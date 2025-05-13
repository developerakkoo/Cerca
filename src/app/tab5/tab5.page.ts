import { Component, OnInit } from '@angular/core';
import { AnimationController, Platform } from '@ionic/angular';
import { ThemeService } from '../services/theme.service';
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
  isDarkMode: boolean = false;
  paletteToggle = false;
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
    private themeService: ThemeService,
    private userService: UserService,
    private router: Router,
    private languageService: LanguageService
  ) {}

  ngOnInit() {
   // Use matchMedia to check the user preference
   const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

   // Initialize the dark palette based on the initial
   // value of the prefers-color-scheme media query
   this.initializeDarkPalette(prefersDark.matches);

   // Listen for changes to the prefers-color-scheme media query
   prefersDark.addEventListener('change', (mediaQuery) => this.initializeDarkPalette(mediaQuery.matches));
    this.animateItems();
    this.getUser();
  }

    // Check/uncheck the toggle and update the palette based on isDark
    initializeDarkPalette(isDark: boolean) {
      this.paletteToggle = isDark;
      this.toggleDarkPalette(isDark);
    }
  
    // Listen for the toggle check/uncheck to toggle the dark palette
    toggleChange(event: CustomEvent) {
      this.toggleDarkPalette(event.detail.checked);
    }
  
   // Add or remove the "ion-palette-dark" class on the html element
  toggleDarkPalette(shouldAdd: boolean) {
    document.documentElement.classList.toggle('ion-palette-dark', shouldAdd);
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

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.setTheme(this.isDarkMode);
  }

  toggleNotifications() {
    this.notificationsEnabled = !this.notificationsEnabled;
    // Implement notifications logic
  }

  changeLanguage(langCode: string) {
    this.selectedLanguage = langCode;
    // Implement language change logic

    console.log(langCode);
    this.languageService.setLanguage(langCode);
    
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
    // Implement FAQ logic
  }

  manageAddress() {
    // Implement address management logic
  }
}
