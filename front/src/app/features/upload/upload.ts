import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { UploadAlbumForm } from './ui/upload-album-form/upload-album-form';
import { UploadSingleForm } from './ui/upload-single-form/upload-single-form';
import { AdminArtistUpload } from './ui/admin-upload/admin-upload';
import { AuthService } from '../../services/auth.service';

type UploadForm = 'album' | 'single';

/** Lets an artist choose the release form that matches what they are uploading. */
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, UploadAlbumForm, UploadSingleForm, AdminArtistUpload],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class BsideUpload {
  protected readonly authService = inject(AuthService);
  activeForm: UploadForm = 'album';

  get isAdmin(): boolean {
    return this.authService.currentUser()?.role === 'Admin';
  }

  showAlbumForm(): void { this.activeForm = 'album'; }
  showSingleForm(): void { this.activeForm = 'single'; }
}
