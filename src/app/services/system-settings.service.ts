import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject, firstValueFrom } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { environment } from 'src/environments/environment';
import { compareVersions, isUpdateRequired } from '../utils/version.util';

// Import compareVersions directly since we need it

export interface SystemSettings {
  maintenanceMode: boolean;
  forceUpdate: boolean;
  maintenanceMessage: string | null;
  userAppVersion: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SystemSettingsService {
  private settingsCache: SystemSettings | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private settingsSubject = new BehaviorSubject<SystemSettings | null>(null);
  public settings$ = this.settingsSubject.asObservable();

  // Store URLs - can be configured in environment files later
  private readonly ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=io.techlapse.Cerca';
  private readonly IOS_STORE_URL = 'https://apps.apple.com/app/id[APP_ID]'; // Placeholder

  constructor(
    private http: HttpClient,
    private platform: Platform
  ) {}

  /**
   * Fetch system settings from API
   */
  fetchSystemSettings(): Observable<SystemSettings> {
    // Check cache first
    const now = Date.now();
    if (this.settingsCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      console.log('📦 Using cached system settings');
      return of(this.settingsCache);
    }

    console.log('📡 Fetching system settings from API...');
    return this.http.get<SystemSettings>(`${environment.apiUrl}/admin/settings/system`).pipe(
      tap((settings) => {
        console.log('✅ System settings fetched:', settings);
        this.settingsCache = settings;
        this.cacheTimestamp = now;
        this.settingsSubject.next(settings);
      }),
      catchError((error) => {
        console.error('❌ Error fetching system settings:', error);
        // Return default settings (fail open - allow app to proceed)
        const defaultSettings: SystemSettings = {
          maintenanceMode: false,
          forceUpdate: false,
          maintenanceMessage: null,
          userAppVersion: null
        };
        this.settingsSubject.next(defaultSettings);
        return of(defaultSettings);
      })
    );
  }

  /**
   * Check if maintenance mode is enabled
   */
  async checkMaintenanceMode(): Promise<boolean> {
    try {
      const settings = await firstValueFrom(this.fetchSystemSettings());
      return settings?.maintenanceMode || false;
    } catch (error) {
      console.error('Error checking maintenance mode:', error);
      return false; // Fail open
    }
  }

  /**
   * Check if force update is required
   * If force update is toggled on in admin, ALWAYS show update screen (no version check)
   */
  async checkForceUpdate(): Promise<boolean> {
    try {
      console.log('🔍 ========================================');
      console.log('🔍 CHECKING FORCE UPDATE STATUS');
      console.log('🔍 ========================================');
      
      const settings = await firstValueFrom(this.fetchSystemSettings());
      console.log('📋 System settings:', settings);
      
      if (!settings?.forceUpdate) {
        console.log('✅ Force update is disabled - no update required');
        console.log('========================================');
        return false;
      }

      // Force update is enabled - ALWAYS show update screen (no version check)
      console.log('⬆️ Force update is ENABLED in admin settings');
      console.log('⬆️ Showing update screen (no version check)');
      console.log('========================================');
      return true;
    } catch (error) {
      console.error('❌ Error checking force update:', error);
      return false; // Fail open
    }
  }

  /**
   * Get maintenance message
   */
  async getMaintenanceMessage(): Promise<string> {
    try {
      const settings = await firstValueFrom(this.fetchSystemSettings());
      return settings?.maintenanceMessage || 'We are currently performing maintenance. Please check back soon.';
    } catch (error) {
      console.error('Error getting maintenance message:', error);
      return 'We are currently performing maintenance. Please check back soon.';
    }
  }

  /**
   * Get required app version
   */
  async getRequiredVersion(): Promise<string | null> {
    try {
      const settings = await firstValueFrom(this.fetchSystemSettings());
      return settings?.userAppVersion || null;
    } catch (error) {
      console.error('Error getting required version:', error);
      return null;
    }
  }

  /**
   * Get current app version
   */
  async getCurrentAppVersion(): Promise<string | null> {
    try {
      if (this.platform.is('capacitor')) {
        const appInfo = await App.getInfo();
        return appInfo.version || null;
      } else {
        // For web, return package.json version or null
        return null; // Web doesn't have app version in the same way
      }
    } catch (error) {
      console.error('Error getting current app version:', error);
      return null;
    }
  }

  /**
   * Get platform-specific store URL
   */
  getStoreUrl(): string {
    if (this.platform.is('ios')) {
      return this.IOS_STORE_URL;
    } else if (this.platform.is('android')) {
      return this.ANDROID_STORE_URL;
    } else {
      // Web fallback
      return this.ANDROID_STORE_URL;
    }
  }

  /**
   * Open app store for update
   */
  async openAppStore(): Promise<void> {
    try {
      const storeUrl = this.getStoreUrl();
      console.log('🔗 Opening store URL:', storeUrl);
      
      // Use window.open which works on both web and native Capacitor apps
      // Capacitor will handle opening the URL in the system browser
      window.open(storeUrl, '_blank');
    } catch (error) {
      console.error('Error opening app store:', error);
      // Fallback to window.open
      window.open(this.getStoreUrl(), '_blank');
    }
  }

  /**
   * Clear cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.settingsCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Get current settings (synchronous, from cache)
   */
  getCurrentSettings(): SystemSettings | null {
    return this.settingsCache;
  }
}

