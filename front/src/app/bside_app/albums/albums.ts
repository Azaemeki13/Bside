import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { LucideAngularModule, Play } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AudioFormat, AudioPlayerService } from '../../services/audio.player.service';
import { AlbumDetailedResponse, AlbumListItem, AlbumService, AlbumSongItem } from '../../services/album.service';

@Component({
  selector: 'app-albums',
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './albums.html',
  styleUrl: './albums.scss',
})
export class BsideAlbums implements OnInit, OnDestroy {
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly playIcon = Play;

  albums: AlbumListItem[] = [];
  selectedAlbum: AlbumDetailedResponse | null = null;
  isLoadingAlbums = false;
  isLoadingAlbum = false;
  error = '';
  playbackError = '';
  activeSongId = '';

  private albumCache = new Map<string, AlbumDetailedResponse>();
  private albumsSub?: Subscription;
  private albumSub?: Subscription;
  private selectedAlbumRequestId = 0;

  constructor() {
    effect(() => {
      const track = this.audio.currentTrack();
      this.activeSongId = track?.id ?? '';
    });
  }

  ngOnInit(): void {
    this.loadAlbums();
  }

  ngOnDestroy(): void {
    this.albumsSub?.unsubscribe();
    this.albumSub?.unsubscribe();
  }

  loadAlbums(): void {
    this.albumsSub?.unsubscribe();
    this.error = '';
    this.isLoadingAlbums = true;
    this.cdr.detectChanges();

    this.albumsSub = this.albumService.getAlbums().subscribe({
      next: (albums) => {
        this.albums = albums;
        this.isLoadingAlbums = false;

        if (!albums.some((item) => item.id === this.selectedAlbum?.id)) {
          this.selectedAlbum = null;
        }

        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Could not load albums.';
        this.isLoadingAlbums = false;
        this.cdr.detectChanges();
      },
    });
  }

  selectAlbum(album: AlbumListItem): void {
    this.albumSub?.unsubscribe();
    const requestId = ++this.selectedAlbumRequestId;
    this.error = '';
    this.playbackError = '';

    const cached = this.albumCache.get(album.id);
    if (cached) {
      this.selectedAlbum = cached;
      this.isLoadingAlbum = false;
      this.cdr.detectChanges();
      return;
    }

    this.selectedAlbum = { ...album, songs: [] };
    this.isLoadingAlbum = true;
    this.cdr.detectChanges();

    this.albumSub = this.albumService.getAlbum(album.id).subscribe({
      next: (details) => {
        if (requestId !== this.selectedAlbumRequestId)
          return;

        this.albumCache.set(album.id, details);
        this.selectedAlbum = details;
        this.isLoadingAlbum = false;
        this.cdr.detectChanges();
      },
      error: () => {
        if (requestId !== this.selectedAlbumRequestId)
          return;

        this.error = 'Could not load album songs.';
        this.isLoadingAlbum = false;
        this.cdr.detectChanges();
      },
    });
  }

  play(song: AlbumSongItem): void {
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
      format: this.audioFormat(s),
      coverUrl: this.coverUrl(this.selectedAlbum?.cover_url ?? ''),
      onRequestUrl: () => this.albumService.getSongStreamUrl(s.id),
    }));

    this.activeSongId = song.id;
    this.audio.setQueue(queue, Math.max(0, startIndex));
  }

  formatDuration(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  coverUrl(url: string): string {
    if (!url)
      return 'assets/cover1.png';

    return url.replace(/^http:\/\/minio:9000/i, 'http://localhost:9000');
  }

  private audioFormat(song: AlbumSongItem): AudioFormat {
    const source = `${song.audio_url} ${song.title}`.toLowerCase();

    if (source.includes('.flac'))
      return 'flac';
    if (source.includes('.mp3'))
      return 'mp3';

    return 'wav';
  }
}

