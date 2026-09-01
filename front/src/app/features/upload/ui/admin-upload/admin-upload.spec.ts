import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminArtistUpload } from './admin-upload';

describe('AdminArtistUpload', () => {
  let component: AdminArtistUpload;
  let fixture: ComponentFixture<AdminArtistUpload>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminArtistUpload],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminArtistUpload);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
