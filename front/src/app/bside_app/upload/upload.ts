import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { UploadAlbumForm } from '../../components/upload-album-form/upload-album-form';
import { UploadSingleForm } from '../../components/upload-single-form/upload-single-form';
import { AdminArtistUpload } from '../../components/admin-upload/admin-upload';
import { AuthService } from '../../services/auth.service';

type UploadForm = 'album' | 'single';

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