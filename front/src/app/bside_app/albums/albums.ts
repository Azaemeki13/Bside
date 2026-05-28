import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AlbumDetailedResponse, AlbumListItem, AlbumService, AlbumSongItem } from '../../services/album.service';

@Component({
  selector: 'app-albums',
  imports: [CommonModule],
  templateUrl: './albums.html',
  styleUrl: './albums.scss',
})
export class BsideAlbums implements OnInit {
  private readonly albumService = inject(AlbumService);

  albums: AlbumListItem[] = [];
  selectedAlbum: AlbumDetailedResponse | null = null;
  isLoadingAlbums = false;
  isLoadingAlbum = false;
  error = '';
  playbackError = '';
  activeSongId = '';

  ngOnInit(): void {
    this.loadAlbums();
  }

  loadAlbums(): void {
    this.error = '';
    this.isLoadingAlbums = true;

    this.albumService.getAlbums().subscribe({
      next: (albums) => {
        this.albums = albums;
        this.isLoadingAlbums = false;
        if (albums.length > 0) {
          this.selectAlbum(albums[0]);
        }
      },
      error: () => {
        this.error = 'Could not load albums.';
        this.isLoadingAlbums = false;
      },
    });
  }

  selectAlbum(album: AlbumListItem): void {
    this.error = '';
    this.playbackError = '';
    this.isLoadingAlbum = true;

    this.albumService.getAlbum(album.id).subscribe({
      next: (details) => {
        this.selectedAlbum = details;
        this.isLoadingAlbum = false;
      },
      error: () => {
        this.error = 'Could not load album songs.';
        this.isLoadingAlbum = false;
      },
    });
  }

  play(song: AlbumSongItem, audio: HTMLAudioElement): void {
    this.playbackError = '';

    if (song.status !== 'Ready') {
      this.playbackError = 'This song is not ready yet.';
      return;
    }

    this.albumService.getSongStreamUrl(song.id).subscribe({
      next: ({ url }) => {
        this.activeSongId = song.id;
        audio.src = url;
        void audio.play();
      },
      error: () => {
        this.playbackError = 'Could not get a stream URL for this song.';
      },
    });
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  coverUrl(url: string): string {
    return url.replace('http://minio:9000', 'http://localhost:9000');
  }
}
