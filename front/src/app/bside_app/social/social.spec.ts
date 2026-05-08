import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BsideSocial } from './social';

describe('BsideSocial', () => {
  let component: BsideSocial;
  let fixture: ComponentFixture<BsideSocial>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BsideSocial],
    }).compileComponents();

    fixture = TestBed.createComponent(BsideSocial);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
