import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TAGS } from '../../../catalog/models/tag.models';
import { AlbumService } from '../../../../services/album.service';
import { UploadApiService } from '../../data-access/upload-api.service';
import type { UploadAlbum } from '../../models/upload.models';
import { MediaMetadataService } from '../../services/media-metadata.service';
import { MAX_AUDIO_BYTES, MediaValidationService } from '../../services/media-validation.service';
import { describeUploadError } from '../../services/upload-error';
import { UploadOrchestratorService } from '../../services/upload-orchestrator.service';

@Component({
  selector: 'app-upload-album-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload-album-form.html',
  styleUrl: './upload-album-form.scss',
})
/** Handles release details while shared services own reusable media behavior. */
export class UploadAlbumForm {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly albumService = inject(AlbumService);
  private readonly uploadApi = inject(UploadApiService);
  private readonly uploadOrchestrator = inject(UploadOrchestratorService);
  private readonly mediaMetadata = inject(MediaMetadataService);
  private readonly mediaValidation = inject(MediaValidationService);

  readonly genreOptions = TAGS.filter((genre) => genre !== 'All');

  albumTitle = '';
  albumGenre = '';
  isGenreOpen = false;
  albumCover: File | null = null;
  albumSongFiles: File[] = [];
  fallbackDurationSeconds = 180;
  albumMessage = '';
  albumDone = false;
  albumError = '';
  isCreatingAlbum = false;
  releaseUploadMessage = '';
  uploadProgress = 0;

  get canCreateAlbum(): boolean {
    const titleLength = [...this.albumTitle.trim()].length;
    return titleLength > 0 && titleLength <= 120 && this.genreOptions.some((genre) => genre === this.albumGenre) && this.selectedTracksAreValid() && !this.isCreatingAlbum;
  }

  private selectedTracksAreValid(): boolean {
    return this.albumSongFiles.every((file) => {
      return this.mediaValidation.isValidAudio(file);
    });
  }

  onAlbumCoverSelected(event: Event): void {
    this.albumCover = this.fileFromEvent(event);
    if (this.albumCover && !this.mediaValidation.isValidCover(this.albumCover)) {
      this.albumError = 'Album cover must be a PNG, JPEG, or WebP image under 10MB.';
      this.albumCover = null;
    }
  }

  onAlbumSongsSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumSongFiles = Array.from(input?.files ?? []);
    this.albumError = '';

    const invalid = this.albumSongFiles.find((file) => !this.mediaValidation.getAudioFormat(file) || file.size > MAX_AUDIO_BYTES);
    if (invalid) {
      this.albumError = `${invalid.name} must be a WAV or FLAC file under 200MB.`;
      this.albumSongFiles = [];
      if (input) input.value = '';
      return;
    }
    const invalidTitle = this.albumSongFiles.find((file) => {
      const title = this.mediaValidation.getFileStem(file);
      return title.length === 0 || [...title].length > 120;
    });
    if (invalidTitle) {
      this.albumError = `${invalidTitle.name} must produce a track title between 1 and 120 characters.`;
      this.albumSongFiles = [];
      if (input) input.value = '';
    }
  }

  toggleGenreDropdown(): void {
    this.isGenreOpen = !this.isGenreOpen;
  }

  selectGenre(genre: string): void {
    this.albumGenre = genre;
    this.isGenreOpen = false;
  }

  @HostListener('document:click', ['$event'])
  closeGenreDropdown(event: MouseEvent): void {
    const target = event.target as Node | null;
    const host = this.elementRef.nativeElement;

    if (target && !host.contains(target)) {
      this.isGenreOpen = false;
    }
  }

  async createAlbum(): Promise<void> {
    this.albumError = '';
    this.albumMessage = '';
    this.releaseUploadMessage = '';

    const title = this.albumTitle.trim();
    if (!title || [...title].length > 120 || !this.genreOptions.some((genre) => genre === this.albumGenre)) {
      this.albumError = 'Album title must be 1-120 characters and genre must be selected.';
      return;
    }

    if (this.albumCover && !this.mediaValidation.isValidCover(this.albumCover)) {
      this.albumError = 'Album cover must be a PNG, JPEG, or WebP image under 10MB.';
      return;
    }
    if (!this.selectedTracksAreValid()) {
      this.albumError = 'Every track must be a WAV or FLAC file under 200MB with a valid title.';
      return;
    }

    this.isCreatingAlbum = true;
    this.uploadProgress = 0;
    let createdAlbum: UploadAlbum | null = null;
    try {
      const album = await firstValueFrom(this.uploadApi.createAlbum({
        title,
        genre: this.albumGenre.trim(),
        cover: this.albumCover,
      }));
      createdAlbum = album;
      this.albumDone = true;
      this.isCreatingAlbum = false;
      setTimeout(() => {
        this.albumDone = false;
        this.cdr.detectChanges();
      }, 5000);

      if (this.albumSongFiles.length > 0) {
        this.releaseUploadMessage = `Uploading 0/${this.albumSongFiles.length} tracks...`;
        await this.uploadFilesToAlbum(album, this.albumSongFiles);
        this.releaseUploadMessage = `Uploaded ${this.albumSongFiles.length}/${this.albumSongFiles.length} tracks.`;
        setTimeout(() => {
          this.releaseUploadMessage = '';
          this.cdr.detectChanges();
        }, 4000);
      }

      this.albumTitle = '';
      this.albumGenre = '';
      this.albumCover = null;
      this.albumSongFiles = [];
    } catch (error) {
      this.albumError = describeUploadError(error, 'Could not create album. Create an artist profile first.');
      this.uploadProgress = 0;
      this.releaseUploadMessage = '';
      await this.cleanUpFailedUpload(createdAlbum);
    } finally {
      this.isCreatingAlbum = false;
      this.cdr.detectChanges();
    }
  }

  private async cleanUpFailedUpload(album: UploadAlbum | null): Promise<void> {
    if (!album) return;
    try {
      await firstValueFrom(this.albumService.deleteAlbum(album.id));
    } catch (cleanupError) {
      console.error('Failed to clean up incomplete album upload:', cleanupError);
    }
  }

  /** Uploads tracks sequentially so progress and rollback stay predictable. */
  private async uploadFilesToAlbum(album: UploadAlbum, files: File[]): Promise<void> {
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const title = this.mediaValidation.getTrackTitle(file);
      const duration = (await this.mediaMetadata.readAudioDuration(file)) ?? this.fallbackDurationSeconds;
      if (!this.mediaValidation.isValidDuration(duration)) {
        throw new Error(`${file.name} must be between 1 second and 6 hours long.`);
      }

      await this.uploadOneSong(album.id, file, title, Math.ceil(duration), (loaded) => {
        this.uploadProgress = totalBytes > 0
          ? Math.min(100, Math.round(((completedBytes + loaded) / totalBytes) * 100))
          : 0;
        this.releaseUploadMessage = `Uploading ${index + 1}/${files.length}: ${file.name}`;
        this.cdr.detectChanges();
      });
      completedBytes += file.size;
      this.releaseUploadMessage = `Uploading ${index + 1}/${files.length} tracks...`;
      this.cdr.detectChanges();
    }
  }

  /** Delegates the shared track workflow and adapts its byte progress. */
  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number, onProgress: (loaded: number) => void): Promise<void> {
    await this.uploadOrchestrator.uploadTrack({
      albumId,
      file,
      title,
      durationSeconds,
      onProgress: (progress) => onProgress(progress.loaded),
    });
  }

  private fileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.item(0) ?? null;
  }

}
