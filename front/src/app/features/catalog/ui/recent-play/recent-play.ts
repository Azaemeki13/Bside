import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { RecentPlayCard } from '../recent-play-card/recent-play-card';
import { AlbumService } from '../../../../services/album.service';
import { AnalyticsService } from '../../../../services/analytics.service';
import { AudioPlayerService } from '../../../../services/audio.player.service';
import type { RecentPlayItem } from '../../models/analytics.models';
import type { AudioFormat } from '../../../audio/models/audio.models';

/** Loads recent listening activity and turns each item into a playable queue. */
@Component({
  selector: 'app-recent-play',
  imports: [RecentPlayCard],
  templateUrl: './recent-play.html',
  styleUrl: './recent-play.scss',
})
export class RecentPlay implements OnInit, OnDestroy {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private subscription: Subscription | null = null;

  items = signal<RecentPlayItem[]>([]);
  isLoading = signal(true);
  isLoggedOut = signal(false);

  ngOnInit(): void {
    this.subscription = this.analyticsService.getRecentPlays(4).subscribe({
      next: (items) => {
        this.items.set(items);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.isLoggedOut.set(error?.status === 401);
        this.isLoading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  play(item: RecentPlayItem): void {
    const items = this.items();
    const startIndex = items.findIndex((entry) => entry.song_id === item.song_id);
    if (startIndex < 0) return;

    this.audio.setQueue(
      items.map((entry) => ({
        id: entry.song_id,
        title: entry.title,
        artist: entry.artist_name,
        artistId: entry.artist_id,
        format: this.audioFormat(entry),
        coverUrl: entry.cover_url,
        onRequestUrl: () => this.albumService.getSongStreamUrl(entry.song_id),
      })),
      startIndex
    );
  }

  private audioFormat(item: RecentPlayItem): AudioFormat {
    return item.audio_url.toLowerCase().includes('.flac') ? 'flac' : 'wav';
  }
}
