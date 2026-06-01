import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environment';
import { TAGS } from '../tag-list';

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

  get canUploadSong(): boolean {
    return Boolean(
      this.songTitle.trim() &&
        this.singleTag.trim() &&
        this.songFile &&
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

    if (!this.songFile || !this.songTitle.trim() || !this.singleTag.trim()) {
      this.songError = 'Choose an audio file, song title, and tag first.';
      return;
    }

    const format = this.getAudioFormat(this.songFile);
    if (!format) {
      this.songError = 'Only WAV and FLAC files are accepted.';
      return;
    }

    if (this.singleCover && !this.isCoverImage(this.singleCover)) {
      this.songError = 'Single cover must be a PNG, JPEG, or WebP image.';
      return;
    }

    const title = this.songTitle.trim();
    const durationSeconds = Math.ceil(this.songDurationSeconds ?? 180);

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
    } finally {
      this.cdr.detectChanges();
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
        ml_features: null,
      })
    );

    this.uploadStep = 'uploading-file';
    const uploadResponse = await fetch(songResponse.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': `audio/${format}` },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`File upload failed for ${file.name} with status ${uploadResponse.status}.`);
    }

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