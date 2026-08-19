import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environment';
import { PreferencesService } from './preferences.service';
import {
	ChatConnectionState,
	ChatMessage,
	ChatUser,
	ConversationListItem,
	MarkMessagesReadResponse,
	PrivateMessageClientPayload,
	ServerWsMessage,
	FriendListItem,
	FriendRequestItem,
	FriendRequestsResponse,
	UserStatusResponse,
} from '../models/chat.model';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = environment.apiUrl;
  private readonly wsMessagesSubject = new Subject<ServerWsMessage>();
  private readonly preferences = inject(PreferencesService);

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  readonly connectionState = signal<ChatConnectionState>('disconnected');
  readonly wsMessages$ = this.wsMessagesSubject.asObservable();

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const visible = this.preferences.shareOnlineStatus();
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.sendPresenceVisibility(visible);
      } else {
        this.connect();
      }
    });
  }

  getConversations(): Observable<ConversationListItem[]> {
    return this.http.get<ConversationListItem[]>(`${this.apiUrl}/conversations`);
  }

  getConversationMessages(otherUserId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/messages/${otherUserId}`);
  }

  markConversationAsRead(otherUserId: string): Observable<MarkMessagesReadResponse> {
    return this.http.put<MarkMessagesReadResponse>(`${this.apiUrl}/messages/${otherUserId}/read`, {});
  }

  getUsers(): Observable<ChatUser[]> {
    return this.http.get<ChatUser[]>(`${this.apiUrl}/users`);
  }

  getUser(userId: string): Observable<ChatUser> {
    return this.http.get<ChatUser>(`${this.apiUrl}/users/${userId}`);
  }

  connect(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.shouldReconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const token = localStorage.getItem('auth_token');

    if (!token) {
      this.connectionState.set('disconnected');
      return;
    }

    this.connectionState.set('connecting');

    const socket = new WebSocket(this.buildWebSocketUrl(token));
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.connectionState.set('connected');
      this.sendPresenceVisibility(this.preferences.shareOnlineStatus());
    };

    socket.onmessage = (event) => {
      const message = this.parseServerMessage(event.data);

      if (!message) return;

      if (message.type === 'private_message') {
        this.preferences.notify('New message on B-SIDE', {
          body: 'Open B-SIDE to read it.',
          tag: `chat-${message.from_user_id}`,
        });
      }

      this.wsMessagesSubject.next(message);
    };

    socket.onerror = () => {
      this.connectionState.set('error');
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      this.connectionState.set('disconnected');
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts = 0;
    this.socket?.close();
    this.socket = null;
    this.connectionState.set('disconnected');
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !isPlatformBrowser(this.platformId)) return;
    if (this.reconnectTimer) return;
    if (!localStorage.getItem('auth_token')) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  sendPrivateMessage(toUserId: string, content: string): boolean {
	const trimmedContent = content.trim();

	if (!this.isUuid(toUserId) || !trimmedContent || [...trimmedContent].length > 2000 || this.socket?.readyState !== WebSocket.OPEN) {
		return false;
	}

	const payload: PrivateMessageClientPayload = {
		type: 'private_message',
		to_user_id: toUserId,
		content: trimmedContent,
		message_type: 'text',
		song_id: null,
	};

	this.socket.send(JSON.stringify(payload));
	return true;
  }

  sendSongMessage(toUserId: string, songId: string): boolean {
	if (!this.isUuid(toUserId) || !this.isUuid(songId) || this.socket?.readyState !== WebSocket.OPEN) {
		return false;
	}

	const payload: PrivateMessageClientPayload = {
		type: 'private_message',
		to_user_id: toUserId,
		content: '',
		message_type: 'song',
		song_id: songId,
	};

	this.socket.send(JSON.stringify(payload));
	return true;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private sendPresenceVisibility(visible: boolean): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'presence_visibility', visible }));
  }

  private parseServerMessage(data: unknown): ServerWsMessage | null {
    if (typeof data !== 'string') return null;

    try {
      return JSON.parse(data) as ServerWsMessage;
    } catch {
      // Never log raw WebSocket data: it can contain private message content.
      console.error('Failed to parse a WebSocket message.');
      return null;
    }
  }

  private buildWebSocketUrl(token: string): string {
    const configuredWsUrl = this.getConfiguredWebSocketUrl();
    const separator = configuredWsUrl.includes('?') ? '&' : '?';

    return `${configuredWsUrl}${separator}token=${encodeURIComponent(token)}&visible=${this.preferences.shareOnlineStatus()}`;
  }

  private getConfiguredWebSocketUrl(): string {
    const configuredEnvironment = environment as typeof environment & { wsUrl?: string };

    if (configuredEnvironment.wsUrl) {
      return configuredEnvironment.wsUrl;
    }

    if (!isPlatformBrowser(this.platformId)) {
      return 'wss://localhost/ws';
    }

    const { protocol, host } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}/ws`;
  }

  	getFriends(): Observable<FriendListItem[]> {
		return this.http.get<FriendListItem[]>(`${this.apiUrl}/friends`);
	}

	getFriendRequests(): Observable<FriendRequestsResponse> {
		return this.http.get<FriendRequestsResponse>(`${this.apiUrl}/friend-requests`);
	}

	sendFriendRequest(userId: string): Observable<FriendRequestItem> {
		return this.http.post<FriendRequestItem>(`${this.apiUrl}/friends/${userId}`, {});
	}

	acceptFriendRequest(friendshipId: string): Observable<FriendRequestItem> {
		return this.http.put<FriendRequestItem>(
			`${this.apiUrl}/friend-requests/${friendshipId}/accept`,
			{}
		);
	}

	rejectFriendRequest(friendshipId: string): Observable<FriendRequestItem> {
		return this.http.put<FriendRequestItem>(
			`${this.apiUrl}/friend-requests/${friendshipId}/reject`,
			{}
		);
	}

	removeFriend(userId: string): Observable<void> {
		return this.http.delete<void>(`${this.apiUrl}/friends/${userId}`);
	}

	getUserStatus(userId: string): Observable<UserStatusResponse> {
		return this.http.get<UserStatusResponse>(`${this.apiUrl}/users/${userId}/status`);
	}
}
