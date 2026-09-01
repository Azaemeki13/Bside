import { Injectable, signal, inject } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import type { DailyMixResponse } from './daily-mix.service';
import { PlaylistApiService } from '../features/library/data-access/playlist-api.service';
import type {
  AddSongResponse,
  Playlist,
  PlaylistDetailedResponse,
  PlaylistSongItem,
} from '../features/library/models/playlist.models';

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private readonly api = inject(PlaylistApiService);
  private readonly authService = inject(AuthService);

  private isLoggedIn(): boolean {
    if (this.authService.currentUser()) return true;
    return typeof localStorage !== 'undefined' && !!localStorage.getItem('auth_token');
  }

  playlists = signal<Playlist[]>([]);
  selectedPlaylist = signal<(Playlist & { songs?: PlaylistSongItem[] }) | null>(null);
  likedSongsSelected = signal<boolean>(false);
  dailyMixSelected = signal<boolean>(false);
  likedSongIds = signal<Set<string>>(new Set<string>());

  loadPlaylists(): void {
    if (!this.isLoggedIn()) {
      this.playlists.set([]);
      return;
    }
    this.api.getPlaylists().subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: (err) => console.error('Failed to load playlists', err),
    });
  }

  getById(id: string): Observable<PlaylistDetailedResponse> {
    return this.api.getById(id);
  }

  create(title: string, description: string, cover?: File): Observable<Playlist> {
    return this.api.create(title, description, cover).pipe(
      tap((playlist) => this.add(playlist)),
    );
  }

  add(playlist: Playlist): void {
    this.playlists.update((list) =>
      list.some((p) => p.id === playlist.id) ? list : [playlist, ...list],
    );
  }

  delete(id: string): Observable<void> {
    return this.api.delete(id).pipe(
      tap(() => {
        this.playlists.update((list) => list.filter((p) => p.id !== id));
        this.selectedPlaylist.set(null);
      }),
    );
  }

  addSong(playlistId: string, songId: string): Observable<AddSongResponse> {
    return this.api.addSong(playlistId, songId).pipe(
      tap((response) => {
        if (!response.warning) {
          this.playlists.update((list) =>
            list.map((playlist) =>
              playlist.id === playlistId
                ? { ...playlist, song_count: (playlist.song_count ?? 0) + 1 }
                : playlist,
            ),
          );
        }

        if (this.selectedPlaylist()?.id === playlistId) {
          this.refreshSelectedPlaylist(playlistId);
        }
      }),
    );
  }

  removeSong(playlistId: string, linkId: string): Observable<void> {
    const removedSongId = this.selectedPlaylist()?.songs?.find(
      (song) => song.link_id === linkId,
    )?.song_id;
    return this.api.removeSong(playlistId, linkId).pipe(
      tap(() => {
        this.playlists.update((list) =>
          list.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, song_count: Math.max((playlist.song_count ?? 1) - 1, 0) }
              : playlist,
          ),
        );
        if (this.likedSongsSelected() && removedSongId) {
          this.likedSongIds.update((ids) => {
            const next = new Set(ids);
            next.delete(removedSongId);
            return next;
          });
        }
        this.refreshSelectedPlaylist(playlistId);
      }),
    );
  }

  selectLiked(): void {
    this.dailyMixSelected.set(false);
    this.likedSongsSelected.set(true);
    this.getLikedSongs().subscribe({
      next: (playlist) => {
        this.selectedPlaylist.set(playlist);
        this.setLikedSongsFromPlaylist(playlist);
      },
      error: (err) => console.error('Failed to load liked songs', err),
    });
  }

  select(playlist: Playlist): void {
    this.selectedPlaylist.set({ ...playlist, songs: [] });
    this.likedSongsSelected.set(false);
    this.dailyMixSelected.set(false);
    this.refreshSelectedPlaylist(playlist.id);
  }

  selectDetailed(playlist: PlaylistDetailedResponse): void {
    this.selectedPlaylist.set(playlist);
    this.likedSongsSelected.set(false);
    this.dailyMixSelected.set(false);
  }

  selectDailyMix(mix: DailyMixResponse): void {
    const songs: PlaylistSongItem[] = mix.songs.map((song) => ({
      link_id: `daily-mix-${song.song_id}`,
      song_id: song.song_id,
      title: song.title,
      duration_seconds: song.duration_seconds,
      position: song.position,
      audio_url: song.audio_url,
      status: 'Ready',
      artist_id: song.artist_id,
      artist_name: song.artist_name,
      cover_url: song.cover_url,
    }));
    this.likedSongsSelected.set(false);
    this.dailyMixSelected.set(true);
    this.selectedPlaylist.set({
      id: 'daily-mix',
      title: 'Your Daily Mix',
      description: `${mix.discovery_count} discoveries · ${mix.familiar_count} familiar · refreshes daily`,
      owner_id: this.authService.currentUser()?.id ?? '',
      owner_username: this.authService.currentUser()?.username ?? 'you',
      total_duration: songs.reduce((total, song) => total + song.duration_seconds, 0),
      song_count: songs.length,
      is_public: false,
      created_at: mix.generated_at,
      songs,
    });
  }

  selectedSongs(): PlaylistSongItem[] {
    return this.selectedPlaylist()?.songs ?? [];
  }

  getLikedSongs(): Observable<PlaylistDetailedResponse> {
    return this.api.getLikedSongs();
  }

  loadLikedSongs(): void {
    if (!this.isLoggedIn()) {
      this.likedSongIds.set(new Set<string>());
      return;
    }
    this.getLikedSongs().subscribe({
      next: (playlist) => this.setLikedSongsFromPlaylist(playlist),
      error: (err) => console.error('Failed to load liked songs', err),
    });
  }

  likeSong(songId: string): Observable<AddSongResponse> {
    const wasLiked = this.isLiked(songId);
    this.likedSongIds.update((ids) => new Set(ids).add(songId));
    return this.api.likeSong(songId).pipe(
      tap((response) => {
        if (this.likedSongsSelected()) {
          this.selectLiked();
        }
        if (!response.warning) {
          this.loadPlaylists();
        }
      }),
      catchError((err) => {
        if (!wasLiked) {
          this.likedSongIds.update((ids) => {
            const next = new Set(ids);
            next.delete(songId);
            return next;
          });
        }
        return throwError(() => err);
      }),
    );
  }

  unlikeSong(songId: string): Observable<void> {
    const wasLiked = this.isLiked(songId);
    this.likedSongIds.update((ids) => {
      const next = new Set(ids);
      next.delete(songId);
      return next;
    });
    return this.api.unlikeSong(songId).pipe(
      tap(() => {
        if (this.likedSongsSelected()) {
          this.selectLiked();
        }
        this.loadPlaylists();
      }),
      catchError((err) => {
        if (wasLiked) {
          this.likedSongIds.update((ids) => new Set(ids).add(songId));
        }
        return throwError(() => err);
      }),
    );
  }

  isLiked(songId: string): boolean {
    return this.likedSongIds().has(songId);
  }

  private refreshSelectedPlaylist(id: string): void {
    this.api.getById(id).subscribe({
      next: (playlist) => this.selectedPlaylist.set(playlist),
      error: (err) => console.error('Failed to load playlist', err),
    });
  }

  private setLikedSongsFromPlaylist(playlist: PlaylistDetailedResponse): void {
    this.likedSongIds.set(new Set(playlist.songs.map((song) => song.song_id)));
  }
}
