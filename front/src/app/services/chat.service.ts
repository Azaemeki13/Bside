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
} from '../models/chat.model';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = environment.apiUrl;
  private readonly wsMessagesSubject = new Subject<ServerWsMessage>();

  private socket: WebSocket | null = null;

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
    };
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionState.set('disconnected');
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
}