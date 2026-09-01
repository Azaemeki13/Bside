import { Component } from '@angular/core';
import { IconBar } from '../../player/icon-bar/icon-bar';
import { VolumeSlider } from '../../player/volume-slider/volume-slider';
import { ProgressionBar } from '../../player/progression-bar/progression-bar';

/** Keeps playback controls available while the listener moves between pages. */
@Component({
  selector: 'app-sound-bar',
  imports: [ProgressionBar, VolumeSlider, IconBar],
  templateUrl: './sound-bar.html',
  styleUrl: './sound-bar.scss',
})

export class SoundBar {
}
