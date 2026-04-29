import { Component } from '@angular/core';
import { FeaturesStack } from '../../components/features-stack/features-stack';
import { CircleDollarSign, LucideAngularModule, MessageCircle, BadgeCheck, Puzzle } from 'lucide-angular';

@Component({
  selector: 'app-features',
  imports: [FeaturesStack, LucideAngularModule],
  templateUrl: './features.html',
  styleUrl: './features.scss',
})
export class Features {
  protected readonly circleDollarSign = CircleDollarSign;
  protected readonly messageCircle = MessageCircle;
  protected readonly badgeCheck = BadgeCheck;
  protected readonly puzzle = Puzzle;
}
