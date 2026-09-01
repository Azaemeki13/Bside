import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AlbumService } from './album.service';

describe('AlbumService', () => {
  let service: AlbumService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AlbumService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads all albums', () => {
    service.getAlbums().subscribe();
    const req = http.expectOne('/api/albums');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads one album with its songs', () => {
    service.getAlbum('album-1').subscribe();
    const req = http.expectOne('/api/albums/album-1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'album-1', songs: [] });
  });

  it('loads fresh picks with no filters when called without arguments', () => {
    service.getFreshPicks().subscribe();
    const req = http.expectOne('/api/fresh-picks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads fresh picks filtered by mood', () => {
    service.getFreshPicks('Happy', 10).subscribe();
    const req = http.expectOne((r) => r.url === '/api/fresh-picks');
    expect(req.request.params.get('mood')).toBe('happy');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush([]);
  });

  it('loads the new-release song', () => {
    service.getNewRelease().subscribe();
    const req = http.expectOne('/api/new-release');
    expect(req.request.method).toBe('GET');
    req.flush({ song_id: 'song-new' });
  });

  it('loads the new-release song excluding a specified song id', () => {
    service.getNewRelease('song-exclude').subscribe();
    const req = http.expectOne((r) => r.url === '/api/new-release');
    expect(req.request.params.get('exclude_song_id')).toBe('song-exclude');
    req.flush({ song_id: 'song-other' });
  });

  it('loads a song stream url', () => {
    service.getSongStreamUrl('song-1').subscribe();
    const req = http.expectOne('/api/songs/song-1/stream-url');
    expect(req.request.method).toBe('GET');
    req.flush({ url: 'https://cdn.example.test/song.flac', expires_in: 3600 });
  });

  it('deletes an album', () => {
    service.deleteAlbum('album-2').subscribe();
    const req = http.expectOne('/api/albums/album-2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('deletes a song', () => {
    service.deleteSong('song-2').subscribe();
    const req = http.expectOne('/api/songs/song-2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
