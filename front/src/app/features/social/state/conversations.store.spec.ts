import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import type { ChatMessage, ConversationListItem, SharedSong } from '../../../models/chat.model';
import { SocialApiService } from '../data-access/social-api.service';
import { ConversationsStore } from './conversations.store';

// Minimal conversation row for assertions that only care about selection or identity.
function conv(userId: string, unread = 0): ConversationListItem {
  return {
    other_user_id: userId,
    other_username: `user-${userId}`,
    other_display_name: null,
    other_email: `${userId}@example.test`,
    other_avatar_url: null,
    last_message_id: 'msg-seed',
    last_sender_id: userId,
    last_receiver_id: 'me',
    last_message: 'Hello',
    last_message_status: 'delivered',
    last_message_at: '2026-01-01T10:00:00.000Z',
    unread_count: unread,
  };
}

function textMsg(id: string, senderId: string, receiverId: string): ChatMessage {
  return {
    id,
    sender_id: senderId,
    receiver_id: receiverId,
    content: 'Hello',
    message_type: 'text',
    song_id: null,
    shared_song: null,
    status: 'delivered',
    created_at: '2026-01-01T10:00:00.000Z',
    delivered_at: null,
    read_at: null,
  };
}

const FAKE_SONG: SharedSong = {
  id: 'song-1',
  title: 'Test Song',
  duration_seconds: 180,
  audio_url: 'https://cdn.example.test/song.mp3',
  status: 'active',
  artist_name: 'Test Artist',
  cover_url: '/cover.jpg',
};

function songMsg(id: string, senderId: string, receiverId: string): ChatMessage {
  return {
    id,
    sender_id: senderId,
    receiver_id: receiverId,
    content: 'Shared a song',
    message_type: 'song',
    song_id: FAKE_SONG.id,
    shared_song: FAKE_SONG,
    status: 'delivered',
    created_at: '2026-01-01T10:00:00.000Z',
    delivered_at: null,
    read_at: null,
  };
}

describe('ConversationsStore', () => {
  let store: ConversationsStore;
  let api: {
    getConversations: ReturnType<typeof vi.fn>;
    getConversationMessages: ReturnType<typeof vi.fn>;
    markConversationAsRead: ReturnType<typeof vi.fn>;
    getUserStatus: ReturnType<typeof vi.fn>;
  };

  // Quiet defaults so each test only wires up the call it cares about.
  beforeEach(() => {
    api = {
      getConversations: vi.fn(),
      getConversationMessages: vi.fn().mockReturnValue(of([])),
      markConversationAsRead: vi.fn().mockReturnValue(of({ read_count: 0 })),
      getUserStatus: vi.fn().mockReturnValue(of({ user_id: 'any', is_online: true })),
    };
    TestBed.configureTestingModule({
      providers: [ConversationsStore, { provide: SocialApiService, useValue: api }],
    });
    store = TestBed.inject(ConversationsStore);
  });

  // ── Stale-request protection ─────────────────────────────────────────────

  it('drops a conversation response that was superseded by a newer load', () => {
    const first$ = new Subject<ConversationListItem[]>();
    const second$ = new Subject<ConversationListItem[]>();
    api.getConversations.mockReturnValueOnce(first$).mockReturnValueOnce(second$);

    store.loadConversations(vi.fn(), false);
    store.loadConversations(vi.fn(), false);

    first$.next([conv('stale-user')]);
    first$.complete();
    expect(store.conversations()).toEqual([]);

    second$.next([conv('fresh-user')]);
    second$.complete();
    expect(store.conversations()).toEqual([conv('fresh-user')]);
  });

  it('drops a message response when the selected user changed before it arrived', () => {
    const first$ = new Subject<ChatMessage[]>();
    const second$ = new Subject<ChatMessage[]>();
    api.getConversationMessages
      .mockReturnValueOnce(first$)
      .mockReturnValueOnce(second$);

    store.select(conv('user-1'), vi.fn());
    store.select(conv('user-2'), vi.fn());

    first$.next([textMsg('msg-1', 'user-1', 'me')]);
    first$.complete();
    expect(store.messages()).toEqual([]);

    second$.next([textMsg('msg-2', 'user-2', 'me')]);
    second$.complete();
    expect(store.messages().length).toBe(1);
    expect(store.messages()[0].sender_id).toBe('user-2');
  });

  it('drops a song-card scan that started before the friend was removed', () => {
    store.conversations.set([conv('user-1')]);
    const cards$ = new Subject<ChatMessage[]>();
    api.getConversationMessages.mockReturnValue(cards$);

    store.loadReceivedSongCards();
    // Removing the friend increments cardLoadRequestId so the pending forkJoin is discarded.
    store.clearUser('user-1');

    cards$.next([songMsg('song-msg', 'user-1', 'me')]);
    cards$.complete();
    expect(store.receivedSongCards()).toEqual([]);
  });

  // ── Cancellation ─────────────────────────────────────────────────────────

  it('cancels the in-flight message load and resets all selection state', () => {
    const messages$ = new Subject<ChatMessage[]>();
    api.getConversationMessages.mockReturnValue(messages$);

    store.select(conv('user-1'), vi.fn());
    expect(store.isLoadingMessages()).toBe(true);

    store.clearSelection();
    expect(store.isLoadingMessages()).toBe(false);
    expect(store.selectedConversation()).toBeNull();
    expect(store.messages()).toEqual([]);
    expect(store.selectedUserOnline()).toBeNull();
  });

  it('cancels the in-flight song-card scan when a friend is removed', () => {
    store.conversations.set([conv('user-1')]);
    const cards$ = new Subject<ChatMessage[]>();
    api.getConversationMessages.mockReturnValue(cards$);

    store.loadReceivedSongCards();
    expect(store.isLoadingSongCards()).toBe(true);

    store.clearUser('user-1');
    expect(store.isLoadingSongCards()).toBe(false);
  });

  it('stops the song-card loader when a replacement scan has no conversations', () => {
    store.conversations.set([conv('user-1')]);
    const cards$ = new Subject<ChatMessage[]>();
    api.getConversationMessages.mockReturnValue(cards$);

    store.loadReceivedSongCards();
    expect(store.isLoadingSongCards()).toBe(true);

    // The empty replacement owns loading state after cancelling the older scan.
    store.conversations.set([]);
    store.loadReceivedSongCards();

    expect(store.receivedSongCards()).toEqual([]);
    expect(store.isLoadingSongCards()).toBe(false);
  });

  // ── markAsRead ────────────────────────────────────────────────────────────

  it('resets unread count only for the conversation that was just read', () => {
    const readConv = conv('user-read', 3);
    const otherConv = conv('user-other', 5);
    store.conversations.set([readConv, otherConv]);
    api.markConversationAsRead.mockReturnValue(of({ read_count: 3 }));

    store.select(readConv, vi.fn());

    expect(store.conversations().find((c) => c.other_user_id === 'user-read')?.unread_count).toBe(0);
    expect(store.conversations().find((c) => c.other_user_id === 'user-other')?.unread_count).toBe(5);
  });

  // ── Optimistic send ───────────────────────────────────────────────────────

  it('appends an optimistic message and updates the conversation preview immediately', () => {
    const conversation = conv('user-1');
    store.conversations.set([conversation]);
    store.selectedConversation.set(conversation);

    const optimistic = { ...textMsg('local-uuid-1', 'me', 'user-1'), status: 'sent' as const };
    store.appendOptimistic(optimistic);

    expect(store.messages()).toEqual([optimistic]);
    const preview = store.conversations().find((c) => c.other_user_id === 'user-1');
    expect(preview?.last_message_id).toBe('local-uuid-1');
    expect(preview?.last_sender_id).toBe('me');
  });

  it('does nothing when no conversation is selected at send time', () => {
    store.appendOptimistic(textMsg('local-uuid-1', 'me', 'user-1'));
    expect(store.messages()).toEqual([]);
  });

  // ── Acknowledgement ───────────────────────────────────────────────────────

  it('replaces the newest pending local message id with the saved server id', () => {
    store.messages.set([{ ...textMsg('local-abc', 'me', 'user-1'), status: 'sent' }]);

    store.acknowledge('user-1', 'server-id-1', 'delivered');

    expect(store.messages()[0].id).toBe('server-id-1');
    expect(store.messages()[0].status).toBe('delivered');
  });

  it('leaves messages unchanged when no local-prefixed message exists for the recipient', () => {
    store.messages.set([textMsg('server-id-2', 'me', 'user-2')]);

    store.acknowledge('user-2', 'server-id-3', 'delivered');

    expect(store.messages()[0].id).toBe('server-id-2');
  });

  // ── Incoming messages ─────────────────────────────────────────────────────

  it('appends a received message and returns true when its sender is currently selected', () => {
    const conversation = conv('user-1');
    store.selectedConversation.set(conversation);
    store.conversations.set([conversation]);

    const result = store.appendIncoming(textMsg('msg-incoming', 'user-1', 'me'));

    expect(result).toBe(true);
    expect(store.messages().length).toBe(1);
    expect(store.messages()[0].id).toBe('msg-incoming');
  });

  it('ignores a received message and returns false when a different user is selected', () => {
    store.selectedConversation.set(conv('user-2'));

    const result = store.appendIncoming(textMsg('msg-incoming', 'user-1', 'me'));

    expect(result).toBe(false);
    expect(store.messages()).toEqual([]);
  });

  it('prepends a song card when the currently selected user sends a song', () => {
    const conversation = conv('user-1');
    store.selectedConversation.set(conversation);
    store.conversations.set([conversation]);

    store.appendIncoming(songMsg('song-msg-1', 'user-1', 'me'));

    expect(store.receivedSongCards().length).toBe(1);
    expect(store.receivedSongCards()[0].message.id).toBe('song-msg-1');
  });

  // ── Online-status polling ─────────────────────────────────────────────────

  it('loads online status immediately when a conversation is selected', () => {
    api.getUserStatus.mockReturnValue(of({ user_id: 'user-1', is_online: true }));

    store.select(conv('user-1'), vi.fn());

    expect(api.getUserStatus).toHaveBeenCalledWith('user-1');
    expect(store.selectedUserOnline()).toBe(true);
  });

  it('polls online status every 15 seconds while the conversation is open', () => {
    vi.useFakeTimers();
    api.getUserStatus.mockReturnValue(of({ user_id: 'user-1', is_online: true }));

    store.select(conv('user-1'), vi.fn());
    expect(api.getUserStatus).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15000);
    expect(api.getUserStatus).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(15000);
    expect(api.getUserStatus).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('stops the old poll and starts a fresh one when the selected conversation changes', () => {
    vi.useFakeTimers();
    api.getUserStatus.mockReturnValue(of({ user_id: 'any', is_online: true }));

    store.select(conv('user-1'), vi.fn());
    vi.advanceTimersByTime(15000);
    const callsAfterFirstPoll = api.getUserStatus.mock.calls.length;

    store.select(conv('user-2'), vi.fn());
    const callsAfterReselect = api.getUserStatus.mock.calls.length;
    vi.advanceTimersByTime(15000);

    // user-1's interval must be cancelled; only one new poll for user-2 should fire.
    expect(api.getUserStatus).toHaveBeenLastCalledWith('user-2');
    expect(api.getUserStatus.mock.calls.length).toBe(callsAfterReselect + 1);
    expect(callsAfterFirstPoll).toBe(2);

    vi.useRealTimers();
  });

  it('discards an online-status response that arrived after the selection changed', () => {
    const status1$ = new Subject<{ user_id: string; is_online: boolean }>();
    const status2$ = new Subject<{ user_id: string; is_online: boolean }>();
    api.getUserStatus.mockReturnValueOnce(status1$).mockReturnValueOnce(status2$);

    store.select(conv('user-1'), vi.fn());
    store.select(conv('user-2'), vi.fn());

    // user-1's load subscription was unsubscribed when user-2 was selected.
    status1$.next({ user_id: 'user-1', is_online: true });
    expect(store.selectedUserOnline()).toBeNull();

    status2$.next({ user_id: 'user-2', is_online: false });
    expect(store.selectedUserOnline()).toBe(false);
  });

  // ── Destruction ───────────────────────────────────────────────────────────

  it('cancels in-flight message and conversation loads on destroy', () => {
    const messages$ = new Subject<ChatMessage[]>();
    const conversations$ = new Subject<ConversationListItem[]>();
    api.getConversationMessages.mockReturnValue(messages$);
    api.getConversations.mockReturnValue(conversations$);

    store.select(conv('user-1'), vi.fn());
    store.loadConversations(vi.fn(), false);

    store.ngOnDestroy();

    messages$.next([textMsg('msg-1', 'user-1', 'me')]);
    conversations$.next([conv('user-1')]);

    expect(store.messages()).toEqual([]);
    expect(store.conversations()).toEqual([]);
  });

  it('stops online-status polling on destroy', () => {
    vi.useFakeTimers();
    api.getUserStatus.mockReturnValue(of({ user_id: 'user-1', is_online: true }));

    store.select(conv('user-1'), vi.fn());
    expect(api.getUserStatus).toHaveBeenCalledTimes(1);

    store.ngOnDestroy();
    vi.advanceTimersByTime(15000);

    // The poll must have been cleared; no second call should occur.
    expect(api.getUserStatus).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
