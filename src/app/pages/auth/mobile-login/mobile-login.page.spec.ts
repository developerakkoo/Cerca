import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileLoginPage } from './mobile-login.page';

describe('MobileLoginPage', () => {
  let component: MobileLoginPage;
  let fixture: ComponentFixture<MobileLoginPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MobileLoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
