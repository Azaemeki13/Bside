import { Component, inject } from '@angular/core';
import { LucideAngularModule, Heart, Repeat, Repeat1, Shuffle } from 'lucide-angular';
import { AudioPlayerService } from '../../services/audio.player.service';
import { PlaylistService } from '../../services/playlist.service';

@Component({
  selector: 'app-icon-bar',
  imports: [LucideAngularModule],
  templateUrl: './icon-bar.html',
})
export class IconBar {
  protected readonly audio = inject(AudioPlayerService);
  protected readonly playlistService = inject(PlaylistService);

  protected readonly heart = Heart;
  protected readonly repeat = Repeat;
  protected readonly repeat1 = Repeat1;
  protected readonly shuffle = Shuffle;

  protected toggleHeart(): void {
    const track = this.audio.currentTrack();
    if (!track) return;

    if (this.playlistService.isLiked(track.id)) {
      this.playlistService.unlikeSong(track.id).subscribe({
        error: (err) => console.error('Failed to unlike song', err)
      });
      return;
    }

    this.playlistService.likeSong(track.id).subscribe({
      error: (err) => console.error('Failed to like song', err)
    });
  }

  protected toggleRepeat(): void {
    this.audio.cycleRepeatMode();
  }

  protected toggleShuffle(): void {
    this.audio.toggleShuffle();
  }
}
