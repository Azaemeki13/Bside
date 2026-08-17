import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach } from 'vitest';

class ResizeObserverMock implements ResizeObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): ResizeObserverEntry[] { return []; }
}

globalThis.ResizeObserver = ResizeObserverMock;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
});

