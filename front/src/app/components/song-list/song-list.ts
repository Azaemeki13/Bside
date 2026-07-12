import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Heart, Play, Trash2, Timer, AudioLines, Shuffle, EllipsisVertical } from 'lucide-angular';
import { PlaylistService, PlaylistSongItem } from '../../services/playlist.service';
import { AuthService } from '../../services/auth.service';
import { AudioFormat, AudioPlayerService } from '../../services/audio.player.service';
import { AlbumService } from '../../services/album.service';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-song-list',
  imports: [LucideAngularModule, DatePipe, NgClass, RouterLink],
  templateUrl: './song-list.html',
  styleUrl: './song-list.scss',
})
export class SongList implements OnInit {
  protected readonly heart = Heart;
  protected readonly trash2 = Trash2;
  protected readonly play = Play;
  protected readonly timer = Timer;
  protected readonly audioLines = AudioLines;
  protected readonly shuffle = Shuffle;
  protected readonly ellipsisVertical = EllipsisVertical;
  protected playlistService = inject(PlaylistService);
  protected authService = inject(AuthService);
  protected readonly audio = inject(AudioPlayerService);
  private readonly albumService = inject(AlbumService);
  protected openMenuLinkId = '';

  ngOnInit(): void {
    this.playlistService.loadLikedSongs();
  }

  deletePlaylist(): void {
    const playlist = this.playlistService.selectedPlaylist();
    if (!playlist) return;
    this.playlistService.delete(playlist.id).subscribe({
      error: (err) => console.error('Failed to delete playlist', err)
    });
  }

  removeSong(song: PlaylistSongItem): void {
    const playlist = this.playlistService.selectedPlaylist();
    if (!playlist) return;
    this.openMenuLinkId = '';
    this.playlistService.removeSong(playlist.id, song.link_id).subscribe({
      error: (err) => console.error('Failed to remove song from playlist', err)
    });
  }

  toggleLike(event: Event, song: PlaylistSongItem): void {
    event.stopPropagation();
    this.openMenuLinkId = '';
    if (this.playlistService.isLiked(song.song_id)) {
      this.playlistService.unlikeSong(song.song_id).subscribe({
        error: (err) => console.error('Failed to unlike song', err)
      });
      return;
    }
    this.playlistService.likeSong(song.song_id).subscribe({
      error: (err) => console.error('Failed to like song', err)
    });
  }

  toggleSongMenu(event: Event, song: PlaylistSongItem): void {
    event.stopPropagation();
    this.openMenuLinkId = this.openMenuLinkId === song.link_id ? '' : song.link_id;
  }

  playSong(song: PlaylistSongItem): void {
    const songs = this.playlistService.selectedSongs().filter((item) => item.status === 'Ready');
    const startIndex = songs.findIndex((item) => item.link_id === song.link_id);
    if (startIndex < 0) return;
    this.audio.setQueue(
      songs.map((item) => ({
        id: item.song_id,
        title: item.title,
        artist: item.artist_name,
        artistId: item.artist_id,
        format: this.audioFormat(item),
        coverUrl: this.coverUrl(item.cover_url),
        onRequestUrl: () => this.albumService.getSongStreamUrl(item.song_id),
      })),
      startIndex
    );
  }

  playPlaylist(): void {
    const songs = this.playlistService.selectedSongs().filter((item) => item.status === 'Ready');
    if (songs.length === 0) return;
    const entries = songs.map((item) => ({
      id: item.song_id,
      title: item.title,
      artist: item.artist_name,
      artistId: item.artist_id,
      format: this.audioFormat(item),
      coverUrl: this.coverUrl(item.cover_url),
      onRequestUrl: () => this.albumService.getSongStreamUrl(item.song_id),
    }));
    const startIndex = this.audio.shuffleEnabled()
      ? Math.floor(Math.random() * entries.length)
      : 0;
    this.audio.setQueue(entries, startIndex);
  }

  isCurrentSong(song: PlaylistSongItem): boolean {
    return this.audio.currentTrack()?.id === song.song_id;
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatTotalDuration(seconds?: number): string {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }

  coverUrl(url: string): string {
    if (!url) return 'assets/cover1.png';
    return url.replace(/^http:\/\/minio:9000/i, 'http://localhost:9000');
  }

  private audioFormat(song: PlaylistSongItem): AudioFormat {
    const source = `${song.audio_url} ${song.title}`.toLowerCase();
    if (source.includes('.flac')) return 'flac';
    return 'wav';
  }
}
