import { Component, HostListener, inject } from '@angular/core';
import { SideBarButton } from '../side-bar-button/side-bar-button';
import { LucideAngularModule, House, Disc3, Heart, UsersRound, LogOut, Settings, Upload, Library, ShieldCheck, Ban} from 'lucide-angular';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

/** Organizes the application links and the guarded sign-out flow. */
@Component({
  selector: 'app-side-bar',
  imports: [SideBarButton, LucideAngularModule],
  templateUrl: './side-bar.html',
  styleUrl: './side-bar.scss',
})

export class SideBar {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

  protected readonly house = House;
  protected readonly disc3 = Disc3;
  protected readonly heart = Heart;
  protected readonly usersRound = UsersRound;
  protected readonly logout = LogOut;
  protected readonly settings = Settings;
  protected readonly upload = Upload;
  protected readonly library = Library;
  protected readonly shieldCheck = ShieldCheck;
  protected readonly ban = Ban;

  protected isLogoutConfirmOpen = false;

  protected openLogoutConfirm(): void {
    this.isLogoutConfirmOpen = true;
  }

  protected closeLogoutConfirm(): void {
    this.isLogoutConfirmOpen = false;
  }

  protected confirmLogout(): void {
    this.authService.logout();
    this.isLogoutConfirmOpen = false;
    void this.router.navigate(['/'], { replaceUrl: true });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.isLogoutConfirmOpen) return;
    this.closeLogoutConfirm();
  }
}
