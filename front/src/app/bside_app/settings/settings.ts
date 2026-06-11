import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
export class BsideSettings implements OnInit {
  protected showProfile = false;
  protected showArtistForm = false;
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    const panel = this.route.snapshot.queryParamMap.get('panel');
    if (panel === 'profile') this.showProfile = true;
  }
}