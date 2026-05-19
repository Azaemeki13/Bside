import { Component, inject } from '@angular/core';
import { LucideAngularModule, Heart } from 'lucide-angular';
import { PlaylistService } from '../../services/playlist.service';

@Component({
  selector: 'app-song-list',
  imports: [LucideAngularModule],
  templateUrl: './song-list.html',
  styleUrl: './song-list.scss',
})
export class SongList {
  protected readonly heart = Heart;
  protected playlistService = inject(PlaylistService);
}