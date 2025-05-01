import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DriverChatPage } from './driver-chat.page';

describe('DriverChatPage', () => {
  let component: DriverChatPage;
  let fixture: ComponentFixture<DriverChatPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DriverChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
