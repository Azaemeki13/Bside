import { Component, HostListener, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, NgIf } from '@angular/common';
import { SideBarButton } from '../side-bar-button/side-bar-button';
import { LucideAngularModule, House, Disc3, Heart, UsersRound, LogOut} from 'lucide-angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-side-bar',
  imports: [SideBarButton, LucideAngularModule, NgIf],
  templateUrl: './side-bar.html',
  styleUrl: './side-bar.scss',
})

export class SideBar {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly house = House;
  protected readonly disc3 = Disc3;
  protected readonly heart = Heart;
  protected readonly usersRound = UsersRound;
  protected readonly logout = LogOut;

  protected isLogoutConfirmOpen = false;

  protected openLogoutConfirm(): void {
    this.isLogoutConfirmOpen = true;
  }

  protected closeLogoutConfirm(): void {
    this.isLogoutConfirmOpen = false;
  }

  protected confirmLogout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('auth_token');
    }
    this.isLogoutConfirmOpen = false;
    void this.router.navigate(['/'], { replaceUrl: true });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.isLogoutConfirmOpen) return;
    this.closeLogoutConfirm();
  }

}
