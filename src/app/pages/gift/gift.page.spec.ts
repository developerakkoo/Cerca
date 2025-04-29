import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GiftPage } from './gift.page';

describe('GiftPage', () => {
  let component: GiftPage;
  let fixture: ComponentFixture<GiftPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(GiftPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
