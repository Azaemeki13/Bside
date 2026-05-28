import { Component, inject } from '@angular/core';
import { LucideAngularModule, Heart } from 'lucide-angular';
import { PlaylistService } from '../../services/playlist.service';

@Component({
  selector: 'app-heart-card',
  imports: [LucideAngularModule],
  templateUrl: './heart-card.html',
  styleUrl: './heart-card.scss',
})
export class HeartCard {
  protected readonly heart = Heart;
  private playlistService = inject(PlaylistService);

  select(): void {
    this.playlistService.selectLiked();
  }
}