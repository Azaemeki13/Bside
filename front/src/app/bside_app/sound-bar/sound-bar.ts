import { Component, inject } from '@angular/core';
import { IconBar } from '../../components/icon-bar/icon-bar';
import { VolumeSlider } from '../../components/volume-slider/volume-slider';
import { ProgressionBar } from '../../components/progression-bar/progression-bar';
import { VolumeService } from '../../services/volume.service';

@Component({
  selector: 'app-sound-bar',
  imports: [ProgressionBar, VolumeSlider, IconBar],
  templateUrl: './sound-bar.html',
  styleUrl: './sound-bar.scss',
})
export class SoundBar {
  protected readonly volumeService = inject(VolumeService);
}
