import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FreshPicks } from './fresh-picks';

describe('FreshPicks', () => {
  let component: FreshPicks;
  let fixture: ComponentFixture<FreshPicks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FreshPicks],
    }).compileComponents();

    fixture = TestBed.createComponent(FreshPicks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
