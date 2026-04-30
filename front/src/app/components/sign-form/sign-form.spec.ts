import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SignForm } from './sign-form';

describe('SignForm', () => {
  let component: SignForm;
  let fixture: ComponentFixture<SignForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignForm],
    }).compileComponents();

    fixture = TestBed.createComponent(SignForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
