import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProgressionBar } from './progression-bar';

describe('ProgressionBar', () => {
  let component: ProgressionBar;
  let fixture: ComponentFixture<ProgressionBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressionBar],
    }).compileComponents();

    fixture = TestBed.createComponent(ProgressionBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
