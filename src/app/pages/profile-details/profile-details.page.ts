import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { firstValueFrom } from 'rxjs';
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
    constructor(
      private formBuilder: FormBuilder, 
      private route: ActivatedRoute, 
      private loadingController: LoadingController,
      private router: Router,
      private userService: UserService,
      private http: HttpClient
    ) {
    // Read route parameters
    this.phoneNumber = this.route.snapshot.paramMap.get('phoneNumber') || '';
    this.isEdit = this.route.snapshot.paramMap.get('isEdit') === 'true';
    this.userId = this.route.snapshot.paramMap.get('userId') || '';
    
    // Debug logging for route parameters
    console.log('Profile Details - Route Parameters:');
    console.log('  phoneNumber:', this.phoneNumber);
    console.log('  isEdit:', this.isEdit);
    console.log('  userId:', this.userId);
    
    // Initialize form with conditional validators
    // Email is optional in edit mode (can be empty), but required in create mode
    // If email is provided, it must be valid format
    const emailValidators = this.isEdit 
      ? [Validators.email] // Optional email in edit mode (empty is allowed, but if provided must be valid)
      : [Validators.required, Validators.email]; // Required in create mode
    
    this.userForm = this.formBuilder.group({
      fullName: ['',[Validators.required, Validators.minLength(3)]],
      email: ['', emailValidators],
    });
   }

  ngOnInit() {
    // Ensure form is initialized before fetching user data
    if (this.userForm) {
      this.getUser();
    }
  }

  async getUser(){
    console.log('🔍 Fetching user data...');
    console.log('  userId from route:', this.userId);
    console.log('  isEdit:', this.isEdit);
    
    try {
      // Fetch user data from API using userId from route params
      if (this.userId) {
        console.log('📡 Making API call to fetch user data...');
        const userData = await firstValueFrom(
          this.http.get<any>(`${environment.apiUrl}/users/${this.userId}`)
        );
        
        console.log('✅ User Data from API:', userData);
        console.log('  fullName:', userData.fullName);
        console.log('  email:', userData.email);
        
        // For new users (isEdit = false), check if profile is incomplete
        // Profile is incomplete if fullName is "Pending" (placeholder) or email is temporary
        const isProfileIncomplete = !userData.fullName || 
                                   userData.fullName.trim() === '' ||
                                   userData.fullName.trim() === 'Pending' ||
                                   userData.email?.includes('@cerca.temp');
        
        if (isProfileIncomplete && !this.isEdit) {
          // New user with incomplete profile - keep form empty
          console.log('🆕 New user with incomplete profile - form will remain empty');
          this.userForm.patchValue({
            fullName: '',
            email: ''
          });
        } else if (userData && (userData.fullName || userData.email)) {
          // Populate form with API response values
          // If fullName or email is null/undefined, set to empty string
          this.userForm.patchValue({
            fullName: userData.fullName || '',
            email: userData.email || ''
          });
          
          console.log('✅ Form patched successfully with API data');
          console.log('  Form values:', this.userForm.value);
        } else {
          console.warn('⚠️ API response missing fullName and email fields');
          // Keep form empty if API doesn't have the data
        }
      } else {
        // No userId provided - try to get from current user
        console.log('⚠️ No userId in route params, attempting to fetch from current user...');
        const currentUser = this.userService.getCurrentUser();
        
        if (currentUser && currentUser.id) {
          // Fetch from API using current user's ID
          console.log('📡 Fetching user data from API using current user ID:', currentUser.id);
          try {
            const userData = await firstValueFrom(
              this.http.get<any>(`${environment.apiUrl}/users/${currentUser.id}`)
            );
            
            console.log('✅ User Data from API (using current user ID):', userData);
            
            if (userData && (userData.fullName || userData.email)) {
              this.userForm.patchValue({
                fullName: userData.fullName || '',
                email: userData.email || ''
              });
              console.log('✅ Form patched successfully with API data');
            }
          } catch (apiError) {
            console.error('❌ Error fetching from API with current user ID:', apiError);
            // Transform localStorage data if API fails
            this.transformAndPatchLocalStorageData(currentUser);
          }
        } else {
          console.warn('⚠️ No current user ID available');
          // Keep form empty - user needs to enter data manually
        }
      }
    } catch (error) {
      console.error('❌ Error fetching user data from API:', error);
      
      // Try to get current user from localStorage as last resort
      const currentUser = this.userService.getCurrentUser();
      if (currentUser) {
        console.log('🔄 Attempting fallback to localStorage data...');
        this.transformAndPatchLocalStorageData(currentUser);
      } else {
        console.warn('⚠️ No user data available from any source');
        // Form remains empty - user can enter data manually
      }
    }
  }

  /**
   * Transform localStorage user data to match API response format
   * and patch the form if possible
   */
  private transformAndPatchLocalStorageData(localStorageUser: any) {
    console.log('🔄 Transforming localStorage data:', localStorageUser);
    
    // localStorage data structure: {_id, id, userId, phoneNumber, token, isLoggedIn, lastLogin}
    // API data structure: {fullName, email, phoneNumber, ...}
    
    // Check if localStorage user has an ID we can use to fetch from API
    const userIdToFetch = localStorageUser.id || localStorageUser.userId || localStorageUser._id;
    
    if (userIdToFetch && userIdToFetch !== this.userId) {
      // Try to fetch from API one more time with this ID
      console.log('📡 Attempting API fetch with localStorage userId:', userIdToFetch);
      firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/users/${userIdToFetch}`)
      ).then((userData) => {
        console.log('✅ User Data from API (using localStorage userId):', userData);
        if (userData && (userData.fullName || userData.email)) {
          this.userForm.patchValue({
            fullName: userData.fullName || '',
            email: userData.email || ''
          });
          console.log('✅ Form patched successfully with API data');
        }
      }).catch((err) => {
        console.error('❌ Failed to fetch from API with localStorage userId:', err);
        // If API fetch fails, localStorage data doesn't have fullName/email
        // So we can't populate the form - it will remain empty
        console.warn('⚠️ Cannot populate form - localStorage data missing fullName/email');
      });
    } else {
      // localStorage data doesn't have fullName/email, so we can't populate form
      console.warn('⚠️ Cannot populate form - localStorage data missing fullName/email fields');
      console.warn('  Available fields:', Object.keys(localStorageUser));
    }
  }

  async onSubmit() {
    const loading = await this.loadingController.create({
      message: this.isEdit ? 'Updating profile...' : 'Completing profile...',
      duration: 3000
    });
    await loading.present();
    
    if (this.userForm.valid) {
      console.log('📝 Form submission:', this.userForm.value);
      console.log('  isEdit:', this.isEdit);
      console.log('  userId:', this.userId);
      
      if (!this.isEdit) {
        // New user completing profile - user already exists (created during login)
        // Use updateUser to update the existing user with fullName and email
        if (this.userId) {
          console.log('🆕 Updating new user profile with userId:', this.userId);
          
          // Update the user with profile details
          const updateData = {
            fullName: this.userForm.value.fullName,
            email: this.userForm.value.email
          };
          
          this.userService.updateUser(updateData).subscribe({
            next: async (res: any) => {
              console.log('✅ Profile updated successfully:', res);
              
              // Fetch complete user data to update UserService
              try {
                const updatedUserData = await firstValueFrom(
                  this.http.get<any>(`${environment.apiUrl}/users/${this.userId}`)
                );
                
                // Update UserService with complete user data
                const completeUserData = {
                  _id: updatedUserData._id || updatedUserData.id,
                  id: updatedUserData._id || updatedUserData.id,
                  userId: updatedUserData._id || updatedUserData.id,
                  phoneNumber: updatedUserData.phoneNumber,
                  fullName: updatedUserData.fullName,
                  email: updatedUserData.email,
                  token: this.userService.getCurrentUser()?.token,
                  isLoggedIn: true,
                  lastLogin: new Date(),
                };
                
                await this.userService.saveUserToStorage(completeUserData);
                this.userService['userSubject'].next(completeUserData);
                
                await loading.dismiss();
                console.log('✅ User data updated - Navigating to tab1');
                this.router.navigate(['/tabs/tabs/tab1']);
              } catch (fetchError) {
                console.error('❌ Error fetching updated user data:', fetchError);
                await loading.dismiss();
                // Still navigate even if fetch fails
                this.router.navigate(['/tabs/tabs/tab1']);
              }
            },
            error: async (err: any) => {
              console.error('❌ Error updating profile:', err);
              await loading.dismiss();
            }
          });
        } else {
          // Fallback: if no userId, use setUser (creates new user)
          console.log('⚠️ No userId found - using setUser (fallback)');
          const body = {
            fullName: this.userForm.value.fullName,
            email: this.userForm.value.email,
            phoneNumber: this.phoneNumber,
            lastLogin: new Date()
          };
          
          this.userService.setUser(body).subscribe({
            next: async (res: any) => {
              console.log('✅ User created:', res);
              const userData = {
                isLoggedIn: true,
                ...res
              };
              await loading.dismiss();
              await this.userService.saveUserToStorage(userData);
              this.userService['userSubject'].next(userData);
              this.router.navigate(['/tabs/tabs/tab1']);
            },
            error: async (err: any) => {
              console.error('❌ Error creating user:', err);
              await loading.dismiss();
            }
          });
        }
      } else {
        // Existing user editing profile
        this.userService.updateUser(this.userForm.value).subscribe({
          next: async (res: any) => {
            console.log('✅ Profile updated:', res);
            await loading.dismiss();
            
            // Show success toast
            const toast = await this.loadingController.create({
              message: 'Profile updated successfully',
              duration: 2000,
            });
            await toast.present();
            
            // Navigate back to profile page (tab5)
            this.router.navigate(['/tabs/tabs/tab5'], { replaceUrl: true });
          },
          error: async (err: any) => {
            console.error('❌ Error updating profile:', err);
            await loading.dismiss();
          }
        });
      }
    } else {
      console.log('❌ Form is invalid');
      await loading.dismiss();
    }
  }
  
}



