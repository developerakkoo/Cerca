import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupportListPage } from './support-list.page';

describe('SupportListPage', () => {
  let component: SupportListPage;
  let fixture: ComponentFixture<SupportListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SupportListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
