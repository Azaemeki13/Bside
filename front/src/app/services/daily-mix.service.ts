import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';

export interface DailyMixSong {
  song_id: string;
  title: string;
  duration_seconds: number;
  audio_url: string;
  album_id: string;
  album_title: string;
  artist_id: string;
  artist_name: string;
  cover_url: string;
  position: number;
  is_discovery: boolean;
  selection_reason: 'taste_discovery' | 'taste_familiar' | 'catalog_fallback';
}

export interface DailyMixResponse {
  id: string;
  generation_date: string;
  generated_at: string;
  discovery_count: number;
  familiar_count: number;
  songs: DailyMixSong[];
}

@Injectable({ providedIn: 'root' })
export class DailyMixService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getToday(): Observable<DailyMixResponse> {
    return this.http.get<DailyMixResponse>(`${this.apiUrl}/users/me/daily-mix`);
  }
}

