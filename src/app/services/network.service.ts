import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';
import { Platform } from '@ionic/angular';
import { NotificationService } from './notification.service';
import { Device } from '@capacitor/device';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export interface NetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
  connectionQuality: 'good' | 'poor' | 'none';
  platform: 'ios' | 'android' | 'web';
  batteryLevel?: number;
  isCharging?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private networkStatus = new BehaviorSubject<NetworkStatus>({
    connected: true,
    connectionType: 'unknown',
    connectionQuality: 'good',
    platform: 'web'
  });

  public networkStatus$ = this.networkStatus.asObservable();
  private networkAlertShown = false;
  private cachedDeviceInfo: any = null;
  private cachedBatteryInfo: any = null;
  private isInitialized = false;
  
  // Debouncing and state management
  private previousStatus: NetworkStatus | null = null;
  private lastNotificationTime: number = 0;
  private readonly NOTIFICATION_COOLDOWN = 30000; // 30 seconds
  private connectivityCheckInProgress = false;
  private debounceTimer: any = null;
  private readonly DEBOUNCE_DELAY = 2000; // 2 seconds debounce

  constructor(
    private platform: Platform,
    private notificationService: NotificationService,
    private http: HttpClient
  ) {
    this.initializeNetworkSnapshot();
  }

  private async initializeNetworkSnapshot() {
    if (this.isInitialized) {
      console.log('⚠️ NetworkService already initialized, skipping snapshot...');
      return;
    }

    if (this.platform.is('capacitor')) {
      try {
        this.isInitialized = true;

        // Get device and battery info once
        if (!this.cachedDeviceInfo) {
          this.cachedDeviceInfo = await Device.getInfo();
        }
        if (!this.cachedBatteryInfo) {
          this.cachedBatteryInfo = await Device.getBatteryInfo();
        }

        // Single network status snapshot
        const status = await Network.getStatus();
        this.updateNetworkStatus(
          status,
          this.cachedDeviceInfo.platform,
          this.cachedBatteryInfo
        );
      } catch (e) {
        console.error('Error initializing network snapshot:', e);
      }
    }
  }

  /// Cleanup method
  public cleanup() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('🧹 NetworkService cleanup completed');
  }

  private updateNetworkStatus(status: any, platform: string, batteryInfo: any) {
    // ✅ Use cached battery info if provided batteryInfo is empty or invalid
    const battery = (batteryInfo && Object.keys(batteryInfo).length > 0 && batteryInfo.batteryLevel !== undefined)
      ? batteryInfo 
      : (this.cachedBatteryInfo || {});
    
    const newStatus: NetworkStatus = {
      connected: status.connected,
      connectionType: status.connectionType || 'unknown',
      connectionQuality: this.determineConnectionQuality(status, platform, battery),
      platform: platform as 'ios' | 'android' | 'web',
      batteryLevel: battery.batteryLevel,
      isCharging: battery.isCharging
    };

    // ✅ Update cached battery info if valid
    if (battery && Object.keys(battery).length > 0 && battery.batteryLevel !== undefined) {
      this.cachedBatteryInfo = battery;
    }

    this.networkStatus.next(newStatus);
    this.debounceNetworkChange(newStatus);
  }
  
  /**
   * Debounce network status changes to prevent rapid toggling
   */
  private debounceNetworkChange(status: NetworkStatus) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.handleNetworkChange(status);
    }, this.DEBOUNCE_DELAY);
  }
  
  /**
   * Verify actual connectivity by pinging API endpoint
   */
  private async verifyActualConnectivity(): Promise<boolean> {
    if (this.connectivityCheckInProgress) {
      return false; // Already checking, don't duplicate
    }
    
    if (!this.platform.is('capacitor')) {
      // For web platform, assume connected if network status says so
      return this.networkStatus.value.connected;
    }
    
    this.connectivityCheckInProgress = true;
    
    try {
      // Try to ping a lightweight endpoint (health check)
      const response = await Promise.race([
        this.http.get(`${environment.apiUrl}/health`).toPromise(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);
      
      this.connectivityCheckInProgress = false;
      return true;
    } catch (error) {
      this.connectivityCheckInProgress = false;
      return false;
    }
  }
  
  /**
   * Check if notification should be shown based on state and cooldown
   */
  private shouldShowNotification(newStatus: NetworkStatus): boolean {
    const now = Date.now();
    const timeSinceLastNotification = now - this.lastNotificationTime;
    
    // Don't show if within cooldown period
    if (timeSinceLastNotification < this.NOTIFICATION_COOLDOWN) {
      return false;
    }
    
    // Don't show if status hasn't actually changed
    if (this.previousStatus) {
      const statusChanged = 
        this.previousStatus.connected !== newStatus.connected ||
        this.previousStatus.connectionQuality !== newStatus.connectionQuality;
      
      if (!statusChanged) {
        return false;
      }
    }
    
    return true;
  }

  private determineConnectionQuality(status: any, platform: string, batteryInfo: any): 'good' | 'poor' | 'none' {
    if (!status.connected) return 'none';
    
    // Consider battery level for connection quality
    if (batteryInfo.batteryLevel < 0.2 && !batteryInfo.isCharging) {
      return 'poor';
    }

    // Platform-specific handling
    if (platform === 'ios') {
      // iOS specific checks
      if (status.connectionType === 'cellular') {
        // On iOS, cellular connection is generally reliable
        return 'good';
      }
    } else if (platform === 'android') {
      // Android specific checks
      if (status.connectionType === 'cellular') {
        // On Android, we can check for mobile data type
        // You can add more sophisticated checks here
        return 'good';
      }
    }

    // For WiFi connections
    if (status.connectionType === 'wifi') {
      // You can add more sophisticated WiFi quality detection here
      // For example, check signal strength on Android
      return 'good';
    }

    return 'good';
  }

  private async handleNetworkChange(status: NetworkStatus) {
    // Only proceed if notification should be shown
    if (!this.shouldShowNotification(status)) {
      this.previousStatus = { ...status };
      return;
    }
    
    // If status says connected, verify actual connectivity before showing errors
    if (status.connected) {
      // Verify actual API connectivity
      const actuallyConnected = await this.verifyActualConnectivity();
      
      if (!actuallyConnected && !this.networkAlertShown) {
        // Network status says connected but API is unreachable
        this.showNetworkAlert('Connection Issue', 'Unable to reach server. Please check your connection.');
        this.networkAlertShown = true;
        this.lastNotificationTime = Date.now();
        this.previousStatus = { ...status };
        return;
      }
      
      // If actually connected and was previously disconnected, show restored message
      if (actuallyConnected && this.networkAlertShown && this.previousStatus && !this.previousStatus.connected) {
        this.showNetworkAlert('Connection Restored', 'Your internet connection has been restored.');
        this.networkAlertShown = false;
        this.lastNotificationTime = Date.now();
        this.previousStatus = { ...status };
        return;
      }
      
      // If connected and quality is poor, show warning (but only once per cooldown)
      if (status.connectionQuality === 'poor' && (!this.previousStatus || this.previousStatus.connectionQuality !== 'poor')) {
        this.showNetworkAlert('Poor Connection', 'Your internet connection is weak. Some features may not work properly.');
        this.lastNotificationTime = Date.now();
        this.previousStatus = { ...status };
        return;
      }
      
      // If connected and quality is good, update status without notification
      this.previousStatus = { ...status };
      if (this.networkAlertShown && status.connectionQuality === 'good') {
        this.networkAlertShown = false;
      }
      return;
    }
    
    // Status says not connected
    if (!status.connected && !this.networkAlertShown) {
      // Double-check with actual connectivity verification
      const actuallyConnected = await this.verifyActualConnectivity();
      
      if (!actuallyConnected) {
        this.showNetworkAlert('No Internet Connection', 'Please check your connection and try again.');
        this.networkAlertShown = true;
        this.lastNotificationTime = Date.now();
      }
    }
    
    this.previousStatus = { ...status };
  }

  private showNetworkAlert(title: string, message: string) {
    this.notificationService.scheduleNotification({
      title,
      body: message,
      extra: {
        type: 'network',
        priority: 'high'
      }
    });
  }

  // Public methods
  public getCurrentStatus(): NetworkStatus {
    return this.networkStatus.value;
  }

  public isConnected(): boolean {
    return this.networkStatus.value.connected;
  }

  public getConnectionType(): string {
    return this.networkStatus.value.connectionType;
  }

  public getConnectionQuality(): string {
    return this.networkStatus.value.connectionQuality;
  }

  public getPlatform(): string {
    return this.networkStatus.value.platform;
  }

  public getBatteryInfo(): { level: number; isCharging: boolean } {
    return {
      level: this.networkStatus.value.batteryLevel || 0,
      isCharging: this.networkStatus.value.isCharging || false
    };
  }

  public async checkConnection(): Promise<boolean> {
    if (this.platform.is('capacitor')) {
      const status = await Network.getStatus();
      return status.connected;
    }
    return true; // Always return true for web platform
  }
} 