import { Component, Input, signal, computed } from '@angular/core';

const TAGS = [
  'All', 'Hip-Hop', 'Jazz', 'Indie', 'Electronic', 'Pop', 'Classical',
  'Metal', 'R&B', 'Country', 'Reggae', 'Blues', 'Folk', 'Punk', 'Soul',
  'Funk', 'Disco', 'Gospel', 'Latin', 'World'
] as const;

type Tag = typeof TAGS[number];

@Component({
  selector: 'app-fresh-picks',
  standalone: true,
  imports: [],
  templateUrl: './fresh-picks.html',
  styleUrl: './fresh-picks.scss'
})
export class FreshPicks {
  @Input() set selectedTag(tag: Tag) {
    this._selectedTag.set(tag);
  }

  private _selectedTag = signal<Tag>('All');

  // TODO: replace with ML service call
  albumsByTag: Record<Tag, null[]> = Object.fromEntries(
    TAGS.map(tag => [tag, Array(15).fill(null)])
  ) as Record<Tag, null[]>;

  filteredAlbums = computed(() => this.albumsByTag[this._selectedTag()]);
}