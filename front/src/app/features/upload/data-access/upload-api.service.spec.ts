import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UploadApiService } from './upload-api.service';

describe('UploadApiService', () => {
  let service: UploadApiService;
  let http: HttpTestingController;

  // Rebuild the HTTP test boundary so every request is inspected in isolation.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UploadApiService);
    http = TestBed.inject(HttpTestingController);
  });

  // A forgotten request usually means the adapter contract changed silently.
  afterEach(() => http.verify());

  it('creates an artist album with the expected multipart body', () => {
    const cover = new File(['cover'], 'cover.webp', { type: 'image/webp' });
    service.createAlbum({ title: 'Night Drive', genre: 'Electronic', cover }).subscribe();

    const request = http.expectOne('/api/albums');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect(request.request.body.get('title')).toBe('Night Drive');
    expect(request.request.body.get('genre')).toBe('Electronic');
    expect(request.request.body.get('cover')).toBe(cover);
    request.flush({ id: 'album-1' });
  });

  it('creates an admin album for the selected artist without an empty cover', () => {
    service.createAdminAlbum('artist-7', { title: 'First Light', genre: 'Jazz' }).subscribe();

    const request = http.expectOne('/api/admin/artists/artist-7/albums');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('title')).toBe('First Light');
    expect(request.request.body.get('genre')).toBe('Jazz');
    expect(request.request.body.has('cover')).toBe(false);
    request.flush({ id: 'album-2' });
  });

  it('loads the artist choices from the public artists endpoint', () => {
    service.getArtists().subscribe();

    const request = http.expectOne('/api/artists');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('creates an artist with only the supplied multipart fields', () => {
    const photo = new File(['photo'], 'artist.png', { type: 'image/png' });
    service.createArtist({ name: 'Mira', bio: 'Makes quiet records.', photo }).subscribe();

    const request = http.expectOne('/api/artists');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('name')).toBe('Mira');
    expect(request.request.body.get('bio')).toBe('Makes quiet records.');
    expect(request.request.body.get('photo')).toBe(photo);
    request.flush({ id: 'artist-1' });
  });

  it('maps the frontend song input to the backend payload', () => {
    service.createSong({
      title: 'Signal',
      albumId: 'album-3',
      durationSeconds: 213,
      format: 'flac',
    }).subscribe();

    const request = http.expectOne('/api/songs');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Signal',
      album_id: 'album-3',
      duration_seconds: 213,
      format: 'flac',
    });
    request.flush({ song: { id: 'song-1' }, upload_url: 'https://storage/upload' });
  });

  it('verifies the exact song with an empty PUT body', () => {
    service.verifySong('song-9').subscribe();

    const request = http.expectOne('/api/songs/song-9/verify');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush(null);
  });
});
