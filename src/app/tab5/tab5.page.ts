import { Component, OnInit, OnDestroy } from '@angular/core';
import { AnimationController, Platform } from '@ionic/angular';
import { UserService, User } from '../services/user.service';
import { Router } from '@angular/router';
import { LanguageService } from '../service/language.service';
import { SupportService, SupportIssue } from '../services/support.service';
import { SocketService } from '../services/socket.service';
import { Subscription } from 'rxjs';
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
export class Tab5Page implements OnInit, OnDestroy {
  notificationsEnabled: boolean = true;
  selectedLanguage: string = 'en';
  user: any;
  activeSupportCount: number = 0;
  private subscriptions: Subscription[] = [];
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
    private languageService: LanguageService,
    private supportService: SupportService,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    this.initializeLanguage();
    this.animateItems();
    this.getUser();
    this.loadActiveSupportCount();
    this.setupSocketListeners();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
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
    this.router.navigate(['/support-list']);
  }

  loadActiveSupportCount() {
    this.userService.getUser().subscribe((user: User) => {
      if (user?.id) {
        const sub = this.supportService.getUserIssues(user.id).subscribe({
          next: (issues: SupportIssue[]) => {
            this.activeSupportCount = issues.filter(
              issue => ['WAITING_FOR_ADMIN', 'ADMIN_ASSIGNED', 'CHAT_ACTIVE', 'FEEDBACK_PENDING'].includes(issue.status)
            ).length;
          },
          error: (error) => {
            console.error('Error loading support count:', error);
            this.activeSupportCount = 0;
          }
        });
        this.subscriptions.push(sub);
      }
    });
  }

  setupSocketListeners() {
    // Listen for new support issues
    const newIssueSub = this.socketService.on('support:new_issue').subscribe((data: any) => {
      // Reload support count when new issue is created
      this.loadActiveSupportCount();
    });
    this.subscriptions.push(newIssueSub);

    // Listen for support accepted
    const acceptSub = this.socketService.on('support:accept').subscribe((data: any) => {
      // Reload support count when issue is accepted
      this.loadActiveSupportCount();
    });
    this.subscriptions.push(acceptSub);

    // Listen for support ended
    const endedSub = this.socketService.on('support:ended').subscribe((data: any) => {
      // Reload support count when issue is ended
      this.loadActiveSupportCount();
    });
    this.subscriptions.push(endedSub);
  }

  openFAQ() {
    this.router.navigate(['/faq']);
  }

  manageAddress() {
    this.router.navigate(['/manage-address']);
  }

  openGifts() {
    this.router.navigate(['/gift']);
  }
}
