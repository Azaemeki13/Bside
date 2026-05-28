import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
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
}

export interface PlaylistSongItem {
  link_id: string;
  song_id: string;
  title: string;
  duration_seconds: number;
  position: number;
}

export interface PlaylistDetailedResponse extends Playlist {
  songs: PlaylistSongItem[];
}

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  playlists = signal<Playlist[]>([]);
  selectedPlaylist = signal<Playlist | null>(null);
  likedSongsSelected = signal<boolean>(false);

  loadPlaylists(): void {
    this.http.get<Playlist[]>(`${this.apiUrl}/playlists`).subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: (err) => console.error('Failed to load playlists', err)
    });
  }

  getById(id: string): Observable<PlaylistDetailedResponse> {
    return this.http.get<PlaylistDetailedResponse>(`${this.apiUrl}/playlists/${id}`);
  }

  add(playlist: Playlist): void {
    this.playlists.update(list => [...list, playlist]);
  }

delete(id: string): Observable<void> {
  return this.http.delete<void>(`${this.apiUrl}/playlists/${id}`).pipe(
    tap(() => {
      this.playlists.update(list => list.filter(p => p.id !== id));
      this.selectedPlaylist.set(null);
    })
  );
}

  addSong(playlistId: string, songId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/playlists/${playlistId}/songs/${songId}`, {});
  }

  removeSong(playlistId: string, linkId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/playlists/${playlistId}/songs/${linkId}`);
  }

  selectLiked(): void {
    this.likedSongsSelected.set(true);
    this.selectedPlaylist.set(null);
  }

  select(playlist: Playlist): void {
    this.selectedPlaylist.set(playlist);
    this.likedSongsSelected.set(false);
  }
}