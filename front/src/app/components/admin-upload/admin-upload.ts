import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environment';
import { TAGS } from '../tag-list';

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
  private readonly apiUrl = environment.apiUrl;

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

  get filteredArtists(): Artist[] {
    const q = this.artistSearch.toLowerCase();
    return this.artists.filter((a) => a.name.toLowerCase().includes(q));
  }

  get canCreateArtist(): boolean {
    return this.newArtistName.trim().length > 0 && !this.isCreatingArtist;
  }

  get canCreateAlbum(): boolean {
    return !!this.selectedArtist && this.albumTitle.trim().length > 0 && this.albumGenre.trim().length > 0 && !this.isCreatingAlbum;
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
  }

  onAlbumCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumCover = input?.files?.item(0) ?? null;
  }

  onAlbumSongsSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumSongFiles = Array.from(input?.files ?? []);
    this.albumError = '';
    const invalid = this.albumSongFiles.find((f) => !this.getAudioFormat(f));
    if (invalid) this.albumError = `${invalid.name} is not a WAV or FLAC file.`;
  }

  async createArtist(): Promise<void> {
    this.artistCreateError = '';
    this.artistCreateSuccess = '';
    if (!this.newArtistName.trim()) { this.artistCreateError = 'Artist name is required.'; return; }

    const form = new FormData();
    form.append('name', this.newArtistName.trim());
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
    if (!this.selectedArtist) { this.albumError = 'Select or create an artist first.'; return; }
    if (!this.albumTitle.trim() || !this.albumGenre.trim()) { this.albumError = 'Album title and genre are required.'; return; }
    if (this.albumCover && !this.isCoverImage(this.albumCover)) { this.albumError = 'Cover must be PNG, JPEG, or WebP.'; return; }

    const form = new FormData();
    form.append('title', this.albumTitle.trim());
    form.append('genre', this.albumGenre.trim());
    if (this.albumCover) form.append('cover', this.albumCover);

    this.isCreatingAlbum = true;
    try {
      const album = await firstValueFrom(
        this.http.post<AlbumResponse>(`${this.apiUrl}/admin/artists/${this.selectedArtist.id}/albums`, form)
      );
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
    } catch (error) {
      this.albumError = this.describeError(error, 'Could not create album.');
    } finally {
      this.isCreatingAlbum = false;
      this.cdr.detectChanges();
    }
  }

  private async uploadFilesToAlbum(album: AlbumResponse, files: File[]): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const title = file.name.replace(/\.[^/.]+$/, '');
      const duration = (await this.readAudioDuration(file)) ?? 180;
      await this.uploadOneSong(album.id, file, title, Math.ceil(duration));
      this.releaseUploadMessage = `Uploading ${i + 1}/${files.length} tracks...`;
      this.cdr.detectChanges();
    }
  }

  private async uploadOneSong(albumId: string, file: File, title: string, durationSeconds: number): Promise<void> {
    const format = this.getAudioFormat(file);
    if (!format) throw new Error(`${file.name} is not a WAV or FLAC file.`);
    const songResponse = await firstValueFrom(
      this.http.post<SongResponse>(`${this.apiUrl}/songs`, {
        title, album_id: albumId, duration_seconds: durationSeconds, format, ml_features: null,
      })
    );
    const uploadResponse = await fetch(songResponse.upload_url, {
      method: 'PUT', headers: { 'Content-Type': `audio/${format}` }, body: file,
    });
    if (!uploadResponse.ok) throw new Error(`Upload failed for ${file.name}: ${uploadResponse.status}`);
    await firstValueFrom(this.http.put(`${this.apiUrl}/songs/${songResponse.song.id}/verify`, {}));
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