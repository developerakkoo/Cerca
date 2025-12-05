import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';
import { Platform } from '@ionic/angular';
import { NotificationService } from './notification.service';
import { Device } from '@capacitor/device';

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

  constructor(
    private platform: Platform,
    private notificationService: NotificationService
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

  /// Cleanup method placeholder (no listeners/intervals to clear in single-run mode)
  public cleanup() {
    console.log('🧹 NetworkService cleanup (single-run mode) - no active listeners');
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
    this.handleNetworkChange(newStatus);
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

  private handleNetworkChange(status: NetworkStatus) {
    if (!status.connected && !this.networkAlertShown) {
      this.showNetworkAlert('No Internet Connection', 'Please check your connection and try again.');
      this.networkAlertShown = true;
    } else if (status.connected && status.connectionQuality === 'poor') {
      this.showNetworkAlert('Poor Connection', 'Your internet connection is weak. Some features may not work properly.');
    } else if (status.connected && this.networkAlertShown) {
      this.showNetworkAlert('Connection Restored', 'Your internet connection has been restored.');
      this.networkAlertShown = false;
    }
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