import { Injectable } from '@angular/core';
import { Geolocation, PermissionStatus } from '@capacitor/geolocation';
import { Platform, AlertController } from '@ionic/angular';
import { BehaviorSubject, Observable } from 'rxjs';

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
}

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private locationPermissionSubject = new BehaviorSubject<boolean>(false);
  public locationPermission$ = this.locationPermissionSubject.asObservable();

  constructor(
    private platform: Platform,
    private alertController: AlertController
  ) {}

  /**
   * Check and request location permission with proper handling for all states
   */
  async requestLocationPermission(): Promise<PermissionResult> {
    try {
      // First check current permission status
      let permission = await Geolocation.checkPermissions();
      
      // If already granted, return success
      if (permission.location === 'granted') {
        this.locationPermissionSubject.next(true);
        return { 
          granted: true, 
          canAskAgain: true,
          status: 'granted'
        };
      }
      
      // If prompt or prompt-with-rationale, request permission
      if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
        permission = await Geolocation.requestPermissions();
        
        if (permission.location === 'granted') {
          this.locationPermissionSubject.next(true);
          return { 
            granted: true, 
            canAskAgain: true,
            status: 'granted'
          };
        }
      }
      
      // If denied, determine if we can ask again
      if (permission.location === 'denied') {
        this.locationPermissionSubject.next(false);
        
        // Try to request again to check if it's permanently denied
        const retryPermission = await Geolocation.requestPermissions();
        
        // If still denied after retry, it's permanently denied
        const canAskAgain = retryPermission.location !== 'denied';
        
        return { 
          granted: false, 
          canAskAgain,
          status: 'denied'
        };
      }
      
      // Default fallback
      this.locationPermissionSubject.next(false);
      return { 
        granted: false, 
        canAskAgain: false,
        status: permission.location as any
      };
      
    } catch (error) {
      console.error('Error requesting location permission:', error);
      this.locationPermissionSubject.next(false);
      return { 
        granted: false, 
        canAskAgain: false,
        status: 'denied'
      };
    }
  }

  /**
   * Check current location permission status without requesting
   */
  async checkLocationPermission(): Promise<PermissionStatus> {
    try {
      return await Geolocation.checkPermissions();
    } catch (error) {
      console.error('Error checking location permission:', error);
      return { location: 'denied', coarseLocation: 'denied' };
    }
  }

  /**
   * Show alert to open app settings when permission is permanently denied
   */
  async showOpenSettingsAlert(): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Location Permission Required',
      message: 'Location access is required to use this app. Please enable location permission in your device settings.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            return false;
          }
        },
        {
          text: 'Open Settings',
          handler: async () => {
            await this.openAppSettings();
            return true;
          }
        }
      ]
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  /**
   * Open app settings page
   */
  async openAppSettings(): Promise<void> {
    try {
      if (this.platform.is('ios')) {
        // iOS - open app settings
        window.open('app-settings:');
      } else if (this.platform.is('android')) {
        // Android - open app details settings
        const packageName = 'io.techlapse.Cerca';
        window.open(`intent://settings/application_details?package=${packageName}#Intent;scheme=android-app;end`);
      } else {
        // Web fallback
        console.log('Cannot open settings on web platform');
      }
    } catch (error) {
      console.error('Error opening app settings:', error);
    }
  }

  /**
   * Request permission with user-friendly error handling
   */
  async requestPermissionWithFallback(): Promise<boolean> {
    const result = await this.requestLocationPermission();
    
    if (result.granted) {
      return true;
    }
    
    // If permission denied and can't ask again, show settings dialog
    if (!result.canAskAgain) {
      await this.showOpenSettingsAlert();
    }
    
    return false;
  }

  /**
   * Get current permission status as boolean
   */
  async isLocationPermissionGranted(): Promise<boolean> {
    const permission = await this.checkLocationPermission();
    return permission.location === 'granted';
  }

  /**
   * Get observable of location permission status
   */
  getLocationPermissionStatus(): Observable<boolean> {
    return this.locationPermission$;
  }
}

