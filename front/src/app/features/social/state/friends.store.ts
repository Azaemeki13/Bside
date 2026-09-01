import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import type {
  ChatUser,
  FriendListItem,
  FriendRequestItem,
  FriendRequestsResponse,
} from '../../../models/chat.model';
import { SocialApiService } from '../data-access/social-api.service';

const EMPTY_REQUESTS: FriendRequestsResponse = { incoming: [], outgoing: [] };

export interface FriendActionCallbacks {
  refresh: () => void;
  reportError: (message: string) => void;
  accepted?: (user: ChatUser) => void;
  removed?: (userId: string) => void;
}

/** Owns friendship state and keeps request bookkeeping out of the page. */
@Injectable()
export class FriendsStore {
  private readonly api = inject(SocialApiService);

  readonly friends = signal<FriendListItem[]>([]);
  readonly requests = signal<FriendRequestsResponse>(EMPTY_REQUESTS);
  readonly isLoadingFriends = signal(false);
  readonly isLoadingRequests = signal(false);
  readonly actionUserId = signal<string | null>(null);
  readonly actionRequestId = signal<string | null>(null);

  /** Loads accepted friends and lets conversation state reconcile afterward. */
  loadFriends(onLoaded?: (friends: FriendListItem[]) => void, reportError?: (message: string) => void): void {
    this.isLoadingFriends.set(true);
    this.api.getFriends().pipe(
      finalize(() => this.isLoadingFriends.set(false)),
    ).subscribe({
      next: (friends) => {
        this.friends.set(friends);
        onLoaded?.(friends);
      },
      error: () => reportError?.('Failed to load friends.'),
    });
  }

  /** Loads incoming and outgoing requests as one consistent snapshot. */
  loadRequests(reportError?: (message: string) => void): void {
    this.isLoadingRequests.set(true);
    this.api.getFriendRequests().pipe(
      finalize(() => this.isLoadingRequests.set(false)),
    ).subscribe({
      next: (requests) => this.requests.set(requests),
      error: () => reportError?.('Failed to load friend requests.'),
    });
  }

  /** Sends a request and refreshes the social snapshot on success. */
  sendRequest(userId: string, callbacks: FriendActionCallbacks): void {
    this.actionUserId.set(userId);
    this.api.sendFriendRequest(userId).pipe(
      finalize(() => this.actionUserId.set(null)),
    ).subscribe({
      next: callbacks.refresh,
      error: () => callbacks.reportError('Failed to send friend request.'),
    });
  }

  /** Accepts a request and opens the new friendship when requested. */
  acceptRequest(request: FriendRequestItem, callbacks: FriendActionCallbacks): void {
    this.actionRequestId.set(request.friendship_id);
    this.api.acceptFriendRequest(request.friendship_id).pipe(
      finalize(() => this.actionRequestId.set(null)),
    ).subscribe({
      next: () => {
        callbacks.refresh();
        callbacks.accepted?.({
          id: request.requester_id,
          username: request.requester_username,
          display_name: request.requester_display_name,
          avatar_url: request.requester_avatar_url,
        });
      },
      error: () => callbacks.reportError('Failed to accept friend request.'),
    });
  }

  /** Rejects a request and refreshes both request lists. */
  rejectRequest(request: FriendRequestItem, callbacks: FriendActionCallbacks): void {
    this.actionRequestId.set(request.friendship_id);
    this.api.rejectFriendRequest(request.friendship_id).pipe(
      finalize(() => this.actionRequestId.set(null)),
    ).subscribe({
      next: callbacks.refresh,
      error: () => callbacks.reportError('Failed to reject friend request.'),
    });
  }

  /** Removes a friend and lets conversation state discard related UI. */
  removeFriend(friend: FriendListItem, callbacks: FriendActionCallbacks): void {
    this.actionUserId.set(friend.user_id);
    this.api.removeFriend(friend.user_id).pipe(
      finalize(() => this.actionUserId.set(null)),
    ).subscribe({
      next: () => {
        callbacks.refresh();
        callbacks.removed?.(friend.user_id);
      },
      error: () => callbacks.reportError('Failed to remove friend.'),
    });
  }

  /** Checks accepted friendship without rebuilding sets in event handlers. */
  isFriend(userId: string): boolean {
    return this.friends().some((friend) => friend.user_id === userId);
  }

  /** Checks whether a request to this user is already pending. */
  hasOutgoingRequest(userId: string): boolean {
    return this.requests().outgoing.some((request) => request.addressee_id === userId);
  }

  /** Checks whether this user has sent an incoming request. */
  hasIncomingRequest(userId: string): boolean {
    return this.requests().incoming.some((request) => request.requester_id === userId);
  }
}
