import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Disc3, EllipsisVertical, Heart, LucideAngularModule, Play, Timer, Trash2, X } from 'lucide-angular';
import { Subscription, switchMap } from 'rxjs';
import { AudioPlayerService } from '../../../services/audio.player.service';
import { AlbumService } from '../../../services/album.service';
import { PlaylistService } from '../../../services/playlist.service';
import type { AudioFormat } from '../../audio/models/audio.models';
import type { Playlist } from '../../library/models/playlist.models';
import { ChatSocketService } from '../../../features/social/data-access/chat-socket.service';
import { SocialApiService } from '../../../features/social/data-access/social-api.service';
import { FriendListItem } from '../../../models/chat.model';
import { browserStorageUrl } from '../../../shared/utils/storage-url';
import { AlbumDetailFacade } from '../album-detail.facade';
import type { AlbumDetailedResponse, AlbumSongItem } from '../models/album.models';

@Component({
  selector: 'app-album-detail',
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './album-detail.html',
  styleUrl: './album-detail.scss',
  providers: [AlbumDetailFacade],
})
/** Coordinates the album detail page — loading and admin operations are owned by AlbumDetailFacade. */
export class AlbumDetail implements OnInit, OnDestroy {
  private readonly facade = inject(AlbumDetailFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly albumService = inject(AlbumService);
  protected readonly playlistService = inject(PlaylistService);
  private readonly audio = inject(AudioPlayerService);
  private readonly socialApi = inject(SocialApiService);
  private readonly chatSocket = inject(ChatSocketService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly playIcon = Play;
  readonly timer = Timer;
  readonly ellipsisVertical = EllipsisVertical;
  readonly heart = Heart;
  readonly x = X;
  readonly disc3 = Disc3;
  readonly trash2 = Trash2;

  // Thin getters so the existing template bindings stay unchanged.
  protected get album(): AlbumDetailedResponse | null { return this.facade.album(); }
  protected get isLoading(): boolean { return this.facade.isLoading(); }
  protected get error(): string { return this.facade.error(); }
  protected get isDeletingAlbum(): boolean { return this.facade.isDeletingAlbum(); }
  protected get deletingSongId(): string { return this.facade.deletingSongId(); }
  protected get deleteError(): string { return this.facade.deleteError(); }
  protected get canDeleteCatalog(): boolean { return this.facade.canDeleteCatalog(); }

  protected playbackError = '';
  protected playlistActionMessage = '';
  protected playlistActionError = '';
  protected activeSongId = '';
  protected openMenuSongId = '';
  protected selectedSong: AlbumSongItem | null = null;
  protected isPlaylistDialogOpen = false;
  protected newPlaylistName = '';
  protected isAddingToPlaylist = false;
  protected isTryMePopupOpen = false;
  protected shareMenuSongId = '';
  protected friends: FriendListItem[] = [];
  protected isLoadingFriends = false;
  protected shareTargetUserId = '';
  protected shareFeedback = '';

  private routeSub?: Subscription;

  constructor() {
    effect(() => {
      this.activeSongId = this.audio.currentTrack()?.id ?? '';
    });
  }

  ngOnInit(): void {
    this.playlistService.loadPlaylists();
    this.playlistService.loadLikedSongs();
    this.chatSocket.connect();
    this.loadFriends();
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const albumId = params.get('albumId');
      if (!albumId) return;
      this.facade.loadAlbum(albumId);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  protected play(song: AlbumSongItem): void {
    this.playbackError = '';
    const currentAlbum = this.album;
    if (!currentAlbum) return;

    if (song.status !== 'Ready') {
      this.playbackError = 'This song is not ready yet.';
      return;
    }

    const playableSongs = currentAlbum.songs.filter((s) => s.status === 'Ready');
    const startIndex = playableSongs.findIndex((s) => s.id === song.id);

    const queue = playableSongs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: currentAlbum.artist_name,
      artistId: currentAlbum.artist_id,
      format: this.audioFormat(s),
      coverUrl: this.coverUrl(currentAlbum.cover_url),
      onRequestUrl: () => this.albumService.getSongStreamUrl(s.id),
    }));

    this.activeSongId = song.id;
    this.audio.setQueue(queue, Math.max(0, startIndex));
  }

  // ── Admin actions ─────────────────────────────────────────────────────────

  protected deleteAlbum(): void {
    const currentAlbum = this.album;
    if (!currentAlbum || !this.canDeleteCatalog) return;
    if (!confirm(`Permanently delete "${currentAlbum.title}"? This cannot be undone.`)) return;
    this.facade.deleteAlbum();
  }

  protected deleteSong(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    if (!this.canDeleteCatalog) return;
    if (!confirm(`Permanently delete "${song.title}"? This cannot be undone.`)) return;
    this.openMenuSongId = '';
    this.facade.removeSong(song);
  }

  // ── Song context menu ────────────────────────────────────────────────────

  protected toggleSongMenu(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.openMenuSongId = this.openMenuSongId === song.id ? '' : song.id;
    this.shareMenuSongId = '';
    this.shareFeedback = '';
  }

  // ── Social sharing ────────────────────────────────────────────────────────

  protected openShareMenu(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.shareMenuSongId = song.id;
    this.shareFeedback = '';
    if (!this.isLoadingFriends) this.loadFriends();
  }

  protected closeShareMenu(event: Event): void {
    event.stopPropagation();
    this.shareMenuSongId = '';
  }

  protected loadFriends(): void {
    this.isLoadingFriends = this.friends.length === 0;
    this.socialApi.getFriends().subscribe({
      next: (friends) => {
        this.friends = friends;
        this.isLoadingFriends = false;
      },
      error: (err) => {
        console.error('Failed to load friends', err);
        this.isLoadingFriends = false;
      },
    });
  }

  protected shareSong(event: Event, song: AlbumSongItem, friend: FriendListItem): void {
    event.preventDefault();
    event.stopPropagation();

    const sent = this.chatSocket.sendSongMessage(friend.user_id, song.id);
    if (!sent) {
      this.shareFeedback = 'Reconnecting, please try again.';
      this.chatSocket.connect();
      return;
    }

    this.shareFeedback = `Shared with ${friend.username}`;
    this.shareTargetUserId = friend.user_id;
    setTimeout(() => {
      this.openMenuSongId = '';
      this.shareMenuSongId = '';
      this.shareFeedback = '';
    }, 900);
  }

  // ── Playlist management ───────────────────────────────────────────────────

  protected openAddToPlaylistDialog(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.selectedSong = song;
    this.openMenuSongId = '';
    this.playlistActionMessage = '';
    this.playlistActionError = '';
    this.newPlaylistName = '';
    this.isPlaylistDialogOpen = true;
  }

  protected toggleLike(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    if (this.playlistService.isLiked(song.id)) {
      this.playlistService.unlikeSong(song.id).subscribe({
        error: (err) => console.error('Failed to unlike song', err),
      });
      return;
    }
    this.playlistService.likeSong(song.id).subscribe({
      error: (err) => console.error('Failed to like song', err),
    });
  }

  protected closePlaylistDialog(): void {
    if (this.isAddingToPlaylist) return;
    this.isPlaylistDialogOpen = false;
    this.selectedSong = null;
    this.newPlaylistName = '';
  }

  protected addSelectedSongToPlaylist(playlist: Playlist): void {
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
      },
    });
  }

  protected createPlaylistWithSelectedSong(): void {
    const title = this.newPlaylistName.trim();
    if (!this.selectedSong || !title || [...title].length > 100) return;

    const songId = this.selectedSong.id;
    this.isAddingToPlaylist = true;
    this.playlistActionError = '';

    this.playlistService.create(title, '').pipe(
      switchMap((playlist) => this.playlistService.addSong(playlist.id, songId)),
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
      },
    });
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  protected coverUrl(url: string): string {
    if (!url) return 'assets/cover1.png';
    return browserStorageUrl(url, this.platformId);
  }

  protected formatDuration(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remaining = safeSeconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, '0')}`;
  }

  private audioFormat(song: AlbumSongItem): AudioFormat {
    const source = `${song.audio_url} ${song.title}`.toLowerCase();
    return source.includes('.flac') ? 'flac' : 'wav';
  }
}
