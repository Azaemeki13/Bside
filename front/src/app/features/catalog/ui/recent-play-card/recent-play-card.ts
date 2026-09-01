import { Component, input, output } from '@angular/core';

/** Presents one recently played item in a compact reusable card. */
@Component({
  selector: 'app-recent-play-card',
  imports: [],
  templateUrl: './recent-play-card.html',
  styleUrl: './recent-play-card.scss',
})
export class RecentPlayCard {
  cover = input<string>('');
  alt = input<string>('recent');
  title = input<string>('');
  artist = input<string>('');
  cardClick = output<void>();
}
