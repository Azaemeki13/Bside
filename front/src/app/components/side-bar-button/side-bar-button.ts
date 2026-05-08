import { Component, Input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-side-bar-button',
  imports: [LucideAngularModule, RouterLink, RouterLinkActive],
  templateUrl: './side-bar-button.html',
  styleUrl: './side-bar-button.scss',
})
export class SideBarButton {
  @Input() icon?: any;
  @Input() link?: string;
}
