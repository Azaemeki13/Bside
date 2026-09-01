import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environment';
import {
  ChatMessage,
  ChatUser,
  ConversationListItem,
  FriendListItem,
  FriendRequestItem,
  FriendRequestsResponse,
  MarkMessagesReadResponse,
  UserStatusResponse,
} from '../../../models/chat.model';

/** Owns every HTTP request used by conversations and friendships. */
@Injectable({ providedIn: 'root' })
export class SocialApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** Loads the current user's message-derived conversation list. */
  getConversations(): Observable<ConversationListItem[]> {
    return this.http.get<ConversationListItem[]>(`${this.apiUrl}/conversations`);
  }

  /** Loads the message history shared with one user. */
  getConversationMessages(otherUserId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/messages/${otherUserId}`);
  }

  /** Marks the selected conversation as read on the backend. */
  markConversationAsRead(otherUserId: string): Observable<MarkMessagesReadResponse> {
    return this.http.put<MarkMessagesReadResponse>(`${this.apiUrl}/messages/${otherUserId}/read`, {});
  }

  /** Loads users available to the social search. */
  getUsers(): Observable<ChatUser[]> {
    return this.http.get<ChatUser[]>(`${this.apiUrl}/users`);
  }

  /** Loads one user when a conversation is opened from a deep link. */
  getUser(userId: string): Observable<ChatUser> {
    return this.http.get<ChatUser>(`${this.apiUrl}/users/${userId}`);
  }

  /** Loads the current user's accepted friends. */
  getFriends(): Observable<FriendListItem[]> {
    return this.http.get<FriendListItem[]>(`${this.apiUrl}/friends`);
  }

  /** Loads incoming and outgoing friendship requests together. */
  getFriendRequests(): Observable<FriendRequestsResponse> {
    return this.http.get<FriendRequestsResponse>(`${this.apiUrl}/friend-requests`);
  }

  /** Sends a friendship request to one user. */
  sendFriendRequest(userId: string): Observable<FriendRequestItem> {
    return this.http.post<FriendRequestItem>(`${this.apiUrl}/friends/${userId}`, {});
  }

  /** Accepts an incoming request by its friendship identifier. */
  acceptFriendRequest(friendshipId: string): Observable<FriendRequestItem> {
    return this.http.put<FriendRequestItem>(`${this.apiUrl}/friend-requests/${friendshipId}/accept`, {});
  }

  /** Rejects an incoming request by its friendship identifier. */
  rejectFriendRequest(friendshipId: string): Observable<FriendRequestItem> {
    return this.http.put<FriendRequestItem>(`${this.apiUrl}/friend-requests/${friendshipId}/reject`, {});
  }

  /** Removes an accepted friend and their empty local conversation. */
  removeFriend(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/friends/${userId}`);
  }

  /** Loads the privacy-aware online state for one user. */
  getUserStatus(userId: string): Observable<UserStatusResponse> {
    return this.http.get<UserStatusResponse>(`${this.apiUrl}/users/${userId}/status`);
  }
}
