import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
@Component({
  selector: 'app-profile-details',
  templateUrl: './profile-details.page.html',
  styleUrls: ['./profile-details.page.scss'],
  standalone:false,
})
export class ProfileDetailsPage implements OnInit {

  userForm!: FormGroup;
  phoneNumber = '';
  isEdit:boolean = false;
  userId:string = '';
    constructor(private formBuilder: FormBuilder, private route: ActivatedRoute, 
    private loadingController: LoadingController,
    private router: Router,
    private userService: UserService) {
    this.phoneNumber = this.route.snapshot.paramMap.get('phoneNumber') || '';
    this.isEdit = this.route.snapshot.paramMap.get('isEdit') === 'true';
    this.userId = this.route.snapshot.paramMap.get('userId') || '';
    console.log(this.isEdit);
    console.log(this.phoneNumber);
    
    
    
    this.userForm = this.formBuilder.group({
      fullName: ['',[Validators.required, Validators.minLength(3)]],
      email: ['',[Validators.required, Validators.email]],
     
    });
   }

  ngOnInit() {
    this.getUser();
  }

  async getUser(){
    this.userService.getUser().subscribe({
      next: (res:any)=>{
        console.log("User Data");
        
        console.log(res);
        this.userForm.patchValue({
          fullName: res.fullName,
          email: res.email
        });
      }
    })
  }

  async onSubmit() {
    const loading = await this.loadingController.create({
      message: 'Logging in...',
      duration: 3000
    });
    await loading.present();
    if (this.userForm.valid) {
      console.log(this.userForm.value);
      if(!this.isEdit){

     
      // Perform the desired action with the form data
      let body = {
        fullName: this.userForm.value.fullName,
        email: this.userForm.value.email,
        phoneNumber: this.phoneNumber,
        lastLogin: new Date()
      }
      console.log(body);
      this.userService.setUser(body).subscribe({
        next:async (res:any)=>{
          console.log(res);
          let body = {
            isLoggedIn: true,
            ...res
          }
          await loading.dismiss();
          this.userService.saveUserToStorage(body);
          this.router.navigate(['/tabs/tabs/tab1']);
        },
        error:async (err:any)=>{
          console.log(err);
          await loading.dismiss();
        }
      })
return;
      }else{
        this.userService.updateUser(this.userForm.value).subscribe({
          next: async (res:any)=>{
            console.log(res);
            await loading.dismiss();
            this.getUser();
          },
          error: async (err:any)=>{
            console.log(err);
            await loading.dismiss();
          }
        })
        return;
      }
    } else {
      console.log('Form is invalid');
    }
  }
  
}



