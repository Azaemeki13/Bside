import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Bell, Check, LucideAngularModule, Search, UserRoundPlus, X } from 'lucide-angular';
import {
  ChatUser,
  ConversationListItem,
  displayName,
  FriendListItem,
  FriendRequestItem,
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
  @Input() friends: FriendListItem[] = [];
  @Input() friendRequests: FriendRequestsResponse = { incoming: [], outgoing: [] };
  @Input() friendActionUserId: string | null = null;
  @Input() friendActionRequestId: string | null = null;

  @Output() conversationSelected = new EventEmitter<ConversationListItem>();
  @Output() userSelected = new EventEmitter<ChatUser>();
  @Output() friendRequested = new EventEmitter<ChatUser>();
  @Output() friendAccepted = new EventEmitter<FriendRequestItem>();
  @Output() friendRejected = new EventEmitter<FriendRequestItem>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  searchQuery = '';
  isSearchOpen = false;
  isRequestsOpen = false;
  brokenAvatarIds = new Set<string>();

  protected readonly search = Search;
  protected readonly addFriend = UserRoundPlus;
  protected readonly bell = Bell;
  protected readonly check = Check;
  protected readonly x = X;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isRequestsOpen && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isRequestsOpen = false;
    }
  }

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

  toggleRequests(): void {
    this.isRequestsOpen = !this.isRequestsOpen;

    if (this.isRequestsOpen) {
      this.isSearchOpen = false;
    }
  }

  acceptRequest(request: FriendRequestItem): void {
    this.friendAccepted.emit(request);
    this.isRequestsOpen = false;
  }

  rejectRequest(request: FriendRequestItem): void {
    this.friendRejected.emit(request);
  }

  isFriend(userId: string): boolean {
    return this.friendIds.has(userId);
  }

  isUserOnline(userId: string): boolean {
    return this.friends.some((friend) => friend.user_id === userId && friend.is_online);
  }

  hasPendingOutgoingRequest(userId: string): boolean {
    return this.friendRequests.outgoing.some((request) => request.addressee_id === userId);
  }

  hasPendingIncomingRequest(userId: string): boolean {
    return this.friendRequests.incoming.some((request) => request.requester_id === userId);
  }

  nameForUser(user: ChatUser): string {
    return displayName(user.username, user.display_name);
  }

  nameForRequester(request: FriendRequestItem): string {
    return displayName(request.requester_username, request.requester_display_name);
  }

  nameForConversation(conversation: ConversationListItem): string {
    return displayName(conversation.other_username, conversation.other_display_name);
  }

  getAvatarInitials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  onAvatarError(id: string): void {
    this.brokenAvatarIds.add(id);
  }

  trackConversationById(_: number, conversation: ConversationListItem): string {
    return conversation.other_user_id;
  }

  timeAgo(dateString: string): string {
    const then = new Date(dateString).getTime();

    if (Number.isNaN(then)) return '';

    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 5) return 'a few minutes ago';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  }
}