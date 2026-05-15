import { Component, input } from '@angular/core';

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