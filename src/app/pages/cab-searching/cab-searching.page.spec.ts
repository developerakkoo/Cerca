import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CabSearchingPage } from './cab-searching.page';

describe('CabSearchingPage', () => {
  let component: CabSearchingPage;
  let fixture: ComponentFixture<CabSearchingPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CabSearchingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
