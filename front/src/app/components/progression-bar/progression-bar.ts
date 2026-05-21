/*
import { Component, signal } from '@angular/core';
import { LucideAngularModule, Pause, Play, SkipBack, SkipForward } from 'lucide-angular';


@Component({
  selector: 'app-progression-bar',
  imports: [LucideAngularModule],
  templateUrl: './progression-bar.html',
})
export class ProgressionBar {
  protected readonly skipBack = SkipBack;
  protected readonly skipForward = SkipForward;
  protected readonly play = Play;
  protected readonly pause = Pause;

  readonly isPlaying = signal<boolean>(false);
  readonly progress = signal<number>(35);
  readonly songTitle = signal<string>('The Adults Are Talking');
  readonly songBand = signal<string>('The Strokes');

  togglePlay(): void {
    this.isPlaying.update((v) => !v);
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const next = input ? Number(input.value) : 0;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(next) ? next : 0));
    this.progress.set(clamped);
  }
}
 */

import { Component, inject, signal } from '@angular/core';
import { LucideAngularModule, Pause, Play, SkipBack, SkipForward } from 'lucide-angular';
import { AudioPlayerService } from '../../services/audio.player.service';

  @Component({
    selector: 'app-progression-bar',
    imports: [LucideAngularModule],
    templateUrl: './progression-bar.html',
  })
  
  export class ProgressionBar {
    protected readonly audio = inject(AudioPlayerService);

    protected readonly skipBack = SkipBack;
    protected readonly skipForward = SkipForward;
    protected readonly play = Play;
    protected readonly pause = Pause;

    readonly songTitle = signal<string>('Local Test Track');
    readonly songBand = signal<string>('Howler.js');

    private hasLoadedTestTrack = false;

    togglePlay(): void {
      if (!this.hasLoadedTestTrack) {
        this.audio.load({
          id: 'local-test',
          title: 'Local Test Track',
          artist: 'Howler.js',
          src: 'assets/test.mp3',
          format: 'mp3',
        });

        this.hasLoadedTestTrack = true;
      }

      this.audio.toggle();
    }

    onInput(event: Event): void {
      const input = event.target as HTMLInputElement | null;
      const next = input ? Number(input.value) : 0;
      this.audio.seekToPercent(next);
    }
  }
