import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminUpload } from './admin-upload';

describe('AdminUpload', () => {
  let component: AdminUpload;
  let fixture: ComponentFixture<AdminUpload>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminUpload],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUpload);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
