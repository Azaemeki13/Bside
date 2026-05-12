import { Component } from '@angular/core';
import { RecentPlayCard } from '../recent-play-card/recent-play-card';

@Component({
  selector: 'app-recent-play',
  imports: [RecentPlayCard],
  templateUrl: './recent-play.html',
  styleUrl: './recent-play.scss',
})
export class RecentPlay {}