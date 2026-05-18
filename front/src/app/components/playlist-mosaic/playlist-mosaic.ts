import { Component } from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { HeartCard } from '../heart-card/heart-card';

@Component({
  selector: 'app-playlist-mosaic',
  imports: [LucideAngularModule, HeartCard],
  templateUrl: './playlist-mosaic.html',
  styleUrl: './playlist-mosaic.scss',
})
export class PlaylistMosaic {
  protected readonly plus = Plus;
}
