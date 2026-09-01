import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VolumeSlider } from './volume-slider';

describe('VolumeSlider', () => {
  let component: VolumeSlider;
  let fixture: ComponentFixture<VolumeSlider>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VolumeSlider],
    }).compileComponents();

    fixture = TestBed.createComponent(VolumeSlider);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
