import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { LucideAngularModule, Play, Sparkles } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { AlbumService } from '../../services/album.service';
import { AudioFormat, AudioPlayerService } from '../../services/audio.player.service';
import { DailyMixResponse, DailyMixService, DailyMixSong } from '../../services/daily-mix.service';
import { browserStorageUrl } from '../../utils/storage-url';

@Component({
  selector: 'app-daily-mix',
  imports: [LucideAngularModule],
  templateUrl: './daily-mix.html',
  styleUrl: './daily-mix.scss',
})
export class DailyMix implements OnInit, OnDestroy {
  private readonly dailyMixService = inject(DailyMixService);
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private readonly platformId = inject(PLATFORM_ID);
  private subscription: Subscription | null = null;

  protected readonly playIcon = Play;
  protected readonly sparkles = Sparkles;
  protected readonly skeletonSlots = Array.from({ length: 8 });
  protected readonly mix = signal<DailyMixResponse | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isLoggedOut = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.subscription = this.dailyMixService.getToday().subscribe({
      next: (mix) => {
        this.mix.set(mix);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.isLoggedOut.set(error?.status === 401);
        this.error.set(error?.status === 401 ? '' : "Couldn't build today's mix right now.");
        this.isLoading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  protected play(song: DailyMixSong): void {
    const songs = this.mix()?.songs ?? [];
    const index = songs.findIndex((item) => item.song_id === song.song_id);
    if (index < 0) return;
    this.audio.setQueue(songs.map((item) => this.toAudioTrack(item)), index);
  }

  protected playAll(): void {
    const songs = this.mix()?.songs ?? [];
    if (songs.length > 0) this.audio.setQueue(songs.map((item) => this.toAudioTrack(item)), 0);
  }

  protected coverUrl(url: string): string {
    return browserStorageUrl(url, this.platformId);
  }

  private toAudioTrack(song: DailyMixSong) {
    return {
      id: song.song_id,
      title: song.title,
      artist: song.artist_name,
      artistId: song.artist_id,
      format: this.audioFormat(song),
      coverUrl: this.coverUrl(song.cover_url),
      onRequestUrl: () => this.albumService.getSongStreamUrl(song.song_id),
    };
  }

  private audioFormat(song: DailyMixSong): AudioFormat {
    return `${song.audio_url} ${song.title}`.toLowerCase().includes('.flac') ? 'flac' : 'wav';
  }
}

