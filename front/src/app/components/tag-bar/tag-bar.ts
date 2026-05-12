import { NgFor } from '@angular/common';
import { Component } from '@angular/core';
import { TagCard } from '../tag-card/tag-card';

@Component({
  selector: 'app-tag-bar',
  imports: [NgFor, TagCard],
  templateUrl: './tag-bar.html',
  styleUrl: './tag-bar.scss',
})
export class TagBar {
  tags: string[] = ['Rock', 'Hip-Hop', 'Jazz', 'Indie', 'Electronic', 'Pop', 'Classical', 'Metal', 'R&B', 'Country', 'Reggae', 'Blues', 'Folk', 'Punk', 'Soul', 'Funk', 'Disco', 'Gospel', 'Latin', 'World'];
}
