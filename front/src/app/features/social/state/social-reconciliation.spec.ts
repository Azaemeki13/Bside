import { ChatMessage, ChatUser, ConversationListItem } from '../../../models/chat.model';
import {
  acknowledgePendingMessage,
  collectReceivedSongCards,
  filterReceivedSongCardsByUser,
  mergeConversations,
  prependReceivedSongCard,
  updateConversationAfterLocalSend,
  upsertConversationForUser,
} from './social-reconciliation';

// Small factories keep each reconciliation example focused on the behavior under test.
function conversation(userId: string, messageId = 'message-1'): ConversationListItem {
  return {
    other_user_id: userId,
    other_username: userId,
    other_email: `${userId}@example.test`,
    last_message_id: messageId,
    last_sender_id: userId,
    last_receiver_id: 'me',
    last_message: 'Hello',
    last_message_status: 'sent',
    last_message_at: '2026-01-01T10:00:00.000Z',
    unread_count: 0,
  };
}

// Messages default to plain text so song behavior stays explicit in its tests.
function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    sender_id: 'me',
    receiver_id: 'friend',
    content: 'Hello',
    message_type: 'text',
    song_id: null,
    shared_song: null,
    status: 'sent',
    created_at: '2026-01-01T10:00:00.000Z',
    delivered_at: null,
    read_at: null,
    ...overrides,
  };
}

describe('social reconciliation', () => {
  it('keeps only local zero-message conversations missing from the server response', () => {
    const server = [conversation('server-user', 'server-message')];
    const localEmpty = conversation('new-friend', '');
    const staleLocal = conversation('old-friend', 'old-message');

    expect(mergeConversations(server, [localEmpty, staleLocal])).toEqual([server[0], localEmpty]);
  });

  it('lets server conversations replace matching empty local entries', () => {
    const server = conversation('friend', 'saved-message');
    const local = conversation('friend', '');

    expect(mergeConversations([server], [local])).toEqual([server]);
  });

  it('returns an existing conversation without changing its list', () => {
    const existing = conversation('friend');
    const conversations = [existing];
    const user: ChatUser = { id: 'friend', username: 'friend' };

    const result = upsertConversationForUser(conversations, user);

    expect(result.conversations).toBe(conversations);
    expect(result.conversation).toBe(existing);
  });

  it('creates a complete empty conversation for a new user', () => {
    const user: ChatUser = { id: 'new', username: 'ada', display_name: 'Ada' };
    const result = upsertConversationForUser([], user, '2026-02-03T04:05:06.000Z');

    expect(result.conversation).toEqual({
      other_user_id: 'new',
      other_username: 'ada',
      other_display_name: 'Ada',
      other_email: '',
      other_avatar_url: null,
      last_message_id: '',
      last_sender_id: '',
      last_receiver_id: '',
      last_message: '',
      last_message_status: 'sent',
      last_message_at: '2026-02-03T04:05:06.000Z',
      unread_count: 0,
    });
    expect(result.conversations[0]).toBe(result.conversation);
  });

  it('updates an existing conversation after a local text send', () => {
    const selected = conversation('friend', 'previous');
    const localMessage = message('local-1', { content: 'New text' });
    const result = updateConversationAfterLocalSend([selected], selected, localMessage);

    expect(result.conversations).toEqual([result.conversation]);
    expect(result.conversation.last_message).toBe('New text');
    expect(result.conversation.last_message_id).toBe('local-1');
  });

  it('prepends a missing conversation and labels a local song send', () => {
    const selected = conversation('friend', '');
    const localSong = message('local-song', { message_type: 'song', content: '' });
    const result = updateConversationAfterLocalSend([], selected, localSong);

    expect(result.conversations[0]).toBe(result.conversation);
    expect(result.conversation.last_message).toBe('Shared a song');
  });

  it('acknowledges the newest matching optimistic message only', () => {
    const messages = [
      message('local-first'),
      message('local-other', { receiver_id: 'someone-else' }),
      message('local-latest'),
    ];
    const result = acknowledgePendingMessage(messages, 'friend', 'saved-7', 'delivered');

    expect(result[0].id).toBe('local-first');
    expect(result[1]).toBe(messages[1]);
    expect(result[2]).toMatchObject({ id: 'saved-7', status: 'delivered' });
  });

  it('keeps the message list untouched when no optimistic send matches', () => {
    const messages = [message('saved-message')];
    expect(acknowledgePendingMessage(messages, 'friend', 'saved-8', 'sent')).toBe(messages);
  });

  it('collects only received songs and sorts them newest first', () => {
    const friend = conversation('friend');
    const sharedSong = {
      id: 'song-1',
      title: 'Track',
      duration_seconds: 120,
      audio_url: '/track.mp3',
      status: 'ready',
      artist_name: 'Artist',
      cover_url: '/cover.jpg',
    };
    const oldSong = message('old', {
      sender_id: 'friend',
      message_type: 'song',
      shared_song: sharedSong,
    });
    const newSong = message('new', {
      sender_id: 'friend',
      message_type: 'song',
      shared_song: sharedSong,
      created_at: '2026-01-02T10:00:00.000Z',
    });
    const sentSong = message('sent', { message_type: 'song', shared_song: sharedSong });

    expect(collectReceivedSongCards([{ conversation: friend, messages: [oldSong, sentSong, newSong] }]))
      .toEqual([
        { message: newSong, conversation: friend },
        { message: oldSong, conversation: friend },
      ]);
  });

  it('prepends live song cards and ignores ordinary messages', () => {
    const friend = conversation('friend');
    const song = message('song', {
      sender_id: 'friend',
      message_type: 'song',
      shared_song: {
        id: 'song-1', title: 'Track', duration_seconds: 120, audio_url: '/track.mp3',
        status: 'ready', artist_name: 'Artist', cover_url: '/cover.jpg',
      },
    });
    const cards = prependReceivedSongCard([], song, [friend], null);

    expect(cards).toEqual([{ message: song, conversation: friend }]);
    expect(prependReceivedSongCard(cards, message('text'), [friend], friend)).toBe(cards);
  });

  it('removes cards owned by an unfriended user', () => {
    const removed = conversation('removed');
    const kept = conversation('kept');
    const cards = [
      { message: message('one'), conversation: removed },
      { message: message('two'), conversation: kept },
    ];

    expect(filterReceivedSongCardsByUser(cards, 'removed')).toEqual([cards[1]]);
  });
});
