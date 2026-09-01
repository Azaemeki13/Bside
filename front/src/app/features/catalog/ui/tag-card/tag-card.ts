import { Component, input } from '@angular/core';

/** Displays one selectable mood in the catalog filter. */
@Component({
  selector: 'app-tag-card',
  imports: [],
  templateUrl: './tag-card.html',
  styleUrl: './tag-card.scss',
})
export class TagCard {
  label = input<string>('');
  active = input<boolean>(false);
}
