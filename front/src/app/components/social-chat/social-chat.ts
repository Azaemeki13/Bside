import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, MessageCircle, Send } from 'lucide-angular';
import { ChatMessage, ConversationListItem, displayName } from '../../models/chat.model';
import { SocialShareCard } from '../social-share-card/social-share-card';

@Component({
  selector: 'app-social-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, DatePipe, SocialShareCard],
  templateUrl: './social-chat.html',
  styleUrl: './social-chat.scss',
})
export class SocialChat implements OnChanges {
  @Input() selectedConversation: ConversationListItem | null = null;
  @Input() messages: ChatMessage[] = [];
  @Input() currentUserId: string | null = null;
  @Input() isLoadingMessages = false;
  @Input() isOtherUserOnline: boolean | null = null;

  @Output() messageSent = new EventEmitter<string>();

  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;

  draftMessage = '';
  headerAvatarBroken = false;

  protected readonly messageCircle = MessageCircle;
  protected readonly send = Send;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedConversation']) {
      this.headerAvatarBroken = false;
    }

    if (changes['messages'] || changes['selectedConversation']) {
      this.scrollToBottom();
    }
  }

  submitMessage(): void {
    const content = this.draftMessage.trim();

    if (!content) return;

    this.messageSent.emit(content);
    this.draftMessage = '';
  }

  isOwnMessage(message: ChatMessage): boolean {
    return message.sender_id === this.currentUserId;
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

  trackMessageById(_: number, message: ChatMessage): string {
    return message.id;
  }

  onHeaderAvatarError(): void {
    this.headerAvatarBroken = true;
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.messagesContainer?.nativeElement;

      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}