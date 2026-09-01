import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule, ArrowLeft } from 'lucide-angular';
import { combineLatest } from 'rxjs';
import { PlaylistMosaic } from './ui/playlist-mosaic/playlist-mosaic';
import { SongList } from './ui/song-list/song-list';
import { DailyMixService } from '../../services/daily-mix.service';
import { PlaylistService } from '../../services/playlist.service';
import type { Playlist } from './models/playlist.models';
import { ResponsiveLayoutService } from '../../services/responsive-layout.service';


@Component({
  selector: 'app-bside-library',
  templateUrl: './library.html',
  styleUrl: './library.scss',
  imports: [PlaylistMosaic, SongList, LucideAngularModule],
})
export class BsideLibrary implements OnInit {
  protected readonly arrowLeft = ArrowLeft;
  protected readonly responsiveLayout = inject(ResponsiveLayoutService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dailyMixService = inject(DailyMixService);
  private readonly playlistService = inject(PlaylistService);

  protected get isDetailRoute(): boolean {
    return !!this.route.snapshot.data['libraryView'];
  }

  ngOnInit(): void {
    combineLatest([this.route.data, this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([data, paramMap, queryParamMap]) => {
        this.loadRouteSelection(
          data['libraryView'],
          paramMap.get('playlistId'),
          queryParamMap.get('dailyMix') === '1',
        );
      });
  }

  private loadRouteSelection(view: unknown, playlistId: string | null, legacyDailyMix: boolean): void {
    if (view === 'liked') {
      this.playlistService.selectLiked();
      return;
    }
    if (view === 'daily-mix' || legacyDailyMix) {
      this.loadDailyMix();
      return;
    }
    if (view === 'playlist' && playlistId) {
      this.playlistService.getById(playlistId).subscribe({
        next: (playlist) => this.playlistService.selectDetailed(playlist),
        error: () => void this.router.navigate(['/bside_app/library']),
      });
    }
  }

  protected selectLiked(): void {
    void this.router.navigate(['/bside_app/library/liked']);
  }

  protected selectDailyMix(): void {
    void this.router.navigate(['/bside_app/library/daily-mix']);
  }

  protected selectPlaylist(playlist: Playlist): void {
    void this.router.navigate(['/bside_app/library/playlist', playlist.id]);
  }

  protected backToLibrary(): void {
    void this.router.navigate(['/bside_app/library']);
  }

  private loadDailyMix(): void {
    this.dailyMixService.getToday().subscribe({
      next: (mix) => this.playlistService.selectDailyMix(mix),
      error: () => {
        this.playlistService.selectedPlaylist.set(null);
        if (this.isDetailRoute) void this.router.navigate(['/bside_app/library']);
      },
    });
  }
}
