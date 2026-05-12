import { Component } from '@angular/core';
import { LucideAngularModule, Heart, Repeat, Shuffle } from 'lucide-angular';

@Component({
  selector: 'app-icon-bar',
  imports: [LucideAngularModule],
  templateUrl: './icon-bar.html',
  styleUrl: './icon-bar.scss',
})
export class IconBar {
  protected readonly heart = Heart;
  protected readonly repeat = Repeat;
  protected readonly shuffle = Shuffle;
}
