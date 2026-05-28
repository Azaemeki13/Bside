import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environment';

interface ArtistResponse {
  id: string;
  user_id: string;
  name: string;
  bio?: string;
  photo_url: string;
  status: string;
}

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

type UploadStep = 'idle' | 'creating-song' | 'uploading-file' | 'verifying' | 'done';

@Component({
  selector: 'app-upload',
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class BsideUpload {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly apiUrl = environment.apiUrl;

  artistName = '';
  artistBio = '';
  artistPhoto: File | null = null;
  artist: ArtistResponse | null = null;
  artistMessage = '';
  artistError = '';
  isSavingArtist = false;

  albumTitle = '';
  albumGenre = '';
  albumCover: File | null = null;
  albumSongFiles: File[] = [];
  fallbackDurationSeconds = 180;
  album: AlbumResponse | null = null;
  albumMessage = '';
  albumError = '';
  isCreatingAlbum = false;
  releaseUploadMessage = '';

  songTitle = '';
  songDurationSeconds: number | null = null;
  songFile: File | null = null;
  songMessage = '';
  songError = '';
  uploadStep: UploadStep = 'idle';

  get canCreateAlbum(): boolean {
    return this.albumTitle.trim().length > 0 && this.albumGenre.trim().length > 0 && !this.isCreatingAlbum;
  }

  get canUploadSong(): boolean {
    return Boolean(
      this.album?.id &&
        this.songTitle.trim() &&
        this.songFile &&
        this.songDurationSeconds &&
        this.songDurationSeconds > 0 &&
        this.uploadStep !== 'creating-song' &&
        this.uploadStep !== 'uploading-file' &&
        this.uploadStep !== 'verifying'
    );
  }

  onArtistPhotoSelected(event: Event): void {
    this.artistPhoto = this.fileFromEvent(event);
  }

  onAlbumCoverSelected(event: Event): void {
    this.albumCover = this.fileFromEvent(event);
  }

  onAlbumSongsSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumSongFiles = Array.from(input?.files ?? []);
    this.albumError = '';

    const invalid = this.albumSongFiles.find((file) => !this.getAudioFormat(file));
    if (invalid) {
      this.albumError = `${invalid.name} is not a WAV or FLAC file.`;
    }
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

    if (format === 'wav') {
      const duration = await this.readAudioDuration(this.songFile);
      if (duration) {
        this.songDurationSeconds = Math.ceil(duration);
      }
    }
  }

  saveArtist(): void {
    this.artistError = '';
    this.artistMessage = '';

    if (!this.artistName.trim()) {
      this.artistError = 'Artist name is required.';
      return;
    }

    if (this.artistPhoto && this.artistPhoto.type !== 'image/png') {
      this.artistError = 'Artist photo must be a PNG.';
      return;
    }

    const form = new FormData();
    form.append('name', this.artistName.trim());
    if (this.artistBio.trim()) form.append('bio', this.artistBio.trim());
    if (this.artistPhoto) form.append('photo', this.artistPhoto);

    this.isSavingArtist = true;
    this.http.post<ArtistResponse>(`${this.apiUrl}/artists`, form).subscribe({
      next: (artist) => {
        this.artist = artist;
        this.artistMessage = 'Artist profile saved. You can create an album now.';
        this.isSavingArtist = false;
      },
      error: (error: unknown) => {
        this.artistError = this.describeError(error, 'Could not create artist profile.');
        this.isSavingArtist = false;
      },
    });
  }

  async createAlbum(): Promise<void> {
    this.albumError = '';
    this.albumMessage = '';
    this.releaseUploadMessage = '';

    if (!this.albumTitle.trim() || !this.albumGenre.trim()) {
      this.albumError = 'Album title and genre are required.';
      return;
    }

    if (this.albumCover && this.albumCover.type !== 'image/png') {
      this.albumError = 'Album cover must be a PNG.';
      return;
    }

    const form = new FormData();
    form.append('title', this.albumTitle.trim());
    form.append('genre', this.albumGenre.trim());
    if (this.albumCover) form.append('cover', this.albumCover);

    this.isCreatingAlbum = true;
    try {
      const album = await firstValueFrom(this.http.post<AlbumResponse>(`${this.apiUrl}/albums`, form));
      this.album = album;
      this.albumMessage = `Album created: ${album.title}`;

      if (this.albumSongFiles.length > 0) {
        this.releaseUploadMessage = `Uploading 0/${this.albumSongFiles.length} tracks...`;
        await this.uploadFilesToAlbum(album, this.albumSongFiles);
        this.releaseUploadMessage = `Uploaded ${this.albumSongFiles.length}/${this.albumSongFiles.length} tracks.`;
      }

      this.albumTitle = '';
      this.albumGenre = '';
      this.albumCover = null;
      this.albumSongFiles = [];
    } catch (error) {
      this.albumError = this.describeError(error, 'Could not create album. Create an artist profile first.');
    } finally {
      this.isCreatingAlbum = false;
      this.cdr.detectChanges();
    }
  }

  async uploadSong(): Promise<void> {
    this.songError = '';
    this.songMessage = '';

    if (!this.album?.id || !this.songFile || !this.songDurationSeconds) {
      this.songError = 'Choose an album, audio file, title, and duration first.';
      return;
    }

    const format = this.getAudioFormat(this.songFile);
    if (!format) {
      this.songError = 'Only WAV and FLAC files are accepted.';
      return;
    }

    try {
      this.uploadStep = 'creating-song';
      const songResponse = await firstValueFrom(
        this.http.post<SongResponse>(`${this.apiUrl}/songs`, {
          title: this.songTitle.trim(),
          album_id: this.album.id,
          duration_seconds: Math.ceil(this.songDurationSeconds),
          format,
          ml_features: null,
        })
      );

      this.uploadStep = 'uploading-file';
      const uploadResponse = await fetch(songResponse.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': `audio/${format}` },
        body: this.songFile,
      });

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed with status ${uploadResponse.status}.`);
      }

      this.uploadStep = 'verifying';
      await firstValueFrom(this.http.put(`${this.apiUrl}/songs/${songResponse.song.id}/verify`, {}));

      this.uploadStep = 'done';
      this.songMessage = 'Song uploaded and verified.';
      this.songTitle = '';
      this.songDurationSeconds = null;
      this.songFile = null;
    } catch (error) {
      this.songError = this.describeError(error, 'Upload failed.');
      this.uploadStep = 'idle';
    }
  }

  private async uploadFilesToAlbum(album: AlbumResponse, files: File[]): Promise<void> {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const title = file.name.replace(/\.[^/.]+$/, '');
      const duration = (await this.readAudioDuration(file)) ?? this.fallbackDurationSeconds;

      await this.uploadOneSong(album.id, file, title, Math.ceil(duration));
      this.releaseUploadMessage = `Uploading ${index + 1}/${files.length} tracks...`;
      this.cdr.detectChanges();
    }
  }

  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number): Promise<void> {
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
        ml_features: null,
      })
    );

    const uploadResponse = await fetch(songResponse.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': `audio/${format}` },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`File upload failed for ${file.name} with status ${uploadResponse.status}.`);
    }

    await firstValueFrom(this.http.put(`${this.apiUrl}/songs/${songResponse.song.id}/verify`, {}));
  }

  private fileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.item(0) ?? null;
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
