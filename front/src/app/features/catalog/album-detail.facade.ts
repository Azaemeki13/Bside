import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlbumService } from '../../services/album.service';
import { ArtistService } from '../../services/artist.service';
import { AuthService } from '../../services/auth.service';
import type { AlbumDetailedResponse, AlbumSongItem } from '../catalog/models/album.models';

/**
 * Owns album loading, ownership resolution, and admin delete operations so the
 * AlbumDetail component can stay focused on template coordination.
 */
@Injectable()
export class AlbumDetailFacade implements OnDestroy {
  private readonly albumService = inject(AlbumService);
  private readonly artistService = inject(ArtistService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly album = signal<AlbumDetailedResponse | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal('');

  readonly isDeletingAlbum = signal(false);
  readonly deletingSongId = signal('');
  readonly deleteError = signal('');

  // Resolved after the album loads; null means ownership is unknown or unverified.
  private readonly catalogOwnerUserId = signal<string | null>(null);

  /** True when the signed-in user is an admin or the artist who owns this album. */
  readonly canDeleteCatalog = computed(() => {
    const role = this.authService.currentUser()?.role;
    const userId = this.authService.currentUser()?.id;
    return role === 'Admin' || (!!userId && this.catalogOwnerUserId() === userId);
  });

  private albumSub?: Subscription;

  ngOnDestroy(): void {
    this.albumSub?.unsubscribe();
  }

  /** Loads the album and resolves the artist ownership id for delete permission. */
  loadAlbum(albumId: string): void {
    this.albumSub?.unsubscribe();
    this.album.set(null);
    this.error.set('');
    this.isLoading.set(true);

    this.albumSub = this.albumService.getAlbum(albumId).subscribe({
      next: (album) => {
        this.album.set(album);
        this.isLoading.set(false);
        this.catalogOwnerUserId.set(null);
        // Resolve artist ownership separately so the page renders before it completes.
        this.artistService.getArtist(album.artist_id).subscribe({
          next: (artist) => this.catalogOwnerUserId.set(artist.user_id),
          error: () => this.catalogOwnerUserId.set(null),
        });
      },
      error: () => {
        this.error.set('Could not load album.');
        this.isLoading.set(false);
      },
    });
  }

  /** Deletes the current album and navigates to the library on success. */
  deleteAlbum(): void {
    const album = this.album();
    if (!album) return;

    this.deleteError.set('');
    this.isDeletingAlbum.set(true);
    this.albumService.deleteAlbum(album.id).subscribe({
      next: () => void this.router.navigate(['/bside_app/library']),
      error: () => {
        this.deleteError.set('Could not delete this album.');
        this.isDeletingAlbum.set(false);
      },
    });
  }

  /** Deletes one song and removes it from the local album signal on success. */
  removeSong(song: AlbumSongItem): void {
    this.deleteError.set('');
    this.deletingSongId.set(song.id);
    this.albumService.deleteSong(song.id).subscribe({
      next: () => {
        this.album.update((current) =>
          current ? { ...current, songs: current.songs.filter((s) => s.id !== song.id) } : null,
        );
        this.deletingSongId.set('');
      },
      error: () => {
        this.deleteError.set(`Could not delete "${song.title}".`);
        this.deletingSongId.set('');
      },
    });
  }
}
