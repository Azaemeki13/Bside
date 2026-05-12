import { Component, signal } from '@angular/core';
import { LucideAngularModule, Pause, Play, SkipBack, SkipForward } from 'lucide-angular';


@Component({
  selector: 'app-progression-bar',
  imports: [LucideAngularModule],
  templateUrl: './progression-bar.html',
  styleUrl: './progression-bar.scss',
})
export class ProgressionBar {
  protected readonly skipBack = SkipBack;
  protected readonly skipForward = SkipForward;
  protected readonly play = Play;
  protected readonly pause = Pause;

  readonly isPlaying = signal<boolean>(false);
  readonly progress = signal<number>(35);

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

