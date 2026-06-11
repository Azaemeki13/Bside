import { Component, ElementRef, HostListener, computed, input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { UserProfile } from '../../models/auth.model';

@Component({
  selector: 'app-profile-card',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './profile-card.html',
  styleUrl: './profile-card.scss',
})
export class ProfileCard {
  protected isMenuOpen = false;
  protected readonly chevronDown = ChevronDown;
  private readonly router = inject(Router);

  readonly user = input<UserProfile | null>(null);

  private readonly DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg/250px-Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg';
  protected readonly avatarUrl = computed(() => this.user()?.avatar_url ?? this.DEFAULT_AVATAR);

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  protected toggleMenu(): void { this.isMenuOpen = !this.isMenuOpen; }
  protected closeMenu(): void { this.isMenuOpen = false; }

  protected goToSettings(panel?: string): void {
    this.closeMenu();
    this.router.navigate(['/bside_app/settings'], panel ? { queryParams: { panel } } : {});
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (this.elementRef.nativeElement.contains(event.target as Node)) return;
    this.closeMenu();
  }
}