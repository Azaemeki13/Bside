import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, Play, Timer } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AudioFormat, AudioPlayerService } from '../../services/audio.player.service';
import { AlbumDetailedResponse, AlbumService, AlbumSongItem } from '../../services/album.service';

@Component({
  selector: 'app-album-detail',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  templateUrl: './album-detail.html',
  styleUrl: './album-detail.scss',
})
export class AlbumDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly playIcon = Play;
  readonly timer = Timer;

  album: AlbumDetailedResponse | null = null;
  isLoading = false;
  error = '';
  playbackError = '';
  activeSongId = '';

  private routeSub?: Subscription;
  private albumSub?: Subscription;

  constructor() {
    effect(() => {
      this.activeSongId = this.audio.currentTrack()?.id ?? '';
    });
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const albumId = params.get('albumId');
      if (!albumId) {
        this.error = 'Album not found.';
        this.album = null;
        return;
      }

      this.loadAlbum(albumId);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.albumSub?.unsubscribe();
  }

  play(song: AlbumSongItem): void {
    this.playbackError = '';

    if (!this.album)
      return;

    if (song.status !== 'Ready') {
      this.playbackError = 'This song is not ready yet.';
      return;
    }

    const playableSongs = this.album.songs.filter((item) => item.status === 'Ready');
    const startIndex = playableSongs.findIndex((item) => item.id === song.id);

    const queue = playableSongs.map((item) => ({
      id: item.id,
      title: item.title,
      artist: this.album?.artist_name ?? '',
      format: this.audioFormat(item),
      coverUrl: this.coverUrl(this.album?.cover_url ?? ''),
      onRequestUrl: () => this.albumService.getSongStreamUrl(item.id),
    }));

    this.activeSongId = song.id;
    this.audio.setQueue(queue, Math.max(0, startIndex));
  }

  coverUrl(url: string): string {
    if (!url)
      return 'assets/cover1.png';

    return url.replace(/^http:\/\/minio:9000/i, 'http://localhost:9000');
  }

  formatDuration(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private loadAlbum(albumId: string): void {
    this.albumSub?.unsubscribe();
    this.album = null;
    this.error = '';
    this.playbackError = '';
    this.isLoading = true;
    this.cdr.detectChanges();

    this.albumSub = this.albumService.getPublicAlbum(albumId).subscribe({
      next: (album) => {
        this.album = album;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Could not load album.';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private audioFormat(song: AlbumSongItem): AudioFormat {
    const source = `${song.audio_url} ${song.title}`.toLowerCase();

    if (source.includes('.flac'))
      return 'flac';
    return 'wav';
  }
}
