import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PresignedUploadService, type UploadProgress } from '../../../services/presigned-upload.service';
import { UploadApiService } from '../data-access/upload-api.service';
import type { UploadAudioFormat } from '../models/upload.models';
import { MediaValidationService } from './media-validation.service';

export type UploadTrackStage = 'creating-song' | 'uploading-file' | 'verifying';

export interface UploadTrackInput {
  albumId: string;
  file: File;
  title: string;
  durationSeconds: number;
  onStage?: (stage: UploadTrackStage) => void;
  onProgress?: (progress: UploadProgress) => void;
}

/** Runs the shared song record, storage upload, and verification workflow. */
@Injectable({ providedIn: 'root' })
export class UploadOrchestratorService {
  private readonly api = inject(UploadApiService);
  private readonly presignedUpload = inject(PresignedUploadService);
  private readonly mediaValidation = inject(MediaValidationService);

  /** Uploads one track in the exact order required by the backend. */
  async uploadTrack(input: UploadTrackInput): Promise<void> {
    const format = this.requireFormat(input.file);

    input.onStage?.('creating-song');
    const response = await firstValueFrom(this.api.createSong({
      title: input.title,
      albumId: input.albumId,
      durationSeconds: input.durationSeconds,
      format,
    }));

    input.onStage?.('uploading-file');
    await this.presignedUpload.upload(
      response.upload_url,
      input.file,
      `audio/${format}`,
      input.onProgress,
    );

    input.onStage?.('verifying');
    await firstValueFrom(this.api.verifySong(response.song.id));
  }

  /** Fails early before any API request when the file is unsupported. */
  private requireFormat(file: File): UploadAudioFormat {
    const format = this.mediaValidation.getAudioFormat(file);
    if (!format) throw new Error(`${file.name} is not a WAV or FLAC file.`);
    return format;
  }
}
