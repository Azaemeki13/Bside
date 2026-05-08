import { Component } from '@angular/core';
import { RecentPlay } from '../recent-play/recent-play';
import { TopSpins } from '../top-spins/top-spins';
import { NewRelease } from '../new-release/new-release';
import { TagBar } from '../tag-bar/tag-bar';

@Component({
  selector: 'app-bside-home',
  templateUrl: './home.html',
  styleUrl: './home.scss',
  imports: [RecentPlay, TopSpins, NewRelease, TagBar],
})
export class BsideHome {}
