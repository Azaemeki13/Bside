import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { catchError, finalize, forkJoin, interval, map, of, Subscription } from 'rxjs';
import type { ChatMessage, ChatUser, ConversationListItem } from '../../../models/chat.model';
import { SocialApiService } from '../data-access/social-api.service';
import {
  SharedSongCard,
  acknowledgePendingMessage,
  collectReceivedSongCards,
  filterReceivedSongCardsByUser,
  mergeConversations,
  prependReceivedSongCard,
  updateConversationAfterLocalSend,
  upsertConversationForUser,
} from './social-reconciliation';

/** Owns conversation selection, message history, and received-song state. */
@Injectable()
export class ConversationsStore implements OnDestroy {
  private readonly api = inject(SocialApiService);
  private messageLoadSubscription: Subscription | null = null;
  private conversationLoadSubscription: Subscription | null = null;
  private cardLoadSubscription: Subscription | null = null;
  private statusPollSubscription: Subscription | null = null;
  private statusLoadSubscription: Subscription | null = null;
  private messageLoadRequestId = 0;
  private conversationLoadRequestId = 0;
  private cardLoadRequestId = 0;

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly selectedConversation = signal<ConversationListItem | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly receivedSongCards = signal<SharedSongCard[]>([]);
  readonly isLoadingConversations = signal(false);
  readonly isLoadingMessages = signal(false);
  readonly isLoadingSongCards = signal(false);
  readonly selectedUserOnline = signal<boolean | null>(null);

  /** Cancels requests and polling owned by this component-scoped store. */
  ngOnDestroy(): void {
    this.messageLoadSubscription?.unsubscribe();
    this.conversationLoadSubscription?.unsubscribe();
    this.cardLoadSubscription?.unsubscribe();
    this.statusPollSubscription?.unsubscribe();
    this.statusLoadSubscription?.unsubscribe();
  }

  /** Refreshes server conversations while retaining new zero-message friends. */
  loadConversations(reportError: (message: string) => void, refreshCards = true): void {
    const requestId = ++this.conversationLoadRequestId;
    this.conversationLoadSubscription?.unsubscribe();
    this.isLoadingConversations.set(true);
    this.conversationLoadSubscription = this.api.getConversations().pipe(
      finalize(() => {
        if (this.conversationLoadRequestId !== requestId) return;
        this.isLoadingConversations.set(false);
        this.conversationLoadSubscription = null;
      }),
    ).subscribe({
      next: (conversations) => {
        if (this.conversationLoadRequestId !== requestId) return;
        this.conversations.set(mergeConversations(conversations, this.conversations()));
        this.refreshSelectedReference();
        if (refreshCards) this.loadReceivedSongCards();
      },
      error: () => reportError('Failed to load conversations.'),
    });
  }

  /** Rebuilds the received-song feed from every available conversation. */
  loadReceivedSongCards(): void {
    const requestId = ++this.cardLoadRequestId;
    this.cardLoadSubscription?.unsubscribe();
    const conversations = this.conversations();
    if (conversations.length === 0) {
      // An empty replacement scan owns the state after cancelling older work.
      this.cardLoadSubscription = null;
      this.isLoadingSongCards.set(false);
      this.receivedSongCards.set([]);
      return;
    }

    this.isLoadingSongCards.set(true);
    this.cardLoadSubscription = forkJoin(conversations.map((conversation) =>
      this.api.getConversationMessages(conversation.other_user_id).pipe(
        map((messages) => ({ conversation, messages })),
        catchError(() => of({ conversation, messages: [] as ChatMessage[] })),
      ),
    )).pipe(
      finalize(() => {
        if (this.cardLoadRequestId !== requestId) return;
        this.isLoadingSongCards.set(false);
        this.cardLoadSubscription = null;
      }),
    ).subscribe((results) => {
      if (this.cardLoadRequestId === requestId) {
        this.receivedSongCards.set(collectReceivedSongCards(results));
      }
    });
  }

  /** Selects one conversation and starts its history and status work. */
  select(conversation: ConversationListItem, reportError: (message: string) => void): void {
    this.selectedConversation.set(conversation);
    this.loadMessages(conversation.other_user_id, reportError);
    this.markAsRead(conversation.other_user_id);
    this.watchOnlineStatus(conversation.other_user_id);
  }

  /** Selects a new empty conversation before either user sends a message. */
  startEmptyConversation(conversation: ConversationListItem): void {
    this.messageLoadRequestId++;
    this.messageLoadSubscription?.unsubscribe();
    this.selectedConversation.set(conversation);
    this.messages.set([]);
    this.watchOnlineStatus(conversation.other_user_id);
  }

  /** Clears the active conversation and invalidates any older history response. */
  clearSelection(): void {
    this.messageLoadRequestId++;
    this.messageLoadSubscription?.unsubscribe();
    this.messageLoadSubscription = null;
    this.isLoadingMessages.set(false);
    this.selectedConversation.set(null);
    this.messages.set([]);
    this.statusPollSubscription?.unsubscribe();
    this.statusPollSubscription = null;
    this.statusLoadSubscription?.unsubscribe();
    this.statusLoadSubscription = null;
    this.selectedUserOnline.set(null);
  }

  /** Finds or creates an empty conversation for a selected user. */
  upsertUser(user: ChatUser): ConversationListItem {
    const update = upsertConversationForUser(this.conversations(), user);
    this.conversations.set(update.conversations);
    return update.conversation;
  }

  /** Removes every local trace belonging to a former friend. */
  clearUser(userId: string): boolean {
    // Prevent an older full-card scan from restoring the removed friend's cards.
    this.cardLoadRequestId++;
    this.cardLoadSubscription?.unsubscribe();
    this.cardLoadSubscription = null;
    this.isLoadingSongCards.set(false);
    this.conversations.update((items) => items.filter((item) => item.other_user_id !== userId));
    this.receivedSongCards.update((cards) => filterReceivedSongCardsByUser(cards, userId));
    const wasSelected = this.selectedConversation()?.other_user_id === userId;
    if (wasSelected) this.clearSelection();
    return wasSelected;
  }

  /** Keeps only message conversations and still-accepted empty friendships. */
  filterEmptyConversations(friendIds: Set<string>): void {
    this.conversations.update((items) =>
      items.filter((item) => !!item.last_message_id || friendIds.has(item.other_user_id)),
    );
  }

  /** Applies a locally queued message to both history and its list preview. */
  appendOptimistic(message: ChatMessage): void {
    const selected = this.selectedConversation();
    if (!selected) return;

    this.messages.update((messages) => [...messages, message]);
    const update = updateConversationAfterLocalSend(this.conversations(), selected, message);
    this.conversations.set(update.conversations);
    this.selectedConversation.set(update.conversation);
  }

  /** Appends a live message only when its sender is currently selected. */
  appendIncoming(message: ChatMessage): boolean {
    if (this.selectedConversation()?.other_user_id !== message.sender_id) return false;

    this.messages.update((messages) => [...messages, message]);
    this.markAsRead(message.sender_id);
    this.cardLoadRequestId++;
    this.cardLoadSubscription?.unsubscribe();
    this.cardLoadSubscription = null;
    this.isLoadingSongCards.set(false);
    this.receivedSongCards.update((cards) => prependReceivedSongCard(
      cards,
      message,
      this.conversations(),
      this.selectedConversation(),
    ));
    return true;
  }

  /** Replaces the newest matching optimistic ID with the saved server ID. */
  acknowledge(toUserId: string, messageId: string, status: ChatMessage['status']): void {
    this.messages.update((messages) =>
      acknowledgePendingMessage(messages, toUserId, messageId, status),
    );
  }

  /** Loads history without allowing an older request to replace newer state. */
  private loadMessages(otherUserId: string, reportError: (message: string) => void): void {
    const requestId = ++this.messageLoadRequestId;
    this.messageLoadSubscription?.unsubscribe();
    this.isLoadingMessages.set(true);

    this.messageLoadSubscription = this.api.getConversationMessages(otherUserId).pipe(
      finalize(() => {
        if (this.messageLoadRequestId !== requestId) return;
        this.isLoadingMessages.set(false);
        this.messageLoadSubscription = null;
      }),
    ).subscribe({
      next: (messages) => {
        if (this.selectedConversation()?.other_user_id === otherUserId) this.messages.set(messages);
      },
      error: () => {
        if (this.selectedConversation()?.other_user_id === otherUserId) {
          reportError('Failed to load messages.');
        }
      },
    });
  }

  /** Marks unread state locally after the backend confirms the update. */
  private markAsRead(otherUserId: string): void {
    this.api.markConversationAsRead(otherUserId).subscribe({
      next: () => {
        this.conversations.update((items) => items.map((conversation) =>
          conversation.other_user_id === otherUserId
            ? { ...conversation, unread_count: 0, last_message_status: 'read' }
            : conversation,
        ));
        this.refreshSelectedReference();
      },
      error: (error) => console.error('Failed to mark messages as read:', error),
    });
  }

  /** Polls only the selected user's privacy-aware online status. */
  private watchOnlineStatus(otherUserId: string): void {
    this.statusPollSubscription?.unsubscribe();
    this.statusLoadSubscription?.unsubscribe();
    this.selectedUserOnline.set(null);
    this.loadOnlineStatus(otherUserId);
    this.statusPollSubscription = interval(15000).subscribe(() => this.loadOnlineStatus(otherUserId));
  }

  /** Ignores status responses belonging to an older selection. */
  private loadOnlineStatus(otherUserId: string): void {
    this.statusLoadSubscription?.unsubscribe();
    this.statusLoadSubscription = this.api.getUserStatus(otherUserId).subscribe({
      next: (status) => {
        if (this.selectedConversation()?.other_user_id === otherUserId) {
          this.selectedUserOnline.set(status.is_online);
        }
      },
      error: (error) => console.error('Failed to load user status:', error),
    });
  }

  /** Repoints the selection after an immutable list update. */
  private refreshSelectedReference(): void {
    const selected = this.selectedConversation();
    if (!selected) return;
    const refreshed = this.conversations().find(
      (conversation) => conversation.other_user_id === selected.other_user_id,
    );
    if (refreshed) this.selectedConversation.set(refreshed);
  }
}
