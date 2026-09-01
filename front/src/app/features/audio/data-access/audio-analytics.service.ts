import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environment';

type PlaybackInteractionType = 'play' | 'complete' | 'skip' | 'replay';

/** Records playback interactions for the recommendation engine. Best-effort: errors are silently ignored. */
@Injectable({ providedIn: 'root' })
export class AudioAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiUrl = environment.apiUrl;

  /** Posts one playback interaction. Does nothing outside a browser context. */
  record(songId: string, interactionType: PlaybackInteractionType, listenedSeconds?: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.http.post(`${this.apiUrl}/songs/${songId}/interactions`, {
      interaction_type: interactionType,
      listened_seconds: listenedSeconds,
    }).subscribe({ error: () => { /* best-effort tracking, ignore failures */ } });
  }
}
