import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BsideLibrary } from './library';

describe('BsideLibrary', () => {
  let component: BsideLibrary;
  let fixture: ComponentFixture<BsideLibrary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BsideLibrary],
    }).compileComponents();

    fixture = TestBed.createComponent(BsideLibrary);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
