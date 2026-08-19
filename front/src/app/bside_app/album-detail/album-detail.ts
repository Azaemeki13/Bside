import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, PLATFORM_ID, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Disc3, EllipsisVertical, Heart, LucideAngularModule, Play, Timer, X ,Trash2} from 'lucide-angular';
import { Subscription, switchMap } from 'rxjs';
import { AudioFormat, AudioPlayerService } from '../../services/audio.player.service';
import { AlbumDetailedResponse, AlbumService, AlbumSongItem } from '../../services/album.service';
import { Playlist, PlaylistService } from '../../services/playlist.service';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { FriendListItem } from '../../models/chat.model';
import { browserStorageUrl } from '../../utils/storage-url';
import { ArtistService } from '../../services/artist.service';

@Component({
  selector: 'app-album-detail',
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './album-detail.html',
  styleUrl: './album-detail.scss',
})
export class AlbumDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly albumService = inject(AlbumService);
  private readonly artistService = inject(ArtistService);
  protected readonly playlistService = inject(PlaylistService);
  private readonly audio = inject(AudioPlayerService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly playIcon = Play;
  readonly timer = Timer;
  readonly ellipsisVertical = EllipsisVertical;
  readonly heart = Heart;
  readonly x = X;
  readonly disc3 = Disc3;
  readonly trash2 = Trash2;

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
  shareMenuSongId = '';
  friends: FriendListItem[] = [];
  isLoadingFriends = false;
  shareTargetUserId = '';
  shareFeedback = '';
  isDeletingAlbum = false;
  deletingSongId = '';
  deleteError = '';
  private catalogOwnerUserId: string | null = null;

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
    this.chatService.connect();
    this.loadFriends();
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
      artistId: this.album?.artist_id,
      format: this.audioFormat(item),
      coverUrl: this.coverUrl(this.album?.cover_url ?? ''),
      onRequestUrl: () => this.albumService.getSongStreamUrl(item.id),
    }));

    this.activeSongId = song.id;
    this.audio.setQueue(queue, Math.max(0, startIndex));
  }

  get canDeleteCatalog(): boolean {
    const role = this.authService.currentUser()?.role;
    return role === 'Admin' || this.catalogOwnerUserId === this.authService.currentUser()?.id;
  }

  deleteAlbum(): void {
    if (!this.album || !this.canDeleteCatalog) return;
    if (!confirm(`Permanently delete "${this.album.title}"? This cannot be undone.`)) {
      return;
    }
    this.deleteError = '';
    this.isDeletingAlbum = true;
    this.albumService.deleteAlbum(this.album.id).subscribe({
      next: () => {
        this.router.navigate(['/bside_app/library']);
      },
      error: () => {
        this.deleteError = 'Could not delete this album.';
        this.isDeletingAlbum = false;
        this.cdr.detectChanges();
      },
    });
  }

  deleteSong(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    if (!this.album || !this.canDeleteCatalog) return;
    if (!confirm(`Permanently delete "${song.title}"? This cannot be undone.`)) {
      return;
    }
    this.openMenuSongId = '';
    this.deleteError = '';
    this.deletingSongId = song.id;
    this.albumService.deleteSong(song.id).subscribe({
      next: () => {
        if (this.album) {
          this.album = { ...this.album, songs: this.album.songs.filter((item) => item.id !== song.id) };
        }
        this.deletingSongId = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.deleteError = `Could not delete "${song.title}".`;
        this.deletingSongId = '';
        this.cdr.detectChanges();
      },
    });
  }

  toggleSongMenu(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.openMenuSongId = this.openMenuSongId === song.id ? '' : song.id;
    this.shareMenuSongId = '';
    this.shareFeedback = '';
  }

  openShareMenu(event: Event, song: AlbumSongItem): void {
    event.stopPropagation();
    this.shareMenuSongId = song.id;
    this.shareFeedback = '';

    if (!this.isLoadingFriends) {
      this.loadFriends();
    }
  }

  closeShareMenu(event: Event): void {
    event.stopPropagation();
    this.shareMenuSongId = '';
  }

  loadFriends(): void {
    this.isLoadingFriends = this.friends.length === 0;

    this.chatService.getFriends().subscribe({
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

  shareSong(event: Event, song: AlbumSongItem, friend: FriendListItem): void {
	event.preventDefault();
    event.stopPropagation();

    const isSentToSocket = this.chatService.sendSongMessage(friend.user_id, song.id);

    if (!isSentToSocket) {
      this.shareFeedback = 'Reconnecting, please try again.';
      this.chatService.connect();
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
    const title = this.newPlaylistName.trim();
    if (!this.selectedSong || !title || [...title].length > 100) return;

    const songId = this.selectedSong.id;
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

    return browserStorageUrl(url, this.platformId);
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
        this.catalogOwnerUserId = null;
        this.artistService.getArtist(album.artist_id).subscribe({
          next: (artist) => { this.catalogOwnerUserId = artist.user_id; this.cdr.detectChanges(); },
          error: () => { this.catalogOwnerUserId = null; },
        });
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
