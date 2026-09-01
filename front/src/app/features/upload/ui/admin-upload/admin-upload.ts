import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TAGS } from '../../../catalog/models/tag.models';
import { AlbumService } from '../../../../services/album.service';
import { UploadApiService } from '../../data-access/upload-api.service';
import type { UploadAlbum, UploadArtist } from '../../models/upload.models';
import { MediaMetadataService } from '../../services/media-metadata.service';
import { MAX_AUDIO_BYTES, MediaValidationService } from '../../services/media-validation.service';
import { describeUploadError } from '../../services/upload-error';
import { UploadOrchestratorService } from '../../services/upload-orchestrator.service';

type AdminTab = 'select' | 'create';

@Component({
  selector: 'app-admin-artist-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-upload.html',
  styleUrl: './admin-upload.scss',
})
/** Supports administrator uploads while shared services own common media rules. */
export class AdminArtistUpload implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly albumService = inject(AlbumService);
  private readonly uploadApi = inject(UploadApiService);
  private readonly uploadOrchestrator = inject(UploadOrchestratorService);
  private readonly mediaMetadata = inject(MediaMetadataService);
  private readonly mediaValidation = inject(MediaValidationService);

  @ViewChild('artistPhotoInput') artistPhotoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('albumCoverInput') albumCoverInput?: ElementRef<HTMLInputElement>;
  @ViewChild('albumSongsInput') albumSongsInput?: ElementRef<HTMLInputElement>;

  readonly genreOptions = TAGS.filter((g) => g !== 'All');

  activeTab: AdminTab = 'select';
  artists: UploadArtist[] = [];
  selectedArtist: UploadArtist | null = null;
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

  get filteredArtists(): UploadArtist[] {
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
      this.genreOptions.some((genre) => genre === this.albumGenre) && this.albumSongFiles.every((file) => this.mediaValidation.isValidAudio(file)) &&
      !this.isCreatingAlbum;
  }

  ngOnInit(): void {
    this.loadArtists();
  }

  loadArtists(): void {
    this.isLoadingArtists = true;
    this.artistLoadError = '';
    this.uploadApi.getArtists().subscribe({
      next: (artists) => { this.artists = artists; this.isLoadingArtists = false; this.cdr.markForCheck(); },
      error: () => { this.artistLoadError = 'Could not load artists.'; this.isLoadingArtists = false; this.cdr.markForCheck(); },
    });
  }

  setTab(tab: AdminTab): void { this.activeTab = tab; }
  toggleArtistDropdown(): void { this.isArtistOpen = !this.isArtistOpen; }
  selectArtist(artist: UploadArtist): void { this.selectedArtist = artist; this.isArtistOpen = false; this.artistSearch = ''; }
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
    if (this.newArtistPhoto && !this.mediaValidation.isValidCover(this.newArtistPhoto)) {
      this.artistCreateError = 'Artist photo must be a PNG, JPEG, or WebP image under 10MB.';
      this.newArtistPhoto = null;
      if (input) input.value = '';
    }
  }

  onAlbumCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumCover = input?.files?.item(0) ?? null;
    if (this.albumCover && !this.mediaValidation.isValidCover(this.albumCover)) {
      this.albumError = 'Cover must be a PNG, JPEG, or WebP image under 10MB.';
      this.albumCover = null;
      if (input) input.value = '';
    }
  }

  onAlbumSongsSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.albumSongFiles = Array.from(input?.files ?? []);
    this.albumError = '';
    const invalid = this.albumSongFiles.find((file) => !this.mediaValidation.getAudioFormat(file) || file.size > MAX_AUDIO_BYTES);
    if (invalid) {
      this.albumError = `${invalid.name} must be a WAV or FLAC file no larger than 200MB.`;
      this.albumSongFiles = [];
      if (input) input.value = '';
      return;
    }
    const invalidTitle = this.albumSongFiles.find((file) => {
      const title = this.mediaValidation.getTrackTitle(file);
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
    if (this.newArtistPhoto && !this.mediaValidation.isValidCover(this.newArtistPhoto)) {
      this.artistCreateError = 'Artist photo must be a PNG, JPEG, or WebP image under 10MB.'; return;
    }

    this.isCreatingArtist = true;
    try {
      const artist = await firstValueFrom(this.uploadApi.createArtist({
        name: artistName,
        bio: this.newArtistBio.trim(),
        photo: this.newArtistPhoto,
      }));
      this.artists = [...this.artists, artist];
      this.selectedArtist = artist;
      this.artistCreateSuccess = `Artist "${artist.name}" created! You can now upload their album below.`;
      this.newArtistName = '';
      this.newArtistBio = '';
      this.newArtistPhoto = null;
      this.clearFileInput(this.artistPhotoInput);
      this.activeTab = 'select';
    } catch (error) {
      this.artistCreateError = describeUploadError(error, 'Could not create artist.');
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
    if (this.albumCover && !this.mediaValidation.isValidCover(this.albumCover)) { this.albumError = 'Cover must be PNG, JPEG, or WebP and under 10MB.'; return; }
    if (this.albumSongFiles.some((file) => !this.mediaValidation.isValidAudio(file))) { this.albumError = 'Every track must be WAV or FLAC, under 200MB, with a title of 1 to 120 characters.'; return; }

    this.isCreatingAlbum = true;
    let createdAlbum: UploadAlbum | null = null;
    try {
      const album = await firstValueFrom(this.uploadApi.createAdminAlbum(this.selectedArtist.id, {
        title: albumTitle,
        genre: this.albumGenre.trim(),
        cover: this.albumCover,
      }));
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
      this.albumError = describeUploadError(error, 'Could not create album.');
      this.releaseUploadMessage = '';
      this.uploadProgress = 0;
      await this.cleanUpFailedAlbum(createdAlbum);
    } finally {
      this.isCreatingAlbum = false;
      this.cdr.detectChanges();
    }
  }

  private async cleanUpFailedAlbum(album: UploadAlbum | null): Promise<void> {
    if (!album) return;
    try {
      await firstValueFrom(this.albumService.deleteAlbum(album.id));
    } catch (cleanupError) {
      console.error('Failed to clean up incomplete album upload:', cleanupError);
    }
  }

  /** Uploads tracks one at a time to keep progress understandable. */
  private async uploadFilesToAlbum(album: UploadAlbum, files: File[]): Promise<void> {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const title = this.mediaValidation.getFileStem(file);
      const duration = (await this.mediaMetadata.readAudioDuration(file)) ?? 180;
      if (!this.mediaValidation.isValidDuration(duration)) {
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

  private clearFileInput(ref?: ElementRef<HTMLInputElement>): void {
    if (ref?.nativeElement) ref.nativeElement.value = '';
  }

}
