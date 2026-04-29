import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeaturesStack } from './features-stack';

describe('FeaturesStack', () => {
  let component: FeaturesStack;
  let fixture: ComponentFixture<FeaturesStack>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturesStack],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturesStack);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
