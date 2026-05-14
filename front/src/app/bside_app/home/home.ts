import { Component } from '@angular/core';
import { RecentPlay } from '../../components/recent-play/recent-play';
import { TopSpins } from '../../components/top-spins/top-spins';
import { NewRelease } from '../../components/new-release/new-release';
import { TagBar } from '../../components/tag-bar/tag-bar';

@Component({
  selector: 'app-bside-home',
  templateUrl: './home.html',
  styleUrl: './home.scss',
  imports: [RecentPlay, TopSpins, NewRelease, TagBar],
})
export class BsideHome {}
