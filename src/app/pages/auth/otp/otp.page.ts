import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserService } from 'src/app/services/user.service';
import { FcmService } from 'src/app/services/fcm.service';
import { OtpAutofillService } from 'src/app/services/otp-autofill.service';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-otp',
  templateUrl: './otp.page.html',
  styleUrls: ['./otp.page.scss'],
  standalone: false,
})
export class OtpPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('otpInput') otpInputRef!: ElementRef<HTMLInputElement>;

  otpValue = '';
  digits: string[] = ['', '', '', ''];
  isVerifying = false;
  timeLeft = 30;
  canResend = false;
  maskedMobile = '';
  phoneNumber = '';
  errorMessage = '';
  isRateLimited = false;
  rateLimitSecondsLeft = 0;

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private rateLimitInterval: ReturnType<typeof setInterval> | null = null;
  private autofillSub: Subscription | null = null;
  private declinedSub: Subscription | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private fcmService: FcmService,
    private otpAutofill: OtpAutofillService,
    private toastController: ToastController,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.phoneNumber = this.route.snapshot.paramMap.get('phoneNumber') || '';
    if (!this.phoneNumber || !/^\d{10}$/.test(this.phoneNumber)) {
      this.router.navigate(['/mobile-login'], { replaceUrl: true });
      return;
    }

    // Already signed in — do not sit on OTP or send/verify again.
    if (this.userService.isUserLoggedIn()) {
      void this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
      return;
    }
    void this.userService.hasStoredCredentials().then(async (has) => {
      if (!has) return;
      const restored = await this.userService.restoreSession();
      if (restored) {
        await this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
      }
    });

    this.maskedMobile = this.maskPhoneNumber(this.phoneNumber);
    this.startResendTimer();

    const pendingCode = this.otpAutofill.consumePendingCode();
    if (pendingCode) {
      this.applyOtp(pendingCode);
    }

    this.autofillSub = this.otpAutofill.code$.subscribe((code) => {
      if (code && !this.isVerifying && !this.isRateLimited) {
        this.applyOtp(code);
      }
    });

    this.declinedSub = this.otpAutofill.declined$.subscribe(() => {
      // Consent Activity closed — restore focus so manual entry works.
      setTimeout(() => this.focusOtpInput(), 250);
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.focusOtpInput(), 300);
  }

  ngOnDestroy() {
    this.clearResendTimer();
    this.clearRateLimitTimer();
    this.autofillSub?.unsubscribe();
    this.declinedSub?.unsubscribe();
    void this.otpAutofill.disarm();
  }

  maskPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber || phoneNumber.length < 10) {
      return phoneNumber || '';
    }
    return `XXXXXX${phoneNumber.slice(-4)}`;
  }

  goBack() {
    void this.otpAutofill.disarm();
    this.router.navigate(['/mobile-login']);
  }

  focusOtpInput() {
    if (this.isVerifying || this.isRateLimited) {
      return;
    }
    this.otpInputRef?.nativeElement?.focus();
  }

  onOtpInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const cleaned = (input.value || '').replace(/\D/g, '').slice(0, 4);
    // Clear previous error as soon as the user starts typing again.
    if (this.errorMessage) {
      this.errorMessage = '';
    }
    // Auto-submit when the 4th digit is entered (applyOtp guards on length).
    this.applyOtp(cleaned);
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const clipboardData = event.clipboardData?.getData('text') || '';
    const cleaned = clipboardData.replace(/\D/g, '').slice(0, 4);
    if (cleaned) {
      this.applyOtp(cleaned);
    }
  }

  private applyOtp(value: string, autoSubmit = true) {
    this.otpValue = value;
    this.digits = [
      value[0] || '',
      value[1] || '',
      value[2] || '',
      value[3] || '',
    ];

    if (this.otpInputRef?.nativeElement && this.otpInputRef.nativeElement.value !== value) {
      this.otpInputRef.nativeElement.value = value;
    }

    if (autoSubmit && value.length === 4) {
      this.errorMessage = '';
      void this.verifyOtp();
    }
  }

  async verifyOtp() {
    if (this.isVerifying || this.isRateLimited || this.otpValue.length !== 4) {
      return;
    }

    this.isVerifying = true;
    this.errorMessage = '';

    const cachedFcmToken = await this.fcmService.getCachedToken();
    const payload: { phoneNumber: string; otp: string; fcmToken?: string } = {
      phoneNumber: this.phoneNumber,
      otp: this.otpValue,
    };
    if (cachedFcmToken) {
      payload.fcmToken = cachedFcmToken;
    }

    this.userService.verifyLoginOtp(payload).subscribe({
      next: async (res: any) => {
        this.isVerifying = false;
        await this.otpAutofill.disarm();
        await this.userService.completeLogin(res);

        if (res.isNewUser) {
          this.router.navigate(
            ['/profile-details', this.phoneNumber, 'false', res.userId],
            { replaceUrl: true },
          );
        } else {
          this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
        }
      },
      error: async (err: any) => {
        this.isVerifying = false;
        await this.handleVerifyError(err);
      },
    });
  }

  private async handleVerifyError(err: any) {
    const status = err?.status;
    const code = err?.error?.code;
    const backendMessage = String(err?.error?.message || '').toLowerCase();
    const isBlocked =
      status === 403 &&
      (code === 'USER_BLOCKED' ||
        err?.error?.isBlocked ||
        err?.error?.details?.isBlocked);

    if (isBlocked) {
      this.router.navigate(['/blocked'], { replaceUrl: true });
      return;
    }

    if (code === 'INVALID_PHONE_NUMBER') {
      this.router.navigate(['/mobile-login'], { replaceUrl: true });
      return;
    }

    // Clear digits first — must not wipe errorMessage (applyOtp no longer clears it).
    this.clearOtp();

    if (status === 429) {
      const retryAfter = Number(err?.error?.retryAfter) || 900;
      this.startRateLimitTimer(retryAfter);
      this.errorMessage = this.translate.instant('AUTH.otp.tooManyAttempts');
      return;
    }

    const isInvalidOtp =
      code === 'OTP_VERIFICATION_FAILED' ||
      code === 'INVALID_OTP' ||
      status === 400 ||
      backendMessage.includes('otp');

    if (isInvalidOtp) {
      this.errorMessage = this.translate.instant('AUTH.otp.invalidOtp');
    } else if (code === 'OTP_DELIVERY_FAILED' || code === 'OTP_RESEND_FAILED') {
      this.errorMessage = this.translate.instant('AUTH.otp.deliveryFailed');
    } else {
      this.errorMessage =
        err?.error?.message ||
        this.translate.instant('AUTH.otp.networkError');
    }

    const toast = await this.toastController.create({
      message: this.errorMessage,
      duration: 3000,
      position: 'bottom',
      color: 'danger',
    });
    await toast.present();
    setTimeout(() => this.focusOtpInput(), 100);
  }

  async resendOTP() {
    if (!this.canResend || this.isVerifying || this.isRateLimited) {
      return;
    }

    this.canResend = false;
    this.errorMessage = '';
    this.clearOtp();

    void this.otpAutofill.arm();

    this.userService.resendLoginOtp(this.phoneNumber).subscribe({
      next: async () => {
        this.startResendTimer();
        const toast = await this.toastController.create({
          message: this.translate.instant('AUTH.otp.subtitle'),
          duration: 2000,
          position: 'bottom',
          color: 'success',
        });
        await toast.present();
        setTimeout(() => this.focusOtpInput(), 100);
      },
      error: async (err: any) => {
        this.canResend = true;

        if (err?.status === 403 && (err?.error?.code === 'USER_BLOCKED' || err?.error?.details?.isBlocked)) {
          this.router.navigate(['/blocked'], { replaceUrl: true });
          return;
        }

        if (err?.status === 429) {
          const retryAfter = Number(err?.error?.retryAfter) || 900;
          this.startRateLimitTimer(retryAfter);
          this.errorMessage = this.translate.instant('AUTH.otp.tooManyAttempts');
          return;
        }

        this.errorMessage =
          err?.error?.message ||
          this.translate.instant('AUTH.otp.deliveryFailed');
      },
    });
  }

  private clearOtp() {
    this.applyOtp('', false);
  }

  private startResendTimer() {
    this.clearResendTimer();
    this.timeLeft = 30;
    this.canResend = false;

    this.timerInterval = setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
      } else {
        this.canResend = true;
        this.clearResendTimer();
      }
    }, 1000);
  }

  private clearResendTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private startRateLimitTimer(seconds: number) {
    this.clearRateLimitTimer();
    this.isRateLimited = true;
    this.rateLimitSecondsLeft = Math.max(1, seconds);

    this.rateLimitInterval = setInterval(() => {
      if (this.rateLimitSecondsLeft > 0) {
        this.rateLimitSecondsLeft--;
      } else {
        this.isRateLimited = false;
        this.clearRateLimitTimer();
        setTimeout(() => this.focusOtpInput(), 100);
      }
    }, 1000);
  }

  private clearRateLimitTimer() {
    if (this.rateLimitInterval) {
      clearInterval(this.rateLimitInterval);
      this.rateLimitInterval = null;
    }
  }
}
