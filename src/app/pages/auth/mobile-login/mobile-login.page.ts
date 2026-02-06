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
          
          console.log('✅ ========================================');
          console.log('✅ LOGIN SUCCESSFUL - UPDATING USER STATE');
          console.log('✅ ========================================');
          console.log('isNewUser:', isNewUser);
          console.log('Response:', res);

          // Store credentials
          await this.storageService.set('userId', res['userId']);
          await this.storageService.set('token', res['token']);
          
          // Store token expiry if provided
          if (res['expiresIn']) {
            const expiryTime = new Date(Date.now() + res['expiresIn'] * 1000);
            await this.storageService.set('tokenExpiry', expiryTime.toISOString());
          } else if (res['tokenExpiry']) {
            await this.storageService.set('tokenExpiry', res['tokenExpiry']);
          }
          
          // Store last login time
          await this.storageService.set('lastLoginTime', new Date().toISOString());

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

          // Navigate based on isNewUser flag
          if (isNewUser) {
            // New user: Navigate to profile-details to complete profile
            console.log('🆕 New user - Navigating to profile-details');
            this.router.navigate([
              '/profile-details',
              this.mobileForm.value.phoneNumber,
              'false', // isEdit = false for new users
              res['userId']
            ]);
          } else {
            // Existing user: Navigate directly to tab1
            console.log('👤 Existing user - Navigating to tab1');
            this.router.navigate(['/tabs/tabs/tab1']);
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
