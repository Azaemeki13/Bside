import {
  ChatMessage,
  ChatUser,
  ConversationListItem,
  MessageStatus,
} from '../../../models/chat.model';

export interface SharedSongCard {
  message: ChatMessage;
  conversation: ConversationListItem;
}

export interface ConversationUpdate {
  conversations: ConversationListItem[];
  conversation: ConversationListItem;
}

export interface ConversationMessages {
  conversation: ConversationListItem;
  messages: ChatMessage[];
}

/** Keeps fresh server data while retaining friendships that have no messages yet. */
export function mergeConversations(
  serverConversations: ConversationListItem[],
  localConversations: ConversationListItem[]
): ConversationListItem[] {
  const emptyLocalConversations = localConversations.filter((item) => !item.last_message_id);
  const serverUserIds = new Set(serverConversations.map((item) => item.other_user_id));

  return [
    ...serverConversations,
    ...emptyLocalConversations.filter((item) => !serverUserIds.has(item.other_user_id)),
  ];
}

/** Finds a user's conversation or creates the empty row shown before their first message. */
export function upsertConversationForUser(
  conversations: ConversationListItem[],
  user: ChatUser,
  createdAt = new Date().toISOString()
): ConversationUpdate {
  const existingConversation = conversations.find((item) => item.other_user_id === user.id);

  if (existingConversation) {
    return { conversations, conversation: existingConversation };
  }

  const conversation: ConversationListItem = {
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
    last_message_at: createdAt,
    unread_count: 0,
  };

  return { conversations: [conversation, ...conversations], conversation };
}

/** Updates the matching conversation preview after a local message is queued. */
export function updateConversationAfterLocalSend(
  conversations: ConversationListItem[],
  selectedConversation: ConversationListItem,
  message: ChatMessage
): ConversationUpdate {
  const conversation: ConversationListItem = {
    ...selectedConversation,
    last_message_id: message.id,
    last_sender_id: message.sender_id,
    last_receiver_id: message.receiver_id,
    last_message: message.message_type === 'song' ? 'Shared a song' : message.content,
    last_message_status: message.status,
    last_message_at: message.created_at,
    unread_count: 0,
  };
  const exists = conversations.some(
    (item) => item.other_user_id === selectedConversation.other_user_id
  );

  return {
    conversations: exists
      ? conversations.map((item) =>
          item.other_user_id === selectedConversation.other_user_id ? conversation : item
        )
      : [conversation, ...conversations],
    conversation,
  };
}

/** Applies a server acknowledgement to the newest pending message for its recipient. */
export function acknowledgePendingMessage(
  messages: ChatMessage[],
  toUserId: string,
  messageId: string,
  status: MessageStatus
): ChatMessage[] {
  let pendingIndex = -1;

  // Search backwards because acknowledgements follow the order messages were sent.
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.receiver_id === toUserId && message.id.startsWith('local-')) {
      pendingIndex = index;
      break;
    }
  }

  if (pendingIndex === -1) return messages;

  return messages.map((message, index) =>
    index === pendingIndex ? { ...message, id: messageId, status } : message
  );
}

/** Builds the newest-first song feed from messages received in each conversation. */
export function collectReceivedSongCards(results: ConversationMessages[]): SharedSongCard[] {
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

  return cards.sort(
    (left, right) =>
      new Date(right.message.created_at).getTime() - new Date(left.message.created_at).getTime()
  );
}

/** Prepends a live received song when its conversation can be identified. */
export function prependReceivedSongCard(
  cards: SharedSongCard[],
  message: ChatMessage,
  conversations: ConversationListItem[],
  selectedConversation: ConversationListItem | null
): SharedSongCard[] {
  if (message.message_type !== 'song' || !message.shared_song) return cards;

  const conversation =
    conversations.find((item) => item.other_user_id === message.sender_id) ?? selectedConversation;

  return conversation ? [{ message, conversation }, ...cards] : cards;
}

/** Removes song cards that belong to a friendship which no longer exists. */
export function filterReceivedSongCardsByUser(
  cards: SharedSongCard[],
  removedUserId: string
): SharedSongCard[] {
  return cards.filter((card) => card.conversation.other_user_id !== removedUserId);
}
