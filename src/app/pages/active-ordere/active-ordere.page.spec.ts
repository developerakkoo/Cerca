import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActiveOrderePage } from './active-ordere.page';

describe('ActiveOrderePage', () => {
  let component: ActiveOrderePage;
  let fixture: ComponentFixture<ActiveOrderePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ActiveOrderePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
