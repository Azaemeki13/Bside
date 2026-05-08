import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BsideFavorites } from './favorites';

describe('BsideFavorites', () => {
  let component: BsideFavorites;
  let fixture: ComponentFixture<BsideFavorites>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BsideFavorites],
    }).compileComponents();

    fixture = TestBed.createComponent(BsideFavorites);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
