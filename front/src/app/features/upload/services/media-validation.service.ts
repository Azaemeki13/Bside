import { Injectable } from '@angular/core';
import type { UploadAudioFormat } from '../models/upload.models';

export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
export const MAX_COVER_BYTES = 10 * 1024 * 1024;
export const MAX_TRACK_DURATION_SECONDS = 21_600;

/** Keeps upload rules in one place so every form accepts the same media. */
@Injectable({ providedIn: 'root' })
export class MediaValidationService {
  /** Reads the supported format from the file extension. */
  getAudioFormat(file: File): UploadAudioFormat | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.wav')) return 'wav';
    if (name.endsWith('.flac')) return 'flac';
    return null;
  }

  /** Turns a file name into the title sent to the API. */
  getTrackTitle(file: File): string {
    return this.getFileStem(file).trim();
  }

  /** Keeps the original spacing when matching the legacy upload payload. */
  getFileStem(file: File): string {
    return file.name.replace(/\.[^/.]+$/, '');
  }

  /** Checks the format, size, and generated title for an audio file. */
  isValidAudio(file: File): boolean {
    const titleLength = [...this.getTrackTitle(file)].length;
    return this.getAudioFormat(file) !== null
      && file.size <= MAX_AUDIO_BYTES
      && titleLength >= 1
      && titleLength <= 120;
  }

  /** Accepts known cover MIME types and common image extensions. */
  isCoverImage(file: File): boolean {
    return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)
      || /\.(png|jpe?g|webp)$/i.test(file.name);
  }

  /** Checks all cover constraints used by artist and album images. */
  isValidCover(file: File): boolean {
    return this.isCoverImage(file) && file.size <= MAX_COVER_BYTES;
  }

  /** Ensures the browser metadata is safe to send to the backend. */
  isValidDuration(duration: number): boolean {
    return Number.isFinite(duration) && duration >= 1 && duration <= MAX_TRACK_DURATION_SECONDS;
  }
}
