import { Component, inject, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth.service';
import { ArtistRequestService } from '../../../../services/artist-request.service';

/** Helps a listener submit an artist access request from settings. */
@Component({
  selector: 'app-artist-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './artist-form.html',
  styleUrl: './artist-form.scss',
})
export class ArtistForm {
  protected readonly authService = inject(AuthService);
  private readonly artistRequests = inject(ArtistRequestService);
  @Output() close = new EventEmitter<void>();

  protected artistName = '';
  protected bio = '';
  protected isSubmitting = false;
  protected message = '';
  protected error = '';

  protected submitArtistRequest(): void {
    this.message = '';
    this.error = '';
    const artistName = this.artistName.trim();
    if ([...artistName].length < 1 || [...artistName].length > 100) {
      this.error = 'Artist name must be between 1 and 100 characters.';
      return;
    }
    if ([...this.bio.trim()].length > 2000) {
      this.error = 'Bio cannot exceed 2000 characters.';
      return;
    }
    this.isSubmitting = true;
    this.artistRequests.create({
      artist_name: artistName,
      bio: this.bio.trim() || undefined,
    }).subscribe({
      next: () => {
        this.message = 'Artist request sent. An admin will review it soon.';
        this.artistName = '';
        this.bio = '';
        this.isSubmitting = false;
      },
      error: (err) => {
        this.error = typeof err.error === 'string' && err.error
          ? err.error
          : 'Could not send artist request.';
        this.isSubmitting = false;
      },
    });
  }
}
