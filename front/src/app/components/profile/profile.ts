import { CommonModule } from '@angular/common';
import { Component, Output, EventEmitter, inject, computed, signal, ElementRef, HostListener, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PlaylistService, Playlist } from '../../services/playlist.service';
import { displayName } from '../../models/chat.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  protected readonly authService = inject(AuthService);
  protected readonly playlistService = inject(PlaylistService);
  private readonly router = inject(Router);
  @Output() close = new EventEmitter<void>();
  @ViewChild('avatarInput') avatarInput?: ElementRef<HTMLInputElement>;

  private readonly DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg/250px-Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg';
  protected readonly avatarUrl = computed(() => this.authService.currentUser()?.avatar_url ?? this.DEFAULT_AVATAR);
  protected readonly effectiveName = computed(() => {
    const user = this.authService.currentUser();
    return user ? displayName(user.username, user.display_name) : '';
  });

  protected isEditingName = signal(false);
  protected nameInput = signal('');
  protected isSavingName = signal(false);
  protected isUploadingAvatar = signal(false);
  protected errorMessage = signal('');

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {
    this.playlistService.loadPlaylists();
  }

  protected selectPlaylist(playlist: Playlist): void {
    this.playlistService.select(playlist);
    this.router.navigate(['/bside_app/library']);
  }

  protected startEditingName(): void {
    this.errorMessage.set('');
    this.nameInput.set(this.authService.currentUser()?.display_name ?? '');
    this.isEditingName.set(true);
  }

  protected cancelEditingName(): void {
    this.isEditingName.set(false);
  }

  protected saveDisplayName(): void {
    this.isSavingName.set(true);
    this.errorMessage.set('');
    this.authService.updateDisplayName(this.nameInput().trim()).subscribe({
      next: () => {
        this.isSavingName.set(false);
        this.isEditingName.set(false);
      },
      error: (error) => {
        console.error('Failed to update display name:', error);
        this.errorMessage.set('Failed to update display name.');
        this.isSavingName.set(false);
      },
    });
  }

  protected triggerAvatarUpload(): void {
    this.avatarInput?.nativeElement.click();
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploadingAvatar.set(true);
    this.errorMessage.set('');
    this.authService.uploadAvatar(file).subscribe({
      next: () => {
        this.isUploadingAvatar.set(false);
        input.value = '';
      },
      error: (error) => {
        console.error('Failed to upload avatar:', error);
        this.errorMessage.set('Failed to upload avatar.');
        this.isUploadingAvatar.set(false);
        input.value = '';
      },
    });
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (this.elementRef.nativeElement.contains(event.target as Node)) {
      return;
    }
    this.close.emit();
  }
}