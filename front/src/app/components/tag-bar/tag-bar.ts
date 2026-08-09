import { NgFor } from '@angular/common';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { TagCard } from '../tag-card/tag-card';
import { ML_MOODS, type MlMood } from '../tag-list';

@Component({
  selector: 'app-tag-bar',
  imports: [NgFor, TagCard],
  templateUrl: './tag-bar.html',
  styleUrl: './tag-bar.scss',
})
export class TagBar {
  tags = [...ML_MOODS];

  @Output() tagSelected = new EventEmitter<MlMood>();
  selectedTag = signal<MlMood>('All');

  select(tag: MlMood) {
    this.selectedTag.set(tag);
    this.tagSelected.emit(tag);
  }
}
