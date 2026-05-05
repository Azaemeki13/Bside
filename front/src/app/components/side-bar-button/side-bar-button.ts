import { Component, Input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-side-bar-button',
  imports: [LucideAngularModule],
  templateUrl: './side-bar-button.html',
  styleUrl: './side-bar-button.scss',
})
export class SideBarButton {
  @Input() icon?: any;
}
