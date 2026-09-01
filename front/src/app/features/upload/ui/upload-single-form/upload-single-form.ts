import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TAGS } from '../../../catalog/models/tag.models';
import { AlbumService } from '../../../../services/album.service';
import { UploadApiService } from '../../data-access/upload-api.service';
import type { UploadAlbum } from '../../models/upload.models';
import { MediaMetadataService } from '../../services/media-metadata.service';
import { MAX_AUDIO_BYTES, MAX_COVER_BYTES, MediaValidationService } from '../../services/media-validation.service';
import { describeUploadError } from '../../services/upload-error';
import { UploadOrchestratorService } from '../../services/upload-orchestrator.service';

type UploadStep = 'idle' | 'creating-album' | 'creating-song' | 'uploading-file' | 'verifying' | 'done';

@Component({
  selector: 'app-upload-single-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload-single-form.html',
  styleUrl: './upload-single-form.scss',
})
/** Handles the single-release form while services own reusable media rules. */
export class UploadSingleForm {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly albumService = inject(AlbumService);
  private readonly uploadApi = inject(UploadApiService);
  private readonly uploadOrchestrator = inject(UploadOrchestratorService);
  private readonly mediaMetadata = inject(MediaMetadataService);
  private readonly mediaValidation = inject(MediaValidationService);

  readonly tagOptions = TAGS.filter((tag) => tag !== 'All');
  songTitle = '';
  songDurationSeconds: number | null = null;
  songFile: File | null = null;
  singleCover: File | null = null;
  singleTag = '';
  isTagOpen = false;
  songMessage = '';
  songError = '';
  singleDone = false;
  uploadStep: UploadStep = 'idle';
  albumMessage = '';
  uploadProgress = 0;

  get canUploadSong(): boolean {
    return Boolean(
      this.songTitle.trim() &&
        [...this.songTitle.trim()].length <= 120 &&
        this.tagOptions.some((tag) => tag === this.singleTag) &&
        this.songFile && this.songFile.size <= MAX_AUDIO_BYTES &&
        this.uploadStep !== 'creating-album' &&
        this.uploadStep !== 'creating-song' &&
        this.uploadStep !== 'uploading-file' &&
        this.uploadStep !== 'verifying'
    );
  }

  async onSongFileSelected(event: Event): Promise<void> {
    this.songFile = this.fileFromEvent(event);
    this.songError = '';

    if (!this.songFile) return;
    const format = this.mediaValidation.getAudioFormat(this.songFile);
    if (!format) {
      this.songError = 'Only WAV and FLAC files are accepted.';
      this.songFile = null;
      return;
    }
    if (this.songFile.size > MAX_AUDIO_BYTES) {
      this.songError = 'Audio file must be under 200MB.';
      this.songFile = null;
      return;
    }

    if (!this.songTitle.trim()) {
      this.songTitle = this.mediaValidation.getTrackTitle(this.songFile);
    }

    const duration = await this.mediaMetadata.readAudioDuration(this.songFile);
    this.songDurationSeconds = duration ? Math.ceil(duration) : null;
    this.cdr.detectChanges();
  }

  onSingleCoverSelected(event: Event): void {
    this.singleCover = this.fileFromEvent(event);
    this.songError = '';

    if (this.singleCover && !this.mediaValidation.isCoverImage(this.singleCover)) {
      this.songError = 'Single cover must be a PNG, JPEG, or WebP image.';
      this.singleCover = null;
    } else if (this.singleCover && this.singleCover.size > MAX_COVER_BYTES) {
      this.songError = 'Single cover must be under 10MB.';
      this.singleCover = null;
    }
  }

  toggleTagDropdown(): void {
    this.isTagOpen = !this.isTagOpen;
  }

  selectTag(tag: string): void {
    this.singleTag = tag;
    this.isTagOpen = false;
  }

  @HostListener('document:click', ['$event'])
  closeTagDropdown(event: MouseEvent): void {
    const target = event.target as Node | null;
    const host = this.elementRef.nativeElement;

    if (target && !host.contains(target)) {
      this.isTagOpen = false;
    }
  }

  async uploadSong(): Promise<void> {
    this.songError = '';
    this.songMessage = '';

    const title = this.songTitle.trim();
    const durationSeconds = Math.ceil(this.songDurationSeconds ?? 180);
    if (!this.songFile || !title || [...title].length > 120 || !this.tagOptions.some((tag) => tag === this.singleTag)) {
      this.songError = 'Choose an audio file, song title, and tag first.';
      return;
    }

    const format = this.mediaValidation.getAudioFormat(this.songFile);
    if (!format) {
      this.songError = 'Only WAV and FLAC files are accepted.';
      return;
    }
    if (this.songFile.size > MAX_AUDIO_BYTES || !this.mediaValidation.isValidDuration(durationSeconds)) {
      this.songError = 'Audio must be under 200MB with a duration between 1 second and 6 hours.';
      return;
    }

    if (this.singleCover && !this.mediaValidation.isCoverImage(this.singleCover)) {
      this.songError = 'Single cover must be a PNG, JPEG, or WebP image.';
      return;
    }

    if (this.singleCover && this.singleCover.size > MAX_COVER_BYTES) {
      this.songError = 'Single cover must be under 10MB.';
      return;
    }
    this.uploadProgress = 0;

    let createdAlbum: UploadAlbum | null = null;
    try {
      this.uploadStep = 'creating-album';
      const album = await this.createSingleAlbum(title);
      createdAlbum = album;

      this.uploadStep = 'creating-song';
      await this.uploadOneSong(album.id, this.songFile, title, durationSeconds);

      this.uploadStep = 'done';
      this.singleDone = true;
      this.albumMessage = `Album created: ${album.title}`;
      // clear confirmation state after 5s
      setTimeout(() => {
        this.singleDone = false;
        this.albumMessage = '';
        this.uploadStep = 'idle';
        this.cdr.detectChanges();
      }, 5000);
      this.songTitle = '';
      this.songDurationSeconds = null;
      this.songFile = null;
      this.singleCover = null;
      this.singleTag = '';
    } catch (error) {
      this.songError = describeUploadError(error, 'Upload failed.');
      this.uploadStep = 'idle';
      this.uploadProgress = 0;
      await this.cleanUpFailedUpload(createdAlbum);
    } finally {
      this.cdr.detectChanges();
    }
  }

  private async cleanUpFailedUpload(album: UploadAlbum | null): Promise<void> {
    if (!album) return;
    try {
      await firstValueFrom(this.albumService.deleteAlbum(album.id));
    } catch (cleanupError) {
      console.error('Failed to clean up incomplete upload:', cleanupError);
    }
  }

  private async createSingleAlbum(title: string): Promise<UploadAlbum> {
    return firstValueFrom(this.uploadApi.createAlbum({
      title,
      genre: this.singleTag.trim(),
      cover: this.singleCover,
    }));
  }

  /** Delegates the shared storage workflow while keeping form progress local. */
  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number): Promise<void> {
    await this.uploadOrchestrator.uploadTrack({
      albumId,
      file,
      title,
      durationSeconds,
      onStage: (stage) => {
        this.uploadStep = stage;
      },
      onProgress: (progress) => {
        this.uploadProgress = progress.percent;
        this.cdr.detectChanges();
      },
    });
  }

  private fileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.item(0) ?? null;
  }

}
