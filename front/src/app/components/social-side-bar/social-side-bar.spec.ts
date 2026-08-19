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

  it('matches users by display name with a two-character query', () => {
    component.users = [
      { id: '1', username: 'account_handle', display_name: 'Luna Waves' },
      { id: '2', username: 'other_account', display_name: 'Someone Else' },
    ];
    component.searchQuery = 'Lu';

    expect(component.filteredUsers.map((user) => user.id)).toEqual(['1']);
  });

  it('still matches account names and rejects one-character queries', () => {
    component.users = [{ id: '1', username: 'account_handle', display_name: 'Luna Waves' }];
    component.searchQuery = 'acc';
    expect(component.filteredUsers).toHaveLength(1);

    component.searchQuery = 'a';
    expect(component.filteredUsers).toEqual([]);
  });
});
