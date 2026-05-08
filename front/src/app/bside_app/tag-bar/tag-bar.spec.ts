import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TagBar } from './tag-bar';

describe('TagBar', () => {
  let component: TagBar;
  let fixture: ComponentFixture<TagBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagBar],
    }).compileComponents();

    fixture = TestBed.createComponent(TagBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
