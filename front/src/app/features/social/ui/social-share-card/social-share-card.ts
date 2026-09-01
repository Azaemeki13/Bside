import { Component, Input, PLATFORM_ID, inject } from '@angular/core';
import { LucideAngularModule, Pause, Play, Heart } from 'lucide-angular';
import { SharedSong } from '../../../../models/chat.model';
import { AlbumService } from '../../../../services/album.service';
import { AudioPlayerService } from '../../../../services/audio.player.service';
import type { AudioFormat } from '../../../audio/models/audio.models';
import { PlaylistService } from '../../../../services/playlist.service';
import { finalize, Observable } from 'rxjs';
import { browserStorageUrl } from '../../../../shared/utils/storage-url';

@Component({
  selector: 'app-social-share-card',
  imports: [LucideAngularModule],
  templateUrl: './social-share-card.html',
})
export class SocialShareCard {
  @Input({ required: true }) song!: SharedSong;

  private readonly audio = inject(AudioPlayerService);
  private readonly albumService = inject(AlbumService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly playlistService = inject(PlaylistService);

  protected readonly play = Play;
  protected readonly pause = Pause;
  protected readonly heart = Heart;

  protected isLikePending = false;

  protected coverUrl(url: string): string {
    if (!url) {
      return 'assets/cover1.png';
    }

    return browserStorageUrl(url, this.platformId);
  }

  protected isCurrentSong(): boolean {
    return this.audio.currentTrack()?.id === this.song.id;
  }

  protected isPlaying(): boolean {
    return this.isCurrentSong() && this.audio.isPlaying();
  }

  protected isLiked(): boolean {
    return this.playlistService.isLiked(this.song.id);
  }

  protected toggleLike(event: Event): void {
    event.stopPropagation();

    if (this.isLikePending) {
      return;
    }

    this.isLikePending = true;

    const request$: Observable<unknown> = this.isLiked()
      ? this.playlistService.unlikeSong(this.song.id)
      : this.playlistService.likeSong(this.song.id);

    request$
      .pipe(
        finalize(() => {
          this.isLikePending = false;
        })
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to update song like status', error);
        },
      });
  }

  protected togglePlay(event: Event): void {
    event.stopPropagation();

    if (this.isCurrentSong()) {
      this.audio.toggle();
      return;
    }

    this.audio.setQueue(
      [
        {
          id: this.song.id,
          title: this.song.title,
          artist: this.song.artist_name,
          format: this.audioFormat(),
          coverUrl: this.coverUrl(this.song.cover_url),
          onRequestUrl: () =>
            this.albumService.getSongStreamUrl(this.song.id),
        },
      ],
      0
    );
  }

  private audioFormat(): AudioFormat {
    const source =
      `${this.song.audio_url} ${this.song.title}`.toLowerCase();

    if (source.includes('.flac')) {
      return 'flac';
    }

    return 'wav';
  }
}
