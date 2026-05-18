import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BsideSettings } from './settings';

describe('BsideSettings', () => {
  let component: BsideSettings;
  let fixture: ComponentFixture<BsideSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BsideSettings],
    }).compileComponents();

    fixture = TestBed.createComponent(BsideSettings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
