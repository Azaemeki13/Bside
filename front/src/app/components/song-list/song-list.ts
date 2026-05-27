import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, Heart, Trash2 } from 'lucide-angular';
import { PlaylistService } from '../../services/playlist.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-song-list',
  imports: [LucideAngularModule, DatePipe],
  templateUrl: './song-list.html',
  styleUrl: './song-list.scss',
})
export class SongList {
  protected readonly heart = Heart;
  protected readonly trash2 = Trash2;
  protected playlistService = inject(PlaylistService);
  protected authService = inject(AuthService);

  deletePlaylist(): void {
    const playlist = this.playlistService.selectedPlaylist();
    if (!playlist) return;
    this.playlistService.delete(playlist.id).subscribe({
      error: (err) => console.error('Failed to delete playlist', err)
    });
  }

  formatDuration(seconds?: number): string {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }
}