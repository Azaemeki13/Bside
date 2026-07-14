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

import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Pause, Play, SkipBack, SkipForward } from 'lucide-angular';
import { AudioPlayerService } from '../../services/audio.player.service';

  @Component({
    selector: 'app-progression-bar',
    imports: [LucideAngularModule, RouterLink],
    templateUrl: './progression-bar.html',
  })
  
  export class ProgressionBar implements AfterViewInit, OnDestroy {
    protected readonly audio = inject(AudioPlayerService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    protected readonly skipBackIcon = SkipBack;
    protected readonly skipForwardIcon = SkipForward;
    protected readonly play = Play;
    protected readonly pause = Pause;
    protected readonly titleOffset = signal(0);
    protected readonly artistOffset = signal(0);

    @ViewChild('titleViewport') private titleViewport?: ElementRef<HTMLElement>;
    @ViewChild('titleText') private titleText?: ElementRef<HTMLElement>;
    @ViewChild('artistViewport') private artistViewport?: ElementRef<HTMLElement>;
    @ViewChild('artistText') private artistText?: ElementRef<HTMLElement>;

    private titleMaxOffset = 0;
    private artistMaxOffset = 0;
    private animationFrame = 0;
    private resizeObserver?: ResizeObserver;
    private startedAt = 0;

    constructor() {
      effect(() => {
        this.audio.currentTrack();
        this.startedAt = 0;
        this.titleOffset.set(0);
        this.artistOffset.set(0);
        if (this.isBrowser) {
          window.setTimeout(() => this.measureTextOverflow());
        }
      });
    }

    ngAfterViewInit(): void {
      if (!this.isBrowser) {
        return;
      }

      this.resizeObserver = new ResizeObserver(() => this.measureTextOverflow());
      if (this.titleViewport?.nativeElement) {
        this.resizeObserver.observe(this.titleViewport.nativeElement);
      }
      if (this.artistViewport?.nativeElement) {
        this.resizeObserver.observe(this.artistViewport.nativeElement);
      }
      this.measureTextOverflow();
      this.startMarquee();
    }

    ngOnDestroy(): void {
      this.resizeObserver?.disconnect();
      if (this.animationFrame) {
        window.cancelAnimationFrame(this.animationFrame);
      }
    }

    togglePlay(): void {
      if (this.audio.currentTrack()) {
        this.audio.toggle();
      }
    }

    previousTrack(): void {
      this.audio.previous();
    }

    nextTrack(): void {
      this.audio.next();
    }

    onInput(event: Event): void {
      const input = event.target as HTMLInputElement | null;
      const next = input ? Number(input.value) : 0;
      this.audio.seekToPercent(next);
    }

    private measureTextOverflow(): void {
      this.titleMaxOffset = this.maxOffset(this.titleViewport, this.titleText);
      this.artistMaxOffset = this.maxOffset(this.artistViewport, this.artistText);

      if (this.titleMaxOffset === 0) {
        this.titleOffset.set(0);
      }
      if (this.artistMaxOffset === 0) {
        this.artistOffset.set(0);
      }
    }

    private maxOffset(
      viewport?: ElementRef<HTMLElement>,
      text?: ElementRef<HTMLElement>,
    ): number {
      if (!viewport?.nativeElement || !text?.nativeElement) {
        return 0;
      }
      return Math.max(0, text.nativeElement.scrollWidth - viewport.nativeElement.clientWidth);
    }

    private startMarquee(): void {
      const step = (timestamp: number) => {
        if (!this.startedAt) {
          this.startedAt = timestamp;
        }

        const elapsed = timestamp - this.startedAt;
        this.titleOffset.set(this.marqueeOffset(elapsed, this.titleMaxOffset));
        this.artistOffset.set(this.marqueeOffset(elapsed, this.artistMaxOffset));
        this.animationFrame = window.requestAnimationFrame(step);
      };

      this.animationFrame = window.requestAnimationFrame(step);
    }

    private marqueeOffset(elapsedMs: number, maxOffset: number): number {
      if (maxOffset <= 0) {
        return 0;
      }

      const pauseMs = 1200;
      const speed = 24;
      const travelMs = (maxOffset / speed) * 1000;
      const cycleMs = pauseMs + travelMs + pauseMs + travelMs;
      const phase = elapsedMs % cycleMs;

      if (phase < pauseMs) {
        return 0;
      }
      if (phase < pauseMs + travelMs) {
        return ((phase - pauseMs) / travelMs) * maxOffset;
      }
      if (phase < pauseMs + travelMs + pauseMs) {
        return maxOffset;
      }
      return maxOffset - ((phase - pauseMs - travelMs - pauseMs) / travelMs) * maxOffset;
    }
  }
