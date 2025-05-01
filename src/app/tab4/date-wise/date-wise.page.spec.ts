import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateWisePage } from './date-wise.page';

describe('DateWisePage', () => {
  let component: DateWisePage;
  let fixture: ComponentFixture<DateWisePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DateWisePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
