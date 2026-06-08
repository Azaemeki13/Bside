import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ArtistForm } from '../../components/artist-form/artist-form';
import { SettingsSideBar } from '../../components/settings-side-bar/settings-side-bar';
import { Profile } from '../../components/profile/profile';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ArtistForm, SettingsSideBar, Profile],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class BsideSettings {
  protected readonly authService = inject(AuthService);
  protected showArtistForm = false;
  protected showProfile = false;
}