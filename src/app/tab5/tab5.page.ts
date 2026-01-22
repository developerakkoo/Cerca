import { Component, OnInit } from '@angular/core';
import { AnimationController, Platform } from '@ionic/angular';
import { UserService, User } from '../services/user.service';
import { Router } from '@angular/router';
import { LanguageService } from '../service/language.service';
interface Language {
  code: string;
  name: string;
  flag: string;
}

@Component({
  selector: 'app-tab5',
  templateUrl: './tab5.page.html',
  styleUrls: ['./tab5.page.scss'],
  standalone: false,
})
export class Tab5Page implements OnInit {
  notificationsEnabled: boolean = true;
  selectedLanguage: string = 'en';
  user: any;
  languages: Language[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'mr', name: 'Marathi', flag: '🇮🇳' },
  ];

  constructor(
    private animationCtrl: AnimationController,
    private platform: Platform,
    private userService: UserService,
    private router: Router,
    private languageService: LanguageService
  ) {}

  ngOnInit() {
    this.initializeLanguage();
    this.animateItems();
    this.getUser();
  }

  private initializeLanguage() {
    // Load available languages from service
    this.languages = this.languageService.getLanguage();
    
    // Load current language
    this.selectedLanguage = this.languageService.getCurrentLanguage();
  }

  private animateItems() {
    const elements = document.querySelectorAll('.settings-item');
    elements.forEach((element, index) => {
      const animation = this.animationCtrl.create()
        .addElement(element)
        .duration(300)
        .easing('ease-out')
        .fromTo('transform', 'translateX(-20px)', 'translateX(0)')
        .fromTo('opacity', '0', '1')
        .delay(index * 100);

      animation.play();
    });
  }

  getUser() {
    this.userService.getUser().subscribe((user: User) => {
      this.user = user;
    });
  }


  toggleNotifications() {
    this.notificationsEnabled = !this.notificationsEnabled;
    // Implement notifications logic
  }

  async changeLanguage(langCode: string) {
    this.selectedLanguage = langCode;
    await this.languageService.setLanguage(langCode);
    console.log('🌐 Language changed to:', langCode);
  }

  editProfile() {
    if (this.user?.id) {
      this.router.navigate(['/profile-details', 
         this.user.phoneNumber,
        true,
         this.user.id 
      ]);
    }
  }

  logout() {
    this.userService.logout();
    this.router.navigate(['/']);
  }

  openSupport() {
    // Implement support logic
  }

  openFAQ() {
    this.router.navigate(['/faq']);
  }

  manageAddress() {
    this.router.navigate(['/manage-address']);
  }
}
