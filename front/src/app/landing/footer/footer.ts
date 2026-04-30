import { Component } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-footer',
  imports: [LucideAngularModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  protected readonly chevronDown = ChevronDown;
}
