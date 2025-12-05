import { Component, OnDestroy } from '@angular/core';
import { UserService } from './services/user.service';
import { Router } from '@angular/router';
import { LanguageService } from './service/language.service';
import { Platform } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SocketService } from './services/socket.service';
import { RideService } from './services/ride.service';
import { NetworkService } from './services/network.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  user: any;
  private userSubscription?: Subscription;

  constructor(
    private userService: UserService,
    private router: Router,
    private languageService: LanguageService,
    private platform: Platform,
    private translate: TranslateService,
    private socketService: SocketService,
    private rideService: RideService,
    private networkService: NetworkService
  ) {}

  async ngOnInit() {
    await this.platform.ready();

    // Initialize language
    this.translate.setDefaultLang('en');
    this.translate.use('en');

    // Load user from storage
    await this.userService.loadUserFromStorage();

    // Subscribe to user changes
    this.userSubscription = this.userService.user$.subscribe(async (user) => {
      console.log('User:', user);
      this.user = user;

      if (user && user.isLoggedIn) {
        console.log('🔐 ========================================');
        console.log('🔐 USER LOGGED IN - INITIALIZING SOCKET');
        console.log('🔐 ========================================');
        console.log('👤 User Object:', user);

        // Initialize socket connection for logged-in users
        try {
          const userId = user._id || user.id || user.uid || user.userId;
          console.log('👤 Extracted User ID:', userId);

          if (userId) {
            console.log('🚀 Calling socketService.initialize()...');

            await this.socketService.initialize({
              userId,
              userType: 'rider',
            });

            console.log('✅ Socket initialization call completed');
            console.log(
              '📡 Socket connected?',
              this.socketService.isConnected()
            );

            // Restore any active ride
            console.log('🔄 Restoring any active rides...');
            await this.rideService.restoreRide();

            console.log('✅ Socket.IO initialization sequence complete');
            console.log('========================================');
          } else {
            console.warn('⚠️ ========================================');
            console.warn('⚠️ User logged in but no user ID found');
            console.warn('⚠️ Socket not initialized');
            console.warn('========================================');
          }
        } catch (error) {
          console.error('❌ ========================================');
          console.error('❌ FAILED TO INITIALIZE SOCKET');
          console.error('❌ ========================================');
          console.error('📝 Error:', error);
          console.error('========================================');
        }

        console.log('🧭 Navigating to /tabs/tabs/tab1');
        this.router.navigate(['/tabs/tabs/tab1']);
      } else {
        console.log('🚪 ========================================');
        console.log('🚪 USER LOGGED OUT - DISCONNECTING SOCKET');
        console.log('🚪 ========================================');

        // Disconnect socket for logged-out users
        await this.socketService.disconnect();

        console.log('🧭 Navigating to /');
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy() {
    // Unsubscribe from user subscription
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
      this.userSubscription = undefined;
    }
    // Cleanup socket connection on app destroy
    this.socketService.disconnect();
    // Cleanup network service (stops polling and removes listeners)
    this.networkService.cleanup();
  }
}
