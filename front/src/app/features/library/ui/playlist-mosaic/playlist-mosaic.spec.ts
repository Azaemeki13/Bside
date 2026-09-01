import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaylistMosaic } from './playlist-mosaic';

describe('PlaylistMosaic', () => {
  let component: PlaylistMosaic;
  let fixture: ComponentFixture<PlaylistMosaic>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistMosaic],
    }).compileComponents();

    fixture = TestBed.createComponent(PlaylistMosaic);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
