import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, Heart, Play, Trash2, Timer } from 'lucide-angular';
import { PlaylistService, PlaylistSongItem } from '../../services/playlist.service';
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
  protected readonly play = Play;
  protected readonly timer = Timer;
  protected playlistService = inject(PlaylistService);
  protected authService = inject(AuthService);

  protected placeholderSongs: PlaylistSongItem[] = [
    { link_id: '1', song_id: '1', title: 'Digital Love', duration_seconds: 301, position: 1 },
    { link_id: '2', song_id: '2', title: 'Harder Better Faster Strongfjisdofdosdhoshfodfhsoer', duration_seconds: 224, position: 2 },
    { link_id: '3', song_id: '3', title: 'One More Time', duration_seconds: 320000, position: 3 },
  ];

  deletePlaylist(): void {
    const playlist = this.playlistService.selectedPlaylist();
    if (!playlist) return;
    this.playlistService.delete(playlist.id).subscribe({
      error: (err) => console.error('Failed to delete playlist', err)
    });
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatTotalDuration(seconds?: number): string {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }
}