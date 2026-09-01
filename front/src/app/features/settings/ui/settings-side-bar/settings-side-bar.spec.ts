import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsSideBar } from './settings-side-bar';

describe('SettingsSideBar', () => {
  let component: SettingsSideBar;
  let fixture: ComponentFixture<SettingsSideBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsSideBar],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsSideBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
