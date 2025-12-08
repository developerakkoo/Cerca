import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewTransactionsPage } from './view-transactions.page';

describe('ViewTransactionsPage', () => {
  let component: ViewTransactionsPage;
  let fixture: ComponentFixture<ViewTransactionsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ViewTransactionsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
