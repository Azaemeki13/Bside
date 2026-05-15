import { Component, signal } from '@angular/core';
import { RecentPlay } from '../../components/recent-play/recent-play';
import { TopSpins } from '../../components/top-spins/top-spins';
import { NewRelease } from '../../components/new-release/new-release';
import { TagBar } from '../../components/tag-bar/tag-bar';
import { FreshPicks } from '../../components/fresh-picks/fresh-picks';

const TAGS = [
  'All', 'Hip-Hop', 'Jazz', 'Indie', 'Electronic', 'Pop', 'Classical',
  'Metal', 'R&B', 'Country', 'Reggae', 'Blues', 'Folk', 'Punk', 'Soul',
  'Funk', 'Disco', 'Gospel', 'Latin', 'World'
] as const;

type Tag = typeof TAGS[number];

@Component({
  selector: 'app-bside-home',
  templateUrl: './home.html',
  styleUrl: './home.scss',
  imports: [RecentPlay, TopSpins, NewRelease, TagBar, FreshPicks],
})
export class BsideHome {
  selectedTag = signal<Tag>('All');

  onTagSelected(tag: string): void {
    this.selectedTag.set(tag as Tag);
  }
}
