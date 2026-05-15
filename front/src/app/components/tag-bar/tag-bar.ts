import { NgFor } from '@angular/common';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { TagCard } from '../tag-card/tag-card';

@Component({
  selector: 'app-tag-bar',
  imports: [NgFor, TagCard],
  templateUrl: './tag-bar.html',
  styleUrl: './tag-bar.scss',
})
export class TagBar {
  tags: string[] = [
    'All', 'Hip-Hop', 'Jazz', 'Indie', 'Electronic', 'Pop', 'Classical',
    'Metal', 'R&B', 'Country', 'Reggae', 'Blues', 'Folk', 'Punk', 'Soul',
    'Funk', 'Disco', 'Gospel', 'Latin', 'World'
  ];

  @Output() tagSelected = new EventEmitter<string>();
  selectedTag = signal('All');

  select(tag: string) {
    this.selectedTag.set(tag);
    this.tagSelected.emit(tag);
  }
}