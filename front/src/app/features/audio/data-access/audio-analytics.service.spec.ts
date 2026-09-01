import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AudioAnalyticsService } from './audio-analytics.service';

describe('AudioAnalyticsService', () => {
  let service: AudioAnalyticsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AudioAnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts a play interaction with no listened seconds', () => {
    service.record('song-1', 'play');
    const req = http.expectOne('/api/songs/song-1/interactions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ interaction_type: 'play', listened_seconds: undefined });
    req.flush(null);
  });

  it('posts a skip interaction with listened seconds', () => {
    service.record('song-2', 'skip', 47);
    const req = http.expectOne('/api/songs/song-2/interactions');
    expect(req.request.body).toEqual({ interaction_type: 'skip', listened_seconds: 47 });
    req.flush(null);
  });

  it('posts a complete interaction with full duration', () => {
    service.record('song-3', 'complete', 210);
    const req = http.expectOne('/api/songs/song-3/interactions');
    expect(req.request.body).toEqual({ interaction_type: 'complete', listened_seconds: 210 });
    req.flush(null);
  });

  it('silently swallows HTTP errors so they never surface to the player', () => {
    service.record('song-4', 'play');
    const req = http.expectOne('/api/songs/song-4/interactions');
    expect(() => req.error(new ErrorEvent('network'))).not.toThrow();
  });
});
