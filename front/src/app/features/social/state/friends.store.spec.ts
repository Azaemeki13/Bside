import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import type { FriendListItem, FriendRequestItem } from '../../../models/chat.model';
import { SocialApiService } from '../data-access/social-api.service';
import { FriendsStore } from './friends.store';

// A complete friend keeps the examples honest about the store's public model.
function friend(userId = 'user-1'): FriendListItem {
  return {
    friendship_id: `friendship-${userId}`,
    user_id: userId,
    username: `name-${userId}`,
    email: `${userId}@example.test`,
    role: 'user',
    is_online: false,
    friendship_created_at: '2026-01-01T10:00:00.000Z',
  };
}

// Requests include both parties so every predicate can use realistic data.
function request(friendshipId = 'request-1'): FriendRequestItem {
  return {
    friendship_id: friendshipId,
    requester_id: 'incoming-user',
    requester_username: 'incoming',
    requester_display_name: 'Incoming Friend',
    requester_avatar_url: '/incoming.jpg',
    addressee_id: 'outgoing-user',
    addressee_username: 'outgoing',
    status: 'pending',
    created_at: '2026-01-01T10:00:00.000Z',
  };
}

describe('FriendsStore', () => {
  let store: FriendsStore;
  let api: {
    getFriends: ReturnType<typeof vi.fn>;
    getFriendRequests: ReturnType<typeof vi.fn>;
    sendFriendRequest: ReturnType<typeof vi.fn>;
    acceptFriendRequest: ReturnType<typeof vi.fn>;
    rejectFriendRequest: ReturnType<typeof vi.fn>;
    removeFriend: ReturnType<typeof vi.fn>;
  };

  // Each example gets a quiet API so it only controls the request under test.
  beforeEach(() => {
    api = {
      getFriends: vi.fn(),
      getFriendRequests: vi.fn(),
      sendFriendRequest: vi.fn(),
      acceptFriendRequest: vi.fn(),
      rejectFriendRequest: vi.fn(),
      removeFriend: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [FriendsStore, { provide: SocialApiService, useValue: api }],
    });
    store = TestBed.inject(FriendsStore);
  });

  it('loads friends, calls the reconciliation callback, and resets loading', () => {
    const response = [friend()];
    const loaded = vi.fn();
    const result$ = new Subject<FriendListItem[]>();
    api.getFriends.mockReturnValue(result$);

    store.loadFriends(loaded);
    expect(store.isLoadingFriends()).toBe(true);
    result$.next(response);
    result$.complete();

    expect(store.friends()).toBe(response);
    expect(loaded).toHaveBeenCalledWith(response);
    expect(store.isLoadingFriends()).toBe(false);
  });

  it('reports friend loading errors and still resets loading', () => {
    const reportError = vi.fn();
    api.getFriends.mockReturnValue(throwError(() => new Error('offline')));

    store.loadFriends(undefined, reportError);

    expect(reportError).toHaveBeenCalledWith('Failed to load friends.');
    expect(store.isLoadingFriends()).toBe(false);
  });

  it('loads both request lists and resets loading', () => {
    const incoming = request('incoming-request');
    const outgoing = { ...request('outgoing-request'), requester_id: 'me' };
    const response = { incoming: [incoming], outgoing: [outgoing] };
    api.getFriendRequests.mockReturnValue(of(response));

    store.loadRequests();

    expect(store.requests()).toBe(response);
    expect(store.isLoadingRequests()).toBe(false);
  });

  it('reports request loading errors and still resets loading', () => {
    const reportError = vi.fn();
    api.getFriendRequests.mockReturnValue(throwError(() => new Error('offline')));

    store.loadRequests(reportError);

    expect(reportError).toHaveBeenCalledWith('Failed to load friend requests.');
    expect(store.isLoadingRequests()).toBe(false);
  });

  it('sends a request, refreshes, and clears the active user', () => {
    const result$ = new Subject<FriendRequestItem>();
    const callbacks = actionCallbacks();
    api.sendFriendRequest.mockReturnValue(result$);

    store.sendRequest('user-2', callbacks);
    expect(store.actionUserId()).toBe('user-2');
    result$.next(request());
    result$.complete();

    expect(api.sendFriendRequest).toHaveBeenCalledWith('user-2');
    expect(callbacks.refresh).toHaveBeenCalledOnce();
    expect(store.actionUserId()).toBeNull();
  });

  it('accepts a request, refreshes, exposes its requester, and clears the action', () => {
    const pending = request();
    const callbacks = actionCallbacks();
    api.acceptFriendRequest.mockReturnValue(of(pending));

    store.acceptRequest(pending, callbacks);

    expect(api.acceptFriendRequest).toHaveBeenCalledWith('request-1');
    expect(callbacks.refresh).toHaveBeenCalledOnce();
    expect(callbacks.accepted).toHaveBeenCalledWith({
      id: 'incoming-user',
      username: 'incoming',
      display_name: 'Incoming Friend',
      avatar_url: '/incoming.jpg',
    });
    expect(store.actionRequestId()).toBeNull();
  });

  it('rejects a request, refreshes, and clears the active request', () => {
    const pending = request();
    const callbacks = actionCallbacks();
    api.rejectFriendRequest.mockReturnValue(of(pending));

    store.rejectRequest(pending, callbacks);

    expect(api.rejectFriendRequest).toHaveBeenCalledWith('request-1');
    expect(callbacks.refresh).toHaveBeenCalledOnce();
    expect(store.actionRequestId()).toBeNull();
  });

  it('removes a friend, refreshes, exposes its user id, and clears the action', () => {
    const removedFriend = friend('removed-user');
    const callbacks = actionCallbacks();
    api.removeFriend.mockReturnValue(of(undefined));

    store.removeFriend(removedFriend, callbacks);

    expect(api.removeFriend).toHaveBeenCalledWith('removed-user');
    expect(callbacks.refresh).toHaveBeenCalledOnce();
    expect(callbacks.removed).toHaveBeenCalledWith('removed-user');
    expect(store.actionUserId()).toBeNull();
  });

  it.each([
    ['send', 'Failed to send friend request.'],
    ['accept', 'Failed to accept friend request.'],
    ['reject', 'Failed to reject friend request.'],
    ['remove', 'Failed to remove friend.'],
  ])('reports a %s failure without refreshing and clears its action', (operation, expectedMessage) => {
    const pending = request();
    const callbacks = actionCallbacks();
    const failure$ = throwError(() => new Error('offline'));

    if (operation === 'send') {
      api.sendFriendRequest.mockReturnValue(failure$);
      store.sendRequest('user-2', callbacks);
      expect(store.actionUserId()).toBeNull();
    } else if (operation === 'accept') {
      api.acceptFriendRequest.mockReturnValue(failure$);
      store.acceptRequest(pending, callbacks);
      expect(store.actionRequestId()).toBeNull();
    } else if (operation === 'reject') {
      api.rejectFriendRequest.mockReturnValue(failure$);
      store.rejectRequest(pending, callbacks);
      expect(store.actionRequestId()).toBeNull();
    } else {
      api.removeFriend.mockReturnValue(failure$);
      store.removeFriend(friend('user-2'), callbacks);
      expect(store.actionUserId()).toBeNull();
    }

    expect(callbacks.reportError).toHaveBeenCalledWith(expectedMessage);
    expect(callbacks.refresh).not.toHaveBeenCalled();
  });

  it('answers friendship and incoming or outgoing request predicates', () => {
    const pending = request();
    store.friends.set([friend('friend-user')]);
    store.requests.set({ incoming: [pending], outgoing: [pending] });

    expect(store.isFriend('friend-user')).toBe(true);
    expect(store.isFriend('stranger')).toBe(false);
    expect(store.hasIncomingRequest('incoming-user')).toBe(true);
    expect(store.hasIncomingRequest('stranger')).toBe(false);
    expect(store.hasOutgoingRequest('outgoing-user')).toBe(true);
    expect(store.hasOutgoingRequest('stranger')).toBe(false);
  });
});

// Shared spies make success and failure assertions read like the store contract.
function actionCallbacks() {
  return {
    refresh: vi.fn<() => void>(),
    reportError: vi.fn<(message: string) => void>(),
    accepted: vi.fn<(user: { id: string }) => void>(),
    removed: vi.fn<(userId: string) => void>(),
  };
}
