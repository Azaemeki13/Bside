import { Component } from '@angular/core';
import { LucideAngularModule, ChevronRight } from 'lucide-angular';

@Component({
  selector: 'app-top-spins',
  imports: [LucideAngularModule],
  templateUrl: './top-spins.html',
  styleUrl: './top-spins.scss',
})
export class TopSpins {
  protected readonly chevronRight = ChevronRight;

  artists = [
    { name: 'The Strokes', minutes: '1,000', img: 'assets/cover1.png' },
    { name: 'The Strokes', minutes: '1,000', img: 'assets/cover1.png' },
    { name: 'Her\'s', minutes: '1,000', img: 'assets/cover2.png' },
    { name: 'Her\'s', minutes: '1,000', img: 'assets/cover2.png' },
    { name: 'Radiohead', minutes: '1,000', img: 'assets/cover3.png' },
    { name: 'Radiohead', minutes: '1,000', img: 'assets/cover3.png' },
  ];
}