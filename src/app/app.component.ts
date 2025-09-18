import { Component } from '@angular/core';
import { UserService } from './services/user.service';
import { Router } from '@angular/router';
import { LanguageService } from './service/language.service';
import { Platform } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  user:any;
  constructor(private userService: UserService,
    private router: Router,
    private languageService: LanguageService   ,
    private platform: Platform ,
    private translate: TranslateService
  ) {}

  ngOnInit(){
    this.platform.ready().then(() =>{
      this.userService.loadUserFromStorage();
      this.translate.setDefaultLang('en');
      this.translate.use('en'); 
    this.userService.user$.subscribe((user) => {
      console.log('user');
      console.log(user);
      // console.log(user['preferences']['language']);
      // this.languageService.setLanguage(user['preferences']['language']);
      if(user)
{
this.router.navigate(['/tabs/tabs/tab1']);

  }  else{
  this.router.navigate(['/']);
}    this.user = user;
    });
  
    })
  }

}
