import { Component, Output, EventEmitter } from '@angular/core';
import { ChevronRight, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-settings-side-bar',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './settings-side-bar.html',
  styleUrl: './settings-side-bar.scss',
})
export class SettingsSideBar {
  protected readonly chevronRight = ChevronRight;
  @Output() openArtistForm = new EventEmitter<void>();
  @Output() openProfile = new EventEmitter<void>();
  isListeningOn = false;
  isNotificationsOn = false;
  isStatusOn = false;
}