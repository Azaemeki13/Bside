import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the current user activity summary', () => {
    service.getMyActivity().subscribe();
    const req = http.expectOne('/api/users/me/analytics');
    expect(req.request.method).toBe('GET');
    req.flush({ total_plays: 42, top_songs: [], daily_activity: [] });
  });

  it('loads recent plays with no limit by default', () => {
    service.getRecentPlays().subscribe();
    const req = http.expectOne('/api/users/me/recent-plays');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads recent plays with a specified limit', () => {
    service.getRecentPlays(5).subscribe();
    const req = http.expectOne((r) => r.url === '/api/users/me/recent-plays');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush([]);
  });

  it('loads top spins with no limit by default', () => {
    service.getTopSpins().subscribe();
    const req = http.expectOne('/api/users/me/top-spins');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads top spins with a specified limit', () => {
    service.getTopSpins(3).subscribe();
    const req = http.expectOne((r) => r.url === '/api/users/me/top-spins');
    expect(req.request.params.get('limit')).toBe('3');
    req.flush([]);
  });
});
