import { Component, OnDestroy } from '@angular/core';
import { UserService } from './services/user.service';
import { Router } from '@angular/router';
import { LanguageService } from './service/language.service';
import { Platform } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SocketService } from './services/socket.service';
import { RideService } from './services/ride.service';
import { NetworkService } from './services/network.service';
import { ThemeService } from './services/theme.service';
import { SystemSettingsService } from './services/system-settings.service';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  user: any;
  private userSubscription?: Subscription;
  private statusCheckInterval?: Subscription;
  private resumeSubscription?: Subscription;

  constructor(
    private userService: UserService,
    private router: Router,
    private languageService: LanguageService,
    private platform: Platform,
    private translate: TranslateService,
    private socketService: SocketService,
    private rideService: RideService,
    private networkService: NetworkService,
    private themeService: ThemeService,
    private systemSettingsService: SystemSettingsService
  ) {}

  async ngOnInit() {
    await this.platform.ready();

    // CRITICAL: Check system settings FIRST before any other initialization
    const systemCheckResult = await this.checkSystemSettings();
    if (systemCheckResult.shouldBlock) {
      // Navigate to blocking screen and return early
      this.router.navigate([systemCheckResult.route], { replaceUrl: true });
      return;
    }

    // Initialize theme service (must be early to apply theme before UI renders)
    await this.themeService.initializeTheme();

    // Initialize language service (must be early to load translations before UI renders)
    await this.languageService.initializeLanguage();

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

            // Sync ride state from backend on app initialization
            // This ensures active rides are restored after browser refresh
            try {
              console.log('🔄 Syncing ride state from backend...');
              await this.rideService.syncRideStateFromBackend();
              console.log('✅ Ride state sync completed');
            } catch (error) {
              console.error('❌ Error syncing ride state:', error);
              // Don't block app initialization if sync fails
            }

            console.log('✅ Socket.IO initialization sequence complete');
            console.log('========================================');

            // Start periodic status check
            this.startPeriodicStatusCheck(userId);

            // Setup app resume check
            this.setupAppResumeCheck(userId);
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

        // Check if user is blocked before navigating
        const userId = user._id || user.id || user.uid || user.userId;
        if (userId) {
          this.checkUserStatus(userId);
        }

        // Check current route - don't auto-navigate if we're on mobile-login or profile-details
        // Let those pages handle their own navigation
        const currentUrl = this.router.url;
        const isOnAuthPage = currentUrl.includes('/mobile-login') || 
                             currentUrl.includes('/profile-details') ||
                             currentUrl === '/';
        
        if (!isOnAuthPage) {
          // User is already logged in on app start (existing session) - navigate to tab1
          console.log('🧭 User already logged in - Navigating to /tabs/tabs/tab1');
          this.router.navigate(['/tabs/tabs/tab1']);
        } else {
          // User just logged in - let mobile-login or profile-details handle navigation
          console.log('🧭 User logged in from auth page - Navigation handled by auth page');
        }
      } else {
        console.log('🚪 ========================================');
        console.log('🚪 USER LOGGED OUT - DISCONNECTING SOCKET');
        console.log('🚪 ========================================');

        // Disconnect socket for logged-out users
        await this.socketService.disconnect();

        // Stop periodic status check
        this.stopPeriodicStatusCheck();

        // Stop app resume check
        this.stopAppResumeCheck();

        console.log('🧭 Navigating to /');
        this.router.navigate(['/']);
      }
    });
  }

  /**
   * Start periodic check for user blocked status
   */
  private startPeriodicStatusCheck(userId: string) {
    // Stop any existing interval
    this.stopPeriodicStatusCheck();

    // Check every 45 seconds
    this.statusCheckInterval = interval(45000).subscribe(() => {
      this.checkUserStatus(userId);
    });
  }

  /**
   * Stop periodic status check
   */
  private stopPeriodicStatusCheck() {
    if (this.statusCheckInterval) {
      this.statusCheckInterval.unsubscribe();
      this.statusCheckInterval = undefined;
    }
  }

  /**
   * Setup app resume check
   */
  private setupAppResumeCheck(userId: string) {
    // Stop any existing subscription
    this.stopAppResumeCheck();

    // Listen for app resume events
    this.resumeSubscription = this.platform.resume.subscribe(() => {
      console.log('📱 App resumed - checking user status');
      this.checkUserStatus(userId);
    });
  }

  /**
   * Stop app resume check
   */
  private stopAppResumeCheck() {
    if (this.resumeSubscription) {
      this.resumeSubscription.unsubscribe();
      this.resumeSubscription = undefined;
    }
  }

  /**
   * Check system settings (maintenance mode and force update)
   * This runs BEFORE normal app initialization
   */
  private async checkSystemSettings(): Promise<{ shouldBlock: boolean; route: string }> {
    try {
      console.log('🔍 ========================================');
      console.log('🔍 CHECKING SYSTEM SETTINGS');
      console.log('🔍 ========================================');

      // Check maintenance mode first
      console.log('🔍 Step 1: Checking maintenance mode...');
      const isMaintenanceMode = await this.systemSettingsService.checkMaintenanceMode();
      console.log('📋 Maintenance mode result:', isMaintenanceMode);
      
      if (isMaintenanceMode) {
        console.log('🚧 Maintenance mode is enabled - blocking app');
        console.log('🚧 Navigating to /maintenance');
        return { shouldBlock: true, route: '/maintenance' };
      }

      // Check force update
      console.log('🔍 Step 2: Checking force update...');
      const isForceUpdateRequired = await this.systemSettingsService.checkForceUpdate();
      console.log('📋 Force update result:', isForceUpdateRequired);
      
      if (isForceUpdateRequired) {
        console.log('⬆️ Force update is required - blocking app');
        console.log('⬆️ Navigating to /force-update');
        return { shouldBlock: true, route: '/force-update' };
      }

      console.log('✅ System settings check passed - proceeding with normal initialization');
      console.log('========================================');
      return { shouldBlock: false, route: '' };
    } catch (error) {
      console.error('❌ Error checking system settings:', error);
      console.error('❌ Error details:', error);
      // Fail open - allow app to proceed if check fails
      return { shouldBlock: false, route: '' };
    }
  }

  /**
   * Check user status and handle if blocked
   */
  private checkUserStatus(userId: string) {
    // Don't check if already on blocked screen
    if (this.router.url === '/blocked') {
      return;
    }

    this.userService.checkUserBlockedStatus(userId).subscribe({
      next: (isBlocked) => {
        if (isBlocked) {
          console.log('🚫 User is blocked - handling logout');
          this.userService.handleBlockedUser();
        }
      },
      error: (error) => {
        console.error('Error checking user status:', error);
      }
    });
  }

  ngOnDestroy() {
    // Unsubscribe from user subscription
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
      this.userSubscription = undefined;
    }
    // Stop periodic status check
    this.stopPeriodicStatusCheck();
    // Stop app resume check
    this.stopAppResumeCheck();
    // Cleanup socket connection on app destroy
    this.socketService.disconnect();
    // Cleanup network service (stops polling and removes listeners)
    this.networkService.cleanup();
  }
}
