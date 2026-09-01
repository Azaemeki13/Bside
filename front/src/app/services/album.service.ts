import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import type { MlMood } from '../features/catalog/models/tag.models';
import type { AlbumDetailedResponse, AlbumListItem, AlbumSongItem, NewReleaseSong } from '../features/catalog/models/album.models';

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
    return this.http.get<{ url: string; expires_in: number; is_anonymous?: boolean }>(
      `${this.apiUrl}/songs/${id}/stream-url`,
    );
  }

  deleteAlbum(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/albums/${id}`);
  }

  deleteSong(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/songs/${id}`);
  }
}
