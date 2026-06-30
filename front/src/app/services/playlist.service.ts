import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../environment';

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  owner_id: string;
  owner_username?: string;
  total_duration?: number;
  song_count?: number;
  is_public: boolean;
  created_at?: string;
  cover_url?: string;
}

export interface PlaylistSongItem {
  link_id: string;
  song_id: string;
  title: string;
  duration_seconds: number;
  position: number;
  audio_url: string;
  status: string;
  artist_name: string;
  cover_url: string;
}

export interface PlaylistDetailedResponse extends Playlist {
  songs: PlaylistSongItem[];
}

export interface AddSongResponse {
  message: string;
  warning?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  playlists = signal<Playlist[]>([]);
  selectedPlaylist = signal<(Playlist & { songs?: PlaylistSongItem[] }) | null>(null);
  likedSongsSelected = signal<boolean>(false);
  likedSongIds = signal<Set<string>>(new Set<string>());

  loadPlaylists(): void {
    this.http.get<Playlist[]>(`${this.apiUrl}/playlists`).subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: (err) => console.error('Failed to load playlists', err)
    });
  }

  getById(id: string): Observable<PlaylistDetailedResponse> {
    return this.http.get<PlaylistDetailedResponse>(`${this.apiUrl}/playlists/${id}`);
  }

  create(title: string, description: string, cover?: File): Observable<Playlist> {
    const form = new FormData();
    form.append('title', title);
    if (description.trim()) form.append('description', description);
    if (cover) form.append('cover', cover);

    return this.http.post<Playlist>(`${this.apiUrl}/playlists`, form).pipe(
      tap((playlist) => this.add(playlist))
    );
  }
  add(playlist: Playlist): void {
    this.playlists.update(list => list.some(p => p.id === playlist.id) ? list : [playlist, ...list]);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/playlists/${id}`).pipe(
      tap(() => {
        this.playlists.update(list => list.filter(p => p.id !== id));
        this.selectedPlaylist.set(null);
      })
    );
  }

  addSong(playlistId: string, songId: string): Observable<AddSongResponse> {
    return this.http.post<AddSongResponse>(`${this.apiUrl}/playlists/${playlistId}/songs/${songId}`, {}).pipe(
      tap((response) => {
        if (!response.warning) {
          this.playlists.update(list => list.map(playlist => (
            playlist.id === playlistId
              ? { ...playlist, song_count: (playlist.song_count ?? 0) + 1 }
              : playlist
          )));
        }

        if (this.selectedPlaylist()?.id === playlistId) {
          this.refreshSelectedPlaylist(playlistId);
        }
      })
    );
  }

  removeSong(playlistId: string, linkId: string): Observable<void> {
    const removedSongId = this.selectedPlaylist()?.songs?.find(song => song.link_id === linkId)?.song_id;
    return this.http.delete<void>(`${this.apiUrl}/playlists/${playlistId}/songs/${linkId}`).pipe(
      tap(() => {
        this.playlists.update(list => list.map(playlist => (
          playlist.id === playlistId
            ? { ...playlist, song_count: Math.max((playlist.song_count ?? 1) - 1, 0) }
            : playlist
        )));
        if (this.likedSongsSelected() && removedSongId) {
          this.likedSongIds.update(ids => {
            const next = new Set(ids);
            next.delete(removedSongId);
            return next;
          });
        }
        this.refreshSelectedPlaylist(playlistId);
      })
    );
  }

  selectLiked(): void {
    this.likedSongsSelected.set(true);
    this.getLikedSongs().subscribe({
      next: (playlist) => {
        this.selectedPlaylist.set(playlist);
        this.setLikedSongsFromPlaylist(playlist);
      },
      error: (err) => console.error('Failed to load liked songs', err)
    });
  }

  select(playlist: Playlist): void {
    this.selectedPlaylist.set({ ...playlist, songs: [] });
    this.likedSongsSelected.set(false);
    this.refreshSelectedPlaylist(playlist.id);
  }

  selectedSongs(): PlaylistSongItem[] {
    return this.selectedPlaylist()?.songs ?? [];
  }

  getLikedSongs(): Observable<PlaylistDetailedResponse> {
    return this.http.get<PlaylistDetailedResponse>(`${this.apiUrl}/liked-songs`);
  }

  loadLikedSongs(): void {
    this.getLikedSongs().subscribe({
      next: (playlist) => this.setLikedSongsFromPlaylist(playlist),
      error: (err) => console.error('Failed to load liked songs', err)
    });
  }

  likeSong(songId: string): Observable<AddSongResponse> {
    const wasLiked = this.isLiked(songId);
    this.likedSongIds.update(ids => new Set(ids).add(songId));
    return this.http.post<AddSongResponse>(`${this.apiUrl}/songs/${songId}/like`, {}).pipe(
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
          this.likedSongIds.update(ids => {
            const next = new Set(ids);
            next.delete(songId);
            return next;
          });
        }
        return throwError(() => err);
      })
    );
  }

  unlikeSong(songId: string): Observable<void> {
    const wasLiked = this.isLiked(songId);
    this.likedSongIds.update(ids => {
      const next = new Set(ids);
      next.delete(songId);
      return next;
    });
    return this.http.delete<void>(`${this.apiUrl}/songs/${songId}/like`).pipe(
      tap(() => {
        if (this.likedSongsSelected()) {
          this.selectLiked();
        }
        this.loadPlaylists();
      }),
      catchError((err) => {
        if (wasLiked) {
          this.likedSongIds.update(ids => new Set(ids).add(songId));
        }
        return throwError(() => err);
      })
    );
  }

  isLiked(songId: string): boolean {
    return this.likedSongIds().has(songId);
  }

  private refreshSelectedPlaylist(id: string): void {
    this.getById(id).subscribe({
      next: (playlist) => this.selectedPlaylist.set(playlist),
      error: (err) => console.error('Failed to load playlist', err)
    });
  }

  private setLikedSongsFromPlaylist(playlist: PlaylistDetailedResponse): void {
    this.likedSongIds.set(new Set(playlist.songs.map(song => song.song_id)));
  }
}
