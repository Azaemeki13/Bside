import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ChevronRight } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AnalyticsService } from '../../../../services/analytics.service';
import type { TopSpinItem } from '../../models/analytics.models';

/** Shows the listener's most-played songs from their recent activity. */
@Component({
  selector: 'app-top-spins',
  imports: [LucideAngularModule, RouterLink],
  templateUrl: './top-spins.html',
  styleUrl: './top-spins.scss',
})
export class TopSpins implements OnInit, OnDestroy {
  protected readonly chevronRight = ChevronRight;
  private readonly analyticsService = inject(AnalyticsService);
  private subscription: Subscription | null = null;

  readonly skeletonSlots = [1, 2, 3, 4];
  artists = signal<TopSpinItem[]>([]);
  isLoading = signal(true);
  isLoggedOut = signal(false);

  ngOnInit(): void {
    this.subscription = this.analyticsService.getTopSpins(6).subscribe({
      next: (artists) => {
        this.artists.set(artists);
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

  formatMinutes(seconds: number): string {
    return Math.round(seconds / 60).toLocaleString();
  }
}
