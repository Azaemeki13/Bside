import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EllipsisVertical, Heart, LucideAngularModule, Play, Timer, X } from 'lucide-angular';
import { Subscription, switchMap } from 'rxjs';
import { AudioFormat, AudioPlayerService } from '../../services/audio.player.service';
import { AlbumDetailedResponse, AlbumService, AlbumSongItem } from '../../services/album.service';
import { Playlist, PlaylistService } from '../../services/playlist.service';

@Component({
  selector: 'app-album-detail',
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './album-detail.html',
  styleUrl: './album-detail.scss',
})
export class AlbumDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);
  protected readonly playlistService = inject(PlaylistService);
  private readonly audio = inject(AudioPlayerService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly playIcon = Play;
  readonly timer = Timer;
  readonly ellipsisVertical = EllipsisVertical;
  readonly heart = Heart;
  readonly x = X;

  album: AlbumDetailedResponse | null = null;
  isLoading = false;
  error = '';
  playbackError = '';
  playlistActionMessage = '';
  playlistActionError = '';
  activeSongId = '';
  openMenuSongId = '';
  selectedSong: AlbumSongItem | null = null;
  isPlaylistDialogOpen = false;
  newPlaylistName = '';
  isAddingToPlaylist = false;
  isTryMePopupOpen = false;

  private routeSub?: Subscription;
  private albumSub?: Subscription;

  constructor() {
    effect(() => {
      this.activeSongId = this.audio.currentTrack()?.id ?? '';
    });
  }

  ngOnInit(): void {
    this.playlistService.loadPlaylists();
    this.playlistService.loadLikedSongs();
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

  toggleSongMenu(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.openMenuSongId = this.openMenuSongId === song.id ? '' : song.id;
  }

  openAddToPlaylistDialog(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.selectedSong = song;
    this.openMenuSongId = '';
    this.playlistActionMessage = '';
    this.playlistActionError = '';
    this.newPlaylistName = '';
    this.isPlaylistDialogOpen = true;
  }

  toggleLike(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    if (this.playlistService.isLiked(song.id)) {
      this.playlistService.unlikeSong(song.id).subscribe({
        error: (err) => console.error('Failed to unlike song', err)
      });
      return;
    }
    this.playlistService.likeSong(song.id).subscribe({
      error: (err) => console.error('Failed to like song', err)
    });
  }

  closePlaylistDialog(): void {
    if (this.isAddingToPlaylist) return;

    this.isPlaylistDialogOpen = false;
    this.selectedSong = null;
    this.newPlaylistName = '';
  }

  addSelectedSongToPlaylist(playlist: Playlist): void {
    if (!this.selectedSong) return;

    this.isAddingToPlaylist = true;
    this.playlistActionError = '';
    this.playlistService.addSong(playlist.id, this.selectedSong.id).subscribe({
      next: () => {
        this.playlistActionMessage = `Added to ${playlist.title}.`;
        this.isAddingToPlaylist = false;
        this.closePlaylistDialog();
      },
      error: (err) => {
        this.playlistActionError = 'Could not add this song to the playlist.';
        this.isAddingToPlaylist = false;
        console.error('Failed to add song to playlist', err);
      }
    });
  }

  createPlaylistWithSelectedSong(): void {
    if (!this.selectedSong || !this.newPlaylistName.trim()) return;

    const songId = this.selectedSong.id;
    const title = this.newPlaylistName.trim();
    this.isAddingToPlaylist = true;
    this.playlistActionError = '';

    this.playlistService.create(title, '').pipe(
      switchMap((playlist) => this.playlistService.addSong(playlist.id, songId))
    ).subscribe({
      next: () => {
        this.playlistActionMessage = `Created ${title}.`;
        this.isAddingToPlaylist = false;
        this.closePlaylistDialog();
      },
      error: (err) => {
        this.playlistActionError = 'Could not create the playlist with this song.';
        this.isAddingToPlaylist = false;
        console.error('Failed to create playlist with song', err);
      }
    });
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

    this.albumSub = this.albumService.getAlbum(albumId).subscribe({
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
