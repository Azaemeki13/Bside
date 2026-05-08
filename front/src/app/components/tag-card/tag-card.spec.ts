import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TagCard } from './tag-card';

describe('TagCard', () => {
  let component: TagCard;
  let fixture: ComponentFixture<TagCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagCard],
    }).compileComponents();

    fixture = TestBed.createComponent(TagCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
