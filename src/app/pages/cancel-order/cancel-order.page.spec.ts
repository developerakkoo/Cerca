import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CancelOrderPage } from './cancel-order.page';

describe('CancelOrderPage', () => {
  let component: CancelOrderPage;
  let fixture: ComponentFixture<CancelOrderPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CancelOrderPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
