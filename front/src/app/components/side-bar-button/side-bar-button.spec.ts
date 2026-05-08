import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SideBarButton } from './side-bar-button';

describe('SideBarButton', () => {
  let component: SideBarButton;
  let fixture: ComponentFixture<SideBarButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SideBarButton],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SideBarButton);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
