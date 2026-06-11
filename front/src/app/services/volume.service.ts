import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class VolumeService {
  private readonly STORAGE_KEY = 'app-volume';
  private readonly LAST_VOLUME_KEY = 'app-last-volume';
  private readonly DEFAULT_VOLUME = 70;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly volume = signal<number>(this.DEFAULT_VOLUME);
  readonly muted = signal<boolean>(false);
  private readonly lastAudibleVolume = signal<number>(this.DEFAULT_VOLUME);

  readonly volume01 = computed(() =>
    this.muted() ? 0 : this.volume() / 100
  );
  readonly displayVolume = computed(() =>
    this.muted() ? 0 : this.volume()
  );

  constructor() {
    if (!this.isBrowser) return;
    const savedVolume = this.loadNumber(this.STORAGE_KEY, this.DEFAULT_VOLUME);
    const savedLastVolume = this.loadNumber(this.LAST_VOLUME_KEY, savedVolume || this.DEFAULT_VOLUME);

    this.volume.set(savedVolume);
    this.lastAudibleVolume.set(savedLastVolume > 0 ? savedLastVolume : this.DEFAULT_VOLUME);
    if (this.volume() === 0) this.muted.set(true);

    effect(() => {
      const current = this.volume();
      const lastAudible = this.lastAudibleVolume();
      try {
        localStorage.setItem(this.STORAGE_KEY, String(current));
        localStorage.setItem(this.LAST_VOLUME_KEY, String(lastAudible));
      } catch {}
    });
  }

  setVolume(next: number): void {
    const clamped = Math.max(0, Math.min(100,
      Number.isFinite(next) ? next : 0
    ));
    this.volume.set(clamped);
    if (clamped === 0) {
      this.muted.set(true);
      return;
    }

    this.lastAudibleVolume.set(clamped);
    this.muted.set(false);
  }

  toggleMute(): void {
    if (this.muted() || this.volume() === 0) {
      this.volume.set(this.lastAudibleVolume());
      this.muted.set(false);
      return;
    }

    this.muted.set(true);
  }

  private loadNumber(key: string, fallback: number): number {
    if (!this.isBrowser) return fallback;
    try {
      const stored = localStorage.getItem(key);
      const parsed = Number(stored);
      return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
    } catch {
      return fallback;
    }
  }
}
