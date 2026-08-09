import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import type { MlMood } from '../components/tag-list';

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

export interface NewReleaseSong {
  song_id: string;
  title: string;
  audio_url: string;
  album_id: string;
  album_title: string;
  cover_url: string;
  artist_id: string;
  artist_name: string;
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

  getFreshPicks(mood?: MlMood, limit?: number): Observable<AlbumListItem[]> {
    let params = new HttpParams();
    if (mood && mood !== 'All') {
      params = params.set('mood', mood.toLowerCase());
    }
    if (limit) {
      params = params.set('limit', limit);
    }
    return this.http.get<AlbumListItem[]>(`${this.apiUrl}/fresh-picks`, { params });
  }

  getNewRelease(excludeSongId?: string): Observable<NewReleaseSong> {
    let params = new HttpParams();
    if (excludeSongId) {
      params = params.set('exclude_song_id', excludeSongId);
    }
    return this.http.get<NewReleaseSong>(`${this.apiUrl}/new-release`, { params });
  }


  getSongStreamUrl(id: string): Observable<{ url: string; expires_in: number; is_anonymous?: boolean }> {
    return this.http.get<{ url: string; expires_in: number; is_anonymous?: boolean }>(`${this.apiUrl}/songs/${id}/stream-url`);
  }

  deleteAlbum(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/albums/${id}`);
  }

  deleteSong(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/songs/${id}`);
  }
}
