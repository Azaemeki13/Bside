import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environment';
import { TAGS } from '../tag-list';
import { AlbumService } from '../../services/album.service';
import { PresignedUploadService } from '../../services/presigned-upload.service';

interface Artist {
  id: string;
  name: string;
  bio: string | null;
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

type AdminTab = 'select' | 'create';

@Component({
  selector: 'app-admin-artist-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-upload.html',
  styleUrl: './admin-upload.scss',
})
export class AdminArtistUpload implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly albumService = inject(AlbumService);
  private readonly presignedUpload = inject(PresignedUploadService);
  private readonly apiUrl = environment.apiUrl;

  @ViewChild('artistPhotoInput') artistPhotoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('albumCoverInput') albumCoverInput?: ElementRef<HTMLInputElement>;
  @ViewChild('albumSongsInput') albumSongsInput?: ElementRef<HTMLInputElement>;

  readonly genreOptions = TAGS.filter((g) => g !== 'All');

  activeTab: AdminTab = 'select';
  artists: Artist[] = [];
  selectedArtist: Artist | null = null;
  isArtistOpen = false;
  artistSearch = '';
  isLoadingArtists = false;
  artistLoadError = '';

  newArtistName = '';
  newArtistBio = '';
  newArtistPhoto: File | null = null;
  isCreatingArtist = false;
  artistCreateError = '';
  artistCreateSuccess = '';

  albumTitle = '';
  albumGenre = '';
  isGenreOpen = false;
  albumCover: File | null = null;
  albumSongFiles: File[] = [];
  isCreatingAlbum = false;
  albumDone = false;
  albumError = '';
  releaseUploadMessage = '';
  uploadProgress = 0;

  get filteredArtists(): Artist[] {
    const q = this.artistSearch.toLowerCase();
    return this.artists.filter((a) => a.name.toLowerCase().includes(q));
  }

  get canCreateArtist(): boolean {
    const nameLength = [...this.newArtistName.trim()].length;
    return nameLength > 0 && nameLength <= 100 && [...this.newArtistBio.trim()].length <= 2000 && !this.isCreatingArtist;
  }

  get canCreateAlbum(): boolean {
    const titleLength = [...this.albumTitle.trim()].length;
    return !!this.selectedArtist && titleLength > 0 && titleLength <= 120 &&
      this.genreOptions.some((genre) => genre === this.albumGenre) && this.albumSongFiles.every((file) => this.isValidAudio(file)) &&
      !this.isCreatingAlbum;
  }

  ngOnInit(): void {
    this.loadArtists();
  }

  loadArtists(): void {
    this.isLoadingArtists = true;
    this.artistLoadError = '';
    this.http.get<Artist[]>(`${this.apiUrl}/artists`).subscribe({
      next: (artists) => { this.artists = artists; this.isLoadingArtists = false; this.cdr.markForCheck(); },
      error: () => { this.artistLoadError = 'Could not load artists.'; this.isLoadingArtists = false; this.cdr.markForCheck(); },
    });
  }

  setTab(tab: AdminTab): void { this.activeTab = tab; }
  toggleArtistDropdown(): void { this.isArtistOpen = !this.isArtistOpen; }
  selectArtist(artist: Artist): void { this.selectedArtist = artist; this.isArtistOpen = false; this.artistSearch = ''; }
  toggleGenreDropdown(): void { this.isGenreOpen = !this.isGenreOpen; }
  selectGenre(genre: string): void { this.albumGenre = genre; this.isGenreOpen = false; }

  @HostListener('document:click', ['$event'])
  closeDropdowns(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.isArtistOpen = false;
      this.isGenreOpen = false;
    }
  }

  onArtistPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.newArtistPhoto = input?.files?.item(0) ?? null;
    if (this.newArtistPhoto && (!this.isCoverImage(this.newArtistPhoto) || this.newArtistPhoto.size > 10 * 1024 * 1024)) {
      this.artistCreateError = 'Artist photo must be a PNG, JPEG, or WebP image under 10MB.';
      this.newArtistPhoto = null;
      if (input) input.value = '';
    }
  }

  onAlbumCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumCover = input?.files?.item(0) ?? null;
    if (this.albumCover && (!this.isCoverImage(this.albumCover) || this.albumCover.size > 10 * 1024 * 1024)) {
      this.albumError = 'Cover must be a PNG, JPEG, or WebP image under 10MB.';
      this.albumCover = null;
      if (input) input.value = '';
    }
  }

  onAlbumSongsSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumSongFiles = Array.from(input?.files ?? []);
    this.albumError = '';
    const invalid = this.albumSongFiles.find((f) => !this.getAudioFormat(f) || f.size > 200 * 1024 * 1024);
    if (invalid) {
      this.albumError = `${invalid.name} must be a WAV or FLAC file no larger than 200MB.`;
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

  async createArtist(): Promise<void> {
    this.artistCreateError = '';
    this.artistCreateSuccess = '';
    const artistName = this.newArtistName.trim();
    if ([...artistName].length < 1 || [...artistName].length > 100) { this.artistCreateError = 'Artist name must be between 1 and 100 characters.'; return; }
    if ([...this.newArtistBio.trim()].length > 2000) { this.artistCreateError = 'Artist bio cannot exceed 2000 characters.'; return; }
    if (this.newArtistPhoto && (!this.isCoverImage(this.newArtistPhoto) || this.newArtistPhoto.size > 10 * 1024 * 1024)) {
      this.artistCreateError = 'Artist photo must be a PNG, JPEG, or WebP image under 10MB.'; return;
    }

    const form = new FormData();
    form.append('name', artistName);
    if (this.newArtistBio.trim()) form.append('bio', this.newArtistBio.trim());
    if (this.newArtistPhoto) form.append('photo', this.newArtistPhoto);

    this.isCreatingArtist = true;
    try {
      const artist = await firstValueFrom(this.http.post<Artist>(`${this.apiUrl}/artists`, form));
      this.artists = [...this.artists, artist];
      this.selectedArtist = artist;
      this.artistCreateSuccess = `Artist "${artist.name}" created! You can now upload their album below.`;
      this.newArtistName = '';
      this.newArtistBio = '';
      this.newArtistPhoto = null;
      this.clearFileInput(this.artistPhotoInput);
      this.activeTab = 'select';
    } catch (error) {
      this.artistCreateError = this.describeError(error, 'Could not create artist.');
    } finally {
      this.isCreatingArtist = false;
      this.cdr.detectChanges();
    }
  }

  async createAlbum(): Promise<void> {
    this.albumError = '';
    this.releaseUploadMessage = '';
    this.uploadProgress = 0;
    if (!this.selectedArtist) { this.albumError = 'Select or create an artist first.'; return; }
    const albumTitle = this.albumTitle.trim();
    if ([...albumTitle].length < 1 || [...albumTitle].length > 120) { this.albumError = 'Album title must be between 1 and 120 characters.'; return; }
    if (!this.genreOptions.some((genre) => genre === this.albumGenre)) { this.albumError = 'Select a valid genre.'; return; }
    if (this.albumCover && (!this.isCoverImage(this.albumCover) || this.albumCover.size > 10 * 1024 * 1024)) { this.albumError = 'Cover must be PNG, JPEG, or WebP and under 10MB.'; return; }
    if (this.albumSongFiles.some((file) => !this.isValidAudio(file))) { this.albumError = 'Every track must be WAV or FLAC, under 200MB, with a title of 1 to 120 characters.'; return; }

    const form = new FormData();
    form.append('title', albumTitle);
    form.append('genre', this.albumGenre.trim());
    if (this.albumCover) form.append('cover', this.albumCover);

    this.isCreatingAlbum = true;
    let createdAlbum: AlbumResponse | null = null;
    try {
      const album = await firstValueFrom(
        this.http.post<AlbumResponse>(`${this.apiUrl}/admin/artists/${this.selectedArtist.id}/albums`, form)
      );
      createdAlbum = album;
      this.albumDone = true;
      setTimeout(() => { this.albumDone = false; this.cdr.detectChanges(); }, 5000);

      if (this.albumSongFiles.length > 0) {
        this.releaseUploadMessage = `Uploading 0/${this.albumSongFiles.length} tracks...`;
        await this.uploadFilesToAlbum(album, this.albumSongFiles);
        this.releaseUploadMessage = `All ${this.albumSongFiles.length} tracks uploaded.`;
        setTimeout(() => { this.releaseUploadMessage = ''; this.cdr.detectChanges(); }, 4000);
      }

      this.albumTitle = '';
      this.albumGenre = '';
      this.albumCover = null;
      this.albumSongFiles = [];
      this.clearFileInput(this.albumCoverInput);
      this.clearFileInput(this.albumSongsInput);
    } catch (error) {
      this.albumError = this.describeError(error, 'Could not create album.');
      this.releaseUploadMessage = '';
      this.uploadProgress = 0;
      await this.cleanUpFailedAlbum(createdAlbum);
    } finally {
      this.isCreatingAlbum = false;
      this.cdr.detectChanges();
    }
  }

  private async cleanUpFailedAlbum(album: AlbumResponse | null): Promise<void> {
    if (!album) return;
    try {
      await firstValueFrom(this.albumService.deleteAlbum(album.id));
    } catch (cleanupError) {
      console.error('Failed to clean up incomplete album upload:', cleanupError);
    }
  }

  private async uploadFilesToAlbum(album: AlbumResponse, files: File[]): Promise<void> {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const title = file.name.replace(/\.[^/.]+$/, '');
      const duration = (await this.readAudioDuration(file)) ?? 180;
      if (!Number.isFinite(duration) || duration < 1 || duration > 21_600) {
        throw new Error(`${file.name} must be between 1 second and 6 hours long.`);
      }
      this.releaseUploadMessage = `Uploading ${i + 1}/${files.length}: ${file.name}`;
      await this.uploadOneSong(album.id, file, title, Math.ceil(duration), (loaded) => {
        this.uploadProgress = totalBytes === 0 ? 100 : Math.min(100, Math.floor(100 * (completedBytes + loaded) / totalBytes));
        this.cdr.detectChanges();
      });
      completedBytes += file.size;
      this.releaseUploadMessage = `Uploading ${i + 1}/${files.length} tracks...`;
      this.cdr.detectChanges();
    }
  }

  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number, onProgress: (loaded: number) => void): Promise<void> {
    const format = this.getAudioFormat(file);
    if (!format) throw new Error(`${file.name} is not a WAV or FLAC file.`);
    const songResponse = await firstValueFrom(
      this.http.post<SongResponse>(`${this.apiUrl}/songs`, {
        title, album_id: albumId, duration_seconds: durationSeconds, format,
      })
    );
    await this.presignedUpload.upload(songResponse.upload_url, file, `audio/${format}`, (progress) => onProgress(progress.loaded));
    await firstValueFrom(this.http.put(`${this.apiUrl}/songs/${songResponse.song.id}/verify`, {}));
  }

  private clearFileInput(ref?: ElementRef<HTMLInputElement>): void {
    if (ref?.nativeElement) ref.nativeElement.value = '';
  }

  private isCoverImage(file: File): boolean {
    return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type) ||
      /\.(png|jpe?g|webp)$/i.test(file.name);
  }

  private getAudioFormat(file: File): 'wav' | 'flac' | null {
    if (file.name.toLowerCase().endsWith('.wav')) return 'wav';
    if (file.name.toLowerCase().endsWith('.flac')) return 'flac';
    return null;
  }

  private isValidAudio(file: File): boolean {
    const title = file.name.replace(/\.[^/.]+$/, '').trim();
    return !!this.getAudioFormat(file) && file.size <= 200 * 1024 * 1024 && [...title].length >= 1 && [...title].length <= 120;
  }

  private readAudioDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(file);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(audio.duration) ? audio.duration : null); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
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
