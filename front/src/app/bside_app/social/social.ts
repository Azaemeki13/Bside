import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  ChatMessage,
  ChatUser,
  ConversationListItem,
  ServerWsMessage,
} from '../../models/chat.model';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-bside-social',
  templateUrl: './social.html',
  styleUrl: './social.scss',
  imports: [CommonModule, FormsModule],
})
export class BsideSocial implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly connectionState = this.chatService.connectionState;
  protected readonly currentUser = this.authService.currentUser;

  protected conversations: ConversationListItem[] = [];
  protected users: ChatUser[] = [];
  protected selectedConversation: ConversationListItem | null = null;
  protected messages: ChatMessage[] = [];
  protected draftMessage = '';
  protected errorMessage = '';
  protected isLoadingConversations = false;
  protected isLoadingMessages = false;
  protected isLoadingUsers = false;

  ngOnInit(): void {
	if (!isPlatformBrowser(this.platformId)) {
    	return;
  	}
    this.chatService.connect();
    this.listenToWebSocketMessages();
    this.loadConversations();
    //this.loadUsers();
  }

  ngOnDestroy(): void {
    this.chatService.disconnect();
  }

  protected loadConversations(): void {
    this.isLoadingConversations = true;
    this.errorMessage = '';

    this.chatService
      .getConversations()
      .pipe(
        finalize(() => {
          this.isLoadingConversations = false;
        })
      )
      .subscribe({
        next: (conversations) => {
          this.conversations = conversations;
          this.refreshSelectedConversationReference();
        },
        error: (error) => {
          console.error('Failed to load conversations:', error);
          this.errorMessage = 'Failed to load conversations.';
        },
      });
  }

  protected loadUsers(): void {
    this.isLoadingUsers = true;

    this.chatService
      .getUsers()
      .pipe(
        finalize(() => {
          this.isLoadingUsers = false;
        })
      )
      .subscribe({
        next: (users) => {
          const currentUserId = this.currentUser()?.id;
          this.users = currentUserId ? users.filter((user) => user.id !== currentUserId) : users;
        },
        error: (error) => {
          console.error('Failed to load users:', error);
        },
      });
  }

  protected selectConversation(conversation: ConversationListItem): void {
    this.selectedConversation = conversation;
    this.loadMessages(conversation.other_user_id);
    this.markSelectedConversationAsRead(conversation.other_user_id);
  }

  protected startConversationWithUser(user: ChatUser): void {
    const existingConversation = this.conversations.find(
      (conversation) => conversation.other_user_id === user.id
    );

    if (existingConversation) {
      this.selectConversation(existingConversation);
      return;
    }

    const now = new Date().toISOString();

    const temporaryConversation: ConversationListItem = {
      other_user_id: user.id,
      other_username: user.username,
      other_email: user.email ?? '',
      other_avatar_url: user.avatar_url ?? null,
      last_message_id: '',
      last_sender_id: '',
      last_receiver_id: '',
      last_message: '',
      last_message_status: 'sent',
      last_message_at: now,
      unread_count: 0,
    };

    this.selectedConversation = temporaryConversation;
    this.messages = [];
  }

  protected loadMessages(otherUserId: string): void {
    this.isLoadingMessages = true;
    this.errorMessage = '';

    this.chatService
      .getConversationMessages(otherUserId)
      .pipe(
        finalize(() => {
          this.isLoadingMessages = false;
        })
      )
      .subscribe({
        next: (messages) => {
          this.messages = messages;
        },
        error: (error) => {
          console.error('Failed to load messages:', error);
          this.errorMessage = 'Failed to load messages.';
        },
      });
  }

  protected sendMessage(): void {
    const selectedConversation = this.selectedConversation;
    const currentUser = this.currentUser();
    const content = this.draftMessage.trim();

    if (!selectedConversation || !currentUser || !content) return;

    const isSentToSocket = this.chatService.sendPrivateMessage(
      selectedConversation.other_user_id,
      content
    );

    if (!isSentToSocket) {
      this.errorMessage = 'WebSocket is not connected. Please try again.';
      this.chatService.connect();
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: this.createLocalMessageId(),
      sender_id: currentUser.id,
      receiver_id: selectedConversation.other_user_id,
      content,
      status: 'sent',
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
    };

    this.messages = [...this.messages, optimisticMessage];
    this.draftMessage = '';
    this.upsertConversationAfterLocalSend(selectedConversation, optimisticMessage);
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

  protected isOwnMessage(message: ChatMessage): boolean {
    return message.sender_id === this.currentUser()?.id;
  }

  private listenToWebSocketMessages(): void {
    this.chatService.wsMessages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.handleWebSocketMessage(message));
  }

  private handleWebSocketMessage(message: ServerWsMessage): void {
    switch (message.type) {
      case 'private_message':
        this.handleIncomingPrivateMessage(message);
        break;
      case 'message_saved':
        this.handleMessageSaved(message);
        break;
      case 'user_offline':
        this.errorMessage = message.message;
        break;
      case 'invalid_message':
        this.errorMessage = message.message;
        break;
    }
  }

  private handleIncomingPrivateMessage(
    message: Extract<ServerWsMessage, { type: 'private_message' }>
  ): void {
    const currentUser = this.currentUser();

    if (!currentUser) return;

    const receivedMessage: ChatMessage = {
      id: message.message_id,
      sender_id: message.from_user_id,
      receiver_id: currentUser.id,
      content: message.content,
      status: 'delivered',
      created_at: message.created_at,
      delivered_at: null,
      read_at: null,
    };

    if (this.selectedConversation?.other_user_id === message.from_user_id) {
      this.messages = [...this.messages, receivedMessage];
      this.markSelectedConversationAsRead(message.from_user_id);
    } else {
      this.loadConversations();
    }
  }

  private handleMessageSaved(
    message: Extract<ServerWsMessage, { type: 'message_saved' }>
  ): void {
    const pendingMessageIndex = this.findLastPendingMessageIndex(message.to_user_id);

    if (pendingMessageIndex !== -1) {
      this.messages = this.messages.map((chatMessage, index) =>
        index === pendingMessageIndex
          ? {
              ...chatMessage,
              id: message.message_id,
              status: message.status,
            }
          : chatMessage
      );
    }

    this.loadConversations();
  }

  private markSelectedConversationAsRead(otherUserId: string): void {
    this.chatService.markConversationAsRead(otherUserId).subscribe({
      next: () => {
        this.conversations = this.conversations.map((conversation) =>
          conversation.other_user_id === otherUserId
            ? { ...conversation, unread_count: 0, last_message_status: 'read' }
            : conversation
        );

        this.refreshSelectedConversationReference();
      },
      error: (error) => {
        console.error('Failed to mark messages as read:', error);
      },
    });
  }

  private upsertConversationAfterLocalSend(
    selectedConversation: ConversationListItem,
    message: ChatMessage
  ): void {
    const updatedConversation: ConversationListItem = {
      ...selectedConversation,
      last_message_id: message.id,
      last_sender_id: message.sender_id,
      last_receiver_id: message.receiver_id,
      last_message: message.content,
      last_message_status: message.status,
      last_message_at: message.created_at,
      unread_count: 0,
    };

    const conversationExists = this.conversations.some(
      (conversation) => conversation.other_user_id === selectedConversation.other_user_id
    );

    this.conversations = conversationExists
      ? this.conversations.map((conversation) =>
          conversation.other_user_id === selectedConversation.other_user_id
            ? updatedConversation
            : conversation
        )
      : [updatedConversation, ...this.conversations];

    this.selectedConversation = updatedConversation;
  }

  private refreshSelectedConversationReference(): void {
    if (!this.selectedConversation) return;

    const refreshedConversation = this.conversations.find(
      (conversation) => conversation.other_user_id === this.selectedConversation?.other_user_id
    );

    if (refreshedConversation) {
      this.selectedConversation = refreshedConversation;
    }
  }

  private findLastPendingMessageIndex(toUserId: string): number {
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const message = this.messages[index];

      if (message.receiver_id === toUserId && message.id.startsWith('local-')) {
        return index;
      }
    }

    return -1;
  }

  private createLocalMessageId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `local-${crypto.randomUUID()}`;
    }

    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}