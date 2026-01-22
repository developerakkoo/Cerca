import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from 'src/app/services/user.service';
import { LoadingController } from '@ionic/angular';
import { StorageService } from 'src/app/services/storage.service';
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
    private formBuilder: FormBuilder,
    private userService: UserService,
    private loadingController: LoadingController,
    private storageService: StorageService
  ) {
    this.mobileForm = this.formBuilder.group({
      phoneNumber: [
        '',
        [Validators.required, Validators.pattern('^[0-9]{10}$')],
      ],
    });
  }

  ngOnInit() {
    // Any initialization logic
  }

  ngOnDestroy() {
    // Cleanup any subscriptions or timers if needed
  }

  async onSubmit() {
    if (this.mobileForm.valid) {
      const loading = await this.loadingController.create({
        message: 'Logging in...',
        duration: 3000,
      });
      await loading.present();
      // Navigate to OTP page
      console.log(this.mobileForm.value);
      this.userService.login(this.mobileForm.value).subscribe({
        next: async (res: any) => {
          await loading.dismiss();
          console.log(res['message']);
          console.log(res);

          let isNewUser = res['isNewUser'];
          if (isNewUser) {
            await this.storageService.set(
              'phoneNumber',
              this.mobileForm.value.phoneNumber
            );
            this.router.navigate([
              '/otp',
              { phoneNumber: this.mobileForm.value.phoneNumber },
            ]);
          } else {
            console.log('✅ ========================================');
            console.log('✅ LOGIN SUCCESSFUL - UPDATING USER STATE');
            console.log('✅ ========================================');
            console.log('isNewUser is false');
            console.log('Response:', res);

            // Store credentials
            await this.storageService.set('userId', res['userId']);
            await this.storageService.set('token', res['token']);

            // **CRITICAL: Update UserService to trigger socket initialization**
            const userData = {
              _id: res['userId'],
              id: res['userId'],
              userId: res['userId'],
              phoneNumber: res['phoneNumber'],
              token: res['token'],
              isLoggedIn: true,
              lastLogin: new Date(),
            };

            console.log('📤 Updating UserService with user data:', userData);

            // Save to UserService (this triggers app.component.ts socket initialization)
            await this.userService.saveUserToStorage(userData);
            this.userService['userSubject'].next(userData);

            console.log('✅ User state updated - socket should initialize now');
            console.log('========================================');

            // Navigation will happen via app.component.ts
            // this.router.navigate(['/tabs/tabs/tab1']);
          }
        },
        error: async (err: any) => {
          await loading.dismiss();
          
          // Check if user is blocked
          if (err.status === 403 && err.error?.isBlocked) {
            console.log('🚫 User is blocked');
            // Navigate to blocked screen
            this.router.navigate(['/blocked'], { replaceUrl: true });
          } else {
            console.log(err.message?.message || err.error?.message || 'Login failed');
            console.log(err.status);
            // Handle other errors as before
          }
        },
      });

      // this.router.navigate(['/otp']);
    }
  }
}
