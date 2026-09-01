import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IconBar } from './icon-bar';

describe('IconBar', () => {
  let component: IconBar;
  let fixture: ComponentFixture<IconBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconBar],
    }).compileComponents();

    fixture = TestBed.createComponent(IconBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
