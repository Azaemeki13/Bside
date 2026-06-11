import { Component, inject } from '@angular/core';
import { VolumeService } from '../../services/volume.service';
import { LucideAngularModule, Volume2, VolumeX } from 'lucide-angular';


@Component({
  selector: 'app-volume-slider',
  imports: [LucideAngularModule],
  templateUrl: './volume-slider.html',
  styleUrl: './volume-slider.scss',
})
export class VolumeSlider {
  protected readonly volumeService = inject(VolumeService);

  protected readonly volume2 = Volume2;
  protected readonly volumeX = VolumeX;
  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.volumeService.setVolume(input ? Number(input.value) : 0);
  }
}
