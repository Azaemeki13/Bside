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

    readonly songTitle = signal<string>('Test WAV Upload');
    readonly songBand = signal<string>('Curl Test Artist');

    private hasLoadedTestTrack = false;
    private readonly testSongId = 'ea04d576-61ce-4961-9269-efe3ba01e45e';

    async togglePlay(): Promise<void> {
      if (!this.hasLoadedTestTrack) {
        // old version:
        // this.audio.load({
        //   id: 'local-test',
        //   title: 'Local Test Track',
        //   artist: 'Howler.js',
        //   src: 'assets/test.mp3',
        //   format: 'mp3',
        // });
        const token = localStorage.getItem('auth_token');
        if (!token) {
          this.audio.error.set('Missing authentication token.');
          return;
        }

        const res = await fetch(`http://localhost:8080/songs/${this.testSongId}/stream-url`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          this.audio.error.set(`Stream URL request failed: ${res.status}`);
          return;
        }

        const data = await res.json() as { url: string };

        this.audio.load({
          id: this.testSongId,
          title: 'Test WAV Upload',
          artist: 'Curl Test Artist',
          src: data.url,
          format: 'wav',
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
