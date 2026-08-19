import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PlaylistMosaic } from '../../components/playlist-mosaic/playlist-mosaic';
import { SongList } from '../../components/song-list/song-list';
import { DailyMixService } from '../../services/daily-mix.service';
import { PlaylistService } from '../../services/playlist.service';


@Component({
  selector: 'app-bside-library',
  templateUrl: './library.html',
  styleUrl: './library.scss',
  imports: [PlaylistMosaic, SongList],
})
export class BsideLibrary implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dailyMixService = inject(DailyMixService);
  private readonly playlistService = inject(PlaylistService);

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('dailyMix') !== '1') return;
    this.dailyMixService.getToday().subscribe({
      next: (mix) => this.playlistService.selectDailyMix(mix),
    });
  }
}
