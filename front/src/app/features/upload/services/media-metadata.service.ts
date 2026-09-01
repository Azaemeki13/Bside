import { Injectable } from '@angular/core';

/** Reads browser media metadata without exposing DOM details to form components. */
@Injectable({ providedIn: 'root' })
export class MediaMetadataService {
  /** Resolves with the audio duration, or null when metadata cannot be read. */
  readAudioDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(file);

      // Always release the temporary URL after either browser callback.
      const finish = (duration: number | null) => {
        URL.revokeObjectURL(url);
        resolve(duration);
      };

      audio.preload = 'metadata';
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => finish(null);
      audio.src = url;
    });
  }
}
