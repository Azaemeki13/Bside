import { Component, Output, EventEmitter, inject } from '@angular/core';
import { ChevronRight, LucideAngularModule } from 'lucide-angular';
import { PreferencesService } from '../../services/preferences.service';

@Component({
  selector: 'app-settings-side-bar',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './settings-side-bar.html',
  styleUrl: './settings-side-bar.scss',
})
export class SettingsSideBar {
  protected readonly chevronRight = ChevronRight;
  protected readonly preferences = inject(PreferencesService);

  @Output() openArtistForm = new EventEmitter<void>();
  @Output() openProfile = new EventEmitter<void>();
  @Output() openActivityStats = new EventEmitter<void>();

  protected isTogglingNotifications = false;

  protected async onToggleNotifications(): Promise<void> {
    if (this.isTogglingNotifications) return;
    this.isTogglingNotifications = true;
    try {
      await this.preferences.setAllowNotifications(!this.preferences.allowNotifications());
    } finally {
      this.isTogglingNotifications = false;
    }
  }

  protected onToggleShareStatus(): void {
    this.preferences.setShareOnlineStatus(!this.preferences.shareOnlineStatus());
  }
}