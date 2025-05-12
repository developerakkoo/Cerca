import { Component } from '@angular/core';
import { UserService } from './services/user.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  user:any;
  constructor(private userService: UserService,
    private router: Router    
  ) {}

  ngOnInit(){
    this.userService.loadUserFromStorage();
    this.userService.user$.subscribe((user) => {
      console.log('user');
      console.log(user);
      if(user['isLoggedIn'])
{
this.router.navigate(['/tabs/tabs/tab1']);

  }  else{
  this.router.navigate(['/']);
}    this.user = user;
    });
  }
}
