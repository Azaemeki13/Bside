import { Component } from '@angular/core';
import { CtaStack } from '../../components/cta-stack/cta-stack';
import { CircleDollarSign, LucideAngularModule, MessageCircle, BadgeCheck, Puzzle } from 'lucide-angular';

@Component({
  selector: 'app-features',
  imports: [CtaStack, LucideAngularModule],
  templateUrl: './features.html',
  styleUrl: './features.scss',
})
export class Features {
  protected readonly circleDollarSign = CircleDollarSign;
  protected readonly messageCircle = MessageCircle;
  protected readonly badgeCheck = BadgeCheck;
  protected readonly puzzle = Puzzle;
}
