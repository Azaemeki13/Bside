import { Component } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { NavButton } from '../../components/nav-button/nav-button';

@Component({
  selector: 'app-footer',
  imports: [LucideAngularModule, NavButton],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  protected readonly chevronDown = ChevronDown;
}
