import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from 'src/app/services/user.service';
import { LoadingController } from '@ionic/angular';
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
    private loadingController: LoadingController
  ) {
    this.mobileForm = this.formBuilder.group({
      phoneNumber: ['', [
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

  async onSubmit() {
    if (this.mobileForm.valid) {
      const loading = await this.loadingController.create({
        message: 'Logging in...',
        duration: 3000
      });
      await loading.present();
      // Navigate to OTP page
      console.log(this.mobileForm.value);
      this.userService.login(this.mobileForm.value).subscribe({
        next:async(res:any)=>{
          await loading.dismiss();
          console.log(res['message']);
          console.log(res);

          let isNewUser = res['isNewUser'];
          if(isNewUser){
            this.router.navigate(['/otp', { phoneNumber: this.mobileForm.value.phoneNumber }]);
          }else{

            this.router.navigate(['/tabs/tabs/tab1']);
          }
          
        },
        error:async(err:any)=>{
          console.log(err.message.message);
          console.log(err.status);
            // this.router.navigate(['/otp']);
         await loading.dismiss();
        }
      })
      
      // this.router.navigate(['/otp']);
    }
  }
}
