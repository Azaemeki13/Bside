import { Component, signal } from '@angular/core';
import { RecentPlay } from '../../components/recent-play/recent-play';
import { TopSpins } from '../../components/top-spins/top-spins';
import { NewRelease } from '../../components/new-release/new-release';
import { TagBar } from '../../components/tag-bar/tag-bar';
import { FreshPicks } from '../../components/fresh-picks/fresh-picks';
import type { MlMood } from '../../components/tag-list';
import { DailyMix } from '../../components/daily-mix/daily-mix';

@Component({
  selector: 'app-bside-home',
  templateUrl: './home.html',
  styleUrl: './home.scss',
  imports: [RecentPlay, TopSpins, NewRelease, DailyMix, TagBar, FreshPicks],
})
export class BsideHome {
  selectedMood = signal<MlMood>('All');

  onMoodSelected(mood: MlMood): void {
    this.selectedMood.set(mood);
  }
}
