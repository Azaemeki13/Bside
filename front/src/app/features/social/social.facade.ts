import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { DestroyRef } from '@angular/core';
import { finalize, interval, Subscription } from 'rxjs';
import type { ChatMessage, ChatUser, ServerWsMessage } from '../../models/chat.model';
import { AuthService } from '../../services/auth.service';
import { ChatSocketService } from './data-access/chat-socket.service';
import { SocialApiService } from './data-access/social-api.service';
import { FriendsStore } from './state/friends.store';
import { ConversationsStore } from './state/conversations.store';

/** Coordinates social loading, polling, socket events, and route selection. */
@Injectable()
export class SocialFacade implements OnDestroy {
  private readonly socialApi = inject(SocialApiService);
  private readonly authService = inject(AuthService);
  private readonly chatSocket = inject(ChatSocketService);
  private readonly friendsStore = inject(FriendsStore);
  private readonly conversationsStore = inject(ConversationsStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly users = signal<ChatUser[]>([]);
  readonly isLoadingUsers = signal(false);
  readonly error = signal('');

  private pollSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private userSub: Subscription | null = null;

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }

  /** Connects the socket, loads all data, and starts the 15-second background poll. */
  start(): void {
    this.chatSocket.connect();
    this.chatSocket.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg) => this.dispatch(msg));
    this.loadAll();
    this.pollSub?.unsubscribe();
    this.pollSub = interval(15000).subscribe(() => this.refresh({ skipIfLoading: true }));
  }

  /** Loads the initial snapshot of conversations, users, friends, and requests. */
  loadAll(): void {
    this.error.set('');
    this.conversationsStore.loadConversations((msg) => this.error.set(msg));
    this.loadUsers();
    this.loadFriends();
    this.friendsStore.loadRequests((msg) => this.error.set(msg));
  }

  /** Refreshes all social data, optionally skipping if any load is in flight. */
  refresh(options: { skipIfLoading?: boolean } = {}): void {
    if (options.skipIfLoading && this.isAnyLoading()) return;
    this.error.set('');
    this.loadUsers();
    this.loadFriends();
    this.friendsStore.loadRequests((msg) => this.error.set(msg));
    this.conversationsStore.loadConversations((msg) => this.error.set(msg), false);
  }

  /** Opens or selects the conversation pointed to by the route user id. */
  openFromRoute(userId: string | null): void {
    this.routeSub?.unsubscribe();

    if (!userId) {
      this.conversationsStore.clearSelection();
      return;
    }

    const existing = this.conversationsStore.conversations().find(
      (item) => item.other_user_id === userId,
    );
    if (existing) {
      this.conversationsStore.select(existing, (msg) => this.error.set(msg));
      return;
    }

    this.routeSub = this.socialApi.getUser(userId).subscribe({
      next: (user) => {
        const convo = this.conversationsStore.upsertUser(user);
        this.conversationsStore.select(convo, (msg) => this.error.set(msg));
      },
      error: () => void this.router.navigate(['/bside_app/social']),
    });
  }

  /** Routes an inbound WebSocket message to the appropriate store action. */
  dispatch(message: ServerWsMessage): void {
    switch (message.type) {
      case 'private_message':
        this.handleIncomingPrivateMessage(message);
        break;
      case 'message_saved':
        this.handleMessageSaved(message);
        break;
      case 'user_offline':
      case 'invalid_message':
        this.error.set(message.message);
        break;
      case 'friend_request_received':
      case 'friend_request_rejected':
        this.refresh();
        break;
      case 'friend_request_accepted':
        this.refresh();
        this.createConversationForAcceptedFriend(message.by_user_id);
        break;
      case 'friend_removed':
        this.refresh();
        this.clearConversationForRemovedFriend(message.by_user_id);
        break;
    }
  }

  /** Surfaces an error from a component-level action into the shared error signal. */
  reportError(message: string): void {
    this.error.set(message);
  }

  /** Clears the error signal before starting a new user-initiated action. */
  clearError(): void {
    this.error.set('');
  }

  private loadUsers(): void {
    // Exclude the signed-in account so search results only offer other users.
    this.userSub?.unsubscribe();
    this.isLoadingUsers.set(true);
    this.userSub = this.socialApi.getUsers().pipe(
      finalize(() => this.isLoadingUsers.set(false)),
    ).subscribe({
      next: (users) => {
        const currentUserId = this.authService.currentUser()?.id;
        this.users.set(currentUserId ? users.filter((u) => u.id !== currentUserId) : users);
      },
      error: () => this.error.set('Failed to load users.'),
    });
  }

  private loadFriends(): void {
    // Friend refreshes also remove empty conversations that are no longer valid.
    this.friendsStore.loadFriends(
      (friends) => this.conversationsStore.filterEmptyConversations(
        new Set(friends.map((f) => f.user_id)),
      ),
      (msg) => this.error.set(msg),
    );
  }

  private isAnyLoading(): boolean {
    // Polling waits for every store to settle to avoid overlapping refreshes.
    return (
      this.isLoadingUsers() ||
      this.friendsStore.isLoadingFriends() ||
      this.friendsStore.isLoadingRequests() ||
      this.conversationsStore.isLoadingConversations()
    );
  }

  private handleIncomingPrivateMessage(
    message: Extract<ServerWsMessage, { type: 'private_message' }>
  ): void {
    // Convert the socket payload once before the conversation store reconciles it.
    const currentUser = this.authService.currentUser();
    if (!currentUser) return;

    const received: ChatMessage = {
      id: message.message_id,
      sender_id: message.from_user_id,
      receiver_id: currentUser.id,
      content: message.content,
      message_type: message.message_type ?? 'text',
      song_id: message.song_id ?? null,
      shared_song: message.shared_song ?? null,
      status: 'delivered',
      created_at: message.created_at,
      delivered_at: null,
      read_at: null,
    };

    const appended = this.conversationsStore.appendIncoming(received);
    if (!appended) {
      this.conversationsStore.loadConversations((msg) => this.error.set(msg));
    }
  }

  private handleMessageSaved(
    message: Extract<ServerWsMessage, { type: 'message_saved' }>
  ): void {
    // Replace the optimistic message id, then refresh conversation ordering.
    this.conversationsStore.acknowledge(message.to_user_id, message.message_id, message.status);
    this.conversationsStore.loadConversations((msg) => this.error.set(msg));
  }

  /** Opens an accepted friend's chat immediately, even before the next poll. */
  private createConversationForAcceptedFriend(otherUserId: string): void {
    const known = this.users().find((u) => u.id === otherUserId);

    if (known) {
      void this.router.navigate(['/bside_app/social/chat', known.id]);
      return;
    }

    this.socialApi.getUser(otherUserId).subscribe({
      next: (user) => {
        if (!this.users().some((u) => u.id === user.id)) {
          this.users.update((list) => [...list, user]);
        }
        void this.router.navigate(['/bside_app/social/chat', user.id]);
      },
      error: () => this.conversationsStore.loadConversations((msg) => this.error.set(msg)),
    });
  }

  private clearConversationForRemovedFriend(userId: string): void {
    // Leave a removed friend's chat if it was the conversation being viewed.
    const wasSelected = this.conversationsStore.clearUser(userId);
    if (wasSelected) {
      void this.router.navigate(['/bside_app/social']);
    }
  }
}
