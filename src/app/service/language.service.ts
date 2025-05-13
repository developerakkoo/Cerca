import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Storage } from '@ionic/storage-angular';
import { UserService } from '../services/user.service';
@Injectable({
  providedIn: 'root'
})
export class LanguageService {

  selected: string = 'en';
  constructor(private translate: TranslateService, private storage: Storage,private userService: UserService) {
    this.storage.create();
   }


   setInitialLanguage() {
    this.storage.get('language').then((lang) => {
      if (lang) {
        this.selected = lang;
        this.translate.use(lang);
      }
    });
  }

  setLanguage(lang: string) {
    this.selected = lang;
    this.translate.use(lang);
    this.userService.updatePreference('language', lang);
  }

  getLanguage() {
    return [
      {
        code: 'en',
        name: 'English',
        flag: '🇺🇸'
      },
      {
        code: 'hi',
        name: 'Hindi',
        flag: '🇮🇳'
      },
      {
        code: 'ma',
        name: 'Marathi',
        flag: '🇮🇳'
      }
    ]
  }
  
}
