import { Component } from '@angular/core';
import { SideBarButton } from '../../components/side-bar-button/side-bar-button';
import { LucideAngularModule, House, Disc3, Heart, UsersRound} from 'lucide-angular';

@Component({
  selector: 'app-side-bar',
  imports: [SideBarButton, LucideAngularModule],
  templateUrl: './side-bar.html',
  styleUrl: './side-bar.scss',
})

export class SideBar {
  protected readonly house = House;
  protected readonly disc3 = Disc3;
  protected readonly heart = Heart;
  protected readonly usersRound = UsersRound;
}
