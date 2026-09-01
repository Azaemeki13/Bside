import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, LucideAngularModule } from 'lucide-angular';
import { ArtistForm } from '../../components/artist-form/artist-form';
import { SettingsSideBar } from '../../components/settings-side-bar/settings-side-bar';
import { Profile } from '../../components/profile/profile';
import { ActivityStats } from '../../components/activity-stats/activity-stats';
import { ResponsiveLayoutService } from '../../services/responsive-layout.service';

type SettingsSection = 'profile' | 'activity' | 'artist';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ArtistForm, SettingsSideBar, Profile, ActivityStats, LucideAngularModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class BsideSettings implements OnInit {
  protected readonly arrowLeft = ArrowLeft;
  protected readonly responsiveLayout = inject(ResponsiveLayoutService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected activeSection: SettingsSection | null = null;
  private lastSidebarActionAt = 0;

  protected get isDetailRoute(): boolean {
    return this.activeSection !== null;
  }

  ngOnInit(): void {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const settingsView = data['settingsView'];
        this.activeSection = this.isSettingsSection(settingsView) ? settingsView : null;
      });

    if (!this.route.snapshot.data['settingsView'] && this.route.snapshot.queryParamMap.get('panel') === 'profile') {
      void this.router.navigate(['/bside_app/settings/profile'], { replaceUrl: true });
    }
  }

  protected openProfile(): void {
    this.openSection('profile');
  }

  protected openActivityStats(): void {
    this.openSection('activity');
  }

  protected openArtistForm(): void {
    this.openSection('artist');
  }

  protected backToSettings(): void {
    void this.router.navigate(['/bside_app/settings']);
  }

  protected closeProfile(): void {
    if (!this.responsiveLayout.isCompact() && Date.now() - this.lastSidebarActionAt < 100) return;

    this.backToSettings();
  }

  private openSection(section: SettingsSection): void {
    if (this.activeSection === section) {
      this.backToSettings();
      return;
    }

    this.lastSidebarActionAt = Date.now();
    void this.router.navigate(['/bside_app/settings', section]);
  }

  private isSettingsSection(value: unknown): value is SettingsSection {
    return value === 'profile' || value === 'activity' || value === 'artist';
  }
}
