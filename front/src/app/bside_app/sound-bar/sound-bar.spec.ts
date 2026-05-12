import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SoundBar } from './sound-bar';

describe('SoundBar', () => {
  let component: SoundBar;
  let fixture: ComponentFixture<SoundBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SoundBar],
    }).compileComponents();

    fixture = TestBed.createComponent(SoundBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
