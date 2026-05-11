import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecentPlayCard } from './recent-play-card';

describe('RecentPlayCard', () => {
  let component: RecentPlayCard;
  let fixture: ComponentFixture<RecentPlayCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentPlayCard],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentPlayCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
