import { Component, OnInit } from '@angular/core';
import { AnimationController, Platform } from '@ionic/angular';
import { ThemeService } from '../services/theme.service';
import { UserService, User } from '../services/user.service';
import { Router } from '@angular/router';

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
  notificationsEnabled: boolean = true;
  selectedLanguage: string = 'en';
  user: any;
  languages: Language[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'es', name: 'Marathi', flag: '🇮🇳' },
  ];

  constructor(
    private animationCtrl: AnimationController,
    private platform: Platform,
    private themeService: ThemeService,
    private userService: UserService,
    private router: Router
  ) {}

  ngOnInit() {
    this.isDarkMode = this.themeService.isDarkMode();
    this.animateItems();
    this.getUser();
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
  }

  editProfile() {
    // Implement edit profile logic
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
