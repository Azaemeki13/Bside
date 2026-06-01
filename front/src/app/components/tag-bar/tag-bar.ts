import { NgFor } from '@angular/common';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { TagCard } from '../tag-card/tag-card';
import { TAGS } from '../tag-list';

@Component({
  selector: 'app-tag-bar',
  imports: [NgFor, TagCard],
  templateUrl: './tag-bar.html',
  styleUrl: './tag-bar.scss',
})
export class TagBar {
  tags = [...TAGS];

  @Output() tagSelected = new EventEmitter<string>();
  selectedTag = signal('All');

  select(tag: string) {
    this.selectedTag.set(tag);
    this.tagSelected.emit(tag);
  }
}