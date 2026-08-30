import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, afterNextRender, inject, signal } from '@angular/core';

const COMPACT_LIBRARY_QUERY = '(max-width: 1023px)';

@Injectable({ providedIn: 'root' })
export class ResponsiveLayoutService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isCompact = signal(false);
  readonly isCompactLibrary = this.isCompact;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    afterNextRender(() => {
      if (typeof window.matchMedia !== 'function') return;

      const mediaQuery = window.matchMedia(COMPACT_LIBRARY_QUERY);
      this.isCompact.set(mediaQuery.matches);
      mediaQuery.addEventListener('change', (event) => this.isCompact.set(event.matches));
    });
  }
}
