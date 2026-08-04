import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlbumListItem, AlbumService } from '../../services/album.service';
import { TAGS } from '../tag-list';

type Tag = typeof TAGS[number];

@Component({
  selector: 'app-fresh-picks',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './fresh-picks.html',
  styleUrl: './fresh-picks.scss'
})
export class FreshPicks implements OnDestroy {
  @Input() set selectedTag(tag: Tag) {
    this.fetchPicks(tag);
  }

  private readonly albumService = inject(AlbumService);
  private subscription: Subscription | null = null;

  readonly skeletonSlots = Array.from({ length: 8 });
  albums = signal<AlbumListItem[]>([]);
  isLoading = signal(true);
  error = signal('');

  private fetchPicks(tag: Tag): void {
    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.error.set('');

    this.subscription = this.albumService.getFreshPicks(tag).subscribe({
      next: (albums) => {
        this.albums.set(albums);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set("Couldn't load fresh picks right now.");
        this.isLoading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
