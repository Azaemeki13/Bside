import { Component } from '@angular/core';
import { CtaStack } from '../../components/cta-stack/cta-stack';
import { CircleDollarSign, LucideAngularModule, MessageCircle, BadgeCheck, Puzzle } from 'lucide-angular';

@Component({
  selector: 'app-cta',
    imports: [CtaStack, LucideAngularModule],
  templateUrl: './cta.html',
  styleUrl: './cta.scss',
})
export class Cta {
  protected readonly circleDollarSign = CircleDollarSign;
  protected readonly messageCircle = MessageCircle;
  protected readonly badgeCheck = BadgeCheck;
  protected readonly puzzle = Puzzle;
}
