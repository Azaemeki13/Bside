import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SocialApiService } from './social-api.service';

describe('SocialApiService', () => {
  let service: SocialApiService;
  let http: HttpTestingController;

  // Rebuild the adapter so every example owns exactly one request.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SocialApiService);
    http = TestBed.inject(HttpTestingController);
  });

  // Unmatched requests usually reveal a quiet endpoint change.
  afterEach(() => http.verify());

  it('loads conversations', () => {
    service.getConversations().subscribe();
    const request = http.expectOne('/api/conversations');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads one conversation history', () => {
    service.getConversationMessages('user-1').subscribe();
    const request = http.expectOne('/api/messages/user-1');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('marks one conversation as read with an empty body', () => {
    service.markConversationAsRead('user-2').subscribe();
    const request = http.expectOne('/api/messages/user-2/read');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush({ read_count: 3 });
  });

  it('loads searchable users', () => {
    service.getUsers().subscribe();
    const request = http.expectOne('/api/users');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads one user for a deep link', () => {
    service.getUser('user-3').subscribe();
    const request = http.expectOne('/api/users/user-3');
    expect(request.request.method).toBe('GET');
    request.flush({ id: 'user-3', username: 'ada' });
  });

  it('loads accepted friends', () => {
    service.getFriends().subscribe();
    const request = http.expectOne('/api/friends');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads incoming and outgoing friend requests', () => {
    service.getFriendRequests().subscribe();
    const request = http.expectOne('/api/friend-requests');
    expect(request.request.method).toBe('GET');
    request.flush({ incoming: [], outgoing: [] });
  });

  it('sends a friend request with an empty body', () => {
    service.sendFriendRequest('user-4').subscribe();
    const request = http.expectOne('/api/friends/user-4');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ friendship_id: 'friendship-1' });
  });

  it('accepts a friend request with an empty body', () => {
    service.acceptFriendRequest('friendship-2').subscribe();
    const request = http.expectOne('/api/friend-requests/friendship-2/accept');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush({ friendship_id: 'friendship-2' });
  });

  it('rejects a friend request with an empty body', () => {
    service.rejectFriendRequest('friendship-3').subscribe();
    const request = http.expectOne('/api/friend-requests/friendship-3/reject');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush({ friendship_id: 'friendship-3' });
  });

  it('removes one accepted friend', () => {
    service.removeFriend('user-5').subscribe();
    const request = http.expectOne('/api/friends/user-5');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('loads one privacy-aware online status', () => {
    service.getUserStatus('user-6').subscribe();
    const request = http.expectOne('/api/users/user-6/status');
    expect(request.request.method).toBe('GET');
    request.flush({ user_id: 'user-6', is_online: true });
  });
});
