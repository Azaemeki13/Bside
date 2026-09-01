import { Component, output } from '@angular/core';
import { LucideAngularModule, Heart } from 'lucide-angular';

/** Opens the listener's liked songs from the library overview. */
@Component({
  selector: 'app-heart-card',
  imports: [LucideAngularModule],
  templateUrl: './heart-card.html',
  styleUrl: './heart-card.scss',
})
export class HeartCard {
  protected readonly heart = Heart;
  readonly selected = output<void>();

  select(): void {
    this.selected.emit();
  }
}
