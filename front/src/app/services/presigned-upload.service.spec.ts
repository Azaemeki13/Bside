import { TestBed } from '@angular/core/testing';
import { PresignedUploadService } from './presigned-upload.service';

class MockXhr {
  static latest: MockXhr;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  method = '';
  url = '';
  headers = new Map<string, string>();

  constructor() { MockXhr.latest = this; }
  open(method: string, url: string): void { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string): void { this.headers.set(name, value); }
  send(): void { /* controlled by each test */ }
}

describe('PresignedUploadService', () => {
  const OriginalXhr = globalThis.XMLHttpRequest;
  let service: PresignedUploadService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PresignedUploadService);
    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => { globalThis.XMLHttpRequest = OriginalXhr; });

  it('reports byte progress and resolves only after a successful response', async () => {
    const values: number[] = [];
    const file = new File([new Uint8Array(10)], 'track.wav');
    const promise = service.upload('https://storage/signed', file, 'audio/wav', (progress) => values.push(progress.percent));
    MockXhr.latest.upload.onprogress?.({ loaded: 5 } as ProgressEvent);
    MockXhr.latest.onload?.();
    await expect(promise).resolves.toBeUndefined();
    expect(values).toEqual([50, 100]);
    expect(MockXhr.latest.method).toBe('PUT');
    expect(MockXhr.latest.headers.get('Content-Type')).toBe('audio/wav');
  });

  it('rejects a non-success response', async () => {
    const promise = service.upload('https://storage/signed', new File(['x'], 'track.flac'), 'audio/flac');
    MockXhr.latest.status = 403;
    MockXhr.latest.onload?.();
    await expect(promise).rejects.toThrow(/status 403/);
  });
});
