import { Component, OnDestroy } from '@angular/core';
import { UserService } from './services/user.service';
import { Router } from '@angular/router';
import { LanguageService } from './service/language.service';
import { Platform } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SocketService } from './services/socket.service';
import { RideService } from './services/ride.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  user: any;

  constructor(
    private userService: UserService,
    private router: Router,
    private languageService: LanguageService,
    private platform: Platform,
    private translate: TranslateService,
    private socketService: SocketService,
    private rideService: RideService
  ) {}

  async ngOnInit() {
    await this.platform.ready();

    // Initialize language
    this.translate.setDefaultLang('en');
    this.translate.use('en');

    // Load user from storage
    await this.userService.loadUserFromStorage();

    // Subscribe to user changes
    this.userService.user$.subscribe(async (user) => {
      console.log('User:', user);
      this.user = user;

      if (user && user.isLoggedIn) {
        // Initialize socket connection for logged-in users
        try {
          const userId = user._id || user.id || user.uid || user.userId;

          if (userId) {
            await this.socketService.initialize({
              userId,
              userType: 'rider',
            });

            // Restore any active ride
            await this.rideService.restoreRide();

            console.log('✅ Socket.IO initialized successfully');
          } else {
            console.warn(
              '⚠️ User logged in but no user ID found. Socket not initialized.'
            );
          }
        } catch (error) {
          console.error('❌ Failed to initialize socket:', error);
        }

        this.router.navigate(['/tabs/tabs/tab1']);
      } else {
        // Disconnect socket for logged-out users
        await this.socketService.disconnect();
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy() {
    // Cleanup socket connection on app destroy
    this.socketService.disconnect();
  }
}
