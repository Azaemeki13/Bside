import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlbumCard } from '../../components/album-card/album-card';

@Component({
  selector: 'app-carousel',
  imports: [CommonModule, AlbumCard],
  templateUrl: './carousel.html',
  styleUrl: './carousel.scss',
})
export class Carousel {}