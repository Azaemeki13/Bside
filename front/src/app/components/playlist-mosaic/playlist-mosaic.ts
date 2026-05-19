import { Component, inject } from '@angular/core';
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
export class PlaylistMosaic {
  protected readonly plus = Plus;
  protected readonly search = Search;
  protected readonly x = X;
  protected readonly imagePlus = ImagePlus;

  protected playlistService = inject(PlaylistService);

  searchOpen = false;
  isCreateOpen = false;
  coverPreview: string | null = null;
  playlistName = '';
  playlistDescription = '';

  selectPlaylist(playlist: Playlist): void {
    this.playlistService.select(playlist);
  }

  closeCreateDialog(): void {
    this.isCreateOpen = false;
    if (this.coverPreview) {
      URL.revokeObjectURL(this.coverPreview);
    }
    this.coverPreview = null;
    this.playlistName = '';
    this.playlistDescription = '';
  }

  confirmCreate(): void {
    if (!this.playlistName.trim()) return;
    this.playlistService.add({
      name: this.playlistName.trim(),
      description: this.playlistDescription.trim(),
      cover: this.coverPreview,
    });
    this.coverPreview = null;
    this.playlistName = '';
    this.playlistDescription = '';
    this.isCreateOpen = false;
  }

  onCoverSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      if (this.coverPreview) {
        URL.revokeObjectURL(this.coverPreview);
      }
      this.coverPreview = URL.createObjectURL(file);
    }
  }
}