import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Location } from '@angular/common';
import { Platform } from '@ionic/angular';
import { SystemSettingsService } from 'src/app/services/system-settings.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-force-update',
  templateUrl: './force-update.page.html',
  styleUrls: ['./force-update.page.scss'],
  standalone: false,
})
export class ForceUpdatePage implements OnInit {
  currentVersion: string = 'Unknown';
  requiredVersion: string = 'Unknown';
  platform: string = 'unknown';
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private location: Location,
    private platformService: Platform,
    private systemSettingsService: SystemSettingsService
  ) {}

  async ngOnInit() {
    // Prevent back navigation
    this.location.replaceState('/force-update');
    
    // Load version information
    await this.loadVersionInfo();
    
    // Detect platform
    if (this.platformService.is('ios')) {
      this.platform = 'iOS';
    } else if (this.platformService.is('android')) {
      this.platform = 'Android';
    } else {
      this.platform = 'Web';
    }
    
    // Prevent any navigation attempts
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        // Keep user on force update screen unless update is no longer required
        if (this.router.url !== '/force-update') {
          this.checkUpdateStatus();
        }
      });
  }

  async loadVersionInfo() {
    try {
      this.currentVersion = await this.systemSettingsService.getCurrentAppVersion() || 'Unknown';
      this.requiredVersion = await this.systemSettingsService.getRequiredVersion() || 'Unknown';
    } catch (error) {
      console.error('Error loading version info:', error);
    }
  }

  async checkUpdateStatus() {
    this.isLoading = true;
    try {
      // Clear cache to force fresh check
      this.systemSettingsService.clearCache();
      
      const updateRequired = await this.systemSettingsService.checkForceUpdate();
      
      if (!updateRequired) {
        // Update no longer required, reload the app
        console.log('✅ Update no longer required, reloading app...');
        window.location.reload();
      } else {
        // Still need update, refresh version info
        await this.loadVersionInfo();
      }
    } catch (error) {
      console.error('Error checking update status:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async updateNow() {
    try {
      await this.systemSettingsService.openAppStore();
    } catch (error) {
      console.error('Error opening app store:', error);
    }
  }

  async retry() {
    await this.checkUpdateStatus();
  }

  // Prevent any navigation away from this screen
  ionViewWillEnter() {
    // Ensure we stay on force update screen
    if (this.router.url !== '/force-update') {
      this.router.navigate(['/force-update'], { replaceUrl: true });
    }
  }
}

