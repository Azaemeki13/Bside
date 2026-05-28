import { CommonModule } from '@angular/common';
import { Component, OnDestroy, afterNextRender, effect, inject } from '@angular/core';
import { LucideAngularModule, Play } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AudioPlayerService } from '../../services/audio.player.service';
import { AlbumDetailedResponse, AlbumListItem, AlbumService, AlbumSongItem } from '../../services/album.service';

@Component({
  selector: 'app-albums',
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './albums.html',
  styleUrl: './albums.scss',
})
export class BsideAlbums implements OnDestroy {
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);

  readonly playIcon = Play;

  albums: AlbumListItem[] = [];
  selectedAlbum: AlbumDetailedResponse | null = null;
  isLoadingAlbums = false;
  isLoadingAlbum = false;
  error = '';
  playbackError = '';
  activeSongId = '';

  private albumCache = new Map<string, AlbumDetailedResponse>();
  private albumSub?: Subscription;

  constructor() {
    afterNextRender(() => this.loadAlbums());

    effect(() => {
      const track = this.audio.currentTrack();
      if (track) {
        this.activeSongId = track.id;
      }
    });
  }

  ngOnDestroy(): void {
    this.albumSub?.unsubscribe();
  }

  loadAlbums(): void {
    this.error = '';
    this.isLoadingAlbums = true;

    this.albumService.getAlbums().subscribe({
      next: (albums) => {
        this.albums = albums;
        this.isLoadingAlbums = false;
      },
      error: () => {
        this.error = 'Could not load albums.';
        this.isLoadingAlbums = false;
      },
    });
  }

  selectAlbum(album: AlbumListItem): void {
    this.albumSub?.unsubscribe();

    const cached = this.albumCache.get(album.id);
    if (cached) {
      this.selectedAlbum = cached;
      return;
    }

    this.error = '';
    this.playbackError = '';
    this.isLoadingAlbum = true;

    this.albumSub = this.albumService.getAlbum(album.id).subscribe({
      next: (details) => {
        this.albumCache.set(album.id, details);
        this.selectedAlbum = details;
        this.isLoadingAlbum = false;
      },
      error: () => {
        this.error = 'Could not load album songs.';
        this.isLoadingAlbum = false;
      },
    });
  }

  play(song: AlbumSongItem, index: number): void {
    this.playbackError = '';

    if (song.status !== 'Ready') {
      this.playbackError = 'This song is not ready yet.';
      return;
    }

    const songs = this.selectedAlbum?.songs.filter(s => s.status === 'Ready') ?? [];
    const startIndex = songs.findIndex(s => s.id === song.id);

    const queue = songs.map(s => ({
      id: s.id,
      title: s.title,
      artist: this.selectedAlbum?.artist_name ?? '',
      format: 'wav' as const,
      coverUrl: this.selectedAlbum?.cover_url ?? '',
      onRequestUrl: () => this.albumService.getSongStreamUrl(s.id),
    }));

    this.activeSongId = song.id;
    this.audio.setQueue(queue, Math.max(0, startIndex));
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  coverUrl(url: string): string {
    return url.replace('http://minio:9000', 'http://localhost:9000');
  }
}
