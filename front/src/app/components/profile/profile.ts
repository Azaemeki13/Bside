import { Component, Output, EventEmitter, inject, computed, ElementRef, HostListener } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { PlaylistService, Playlist } from '../../services/playlist.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  protected readonly authService = inject(AuthService);
  protected readonly playlistService = inject(PlaylistService);
  @Output() close = new EventEmitter<void>();

  private readonly DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg/250px-Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg';
  protected readonly avatarUrl = computed(() => this.authService.currentUser()?.avatar_url ?? this.DEFAULT_AVATAR);
  protected readonly username = computed(() => this.authService.currentUser()?.username);

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {
    this.playlistService.loadPlaylists();
  }

  protected selectPlaylist(playlist: Playlist): void {
    this.playlistService.select(playlist);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (this.elementRef.nativeElement.contains(event.target as Node)) {
      return;
    }
    this.close.emit();
  }
}