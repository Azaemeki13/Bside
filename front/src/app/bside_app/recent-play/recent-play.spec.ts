import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecentPlay } from './recent-play';

describe('RecentPlay', () => {
  let component: RecentPlay;
  let fixture: ComponentFixture<RecentPlay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentPlay],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentPlay);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
