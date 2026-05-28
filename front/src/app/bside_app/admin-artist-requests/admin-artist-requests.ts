import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ArtistRequest, ArtistRequestService } from '../../services/artist-request.service';

@Component({
  selector: 'app-admin-artist-requests',
  imports: [CommonModule],
  templateUrl: './admin-artist-requests.html',
  styleUrl: './admin-artist-requests.scss',
})
export class AdminArtistRequests implements OnInit {
  private readonly requests = inject(ArtistRequestService);

  pending: ArtistRequest[] = [];
  isLoading = false;
  message = '';
  error = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.error = '';
    this.requests.getPending().subscribe({
      next: (requests) => {
        this.pending = requests;
        this.isLoading = false;
      },
      error: () => {
        this.error = 'Could not load artist requests. Admin role is required.';
        this.isLoading = false;
      },
    });
  }

  review(request: ArtistRequest, decision: 'Accepted' | 'Denied'): void {
    this.message = '';
    this.error = '';
    this.requests.review(request.id, decision).subscribe({
      next: () => {
        this.pending = this.pending.filter((item) => item.id !== request.id);
        this.message = decision === 'Accepted'
          ? `${request.artist_name} was accepted.`
          : `${request.artist_name} was denied.`;
      },
      error: () => {
        this.error = `Could not ${decision.toLowerCase()} this request.`;
      },
    });
  }
}
