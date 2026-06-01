import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import { AlbumListItem } from './album.service';

export interface ArtistSongItem {
  id: string;
  album_id: string;
  album_title: string;
  title: string;
  duration_seconds: number;
  audio_url: string;
  status: string;
  created_at: string;
}

export interface ArtistDetailResponse {
  id: string;
  user_id: string | null;
  name: string;
  bio: string | null;
  photo_url: string;
  status: string;
  albums: AlbumListItem[];
  songs: ArtistSongItem[];
}

@Injectable({ providedIn: 'root' })
export class ArtistService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getPublicArtist(id: string): Observable<ArtistDetailResponse> {
    return this.http.get<ArtistDetailResponse>(`${this.apiUrl}/catalog/artists/${id}`);
  }
}
