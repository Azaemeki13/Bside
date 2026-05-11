import { Component, input } from '@angular/core';

@Component({
  selector: 'app-recent-play-card',
  imports: [],
  templateUrl: './recent-play-card.html',
  styleUrl: './recent-play-card.scss',
})
export class RecentPlayCard {
  cover = input<string>('');
  alt = input<string>('recent');
}
