import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environment';
import { TAGS } from '../tag-list';
import { AlbumService } from '../../services/album.service';
import { PresignedUploadService } from '../../services/presigned-upload.service';

interface AlbumResponse {
  id: string;
  artist_id: string;
  title: string;
  genre: string;
  cover_url: string;
  status: string;
}

interface SongResponse {
  song: {
    id: string;
    album_id: string;
    title: string;
    duration_seconds: number;
    audio_url: string;
    status: string;
    created_at: string;
  };
  upload_url: string;
}

type UploadStep = 'idle' | 'creating-album' | 'creating-song' | 'uploading-file' | 'verifying' | 'done';

@Component({
  selector: 'app-upload-single-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload-single-form.html',
  styleUrl: './upload-single-form.scss',
})
export class UploadSingleForm {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly albumService = inject(AlbumService);
  private readonly presignedUpload = inject(PresignedUploadService);
  private readonly apiUrl = environment.apiUrl;

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
  album: AlbumResponse | null = null;
  albumMessage = '';
  uploadProgress = 0;

  get canUploadSong(): boolean {
    return Boolean(
      this.songTitle.trim() &&
        [...this.songTitle.trim()].length <= 120 &&
        this.tagOptions.some((tag) => tag === this.singleTag) &&
        this.songFile && this.songFile.size <= 200 * 1024 * 1024 &&
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
    const format = this.getAudioFormat(this.songFile);
    if (!format) {
      this.songError = 'Only WAV and FLAC files are accepted.';
      this.songFile = null;
      return;
    }
    if (this.songFile.size > 200 * 1024 * 1024) {
      this.songError = 'Audio file must be under 200MB.';
      this.songFile = null;
      return;
    }

    if (!this.songTitle.trim()) {
      this.songTitle = this.songFile.name.replace(/\.[^/.]+$/, '');
    }

    const duration = await this.readAudioDuration(this.songFile);
    this.songDurationSeconds = duration ? Math.ceil(duration) : null;
    this.cdr.detectChanges();
  }

  onSingleCoverSelected(event: Event): void {
    this.singleCover = this.fileFromEvent(event);
    this.songError = '';

    if (this.singleCover && !this.isCoverImage(this.singleCover)) {
      this.songError = 'Single cover must be a PNG, JPEG, or WebP image.';
      this.singleCover = null;
    } else if (this.singleCover && this.singleCover.size > 10 * 1024 * 1024) {
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

    const format = this.getAudioFormat(this.songFile);
    if (!format) {
      this.songError = 'Only WAV and FLAC files are accepted.';
      return;
    }
    if (this.songFile.size > 200 * 1024 * 1024 || durationSeconds < 1 || durationSeconds > 21_600) {
      this.songError = 'Audio must be under 200MB with a duration between 1 second and 6 hours.';
      return;
    }

    if (this.singleCover && !this.isCoverImage(this.singleCover)) {
      this.songError = 'Single cover must be a PNG, JPEG, or WebP image.';
      return;
    }

    if (this.singleCover && this.singleCover.size > 10 * 1024 * 1024) {
      this.songError = 'Single cover must be under 10MB.';
      return;
    }
    this.uploadProgress = 0;

    try {
      this.uploadStep = 'creating-album';
      const album = await this.createSingleAlbum(title);
      this.album = album;

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
      this.songError = this.describeError(error, 'Upload failed.');
      this.uploadStep = 'idle';
      this.uploadProgress = 0;
      await this.cleanUpFailedUpload();
    } finally {
      this.cdr.detectChanges();
    }
  }

  private async cleanUpFailedUpload(): Promise<void> {
    if (!this.album) return;
    try {
      await firstValueFrom(this.albumService.deleteAlbum(this.album.id));
    } catch (cleanupError) {
      console.error('Failed to clean up incomplete upload:', cleanupError);
    } finally {
      this.album = null;
    }
  }

  private async createSingleAlbum(title: string): Promise<AlbumResponse> {
    const form = new FormData();
    form.append('title', title);
    form.append('genre', this.singleTag.trim());
    if (this.singleCover) form.append('cover', this.singleCover);

    return firstValueFrom(this.http.post<AlbumResponse>(`${this.apiUrl}/albums`, form));
  }

  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number): Promise<void> {
    const format = this.getAudioFormat(file);
    if (!format) {
      throw new Error(`${file.name} is not a WAV or FLAC file.`);
    }

    this.uploadStep = 'creating-song';
    const songResponse = await firstValueFrom(
      this.http.post<SongResponse>(`${this.apiUrl}/songs`, {
        title,
        album_id: albumId,
        duration_seconds: durationSeconds,
        format,
      })
    );

    this.uploadStep = 'uploading-file';
    await this.presignedUpload.upload(songResponse.upload_url, file, `audio/${format}`, (progress) => {
      this.uploadProgress = progress.percent;
      this.cdr.detectChanges();
    });

    this.uploadStep = 'verifying';
    await firstValueFrom(this.http.put(`${this.apiUrl}/songs/${songResponse.song.id}/verify`, {}));
  }

  private fileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.item(0) ?? null;
  }

  private isCoverImage(file: File): boolean {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (validTypes.includes(file.type)) {
      return true;
    }

    return /\.(png|jpe?g|webp)$/i.test(file.name);
  }

  private getAudioFormat(file: File): 'wav' | 'flac' | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.wav')) return 'wav';
    if (name.endsWith('.flac')) return 'flac';
    return null;
  }

  private readAudioDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(file);

      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(audio.duration) ? audio.duration : null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      audio.src = url;
    });
  }

  private describeError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) return error.error;
      if (error.message) return error.message;
    }

    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }
}
