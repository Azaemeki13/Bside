import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, PLATFORM_ID, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Disc3, LucideAngularModule, Play, X, Trash2 } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AudioPlayerService } from '../../../services/audio.player.service';
import { AlbumService } from '../../../services/album.service';
import { ArtistService } from '../../../services/artist.service';
import type { AudioFormat } from '../../audio/models/audio.models';
import type { ArtistDetailResponse, ArtistSongItem } from '../models/artist.models';
import { AdminService } from '../../../services/admin.service';
import { AuthService } from '../../../services/auth.service';
import { browserStorageUrl } from '../../../shared/utils/storage-url';

@Component({
  selector: 'app-artist-detail',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  templateUrl: './artist-detail.html',
  styleUrl: './artist-detail.scss',
})
export class ArtistDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly artistService = inject(ArtistService);
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly playIcon = Play;
  readonly x = X;
  readonly disc3 = Disc3;
  readonly trash2 = Trash2;

  artist: ArtistDetailResponse | null = null;
  isLoading = false;
  error = '';
  playbackError = '';
  activeSongId = '';
  isTryMePopupOpen = false;
  isDeletingArtist = false;
  deleteError = '';

  private routeSub?: Subscription;
  private artistSub?: Subscription;

  constructor() {
    effect(() => {
      this.activeSongId = this.audio.currentTrack()?.id ?? '';
    });
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const artistId = params.get('artistId');
      if (!artistId) {
        this.error = 'Artist not found.';
        this.artist = null;
        return;
      }

      this.loadArtist(artistId);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.artistSub?.unsubscribe();
  }

  get isAdmin(): boolean {
    const role = this.authService.currentUser()?.role;
    return role === 'Admin' || role === 'Moderator';
  }

  deleteArtist(): void {
    if (!this.artist || !this.isAdmin) return;
    if (!confirm(`Permanently delete "${this.artist.name}" and all their albums and songs? This cannot be undone.`)) {
      return;
    }
    this.deleteError = '';
    this.isDeletingArtist = true;
    this.adminService.deleteArtist(this.artist.id).subscribe({
      next: () => {
        this.router.navigate(['/bside_app/library']);
      },
      error: () => {
        this.deleteError = 'Could not delete this artist.';
        this.isDeletingArtist = false;
        this.cdr.detectChanges();
      },
    });
  }

  get playableSongs(): ArtistSongItem[] {
    return this.artist?.songs.filter((song) => song.status === 'Ready') ?? [];
  }

  playAll(): void {
    if (!this.artist)
      return;

    const songs = this.playableSongs;
    if (songs.length === 0)
      return;

    this.playSong(songs[0]);
  }

  play(song: ArtistSongItem): void {
    this.playSong(song);
  }

  coverUrl(url: string): string {
    if (!url)
      return 'assets/cover1.png';

    return browserStorageUrl(url, this.platformId);
  }

  formatDuration(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private loadArtist(artistId: string): void {
    this.artistSub?.unsubscribe();
    this.artist = null;
    this.error = '';
    this.playbackError = '';
    this.isLoading = true;
    this.cdr.detectChanges();

    this.artistSub = this.artistService.getArtist(artistId).subscribe({
      next: (artist) => {
        this.artist = artist;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Could not load artist.';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private playSong(song: ArtistSongItem): void {
    this.playbackError = '';

    if (!this.artist)
      return;

    if (song.status !== 'Ready') {
      this.playbackError = 'This song is not ready yet.';
      return;
    }

    const queue = this.playableSongs.map((item) => ({
      id: item.id,
      title: item.title,
      artist: this.artist?.name ?? '',
      artistId: this.artist?.id,
      format: this.audioFormat(item),
      coverUrl: this.coverUrl(this.artist?.photo_url ?? ''),
      onRequestUrl: () => this.albumService.getSongStreamUrl(item.id),
    }));
    const startIndex = queue.findIndex((entry) => entry.id === song.id);

    this.activeSongId = song.id;
    this.audio.setQueue(queue, Math.max(0, startIndex));
  }

  private audioFormat(song: ArtistSongItem): AudioFormat {
    const source = `${song.audio_url} ${song.title}`.toLowerCase();

    if (source.includes('.flac'))
      return 'flac';
    return 'wav';
  }
}
