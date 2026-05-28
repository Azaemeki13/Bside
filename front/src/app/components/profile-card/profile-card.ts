import { Component, ElementRef, HostListener, computed, input} from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../services/auth.service';
import { LoginPayload, AuthResponse, RegisterPayload, UserProfile } from '../../models/auth.model';

@Component({
  selector: 'app-profile-card',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './profile-card.html',
  styleUrl: './profile-card.scss',
})
export class ProfileCard   {
  protected isMenuOpen = false;
  protected readonly chevronDown = ChevronDown;

  readonly user = input<UserProfile | null>(null);

  //private authService = inject(AuthService);
  private readonly DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg/250px-Leon_Kennedy_%28Resident_Evil_Requiem%29.jpg'; 
  //protected avatarUrl = computed(() => this.authService.currentUser()?.avatar_url ?? this.DEFAULT_AVATAR);

  protected readonly avatarUrl = computed(() => {
    return this.user()?.avatar_url ?? this.DEFAULT_AVATAR;
  });

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}
  protected toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  protected closeMenu(): void {
    this.isMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (this.elementRef.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.closeMenu();
  }
}
