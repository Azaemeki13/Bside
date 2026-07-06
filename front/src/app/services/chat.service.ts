import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environment';
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

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  readonly connectionState = signal<ChatConnectionState>('disconnected');
  readonly wsMessages$ = this.wsMessagesSubject.asObservable();

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
    };

    socket.onmessage = (event) => {
      const message = this.parseServerMessage(event.data);

      if (!message) return;

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

    if (!trimmedContent || this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    const payload: PrivateMessageClientPayload = {
      type: 'private_message',
      to_user_id: toUserId,
      content: trimmedContent,
    };

    this.socket.send(JSON.stringify(payload));
    return true;
  }

  private parseServerMessage(data: unknown): ServerWsMessage | null {
    if (typeof data !== 'string') return null;

    try {
      return JSON.parse(data) as ServerWsMessage;
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      return null;
    }
  }

  private buildWebSocketUrl(token: string): string {
    const configuredWsUrl = this.getConfiguredWebSocketUrl();
    const separator = configuredWsUrl.includes('?') ? '&' : '?';

    return `${configuredWsUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  private getConfiguredWebSocketUrl(): string {
    const configuredEnvironment = environment as typeof environment & { wsUrl?: string };

    if (configuredEnvironment.wsUrl) {
      return configuredEnvironment.wsUrl;
    }

    if (!isPlatformBrowser(this.platformId)) {
      return 'ws://localhost:8080/ws';
    }

    const { protocol, hostname, host } = window.location;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'ws://localhost:8080/ws';
    }

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