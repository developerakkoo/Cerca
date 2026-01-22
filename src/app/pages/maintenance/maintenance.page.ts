import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Location } from '@angular/common';
import { SystemSettingsService } from 'src/app/services/system-settings.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-maintenance',
  templateUrl: './maintenance.page.html',
  styleUrls: ['./maintenance.page.scss'],
  standalone: false,
})
export class MaintenancePage implements OnInit {
  maintenanceMessage: string = 'We are currently performing maintenance. Please check back soon.';
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private location: Location,
    private systemSettingsService: SystemSettingsService
  ) {}

  async ngOnInit() {
    // Prevent back navigation
    this.location.replaceState('/maintenance');
    
    // Load maintenance message
    this.loadMaintenanceMessage();
    
    // Prevent any navigation attempts
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        // Keep user on maintenance screen unless maintenance is over
        if (this.router.url !== '/maintenance') {
          this.checkMaintenanceStatus();
        }
      });
  }

  async loadMaintenanceMessage() {
    try {
      this.maintenanceMessage = await this.systemSettingsService.getMaintenanceMessage();
    } catch (error) {
      console.error('Error loading maintenance message:', error);
    }
  }

  async checkMaintenanceStatus() {
    this.isLoading = true;
    try {
      // Clear cache to force fresh check
      this.systemSettingsService.clearCache();
      
      const isMaintenanceMode = await this.systemSettingsService.checkMaintenanceMode();
      
      if (!isMaintenanceMode) {
        // Maintenance is over, reload the app
        console.log('✅ Maintenance mode disabled, reloading app...');
        window.location.reload();
      } else {
        // Still in maintenance, update message
        await this.loadMaintenanceMessage();
      }
    } catch (error) {
      console.error('Error checking maintenance status:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async retry() {
    await this.checkMaintenanceStatus();
  }

  // Prevent any navigation away from this screen
  ionViewWillEnter() {
    // Ensure we stay on maintenance screen
    if (this.router.url !== '/maintenance') {
      this.router.navigate(['/maintenance'], { replaceUrl: true });
    }
  }
}

