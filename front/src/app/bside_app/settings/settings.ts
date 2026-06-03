import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ArtistForm } from '../../components/artist-form/artist-form';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ArtistForm],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class BsideSettings {
  protected readonly authService = inject(AuthService);

  protected openSection: string | null = null;
  protected shareListening = true;
  protected allowNotifications = true;
  protected shareOnlineStatus = false;

  protected toggleSection(section: string): void {
    this.openSection = this.openSection === section ? null : section;
  }
}