import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, LucideAngularModule, Music } from 'lucide-angular';
import {
  ChatMessage,
  ChatUser,
  ConversationListItem,
  FriendListItem,
  FriendRequestItem,
  FriendRequestsResponse,
} from '../../models/chat.model';
import { AuthService } from '../../services/auth.service';
import { ChatSocketService } from './data-access/chat-socket.service';
import { SocialSideBar } from './ui/social-side-bar/social-side-bar';
import { SocialShareCard } from './ui/social-share-card/social-share-card';
import { SocialChat } from './ui/social-chat/social-chat';
import { PlaylistService } from '../../services/playlist.service';
import { ResponsiveLayoutService } from '../../services/responsive-layout.service';
import { SharedSongCard } from './state/social-reconciliation';
import { FriendActionCallbacks, FriendsStore } from './state/friends.store';
import { ConversationsStore } from './state/conversations.store';
import { SocialFacade } from './social.facade';

@Component({
  selector: 'app-bside-social',
  templateUrl: './social.html',
  styleUrl: './social.scss',
  imports: [CommonModule, FormsModule, LucideAngularModule, SocialSideBar, SocialShareCard, SocialChat],
  providers: [FriendsStore, ConversationsStore, SocialFacade],
})
/** Coordinates the social screen — data and socket details are owned by the facade and stores. */
export class BsideSocial implements OnInit {
  private readonly facade = inject(SocialFacade);
  private readonly friendsStore = inject(FriendsStore);
  private readonly conversationsStore = inject(ConversationsStore);
  private readonly chatSocket = inject(ChatSocketService);
  private readonly authService = inject(AuthService);
  private readonly playlistService = inject(PlaylistService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly responsiveLayout = inject(ResponsiveLayoutService);

  protected readonly connectionState = this.chatSocket.connectionState;
  protected readonly currentUser = this.authService.currentUser;

  protected readonly musicIcon = Music;
  protected readonly arrowLeft = ArrowLeft;

  // Thin wrappers so the existing template bindings stay unchanged.
  protected get users(): ChatUser[] { return this.facade.users(); }
  protected get isLoadingUsers(): boolean { return this.facade.isLoadingUsers(); }
  protected get errorMessage(): string { return this.facade.error(); }

  protected get friends(): FriendListItem[] { return this.friendsStore.friends(); }
  protected get friendRequests(): FriendRequestsResponse { return this.friendsStore.requests(); }
  protected get friendIds(): Set<string> {
    return new Set(this.friends.map((f) => f.user_id));
  }
  protected get isLoadingFriends(): boolean { return this.friendsStore.isLoadingFriends(); }
  protected get isLoadingFriendRequests(): boolean { return this.friendsStore.isLoadingRequests(); }
  protected get friendActionUserId(): string | null { return this.friendsStore.actionUserId(); }
  protected get friendActionRequestId(): string | null { return this.friendsStore.actionRequestId(); }

  protected get conversations(): ConversationListItem[] { return this.conversationsStore.conversations(); }
  protected get selectedConversation(): ConversationListItem | null { return this.conversationsStore.selectedConversation(); }
  protected get messages(): ChatMessage[] { return this.conversationsStore.messages(); }
  protected get receivedSongCards(): SharedSongCard[] { return this.conversationsStore.receivedSongCards(); }
  protected get isLoadingConversations(): boolean { return this.conversationsStore.isLoadingConversations(); }
  protected get isLoadingMessages(): boolean { return this.conversationsStore.isLoadingMessages(); }
  protected get isLoadingSongCards(): boolean { return this.conversationsStore.isLoadingSongCards(); }
  protected get isSelectedConversationUserOnline(): boolean | null { return this.conversationsStore.selectedUserOnline(); }

  protected get isChatRoute(): boolean {
    return !!this.route.snapshot.paramMap.get('userId');
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.playlistService.loadLikedSongs();
    this.facade.start();
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.facade.openFromRoute(params.get('userId')));
  }

  // ── Friend actions ───────────────────────────────────────────────────────

  protected sendFriendRequest(user: ChatUser): void {
    this.facade.clearError();
    this.friendsStore.sendRequest(user.id, this.friendCallbacks());
  }

  protected acceptFriendRequest(request: FriendRequestItem): void {
    this.facade.clearError();
    this.friendsStore.acceptRequest(request, {
      ...this.friendCallbacks(),
      accepted: (user) => this.openUserConversation(user),
    });
  }

  protected rejectFriendRequest(request: FriendRequestItem): void {
    this.facade.clearError();
    this.friendsStore.rejectRequest(request, this.friendCallbacks());
  }

  protected removeFriend(friend: FriendListItem): void {
    this.facade.clearError();
    this.friendsStore.removeFriend(friend, {
      ...this.friendCallbacks(),
      removed: (userId) => {
        const wasSelected = this.conversationsStore.clearUser(userId);
        if (wasSelected && this.isChatRoute) {
          void this.router.navigate(['/bside_app/social']);
        }
      },
    });
  }

  protected startConversationWithFriend(friend: FriendListItem): void {
    this.startConversationWithUser({
      id: friend.user_id,
      username: friend.username,
      email: friend.email,
      avatar_url: friend.avatar_url,
      role: friend.role,
    });
  }

  protected isFriend(userId: string): boolean {
    return this.friendsStore.isFriend(userId);
  }

  protected removeSelectedConversationFriend(): void {
    const conversation = this.selectedConversation;
    if (!conversation) return;
    const friend = this.friends.find((f) => f.user_id === conversation.other_user_id);
    if (!friend) return;
    this.removeFriend(friend);
  }

  protected hasPendingOutgoingRequest(userId: string): boolean {
    return this.friendsStore.hasOutgoingRequest(userId);
  }

  protected hasPendingIncomingRequest(userId: string): boolean {
    return this.friendsStore.hasIncomingRequest(userId);
  }

  /** Shares the page-level reaction callbacks used by every friendship action. */
  private friendCallbacks(): FriendActionCallbacks {
    return {
      refresh: () => this.facade.refresh(),
      reportError: (message) => this.facade.reportError(message),
    };
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  protected openConversation(conversation: ConversationListItem): void {
    void this.router.navigate(['/bside_app/social/chat', conversation.other_user_id]);
  }

  protected openUserConversation(user: ChatUser): void {
    void this.router.navigate(['/bside_app/social/chat', user.id]);
  }

  protected backToSocial(): void {
    void this.router.navigate(['/bside_app/social']);
  }

  // ── Conversation ─────────────────────────────────────────────────────────

  protected startConversationWithUser(user: ChatUser): void {
    const convo = this.conversationsStore.upsertUser(user);
    this.conversationsStore.startEmptyConversation(convo);
  }

  protected openSongCard(card: SharedSongCard): void {
    const convo =
      this.conversations.find((c) => c.other_user_id === card.conversation.other_user_id) ??
      card.conversation;
    this.openConversation(convo);
  }

  protected loadReceivedSongCards(): void {
    this.conversationsStore.loadReceivedSongCards();
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  protected sendMessage(content: string): void {
    const selected = this.selectedConversation;
    const currentUser = this.currentUser();
    const trimmed = content.trim();

    if (!selected || !currentUser || !trimmed) return;

    const sent = this.chatSocket.sendPrivateMessage(selected.other_user_id, trimmed);

    if (!sent) {
      this.facade.reportError('WebSocket is not connected. Please try again.');
      this.chatSocket.connect();
      return;
    }

    const optimistic: ChatMessage = {
      id: this.createLocalMessageId(),
      sender_id: currentUser.id,
      receiver_id: selected.other_user_id,
      content: trimmed,
      message_type: 'text',
      song_id: null,
      shared_song: null,
      status: 'sent',
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
    };

    this.conversationsStore.appendOptimistic(optimistic);
  }

  private createLocalMessageId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `local-${crypto.randomUUID()}`;
    }
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // ── Track-by and predicates ───────────────────────────────────────────────

  protected isOwnMessage(message: ChatMessage): boolean {
    return message.sender_id === this.currentUser()?.id;
  }

  protected trackConversationById(_: number, conversation: ConversationListItem): string {
    return conversation.other_user_id;
  }

  protected trackMessageById(_: number, message: ChatMessage): string {
    return message.id;
  }

  protected trackUserById(_: number, user: ChatUser): string {
    return user.id;
  }

  protected trackSongCardById(_: number, card: SharedSongCard): string {
    return card.message.id;
  }
}
