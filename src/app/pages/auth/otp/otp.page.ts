import { Component, OnInit, OnDestroy, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';

@Component({
  selector: 'app-otp',
  templateUrl: './otp.page.html',
  styleUrls: ['./otp.page.scss'],
  standalone: false,
})
export class OtpPage implements OnInit, OnDestroy {
  @ViewChildren('otpInput1, otpInput2, otpInput3, otpInput4') otpInputs!: QueryList<ElementRef>;
  
  otpForm: FormGroup;
  digit1Control = new FormControl('', [Validators.required, Validators.pattern('[0-9]')]);
  digit2Control = new FormControl('', [Validators.required, Validators.pattern('[0-9]')]);
  digit3Control = new FormControl('', [Validators.required, Validators.pattern('[0-9]')]);
  digit4Control = new FormControl('', [Validators.required, Validators.pattern('[0-9]')]);

  isVerifying = false;
  timeLeft = 30;
  canResend = false;
  timerInterval: any;
  maskedMobile = '******1234'; // Replace with actual masked number

  constructor(
    private router: Router,
    private formBuilder: FormBuilder
  ) {
    this.otpForm = this.formBuilder.group({
      digit1: this.digit1Control,
      digit2: this.digit2Control,
      digit3: this.digit3Control,
      digit4: this.digit4Control
    });
  }

  ngOnInit() {
    this.startResendTimer();
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  goBack() {
    this.router.navigate(['/mobile-login']);
  }

  onOtpInput(event: any, index: number) {
    const input = event.target;
    const value = input.value;

    // Allow only numbers
    if (!/^\d*$/.test(value)) {
      input.value = '';
      return;
    }

    // Auto focus next input
    if (value.length === 1 && index < 4) {
      const inputs = this.otpInputs.toArray();
      inputs[index].nativeElement.focus();
    }

    // Handle backspace
    if (event.key === 'Backspace' && index > 0 && !value) {
      const inputs = this.otpInputs.toArray();
      inputs[index - 2].nativeElement.focus();
    }

    // Check if OTP is complete
    if (this.otpForm.valid) {
      this.verifyOtp();
    }
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const clipboardData = event.clipboardData?.getData('text');
    if (clipboardData && /^\d{4}$/.test(clipboardData)) {
      const digits = clipboardData.split('');
      const controls = [this.digit1Control, this.digit2Control, this.digit3Control, this.digit4Control];
      digits.forEach((digit, index) => {
        controls[index].setValue(digit);
      });
      this.verifyOtp();
    }
  }

  verifyOtp() {
    this.isVerifying = true;
    const otp = Object.values(this.otpForm.value).join('');
    
    // Simulate API call
    setTimeout(() => {
      this.isVerifying = false;
      this.router.navigate(['/tabs/tabs/tab1']); // Navigate to home after verification
    }, 1500);
  }

  startResendTimer() {
    this.timeLeft = 30;
    this.canResend = false;
    
    this.timerInterval = setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
      } else {
        this.canResend = true;
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  resendOTP() {
    if (this.canResend) {
      // Implement resend logic here
      this.startResendTimer();
    }
  }
}
