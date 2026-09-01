import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BsideHome } from './home';

describe('BsideHome', () => {
  let component: BsideHome;
  let fixture: ComponentFixture<BsideHome>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BsideHome],
    }).compileComponents();

    fixture = TestBed.createComponent(BsideHome);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
