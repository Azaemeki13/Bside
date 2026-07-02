export type MessageStatus = 'sent' | 'delivered' | 'read' | 'sending' | string;

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  status: MessageStatus;
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
}

export interface ConversationListItem {
  other_user_id: string;
  other_username: string;
  other_email: string;
  other_avatar_url?: string | null;
  last_message_id: string;
  last_sender_id: string;
  last_receiver_id: string;
  last_message: string;
  last_message_status: MessageStatus;
  last_message_at: string;
  unread_count: number;
}

export interface MarkMessagesReadResponse {
  read_count: number;
}

export interface ChatUser {
  id: string;
  username: string;
  email?: string;
  avatar_url?: string | null;
  role?: string;
  created_at?: string;
}

export interface PrivateMessageClientPayload {
  type: 'private_message';
  to_user_id: string;
  content: string;
}

export type ServerWsMessage =
  | {
      type: 'private_message';
      message_id: string;
      from_user_id: string;
      content: string;
      created_at: string;
    }
  | {
      type: 'message_saved';
      message_id: string;
      to_user_id: string;
      status: MessageStatus;
      message: string;
    }
  | {
      type: 'user_offline';
      to_user_id: string;
      message: string;
    }
  | {
      type: 'invalid_message';
      message: string;
    };

export type ChatConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface FriendListItem {
  friendship_id: string;
  user_id: string;
  username: string;
  email: string;
  avatar_url?: string | null;
  role: string;
  is_online: boolean;
  friendship_created_at: string;
}

export interface FriendRequestItem {
  friendship_id: string;

  requester_id: string;
  requester_username: string;
  requester_avatar_url?: string | null;

  addressee_id: string;
  addressee_username: string;
  addressee_avatar_url?: string | null;

  status: string;
  created_at: string;
}

export interface FriendRequestsResponse {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
}

export interface UserStatusResponse {
  user_id: string;
  is_online: boolean;
}