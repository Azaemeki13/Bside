import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Search, X, ImagePlus } from 'lucide-angular';
import { HeartCard } from '../heart-card/heart-card';
import { PlaylistService, Playlist } from '../../services/playlist.service';

@Component({
  selector: 'app-playlist-mosaic',
  imports: [LucideAngularModule, HeartCard, FormsModule],
  templateUrl: './playlist-mosaic.html',
  styleUrl: './playlist-mosaic.scss',
})
export class PlaylistMosaic implements OnInit {
  protected readonly plus = Plus;
  protected readonly search = Search;
  protected readonly x = X;
  protected readonly imagePlus = ImagePlus;

  protected playlistService = inject(PlaylistService);
  private platformId = inject(PLATFORM_ID);

  searchOpen = false;
  isCreateOpen = false;
  coverPreview: string | null = null;
  playlistName = '';
  playlistDescription = '';

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.playlistService.loadPlaylists();
    }
  }

  selectPlaylist(playlist: Playlist): void {
    this.playlistService.select(playlist);
  }

  closeCreateDialog(): void {
    this.isCreateOpen = false;
    if (this.coverPreview) URL.revokeObjectURL(this.coverPreview);
    this.coverPreview = null;
    this.playlistName = '';
    this.playlistDescription = '';
  }

  confirmCreate(): void {
    if (!this.playlistName.trim()) return;

    this.playlistService.create(this.playlistName.trim()).subscribe({
      next: () => this.closeCreateDialog(),
      error: (err) => console.error('Failed to create playlist', err)
    });
  }

  onCoverSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      if (this.coverPreview) URL.revokeObjectURL(this.coverPreview);
      this.coverPreview = URL.createObjectURL(file);
    }
  }
}
