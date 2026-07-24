import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { AnalyticsService, UserActivityAnalytics } from '../../services/analytics.service';

@Component({
  selector: 'app-activity-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-stats.html',
  styleUrl: './activity-stats.scss',
})
export class ActivityStats {
  private readonly analytics = inject(AnalyticsService);
  @Output() close = new EventEmitter<void>();

  protected readonly isLoading = signal(true);
  protected readonly error = signal('');
  protected readonly stats = signal<UserActivityAnalytics | null>(null);

  protected readonly maxDailyPlays = computed(() => {
    const days = this.stats()?.daily_activity ?? [];
    return days.reduce((max, day) => Math.max(max, day.play_count), 0);
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.analytics.getMyActivity().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Could not load your activity stats.');
        this.isLoading.set(false);
      },
    });
  }

  formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  barHeight(playCount: number): number {
    const max = this.maxDailyPlays();
    if (max === 0) return 4;
    return Math.max(4, Math.round((playCount / max) * 100));
  }
}
