import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-mobile-login',
  templateUrl: './mobile-login.page.html',
  styleUrls: ['./mobile-login.page.scss'],
  standalone: false,
})
export class MobileLoginPage implements OnInit, OnDestroy {
  mobileForm: FormGroup;
  isInputFocused = false;

  constructor(
    private router: Router,
    private formBuilder: FormBuilder
  ) {
    this.mobileForm = this.formBuilder.group({
      mobileNumber: ['', [
        Validators.required,
        Validators.pattern('^[0-9]{10}$')
      ]]
    });
  }

  ngOnInit() {
    // Any initialization logic
  }

  ngOnDestroy() {
    // Cleanup any subscriptions or timers if needed
  }

  goBack() {
    this.router.navigate(['/login']);
  }

  onSubmit() {
    if (this.mobileForm.valid) {
      // Navigate to OTP page
      this.router.navigate(['/otp']);
    }
  }
}
