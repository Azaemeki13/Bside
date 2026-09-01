import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlbumService } from '../../../../services/album.service';
import { AudioPlayerService } from '../../../../services/audio.player.service';
import type { NewReleaseSong } from '../../models/album.models';
import type { AudioFormat } from '../../../audio/models/audio.models';

/** Highlights one recent song and lets the listener start it immediately. */
@Component({
  selector: 'app-new-release',
  imports: [],
  templateUrl: './new-release.html',
  styleUrl: './new-release.scss',
})
export class NewRelease implements OnInit, OnDestroy {
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private subscription: Subscription | null = null;

  song = signal<NewReleaseSong | null>(null);

  ngOnInit(): void {
    if (!this.isBrowser) return;

    const previousSongId = sessionStorage.getItem('bside-new-release-song');
    this.subscription = this.albumService.getNewRelease(previousSongId ?? undefined).subscribe({
      next: (song) => {
        this.song.set(song);
        sessionStorage.setItem('bside-new-release-song', song.song_id);
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  play(): void {
    const song = this.song();
    if (!song) return;

    this.audio.setQueue([{
      id: song.song_id,
      title: song.title,
      artist: song.artist_name,
      artistId: song.artist_id,
      format: this.audioFormat(song.audio_url),
      coverUrl: song.cover_url,
      onRequestUrl: () => this.albumService.getSongStreamUrl(song.song_id),
    }]);
  }

  private audioFormat(audioUrl: string): AudioFormat {
    return audioUrl.toLowerCase().endsWith('.flac') ? 'flac' : 'wav';
  }
}
