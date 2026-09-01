import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ArtistService } from './artist.service';

describe('ArtistService', () => {
  let service: ArtistService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ArtistService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads one artist with albums and songs', () => {
    service.getArtist('artist-1').subscribe();
    const req = http.expectOne('/api/artists/artist-1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'artist-1', albums: [], songs: [] });
  });
});
