import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlaylistApiService } from './playlist-api.service';

describe('PlaylistApiService', () => {
  let service: PlaylistApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlaylistApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads all playlists', () => {
    service.getPlaylists().subscribe();
    const req = http.expectOne('/api/playlists');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads one playlist with its songs', () => {
    service.getById('playlist-1').subscribe();
    const req = http.expectOne('/api/playlists/playlist-1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'playlist-1', songs: [] });
  });

  it('creates a playlist with title, description, and cover', () => {
    const cover = new File(['data'], 'cover.jpg', { type: 'image/jpeg' });
    service.create('My Mix', 'A description', cover).subscribe();
    const req = http.expectOne('/api/playlists');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.get('title')).toBe('My Mix');
    expect(req.request.body.get('description')).toBe('A description');
    expect(req.request.body.get('cover')).toBe(cover);
    req.flush({ id: 'playlist-2' });
  });

  it('creates a playlist without a description when it is blank', () => {
    service.create('Chill', '   ').subscribe();
    const req = http.expectOne('/api/playlists');
    expect(req.request.body.get('description')).toBeNull();
    req.flush({ id: 'playlist-3' });
  });

  it('deletes a playlist', () => {
    service.delete('playlist-4').subscribe();
    const req = http.expectOne('/api/playlists/playlist-4');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('adds a song to a playlist with an empty body', () => {
    service.addSong('playlist-5', 'song-1').subscribe();
    const req = http.expectOne('/api/playlists/playlist-5/songs/song-1');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ message: 'Added' });
  });

  it('removes a song from a playlist by link id', () => {
    service.removeSong('playlist-6', 'link-1').subscribe();
    const req = http.expectOne('/api/playlists/playlist-6/songs/link-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('loads the liked-songs playlist', () => {
    service.getLikedSongs().subscribe();
    const req = http.expectOne('/api/liked-songs');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'liked', songs: [] });
  });

  it('likes a song with an empty body', () => {
    service.likeSong('song-2').subscribe();
    const req = http.expectOne('/api/songs/song-2/like');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ message: 'Liked' });
  });

  it('unlikes a song', () => {
    service.unlikeSong('song-3').subscribe();
    const req = http.expectOne('/api/songs/song-3/like');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
