import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';

export interface TopSongStat {
  song_id: string;
  title: string;
  play_count: number;
}

export interface DailyActivityStat {
  day: string;
  play_count: number;
  listened_seconds: number;
}

export interface UserActivityAnalytics {
  total_plays: number;
  total_listened_seconds: number;
  total_likes: number;
  unique_songs_played: number;
  top_songs: TopSongStat[];
  daily_activity: DailyActivityStat[];
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getMyActivity(): Observable<UserActivityAnalytics> {
    return this.http.get<UserActivityAnalytics>(`${this.apiUrl}/users/me/analytics`);
  }
}
