import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from 'src/app/services/user.service';
import { LoadingController, ToastController } from '@ionic/angular';
import { OtpAutofillService } from 'src/app/services/otp-autofill.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-mobile-login',
  templateUrl: './mobile-login.page.html',
  styleUrls: ['./mobile-login.page.scss'],
  standalone: false,
})
export class MobileLoginPage implements OnInit, OnDestroy {
  mobileForm: FormGroup;
  isInputFocused = false;
  private isSubmitting = false;

  constructor(
    private router: Router,
    private formBuilder: FormBuilder,
    private userService: UserService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private otpAutofill: OtpAutofillService,
    private translate: TranslateService,
  ) {
    this.mobileForm = this.formBuilder.group({
      phoneNumber: [
        '',
        [Validators.required, Validators.pattern('^[0-9]{10}$')],
      ],
    });
  }

  ngOnInit() {}

  ngOnDestroy() {}

  openTerms(): void {
    this.router.navigate(['/legal-webview', 'terms']);
  }

  openPrivacy(): void {
    this.router.navigate(['/legal-webview', 'privacy']);
  }

  async onSubmit() {
    if (!this.mobileForm.valid || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    const phoneNumber = this.mobileForm.value.phoneNumber as string;

    const loading = await this.loadingController.create({
      message: this.translate.instant('AUTH.mobileLogin.continue') + '...',
    });
    await loading.present();

    // Arm SMS User Consent before the OTP SMS can arrive.
    void this.otpAutofill.arm();

    this.userService.sendLoginOtp(phoneNumber).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        this.router.navigate(['/otp', phoneNumber]);
      },
      error: async (err: any) => {
        await loading.dismiss();
        this.isSubmitting = false;
        void this.otpAutofill.disarm();

        if (err.status === 403 && (err.error?.isBlocked || err.error?.details?.isBlocked || err.error?.code === 'USER_BLOCKED')) {
          this.router.navigate(['/blocked'], { replaceUrl: true });
          return;
        }

        const message =
          err.error?.message ||
          err.message ||
          this.translate.instant('AUTH.otp.networkError');
        await this.showToast(message);
      },
    });
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'danger',
    });
    await toast.present();
  }
}
