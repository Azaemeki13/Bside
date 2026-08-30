import { Component, output } from '@angular/core';
import { LucideAngularModule, Heart } from 'lucide-angular';

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
