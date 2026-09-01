import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HeartCard } from './heart-card';

describe('HeartCard', () => {
  let component: HeartCard;
  let fixture: ComponentFixture<HeartCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeartCard],
    }).compileComponents();

    fixture = TestBed.createComponent(HeartCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
