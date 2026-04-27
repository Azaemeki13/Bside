import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CtaStack } from './cta-stack';

describe('CtaStack', () => {
  let component: CtaStack;
  let fixture: ComponentFixture<CtaStack>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CtaStack],
    }).compileComponents();

    fixture = TestBed.createComponent(CtaStack);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
