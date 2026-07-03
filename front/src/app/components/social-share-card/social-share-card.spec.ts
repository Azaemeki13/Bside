import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialShareCard } from './social-share-card';

describe('SocialShareCard', () => {
  let component: SocialShareCard;
  let fixture: ComponentFixture<SocialShareCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialShareCard],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialShareCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
