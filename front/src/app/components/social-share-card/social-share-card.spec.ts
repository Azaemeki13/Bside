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
    fixture.componentRef.setInput('song', {
      id: 'song-1',
      title: 'Test song',
      duration_seconds: 120,
      audio_url: 'test.flac',
      status: 'Ready',
      artist_name: 'Test artist',
      cover_url: 'cover.jpg',
    });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
