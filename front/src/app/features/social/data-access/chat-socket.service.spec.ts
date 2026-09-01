import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreferencesService } from '../../../services/preferences.service';
import { ChatSocketService } from './chat-socket.service';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const SONG_ID = '123e4567-e89b-42d3-a456-426614174001';

// This fake exposes browser callbacks while keeping every sent frame visible.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  // Opening manually keeps connection timing under the test's control.
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

describe('ChatSocketService', () => {
  const shareOnlineStatus = signal(true);
  const notify = vi.fn();
  const originalWebSocket = globalThis.WebSocket;

  // Keep browser state and socket instances isolated between examples.
  beforeEach(() => {
    localStorage.clear();
    FakeWebSocket.instances = [];
    shareOnlineStatus.set(true);
    notify.mockReset();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  function createService(platformId: unknown = 'browser'): ChatSocketService {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platformId },
        {
          provide: PreferencesService,
          useValue: { shareOnlineStatus, notify },
        },
      ],
    });
    return TestBed.inject(ChatSocketService);
  }

  it('stays disconnected during server rendering', () => {
    localStorage.setItem('auth_token', 'server-token');
    const service = createService('server');

    service.connect();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(service.connectionState()).toBe('disconnected');
  });

  it('requires a token and avoids duplicate connections', () => {
    const service = createService();
    expect(FakeWebSocket.instances).toHaveLength(0);

    localStorage.setItem('auth_token', 'hello world');
    service.connect();
    service.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('token=hello%20world&visible=true');
    expect(service.connectionState()).toBe('connecting');
  });

  it('tracks connection state and sends the current presence setting', () => {
    localStorage.setItem('auth_token', 'token');
    const service = createService();
    service.connect();
    const socket = FakeWebSocket.instances[0];

    socket.open();
    expect(service.connectionState()).toBe('connected');
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'presence_visibility', visible: true });

    socket.fail();
    expect(service.connectionState()).toBe('error');
  });

  it('sends trimmed text and exact song payloads', () => {
    localStorage.setItem('auth_token', 'token');
    const service = createService();
    service.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.sent.length = 0;

    expect(service.sendPrivateMessage(USER_ID, '  hello  ')).toBe(true);
    expect(service.sendSongMessage(USER_ID, SONG_ID)).toBe(true);
    expect(socket.sent.map((frame) => JSON.parse(frame))).toEqual([
      {
        type: 'private_message',
        to_user_id: USER_ID,
        content: 'hello',
        message_type: 'text',
        song_id: null,
      },
      {
        type: 'private_message',
        to_user_id: USER_ID,
        content: '',
        message_type: 'song',
        song_id: SONG_ID,
      },
    ]);
  });

  it('rejects invalid, empty, oversized, and disconnected messages', () => {
    const service = createService();
    expect(service.sendPrivateMessage(USER_ID, 'hello')).toBe(false);

    localStorage.setItem('auth_token', 'token');
    service.connect();
    FakeWebSocket.instances[0].open();

    expect(service.sendPrivateMessage('not-a-uuid', 'hello')).toBe(false);
    expect(service.sendPrivateMessage(USER_ID, '   ')).toBe(false);
    expect(service.sendPrivateMessage(USER_ID, 'x'.repeat(2001))).toBe(false);
    expect(service.sendSongMessage(USER_ID, 'not-a-uuid')).toBe(false);
  });

  it('emits parsed messages and ignores malformed private content', () => {
    localStorage.setItem('auth_token', 'token');
    const service = createService();
    service.connect();
    const received: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.messages$.subscribe((message) => received.push(message));
    const socket = FakeWebSocket.instances[0];

    socket.receive(JSON.stringify({
      type: 'private_message',
      message_id: 'message-1',
      from_user_id: USER_ID,
      content: 'private words',
      message_type: 'text',
      created_at: '2026-09-01T10:00:00Z',
    }));
    socket.receive('{private words');
    socket.receive({ type: 'private_message' });

    expect(received).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith('New message on B-SIDE', {
      body: 'Open B-SIDE to read it.',
      tag: `chat-${USER_ID}`,
    });
    expect(consoleError).toHaveBeenCalledWith('Failed to parse a WebSocket message.');
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('private words');
    consoleError.mockRestore();
  });

  it('reconnects after a dropped connection', () => {
    vi.useFakeTimers();
    localStorage.setItem('auth_token', 'token');
    const service = createService();
    TestBed.tick();
    FakeWebSocket.instances[0].drop();

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('cancels a pending reconnect during an explicit disconnect', () => {
    vi.useFakeTimers();
    localStorage.setItem('auth_token', 'token');
    const service = createService();
    TestBed.tick();
    FakeWebSocket.instances[0].drop();

    service.disconnect();
    vi.advanceTimersByTime(20000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(service.connectionState()).toBe('disconnected');
  });
});
