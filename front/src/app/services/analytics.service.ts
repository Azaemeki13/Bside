import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environment';
import type {
  DailyActivityStat,
  RecentPlayItem,
  TopSpinItem,
  TopSongStat,
  UserActivityAnalytics,
} from '../features/catalog/models/analytics.models';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getMyActivity(): Observable<UserActivityAnalytics> {
    return this.http.get<UserActivityAnalytics>(`${this.apiUrl}/users/me/analytics`);
  }

  getRecentPlays(limit?: number): Observable<RecentPlayItem[]> {
    let params = new HttpParams();
    if (limit) {
      params = params.set('limit', limit);
    }
    return this.http.get<RecentPlayItem[]>(`${this.apiUrl}/users/me/recent-plays`, { params });
  }

  getTopSpins(limit?: number): Observable<TopSpinItem[]> {
    let params = new HttpParams();
    if (limit) {
      params = params.set('limit', limit);
    }
    return this.http.get<TopSpinItem[]>(`${this.apiUrl}/users/me/top-spins`, { params });
  }
}
