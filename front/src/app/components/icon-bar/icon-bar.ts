import { Component } from '@angular/core';
import { LucideAngularModule, Heart, Repeat, Repeat1, Shuffle } from 'lucide-angular';

@Component({
  selector: 'app-icon-bar',
  imports: [LucideAngularModule],
  templateUrl: './icon-bar.html',
})
export class IconBar {
  protected readonly heart = Heart;
  protected readonly repeat = Repeat;
  protected readonly repeat1 = Repeat1;
  protected readonly shuffle = Shuffle;

  protected isHeartActive = false;
  protected isRepeatOne = false;
  protected isShuffleActive = false;

  protected toggleHeart(): void {
    this.isHeartActive = !this.isHeartActive;
  }

  protected toggleRepeat(): void {
    this.isRepeatOne = !this.isRepeatOne;
  }

  protected toggleShuffle(): void {
    this.isShuffleActive = !this.isShuffleActive;
  }
}
