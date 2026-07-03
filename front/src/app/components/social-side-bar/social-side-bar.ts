import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, UserRoundPlus } from 'lucide-angular';
import {
  ChatUser,
  ConversationListItem,
  FriendRequestsResponse,
} from '../../models/chat.model';

@Component({
  selector: 'app-social-side-bar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  templateUrl: './social-side-bar.html',
  styleUrl: './social-side-bar.scss',
})
export class SocialSideBar {
  @Input() users: ChatUser[] = [];
  @Input() conversations: ConversationListItem[] = [];
  @Input() currentUserId: string | null = null;
  @Input() selectedConversationId: string | null = null;
  @Input() isLoadingUsers = false;
  @Input() isLoadingConversations = false;
  @Input() friendIds: Set<string> = new Set();
  @Input() friendRequests: FriendRequestsResponse = { incoming: [], outgoing: [] };
  @Input() friendActionUserId: string | null = null;

  @Output() conversationSelected = new EventEmitter<ConversationListItem>();
  @Output() userSelected = new EventEmitter<ChatUser>();
  @Output() friendRequested = new EventEmitter<ChatUser>();

  searchQuery = '';
  isSearchOpen = false;

  protected readonly search = Search;
  protected readonly addFriend = UserRoundPlus;

  get filteredUsers(): ChatUser[] {
    const query = this.searchQuery.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    return this.users
      .filter((user) => user.id !== this.currentUserId)
      .filter((user) => {
        const username = user.username.toLowerCase();
        const email = (user.email ?? '').toLowerCase();

        return username.includes(query) || email.includes(query);
      });
  }

  get conversationPreviews(): ConversationListItem[] {
    return this.conversations;
  }

  closeSoon(): void {
    window.setTimeout(() => {
      this.isSearchOpen = false;
    }, 150);
  }

  onSearchFocus(): void {
    if (this.searchQuery.trim().length >= 2) {
      this.isSearchOpen = true;
    }
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.searchQuery = input?.value ?? '';
    this.isSearchOpen = this.searchQuery.trim().length >= 2;
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.isSearchOpen = false;
  }

  openConversationForUser(user: ChatUser): void {
    const existingConversation = this.conversations.find(
      (conversation) => conversation.other_user_id === user.id
    );

    if (existingConversation) {
      this.conversationSelected.emit(existingConversation);
      this.clearSearch();
      return;
    }

    this.userSelected.emit(user);
    this.clearSearch();
  }

  requestFriend(user: ChatUser): void {
    this.friendRequested.emit(user);
    this.clearSearch();
  }

  isFriend(userId: string): boolean {
    return this.friendIds.has(userId);
  }

  hasPendingOutgoingRequest(userId: string): boolean {
    return this.friendRequests.outgoing.some((request) => request.addressee_id === userId);
  }

  hasPendingIncomingRequest(userId: string): boolean {
    return this.friendRequests.incoming.some((request) => request.requester_id === userId);
  }

  getAvatarInitials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  trackConversationById(_: number, conversation: ConversationListItem): string {
    return conversation.other_user_id;
  }

}