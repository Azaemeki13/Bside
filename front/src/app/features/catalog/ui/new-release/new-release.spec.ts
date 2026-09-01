import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewRelease } from './new-release';

describe('NewRelease', () => {
  let component: NewRelease;
  let fixture: ComponentFixture<NewRelease>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewRelease],
    }).compileComponents();

    fixture = TestBed.createComponent(NewRelease);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
