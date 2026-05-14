import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class VolumeService {
  private readonly STORAGE_KEY = 'app-volume';

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly volume = signal<number>(70);
  readonly muted = signal<boolean>(false);

  readonly volume01 = computed(() =>
    this.muted() ? 0 : this.volume() / 100
  );

  constructor() {
    if (!this.isBrowser) return;
    this.volume.set(this.loadVolume());
    if (this.volume() === 0) this.muted.set(true);

    effect(() => {
      const current = this.volume();
      try {
        localStorage.setItem(this.STORAGE_KEY, String(current));
      } catch {}
    });
  }

  setVolume(next: number): void {
    const clamped = Math.max(0, Math.min(100,
      Number.isFinite(next) ? next : 0
    ));
    this.volume.set(clamped);
    if (clamped === 0) this.muted.set(true);
    else this.muted.set(false);
  }

  toggleMute(): void {
    this.muted.update(m => !m);
  }
  private loadVolume(): number {
    if (!this.isBrowser) return 70;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      const parsed = Number(stored);
      return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 70;
    } catch {
      return 70;
    }
  }
}