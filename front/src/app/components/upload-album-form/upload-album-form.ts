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

@Component({
  selector: 'app-upload-album-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload-album-form.html',
  styleUrl: './upload-album-form.scss',
})
export class UploadAlbumForm {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly albumService = inject(AlbumService);
  private readonly presignedUpload = inject(PresignedUploadService);
  private readonly apiUrl = environment.apiUrl;

  readonly genreOptions = TAGS.filter((genre) => genre !== 'All');

  albumTitle = '';
  albumGenre = '';
  isGenreOpen = false;
  albumCover: File | null = null;
  albumSongFiles: File[] = [];
  fallbackDurationSeconds = 180;
  album: AlbumResponse | null = null;
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
      const title = file.name.replace(/\.[^/.]+$/, '').trim();
      return this.getAudioFormat(file) !== null && file.size <= 200 * 1024 * 1024 && title.length > 0 && [...title].length <= 120;
    });
  }

  onAlbumCoverSelected(event: Event): void {
    this.albumCover = this.fileFromEvent(event);
    if (this.albumCover && (!this.isCoverImage(this.albumCover) || this.albumCover.size > 10 * 1024 * 1024)) {
      this.albumError = 'Album cover must be a PNG, JPEG, or WebP image under 10MB.';
      this.albumCover = null;
    }
  }

  onAlbumSongsSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumSongFiles = Array.from(input?.files ?? []);
    this.albumError = '';

    const invalid = this.albumSongFiles.find((file) => !this.getAudioFormat(file) || file.size > 200 * 1024 * 1024);
    if (invalid) {
      this.albumError = `${invalid.name} must be a WAV or FLAC file under 200MB.`;
      this.albumSongFiles = [];
      if (input) input.value = '';
      return;
    }
    const invalidTitle = this.albumSongFiles.find((file) => {
      const title = file.name.replace(/\.[^/.]+$/, '').trim();
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

    if (this.albumCover && (!this.isCoverImage(this.albumCover) || this.albumCover.size > 10 * 1024 * 1024)) {
      this.albumError = 'Album cover must be a PNG, JPEG, or WebP image under 10MB.';
      return;
    }
    if (!this.selectedTracksAreValid()) {
      this.albumError = 'Every track must be a WAV or FLAC file under 200MB with a valid title.';
      return;
    }

    const form = new FormData();
    form.append('title', title);
    form.append('genre', this.albumGenre.trim());
    if (this.albumCover) form.append('cover', this.albumCover);

    this.isCreatingAlbum = true;
    this.uploadProgress = 0;
    try {
      const album = await firstValueFrom(this.http.post<AlbumResponse>(`${this.apiUrl}/albums`, form));
      this.album = album;
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
      this.albumError = this.describeError(error, 'Could not create album. Create an artist profile first.');
      this.uploadProgress = 0;
      this.releaseUploadMessage = '';
      await this.cleanUpFailedUpload();
    } finally {
      this.isCreatingAlbum = false;
      this.cdr.detectChanges();
    }
  }

  private async cleanUpFailedUpload(): Promise<void> {
    if (!this.album) return;
    try {
      await firstValueFrom(this.albumService.deleteAlbum(this.album.id));
    } catch (cleanupError) {
      console.error('Failed to clean up incomplete album upload:', cleanupError);
    } finally {
      this.album = null;
    }
  }

  private async uploadFilesToAlbum(album: AlbumResponse, files: File[]): Promise<void> {
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const title = file.name.replace(/\.[^/.]+$/, '');
      const duration = (await this.readAudioDuration(file)) ?? this.fallbackDurationSeconds;
      if (!Number.isFinite(duration) || duration < 1 || duration > 21_600) {
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

  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number, onProgress: (loaded: number) => void): Promise<void> {
    const format = this.getAudioFormat(file);
    if (!format) {
      throw new Error(`${file.name} is not a WAV or FLAC file.`);
    }

    const songResponse = await firstValueFrom(
      this.http.post<SongResponse>(`${this.apiUrl}/songs`, {
        title,
        album_id: albumId,
        duration_seconds: durationSeconds,
        format,
      })
    );

    await this.presignedUpload.upload(songResponse.upload_url, file, `audio/${format}`, (progress) => onProgress(progress.loaded));

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
