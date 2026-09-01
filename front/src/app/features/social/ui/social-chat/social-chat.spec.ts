import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialChat } from './social-chat';

describe('SocialChat', () => {
  let component: SocialChat;
  let fixture: ComponentFixture<SocialChat>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialChat],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialChat);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
