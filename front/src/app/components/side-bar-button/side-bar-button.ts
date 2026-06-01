import { Component, Input, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { IsActiveMatchOptions, Router } from '@angular/router';

@Component({
  selector: 'app-side-bar-button',
  imports: [LucideAngularModule],
  templateUrl: './side-bar-button.html',
  styleUrl: './side-bar-button.scss',
})
export class SideBarButton {
  private readonly router = inject(Router);
  private readonly activeOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };

  @Input() icon?: any;
  @Input() link?: string;

  isActive(): boolean {
    return this.link ? this.router.isActive(this.link, this.activeOptions) : false;
  }

  navigate(): void {
    if (!this.link)
      return;

    void this.router.navigateByUrl(this.link);
  }
}
