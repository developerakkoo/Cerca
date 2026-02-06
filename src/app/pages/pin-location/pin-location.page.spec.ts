import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PinLocationPage } from './pin-location.page';

describe('PinLocationPage', () => {
  let component: PinLocationPage;
  let fixture: ComponentFixture<PinLocationPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PinLocationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

