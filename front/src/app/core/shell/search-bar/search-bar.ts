import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, Search, X } from 'lucide-angular';
import { Subject, Subscription, catchError, debounceTime, of, switchMap } from 'rxjs';
import { SearchService } from '../../../services/search.service';
import type { SearchEntityType, SearchResult, SearchSort } from '../../../features/catalog/models/search.models';
import { AlbumService } from '../../../services/album.service';
import { AudioPlayerService } from '../../../services/audio.player.service';
import { PlaylistService } from '../../../services/playlist.service';

/** Turns a listener's query into navigable catalog and library results. */
@Component({
  selector: 'app-search-bar',
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
})
export class SearchBar implements OnDestroy {
  private readonly searchService = inject(SearchService);
  private readonly albumService = inject(AlbumService);
  private readonly audio = inject(AudioPlayerService);
  private readonly router = inject(Router);
  private readonly playlistService = inject(PlaylistService);
  private readonly query$ = new Subject<string>();
  private readonly searchSub: Subscription;

  protected readonly search = Search;
  protected query = '';
  protected results: SearchResult[] = [];
  protected entityType: SearchEntityType = 'all';
  protected sort: SearchSort = 'relevance';
  protected page = 1;
  protected totalPages = 0;
  protected total = 0;
  protected isSearching = false;
  protected isOpen = false;
  protected error = '';
  readonly x = X;
  protected isTryMePopupOpen = false;

  constructor() {
    this.searchSub = this.query$
      .pipe(
        debounceTime(250),
        switchMap((query) => {
          const trimmed = query.trim();
          this.error = '';

          if (!this.isValidQuery(trimmed)) {
            this.isSearching = false;
            return of({ results: [], page: 1, page_size: 10, total: 0, total_pages: 0 });
          }

          this.isSearching = true;
          return this.searchService.search(trimmed, {
            entityType: this.entityType,
            sort: this.sort,
            page: this.page,
          }).pipe(
            catchError(() => {
              this.error = 'Search failed.';
              return of({ results: [], page: 1, page_size: 10, total: 0, total_pages: 0 });
            })
          );
        })
      )
      .subscribe((response) => {
        this.results = response.results;
        this.page = response.page;
        this.total = response.total;
        this.totalPages = response.total_pages;
        this.isSearching = false;
        this.isOpen = this.isValidQuery(this.query);
      });
  }

  ngOnDestroy(): void {
    this.searchSub.unsubscribe();
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.query = input?.value ?? '';
    this.page = 1;
    this.isOpen = this.isValidQuery(this.query);
    this.query$.next(this.query);
  }

  protected updateEntityType(event: Event): void {
    this.entityType = (event.target as HTMLSelectElement).value as SearchEntityType;
    this.page = 1;
    this.query$.next(this.query);
  }

  protected updateSort(event: Event): void {
    this.sort = (event.target as HTMLSelectElement).value as SearchSort;
    this.page = 1;
    this.query$.next(this.query);
  }

  protected changePage(delta: number): void {
    const nextPage = this.page + delta;
    if (nextPage < 1 || nextPage > this.totalPages) return;
    this.page = nextPage;
    this.query$.next(this.query);
  }

  protected onFocus(): void {
    if (this.isValidQuery(this.query)) {
      this.isOpen = true;
    }
  }

  protected closeSoon(): void {
    window.setTimeout(() => {
      this.isOpen = false;
    }, 150);
  }

  protected selectResult(event: Event, result: SearchResult): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.canOpen(result))
      return;

    this.openResult(result);
  }

  protected openResult(result: SearchResult): void {
    if (result.type === 'song') {
      if (!result.data.album_id) {
        this.error = 'Song result is missing album data. Restart the backend and try again.';
        this.isOpen = true;
        return;
      }

      this.albumService.getAlbum(result.data.album_id).subscribe({
        next: (album) => {
          const playable = album.songs.filter(s => s.status === 'Ready');
          const startIndex = Math.max(0, playable.findIndex(s => s.id === result.data.id));
          const queue = playable.map(s => ({
            id: s.id,
            title: s.title,
            artist: album.artist_name,
            artistId: album.artist_id,
            format: (s.audio_url.includes('.flac') ? 'flac' : 'wav') as 'flac' | 'wav',
            coverUrl: album.cover_url,
            onRequestUrl: () => this.albumService.getSongStreamUrl(s.id),
          }));
          this.audio.setQueue(queue, startIndex);
        },
        error: () => {
          this.error = 'Could not load song.';
          this.isOpen = true;
        }
      });

      this.clearSearch();
      return;
    }

    if (result.type === 'album') {
      this.clearSearch();
      void this.router.navigate(['/bside_app/album', result.data.id]);
      return;
    }

    if (result.type === 'artist') {
      this.clearSearch();
      void this.router.navigate(['/bside_app/artist', result.data.id]);
      return;
    }

    if (result.type === 'playlist') {
      this.playlistService.getById(result.data.id).subscribe({
        next: (playlist) => {
          this.playlistService.selectDetailed(playlist);
          this.clearSearch();
          void this.router.navigate(['/bside_app/library']);
        },
        error: () => {
          this.error = 'Log in to open this playlist.';
          this.isOpen = true;
        },
      });
    }
  }

  private clearSearch(): void {
    this.isOpen = false;
    this.query = '';
    this.results = [];
    this.page = 1;
    this.total = 0;
    this.totalPages = 0;
    this.error = '';
  }

  protected resultTitle(result: SearchResult): string {
    if (result.type === 'song')
      return result.data.title;
    return result.data.name;
  }

  protected resultMeta(result: SearchResult): string {
    if (result.type === 'song')
      return `Song | ${result.data.artist}`;
    if (result.type === 'album')
      return `Album | ${result.data.artist}`;
    if (result.type === 'playlist')
      return `Playlist | ${result.data.creator}`;
    return 'Artist';
  }

  protected canOpen(result: SearchResult): boolean {
    return result.type === 'song' || result.type === 'album' || result.type === 'artist' || result.type === 'playlist';
  }

  private isValidQuery(query: string): boolean {
    const length = this.queryLength(query.trim());
    return length >= 2 && length <= 100;
  }

  private queryLength(query: string): number {
    return [...query].length;
  }
}
