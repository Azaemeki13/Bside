import { Component, inject } from '@angular/core';
import { LucideAngularModule, Heart, Repeat, Repeat1, Shuffle } from 'lucide-angular';
import { AudioPlayerService } from '../../services/audio.player.service';

@Component({
  selector: 'app-icon-bar',
  imports: [LucideAngularModule],
  templateUrl: './icon-bar.html',
})
export class IconBar {
  protected readonly audio = inject(AudioPlayerService);

  protected readonly heart = Heart;
  protected readonly repeat = Repeat;
  protected readonly repeat1 = Repeat1;
  protected readonly shuffle = Shuffle;

  protected isHeartActive = false;

  protected toggleHeart(): void {
    this.isHeartActive = !this.isHeartActive;
  }

  protected toggleRepeat(): void {
    this.audio.cycleRepeatMode();
  }

  protected toggleShuffle(): void {
    this.audio.toggleShuffle();
  }
}
