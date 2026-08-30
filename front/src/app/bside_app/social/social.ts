import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, LucideAngularModule, Music } from 'lucide-angular';
import { catchError, finalize, forkJoin, interval, map, of, Subscription } from 'rxjs';
import {
  ChatMessage,
  ChatUser,
  ConversationListItem,
  FriendListItem,
  FriendRequestItem,
  FriendRequestsResponse,
  ServerWsMessage,
} from '../../models/chat.model';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { SocialSideBar } from '../../components/social-side-bar/social-side-bar';
import { SocialShareCard } from '../../components/social-share-card/social-share-card';
import { SocialChat } from '../../components/social-chat/social-chat';
import { PlaylistService } from '../../services/playlist.service';
import { ResponsiveLayoutService } from '../../services/responsive-layout.service';

interface SharedSongCard {
  message: ChatMessage;
  conversation: ConversationListItem;
}

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
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	protected readonly responsiveLayout = inject(ResponsiveLayoutService);

	protected readonly connectionState = this.chatService.connectionState;
	protected readonly currentUser = this.authService.currentUser;

	protected readonly musicIcon = Music;
	protected readonly arrowLeft = ArrowLeft;

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
  private readonly playlistService = inject(PlaylistService);

	protected get friendIds(): Set<string> {
		return new Set(this.friends.map((friend) => friend.user_id));
	}

	protected isLoadingFriends = false;
	protected isLoadingFriendRequests = false;
	protected friendActionUserId: string | null = null;
	protected friendActionRequestId: string | null = null;

	protected receivedSongCards: SharedSongCard[] = [];
	protected isLoadingSongCards = false;

	protected isSelectedConversationUserOnline: boolean | null = null;
	private statusPollSubscription: Subscription | null = null;
	private socialDataPollSubscription: Subscription | null = null;
	private routeUserSubscription: Subscription | null = null;
	private messageLoadSubscription: Subscription | null = null;
	private messageLoadRequestId = 0;

	protected get isChatRoute(): boolean {
		return !!this.route.snapshot.paramMap.get('userId');
	}


  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.playlistService.loadLikedSongs();

    this.chatService.connect();
    this.listenToWebSocketMessages();
    this.loadConversations();
    this.loadUsers();
	this.loadFriends();
	this.loadFriendRequests();
	this.route.paramMap
		.pipe(takeUntilDestroyed(this.destroyRef))
		.subscribe((params) => this.openConversationFromRoute(params.get('userId')));
	this.socialDataPollSubscription = interval(15000).subscribe(() => this.refreshSocialData(true));
	}

	ngOnDestroy(): void {
		this.chatService.disconnect();
		this.statusPollSubscription?.unsubscribe();
		this.socialDataPollSubscription?.unsubscribe();
		this.routeUserSubscription?.unsubscribe();
		this.messageLoadSubscription?.unsubscribe();
	}

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
				const friendIds = new Set(friends.map((friend) => friend.user_id));
				this.conversations = this.conversations.filter(
					(item) => !!item.last_message_id || friendIds.has(item.other_user_id)
				);
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
				this.refreshSocialData();
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
				this.refreshSocialData();
				this.openUserConversation({
					id: request.requester_id,
					username: request.requester_username,
					display_name: request.requester_display_name,
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
				this.refreshSocialData();
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
				this.refreshSocialData();
				this.clearConversationWithUser(friend.user_id);
			},
			error: (error) => {
				console.error('Failed to remove friend:', error);
				this.errorMessage = 'Failed to remove friend.';
			},
			});
	}

	/**
	 * Called when the other party accepts our friend request. Creates the
	 * conversation locally so it shows up in real time, mirroring how
	 * `clearConversationWithUser` removes it in real time when unfriended.
	 */
	private createConversationForAcceptedFriend(otherUserId: string): void {
		const user = this.users.find((user) => user.id === otherUserId);

		if (user) {
			this.openUserConversation(user);
			return;
		}

		this.chatService.getUser(otherUserId).subscribe({
			next: (acceptedFriend) => {
				this.users = this.users.some((item) => item.id === acceptedFriend.id)
					? this.users
					: [...this.users, acceptedFriend];
				this.openUserConversation(acceptedFriend);
				this.cdr.detectChanges();
			},
			error: () => this.loadConversations(),
		});
	}

	private clearConversationWithUser(otherUserId: string): void {
		this.conversations = this.conversations.filter(
			(conversation) => conversation.other_user_id !== otherUserId
		);

		if (this.selectedConversation?.other_user_id === otherUserId) {
			this.selectedConversation = null;
			this.messages = [];
			this.statusPollSubscription?.unsubscribe();
			this.isSelectedConversationUserOnline = null;
			if (this.isChatRoute) {
				void this.router.navigate(['/bside_app/social']);
			}
		}

		this.receivedSongCards = this.receivedSongCards.filter(
			(card) => card.conversation.other_user_id !== otherUserId
		);
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

	protected removeSelectedConversationFriend(): void {
		const conversation = this.selectedConversation;

		if (!conversation) return;

		const friend = this.friends.find((item) => item.user_id === conversation.other_user_id);

		if (!friend) return;

		this.removeFriend(friend);
	}

	protected hasPendingOutgoingRequest(userId: string): boolean {
		return this.friendRequests.outgoing.some((request) => request.addressee_id === userId);
	}

	protected hasPendingIncomingRequest(userId: string): boolean {
		return this.friendRequests.incoming.some((request) => request.requester_id === userId);
	}

	protected refreshSocialData(skipIfLoading = false): void {
		if (skipIfLoading && (
			this.isLoadingUsers || this.isLoadingFriends ||
			this.isLoadingFriendRequests || this.isLoadingConversations
		)) return;

		this.loadUsers();
		this.loadFriends();
		this.loadFriendRequests();
		this.loadConversations(false);
	}

  protected loadConversations(refreshSongCards = true): void {
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
		  // The backend conversation list is message-derived. Preserve local
		  // zero-message conversations created as soon as a friendship is
		  // accepted, otherwise a refresh would hide them until the first message.
		  const zeroMessageConversations = this.conversations.filter(
			(item) => !item.last_message_id
		  );
		  const serverUserIds = new Set(conversations.map((item) => item.other_user_id));
		  this.conversations = [
			...conversations,
			...zeroMessageConversations.filter((item) => !serverUserIds.has(item.other_user_id)),
		  ];
          this.refreshSelectedConversationReference();
          if (refreshSongCards) {
            this.loadReceivedSongCards();
          }
        },
        error: (error) => {
          console.error('Failed to load conversations:', error);
          this.errorMessage = 'Failed to load conversations.';
        },
      });
  }

  protected loadReceivedSongCards(): void {
    if (this.conversations.length === 0) {
      this.receivedSongCards = [];
      return;
    }

    this.isLoadingSongCards = true;

    forkJoin(
      this.conversations.map((conversation) =>
        this.chatService.getConversationMessages(conversation.other_user_id).pipe(
          map((messages) => ({ conversation, messages })),
          catchError(() => of({ conversation, messages: [] as ChatMessage[] }))
        )
      )
    )
      .pipe(
        finalize(() => {
          this.isLoadingSongCards = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((results) => {
        const cards = results.flatMap(({ conversation, messages }) =>
          messages
            .filter(
              (message) =>
                message.message_type === 'song' &&
                !!message.shared_song &&
                message.sender_id === conversation.other_user_id
            )
            .map((message) => ({ message, conversation }))
        );

        cards.sort(
          (a, b) => new Date(b.message.created_at).getTime() - new Date(a.message.created_at).getTime()
        );

        this.receivedSongCards = cards;
      });
  }

  protected openSongCard(card: SharedSongCard): void {
    const conversation =
      this.conversations.find(
        (conversation) => conversation.other_user_id === card.conversation.other_user_id
      ) ?? card.conversation;

    this.openConversation(conversation);
  }

  protected trackSongCardById(_: number, card: SharedSongCard): string {
    return card.message.id;
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
    this.watchOnlineStatus(conversation.other_user_id);
  }

  protected openConversation(conversation: ConversationListItem): void {
    void this.router.navigate(['/bside_app/social/chat', conversation.other_user_id]);
  }

  protected openUserConversation(user: ChatUser): void {
    void this.router.navigate(['/bside_app/social/chat', user.id]);
  }

  protected backToSocial(): void {
    void this.router.navigate(['/bside_app/social']);
  }

  private openConversationFromRoute(userId: string | null): void {
    this.routeUserSubscription?.unsubscribe();

    if (!userId) {
      this.messageLoadRequestId += 1;
      this.messageLoadSubscription?.unsubscribe();
      this.messageLoadSubscription = null;
      this.isLoadingMessages = false;
      this.selectedConversation = null;
      this.messages = [];
      this.statusPollSubscription?.unsubscribe();
      this.isSelectedConversationUserOnline = null;
      return;
    }

    const conversation = this.conversations.find((item) => item.other_user_id === userId);
    if (conversation) {
      this.selectConversation(conversation);
      return;
    }

    this.routeUserSubscription = this.chatService.getUser(userId).subscribe({
      next: (user) => this.selectConversation(this.upsertConversationForUser(user)),
      error: () => void this.router.navigate(['/bside_app/social']),
    });
  }

  protected startConversationWithUser(user: ChatUser): void {
    const conversation = this.upsertConversationForUser(user);

    this.selectedConversation = conversation;
    this.messages = [];
    this.watchOnlineStatus(user.id);
  }

  /**
   * Ensures a conversation entry exists locally for the given user, adding it
   * to the conversation list if it's not there yet (e.g. right after a
   * friendship is created, before any message has been exchanged). Returns
   * the existing or newly created conversation.
   */
  private upsertConversationForUser(user: ChatUser): ConversationListItem {
    const existingConversation = this.conversations.find(
      (conversation) => conversation.other_user_id === user.id
    );

    if (existingConversation) {
      return existingConversation;
    }

    const now = new Date().toISOString();

    const newConversation: ConversationListItem = {
      other_user_id: user.id,
      other_username: user.username,
      other_display_name: user.display_name ?? null,
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

    this.conversations = [newConversation, ...this.conversations];

    return newConversation;
  }

  protected loadMessages(otherUserId: string): void {
    const requestId = ++this.messageLoadRequestId;
    this.messageLoadSubscription?.unsubscribe();
    this.isLoadingMessages = true;
    this.errorMessage = '';

    this.messageLoadSubscription = this.chatService
      .getConversationMessages(otherUserId)
      .pipe(
        finalize(() => {
          if (this.messageLoadRequestId !== requestId) return;

          this.isLoadingMessages = false;
          this.messageLoadSubscription = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (messages) => {
          if (this.selectedConversation?.other_user_id !== otherUserId) return;
          this.messages = messages;
        },
        error: (error) => {
          if (this.selectedConversation?.other_user_id !== otherUserId) return;
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
      case 'friend_request_received':
        this.refreshSocialData();
        break;
      case 'friend_request_accepted':
        this.refreshSocialData();
        this.createConversationForAcceptedFriend(message.by_user_id);
        break;
      case 'friend_request_rejected':
        this.refreshSocialData();
        break;
      case 'friend_removed':
        this.refreshSocialData();
        this.clearConversationWithUser(message.by_user_id);
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
      this.prependReceivedSongCard(receivedMessage);
    } else {
      this.loadConversations();
    }
  }

  private prependReceivedSongCard(message: ChatMessage): void {
    if (message.message_type !== 'song' || !message.shared_song) return;

    const conversation =
      this.conversations.find((conversation) => conversation.other_user_id === message.sender_id) ??
      this.selectedConversation;

    if (!conversation) return;

    this.receivedSongCards = [{ message, conversation }, ...this.receivedSongCards];
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

  private watchOnlineStatus(otherUserId: string): void {
    this.statusPollSubscription?.unsubscribe();
    this.isSelectedConversationUserOnline = null;

    this.loadOnlineStatus(otherUserId);

    this.statusPollSubscription = interval(15000).subscribe(() => {
      this.loadOnlineStatus(otherUserId);
    });
  }

  private loadOnlineStatus(otherUserId: string): void {
    this.chatService.getUserStatus(otherUserId).subscribe({
      next: (status) => {
        if (this.selectedConversation?.other_user_id !== otherUserId) return;

        this.isSelectedConversationUserOnline = status.is_online;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load user status:', error);
      },
    });
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
