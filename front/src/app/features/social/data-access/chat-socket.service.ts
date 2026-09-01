import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../../environment';
import type {
  ChatConnectionState,
  PrivateMessageClientPayload,
  ServerWsMessage,
} from '../../../models/chat.model';
import { AuthService } from '../../../services/auth.service';
import { PreferencesService } from '../../../services/preferences.service';

/** Owns the application-wide chat socket and its reconnect lifecycle. */
@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly preferences = inject(PreferencesService);
  private readonly auth = inject(AuthService);
  private readonly messagesSubject = new Subject<ServerWsMessage>();

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  readonly connectionState = signal<ChatConnectionState>('disconnected');
  readonly messages$ = this.messagesSubject.asObservable();

  constructor() {
    // Logging out ends the shared socket session regardless of the active page.
    this.auth.loggedOut$.subscribe(() => this.disconnect());

    // Keep presence privacy synchronized even when settings change elsewhere.
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

  /** Opens the socket once authentication and browser APIs are available. */
  connect(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.shouldReconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      this.connectionState.set('disconnected');
      return;
    }

    this.connectionState.set('connecting');
    const socket = new WebSocket(this.buildWebSocketUrl(token));
    this.socket = socket;
    this.bindSocketEvents(socket);
  }

  /** Closes the socket and disables automatic reconnection. */
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

  /** Sends a validated text message over the active connection. */
  sendPrivateMessage(toUserId: string, content: string): boolean {
    const trimmedContent = content.trim();
    if (!this.isUuid(toUserId) || !trimmedContent || [...trimmedContent].length > 2000 || !this.isConnected()) return false;

    return this.sendMessage({
      type: 'private_message',
      to_user_id: toUserId,
      content: trimmedContent,
      message_type: 'text',
      song_id: null,
    });
  }

  /** Sends a validated shared-song message over the active connection. */
  sendSongMessage(toUserId: string, songId: string): boolean {
    if (!this.isUuid(toUserId) || !this.isUuid(songId) || !this.isConnected()) return false;

    return this.sendMessage({
      type: 'private_message',
      to_user_id: toUserId,
      content: '',
      message_type: 'song',
      song_id: songId,
    });
  }

  /** Wires browser callbacks without leaking them into page components. */
  private bindSocketEvents(socket: WebSocket): void {
    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.connectionState.set('connected');
      this.sendPresenceVisibility(this.preferences.shareOnlineStatus());
    };

    socket.onmessage = (event) => this.receiveMessage(event.data);
    socket.onerror = () => this.connectionState.set('error');
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.connectionState.set('disconnected');
      this.scheduleReconnect();
    };
  }

  /** Parses server events and keeps private notification contents out of logs. */
  private receiveMessage(data: unknown): void {
    const message = this.parseServerMessage(data);
    if (!message) return;

    if (message.type === 'private_message') {
      this.preferences.notify('New message on B-SIDE', {
        body: 'Open B-SIDE to read it.',
        tag: `chat-${message.from_user_id}`,
      });
    }
    this.messagesSubject.next(message);
  }

  /** Schedules capped exponential backoff while the session stays active. */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !isPlatformBrowser(this.platformId) || this.reconnectTimer) return;
    if (!localStorage.getItem('auth_token')) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Sends the user's current presence privacy preference. */
  private sendPresenceVisibility(visible: boolean): void {
    if (!this.isConnected()) return;
    this.socket?.send(JSON.stringify({ type: 'presence_visibility', visible }));
  }

  /** Serializes one already validated client payload. */
  private sendMessage(payload: PrivateMessageClientPayload): boolean {
    if (!this.isConnected()) return false;
    this.socket?.send(JSON.stringify(payload));
    return true;
  }

  /** Checks the active browser socket without exposing it to callers. */
  private isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Rejects identifiers that the backend would refuse. */
  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  /** Parses a server payload without ever logging private message text. */
  private parseServerMessage(data: unknown): ServerWsMessage | null {
    if (typeof data !== 'string') return null;
    try {
      return JSON.parse(data) as ServerWsMessage;
    } catch {
      console.error('Failed to parse a WebSocket message.');
      return null;
    }
  }

  /** Adds authentication and presence settings to the configured socket URL. */
  private buildWebSocketUrl(token: string): string {
    const configuredUrl = this.getConfiguredWebSocketUrl();
    const separator = configuredUrl.includes('?') ? '&' : '?';
    return `${configuredUrl}${separator}token=${encodeURIComponent(token)}&visible=${this.preferences.shareOnlineStatus()}`;
  }

  /** Uses the explicit environment URL or derives one from the browser host. */
  private getConfiguredWebSocketUrl(): string {
    const configuredEnvironment = environment as typeof environment & { wsUrl?: string };
    if (configuredEnvironment.wsUrl) return configuredEnvironment.wsUrl;
    if (!isPlatformBrowser(this.platformId)) return 'wss://localhost/ws';

    const { protocol, host } = window.location;
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
  }
}
