import { Component } from '@angular/core';
import { PlaylistMosaic } from '../../components/playlist-mosaic/playlist-mosaic';
import { SongList } from '../../components/song-list/song-list';


@Component({
  selector: 'app-bside-library',
  templateUrl: './library.html',
  styleUrl: './library.scss',
  imports: [PlaylistMosaic, SongList],
})
export class BsideLibrary {}
