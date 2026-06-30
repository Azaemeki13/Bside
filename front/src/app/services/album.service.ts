import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';

export interface AlbumListItem {
  id: string;
  artist_id: string;
  artist_name: string;
  title: string;
  genre: string;
  cover_url: string;
  status: string;
  song_count: number;
  created_at: string;
}

export interface AlbumSongItem {
  id: string;
  title: string;
  duration_seconds: number;
  status: string;
  audio_url: string;
  created_at: string;
}

export interface AlbumDetailedResponse extends AlbumListItem {
  songs: AlbumSongItem[];
}

@Injectable({ providedIn: 'root' })
export class AlbumService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getAlbums(): Observable<AlbumListItem[]> {
    return this.http.get<AlbumListItem[]>(`${this.apiUrl}/albums`);
  }

  getAlbum(id: string): Observable<AlbumDetailedResponse> {
    return this.http.get<AlbumDetailedResponse>(`${this.apiUrl}/albums/${id}`);
  }


  getSongStreamUrl(id: string): Observable<{ url: string; expires_in: number; is_anonymous?: boolean }> {
    return this.http.get<{ url: string; expires_in: number; is_anonymous?: boolean }>(`${this.apiUrl}/songs/${id}/stream-url`);
  }
}
