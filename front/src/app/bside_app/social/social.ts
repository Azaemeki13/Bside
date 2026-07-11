import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule} from 'lucide-angular';
import { finalize } from 'rxjs';
import {
  ChatMessage,
  ChatUser,
  ConversationListItem,
  FriendListItem,
  FriendRequestItem,
  FriendRequestsResponse,
  ServerWsMessage,
  SharedSong,
} from '../../models/chat.model';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { SocialSideBar } from '../../components/social-side-bar/social-side-bar';
import { SocialShareCard } from '../../components/social-share-card/social-share-card';
import { SocialChat } from '../../components/social-chat/social-chat';

@Component({
  selector: 'app-bside-social',
  templateUrl: './social.html',
  styleUrl: './social.scss',
  imports: [CommonModule, FormsModule, LucideAngularModule, SocialSideBar, SocialShareCard, SocialChat, ],
})
export class BsideSocial implements OnInit, OnDestroy {

	private readonly chatService = inject(ChatService);
	private readonly authService = inject(AuthService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly platformId = inject(PLATFORM_ID);
	private readonly cdr = inject(ChangeDetectorRef);

	protected readonly connectionState = this.chatService.connectionState;
	protected readonly currentUser = this.authService.currentUser;

	protected conversations: ConversationListItem[] = [];
	protected users: ChatUser[] = [];
	protected selectedConversation: ConversationListItem | null = null;
	protected messages: ChatMessage[] = [];
	protected errorMessage = '';
	protected isLoadingConversations = false;
	protected isLoadingMessages = false;
	protected isLoadingUsers = false;

	protected friends: FriendListItem[] = [];
	protected friendRequests: FriendRequestsResponse = {
	incoming: [],
	outgoing: [],
	};

	protected get friendIds(): Set<string> {
		return new Set(this.friends.map((friend) => friend.user_id));
	}

	protected isLoadingFriends = false;
	protected isLoadingFriendRequests = false;
	protected friendActionUserId: string | null = null;
	protected friendActionRequestId: string | null = null;


  	ngOnInit(): void {
		if (!isPlatformBrowser(this.platformId)) {
			return;
		}

		this.chatService.connect();
		this.listenToWebSocketMessages();

		this.loadConversations();
		this.loadUsers();
		this.loadFriends();
		this.loadFriendRequests();
	}

	ngOnDestroy(): void {
		this.chatService.disconnect();
	}

	protected readonly testSong: SharedSong = {
		id: '90000000-0000-4000-8000-000000000003',
		title: 'WebSocket Test Song',
		duration_seconds: 180,
		audio_url: 'test/websocket-test-song.wav',
		status: 'Ready',
		artist_name: 'WebSocket Test Artist',
		cover_url: 'http://localhost:9000/bside-covers/default_cover.jpg',
	};

  	protected loadFriends(): void {
		this.isLoadingFriends = true;

		this.chatService
			.getFriends()
			.pipe(
			finalize(() => {
				this.isLoadingFriends = false;
				this.cdr.detectChanges();
			})
			)
			.subscribe({
			next: (friends) => {
				this.friends = friends;
			},
			error: (error) => {
				console.error('Failed to load friends:', error);
				this.errorMessage = 'Failed to load friends.';
			},
			});
	}

	protected loadFriendRequests(): void {
		this.isLoadingFriendRequests = true;

		this.chatService
			.getFriendRequests()
			.pipe(
			finalize(() => {
				this.isLoadingFriendRequests = false;
				this.cdr.detectChanges();
			})
			)
			.subscribe({
			next: (friendRequests) => {
				this.friendRequests = friendRequests;
			},
			error: (error) => {
				console.error('Failed to load friend requests:', error);
				this.errorMessage = 'Failed to load friend requests.';
			},
			});
	}

	protected sendFriendRequest(user: ChatUser): void {
		this.friendActionUserId = user.id;
		this.errorMessage = '';

		this.chatService
			.sendFriendRequest(user.id)
			.pipe(
			finalize(() => {
				this.friendActionUserId = null;
				this.cdr.detectChanges();
			})
			)
			.subscribe({
			next: () => {
				this.loadFriendRequests();
			},
			error: (error) => {
				console.error('Failed to send friend request:', error);
				this.errorMessage = 'Failed to send friend request.';
			},
			});
	}

	protected acceptFriendRequest(request: FriendRequestItem): void {
		this.friendActionRequestId = request.friendship_id;
		this.errorMessage = '';

		this.chatService
			.acceptFriendRequest(request.friendship_id)
			.pipe(
			finalize(() => {
				this.friendActionRequestId = null;
				this.cdr.detectChanges();
			})
			)
			.subscribe({
			next: () => {
				this.loadFriendRequests();
				this.loadFriends();
				this.startConversationWithUser({
					id: request.requester_id,
					username: request.requester_username,
					avatar_url: request.requester_avatar_url,
				});
			},
			error: (error) => {
				console.error('Failed to accept friend request:', error);
				this.errorMessage = 'Failed to accept friend request.';
			},
			});
	}

	protected rejectFriendRequest(request: FriendRequestItem): void {
		this.friendActionRequestId = request.friendship_id;
		this.errorMessage = '';

		this.chatService
			.rejectFriendRequest(request.friendship_id)
			.pipe(
			finalize(() => {
				this.friendActionRequestId = null;
				this.cdr.detectChanges();
			})
			)
			.subscribe({
			next: () => {
				this.loadFriendRequests();
			},
			error: (error) => {
				console.error('Failed to reject friend request:', error);
				this.errorMessage = 'Failed to reject friend request.';
			},
			});
	}

	protected removeFriend(friend: FriendListItem): void {
		this.friendActionUserId = friend.user_id;
		this.errorMessage = '';

		this.chatService
			.removeFriend(friend.user_id)
			.pipe(
			finalize(() => {
				this.friendActionUserId = null;
				this.cdr.detectChanges();
			})
			)
			.subscribe({
			next: () => {
				this.loadFriends();
				this.loadFriendRequests();
			},
			error: (error) => {
				console.error('Failed to remove friend:', error);
				this.errorMessage = 'Failed to remove friend.';
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
		return this.friends.some((friend) => friend.user_id === userId);
	}

	protected hasPendingOutgoingRequest(userId: string): boolean {
		return this.friendRequests.outgoing.some((request) => request.addressee_id === userId);
	}

	protected hasPendingIncomingRequest(userId: string): boolean {
		return this.friendRequests.incoming.some((request) => request.requester_id === userId);
	}

	protected refreshSocialData(): void {
		this.loadUsers();
		this.loadFriends();
		this.loadFriendRequests();
		this.loadConversations();
	}

  protected loadConversations(): void {
    this.isLoadingConversations = true;
    this.errorMessage = '';

    this.chatService
      .getConversations()
      .pipe(
        finalize(() => {
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
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
          this.cdr.detectChanges();
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
          this.cdr.detectChanges();
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

  protected sendMessage(content: string): void {
    const selectedConversation = this.selectedConversation;
    const currentUser = this.currentUser();
    const trimmedContent = content.trim();

    if (!selectedConversation || !currentUser || !trimmedContent) return;

    const isSentToSocket = this.chatService.sendPrivateMessage(
      selectedConversation.other_user_id,
      trimmedContent
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
		content: trimmedContent,

		message_type: 'text',
		song_id: null,
		shared_song: null,

		status: 'sent',
		created_at: new Date().toISOString(),
		delivered_at: null,
		read_at: null,
	};

    this.messages = [...this.messages, optimisticMessage];
    this.upsertConversationAfterLocalSend(selectedConversation, optimisticMessage);
  }

  protected shareTestSong(): void {
	const selectedConversation = this.selectedConversation;
	const currentUser = this.currentUser();

	if (!selectedConversation || !currentUser) {
		this.errorMessage = 'Select a conversation first.';
		return;
	}

	const isSentToSocket = this.chatService.sendSongMessage(
		selectedConversation.other_user_id,
		this.testSong.id
	);

	if (!isSentToSocket) {
		this.errorMessage =
		'WebSocket is not connected. Please try again.';

		this.chatService.connect();
		return;
	}

	const optimisticMessage: ChatMessage = {
		id: this.createLocalMessageId(),
		sender_id: currentUser.id,
		receiver_id: selectedConversation.other_user_id,
		content: '',

		message_type: 'song',
		song_id: this.testSong.id,
		shared_song: this.testSong,

		status: 'sent',
		created_at: new Date().toISOString(),
		delivered_at: null,
		read_at: null,
	};

	this.messages = [...this.messages, optimisticMessage];

	this.upsertConversationAfterLocalSend(
		selectedConversation,
		optimisticMessage
	);
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

    this.cdr.detectChanges();
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

		message_type: message.message_type ?? 'text',
		song_id: message.song_id ?? null,
		shared_song: message.shared_song ?? null,

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
        this.cdr.detectChanges();
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
      last_message:
		message.message_type === 'song'
			? 'Shared a song'
			: message.content,
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