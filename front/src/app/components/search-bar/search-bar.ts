import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, Search } from 'lucide-angular';
import { Subject, Subscription, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { SearchResult, SearchService } from '../../services/search.service';

@Component({
  selector: 'app-search-bar',
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
})
export class SearchBar implements OnDestroy {
  private readonly searchService = inject(SearchService);
  private readonly router = inject(Router);
  private readonly query$ = new Subject<string>();
  private readonly searchSub: Subscription;

  protected readonly search = Search;
  protected query = '';
  protected results: SearchResult[] = [];
  protected isSearching = false;
  protected isOpen = false;
  protected error = '';

  constructor() {
    this.searchSub = this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          this.error = '';

          if (trimmed.length < 2) {
            this.isSearching = false;
            return of([]);
          }

          this.isSearching = true;
          return this.searchService.search(trimmed).pipe(
            catchError(() => {
              this.error = 'Search failed.';
              return of([]);
            })
          );
        })
      )
      .subscribe((results) => {
        this.results = results;
        this.isSearching = false;
        this.isOpen = this.query.trim().length >= 2;
      });
  }

  ngOnDestroy(): void {
    this.searchSub.unsubscribe();
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.query = input?.value ?? '';
    this.isOpen = this.query.trim().length >= 2;
    this.query$.next(this.query);
  }

  protected onFocus(): void {
    if (this.query.trim().length >= 2) {
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

      this.clearSearch();
      void this.router.navigate(['/bside_app/album', result.data.album_id]);
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
    }
  }

  private clearSearch(): void {
    this.isOpen = false;
    this.query = '';
    this.results = [];
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
    return result.type === 'song' || result.type === 'album' || result.type === 'artist';
  }
}
