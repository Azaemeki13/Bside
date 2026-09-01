import { Component, signal } from '@angular/core';
import { RecentPlay } from '../ui/recent-play/recent-play';
import { TopSpins } from '../ui/top-spins/top-spins';
import { NewRelease } from '../ui/new-release/new-release';
import { TagBar } from '../ui/tag-bar/tag-bar';
import { FreshPicks } from '../ui/fresh-picks/fresh-picks';
import type { MlMood } from '../models/tag.models';

/** Brings the discovery sections together on the listener's home page. */
@Component({
  selector: 'app-bside-home',
  templateUrl: './home.html',
  styleUrl: './home.scss',
  imports: [RecentPlay, TopSpins, NewRelease, TagBar, FreshPicks],
})
export class BsideHome {
  selectedMood = signal<MlMood>('All');

  onMoodSelected(mood: MlMood): void {
    this.selectedMood.set(mood);
  }
}
