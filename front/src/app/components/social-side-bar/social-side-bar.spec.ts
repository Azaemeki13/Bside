import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialSideBar } from './social-side-bar';

describe('SocialSideBar', () => {
  let component: SocialSideBar;
  let fixture: ComponentFixture<SocialSideBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialSideBar],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialSideBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
