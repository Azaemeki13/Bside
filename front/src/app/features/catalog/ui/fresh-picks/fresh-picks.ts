import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ListMusic, Sparkles } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AlbumService } from '../../../../services/album.service';
import type { AlbumListItem } from '../../models/album.models';
import type { MlMood } from '../../models/tag.models';

/** Refreshes a small set of album suggestions for the selected mood. */
@Component({
  selector: 'app-fresh-picks',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './fresh-picks.html',
  styleUrl: './fresh-picks.scss'
})
export class FreshPicks implements OnDestroy {
  @Input() set selectedMood(mood: MlMood) {
    this.showDailyMix.set(mood === 'All');
    this.fetchPicks(mood);
  }

  private readonly albumService = inject(AlbumService);
  private subscription: Subscription | null = null;

  readonly skeletonSlots = Array.from({ length: 8 });
  albums = signal<AlbumListItem[]>([]);
  isLoading = signal(true);
  error = signal('');
  showDailyMix = signal(true);
  readonly dailyMixIcon = Sparkles;
  readonly playlistIcon = ListMusic;

  private fetchPicks(mood: MlMood): void {
    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.error.set('');

    this.subscription = this.albumService.getFreshPicks(mood).subscribe({
      next: (albums) => {
        this.albums.set(albums);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set("Couldn't load fresh picks right now.");
        this.isLoading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
