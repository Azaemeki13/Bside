import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { UploadAlbumForm } from '../../components/upload-album-form/upload-album-form';
import { UploadSingleForm } from '../../components/upload-single-form/upload-single-form';

type UploadForm = 'album' | 'single';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, UploadAlbumForm, UploadSingleForm],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class BsideUpload {
  activeForm: UploadForm = 'album';

  showAlbumForm(): void {
    this.activeForm = 'album';
  }

  showSingleForm(): void {
    this.activeForm = 'single';
  }
}