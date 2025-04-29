import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject, Observable } from 'rxjs';
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
  private lastConnectionCheck = 0;
  private readonly CONNECTION_CHECK_INTERVAL = 5000; // 5 seconds

  constructor(
    private platform: Platform,
    private notificationService: NotificationService
  ) {
    this.initializeNetworkListener();
  }

  private async initializeNetworkListener() {
    if (this.platform.is('capacitor')) {
      // Get initial device info
      const deviceInfo = await Device.getInfo();
      const batteryInfo = await Device.getBatteryInfo();

      // Initial network status
      const status = await Network.getStatus();
      this.updateNetworkStatus(status, deviceInfo.platform, batteryInfo);

      // Listen for network status changes
      Network.addListener('networkStatusChange', async (status) => {
        const batteryInfo = await Device.getBatteryInfo();
        this.updateNetworkStatus(status, deviceInfo.platform, batteryInfo);
      });

      // Periodic connection quality check
      setInterval(async () => {
        const now = Date.now();
        if (now - this.lastConnectionCheck >= this.CONNECTION_CHECK_INTERVAL) {
          this.lastConnectionCheck = now;
          const status = await Network.getStatus();
          const batteryInfo = await Device.getBatteryInfo();
          this.updateNetworkStatus(status, deviceInfo.platform, batteryInfo);
        }
      }, this.CONNECTION_CHECK_INTERVAL);
    }
  }

  private updateNetworkStatus(status: any, platform: string, batteryInfo: any) {
    const newStatus: NetworkStatus = {
      connected: status.connected,
      connectionType: status.connectionType || 'unknown',
      connectionQuality: this.determineConnectionQuality(status, platform, batteryInfo),
      platform: platform as 'ios' | 'android' | 'web',
      batteryLevel: batteryInfo.batteryLevel,
      isCharging: batteryInfo.isCharging
    };

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