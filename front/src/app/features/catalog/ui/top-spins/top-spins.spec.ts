import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopSpins } from './top-spins';

describe('TopSpins', () => {
  let component: TopSpins;
  let fixture: ComponentFixture<TopSpins>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopSpins],
    }).compileComponents();

    fixture = TestBed.createComponent(TopSpins);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
