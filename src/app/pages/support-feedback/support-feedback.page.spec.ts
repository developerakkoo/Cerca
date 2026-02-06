import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupportFeedbackPage } from './support-feedback.page';

describe('SupportFeedbackPage', () => {
  let component: SupportFeedbackPage;
  let fixture: ComponentFixture<SupportFeedbackPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SupportFeedbackPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
