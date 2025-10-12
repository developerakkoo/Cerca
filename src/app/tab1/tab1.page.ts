import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  NgZone,
  OnInit,
} from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';
import { UserService } from '../services/user.service';
import { PermissionService } from '../services/permission.service';
import { Subscription } from 'rxjs';
import { ToastController } from '@ionic/angular';

interface LatLng {
  lat: number;
  lng: number;
}

interface CabMarker {
  id: string;
  marker: any;
  position: LatLng;
  previousPosition: LatLng;
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {
  @ViewChild('map') mapRef!: ElementRef<HTMLElement>;
  newMap!: GoogleMap;
  isKeyboardOpen = false;
  pickupAddress = 'Pune, Maharashtra, India';
  destinationAddress = 'Mumbai, Maharashtra, India';
  isLocationFetched = false;
  isDragging = false;
  isMapReady = false;
  currentLocation: LatLng = { lat: 0, lng: 0 };
  private cabMarkers: CabMarker[] = [];
  private updateInterval: any;
  private currentLocationMarker: string | undefined;
  private pickupSubscription: Subscription | null = null;

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private toastController: ToastController,
    private permissionService: PermissionService
  ) {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.getCurrentPosition();
      // this.createMap(18.5213738, 73.8545071);
    }, 2000);
  }

  ionViewWillLeave() {
    this.cleanupMap();
  }

  ngOnDestroy() {
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    // this.cleanupMap();
  }

  ngOnInit() {
    this.initializePickupSubscription();
    this.getPickUpAddress();
    this.getDestinationAddress();
  }

  private initializePickupSubscription() {
    // Unsubscribe from any existing subscription
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }

    // Create new subscription
    this.pickupSubscription = this.userService.pickup$.subscribe((pickup) => {
      if (pickup) {
        this.pickupAddress = pickup;
        console.log('Pickup Address Updated:', this.pickupAddress);
        // You can add any additional logic here that needs to run when pickup address changes
        // For example, update map markers, recalculate routes, etc.
      }
    });
  }

  async presentToast(msg: string) {
    const toast = await this.toastController.create({
      message: msg,
      duration: 2000,
    });
    toast.present();
  }
  private async cleanupMap() {
    if (this.newMap) {
      await this.clearCabMarkers();
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
      await this.newMap.destroy();
      this.newMap = undefined as any;
    }
  }

  private async clearCabMarkers() {
    for (const cab of this.cabMarkers) {
      await this.newMap.removeMarker(cab.marker);
    }
    this.cabMarkers = [];
  }

  getPickUpAddress() {
    this.userService.pickup$.subscribe((pickup) => {
      this.pickupAddress = pickup;
      console.log('Pickup Address On Tab1');
      console.log(this.pickupAddress);
    });
  }

  getDestinationAddress() {
    this.userService.destination$.subscribe((destination) => {
      this.destinationAddress = destination;
    });
    console.log('Destination Address On Tab1');
    console.log(this.destinationAddress);
  }
  async createMap(lat: number, lng: number) {
    try {
      console.log('Creating map with coordinates:', lat, lng);
      console.log('API Key:', environment.apiKey ? 'Present' : 'Missing');
      console.log('Map ID:', environment.mapId);

      const newMap = await GoogleMap.create({
        id: 'my-map',
        element: this.mapRef.nativeElement,
        apiKey: environment.apiKey,
        config: {
          center: {
            lat: lat,
            lng: lng,
          },
          mapId: environment.mapId,
          zoom: 18,
        },
      });

      console.log('Map created successfully');
      this.zone.run(() => {
        this.newMap = newMap;
      });

      await this.newMap.setMapType(MapType.Normal);
      console.log('Map type set');

      await this.newMap.enableClustering();
      console.log('Clustering enabled');

      await this.newMap.enableCurrentLocation(true);
      console.log('Current location enabled');

      await this.setCurrentLocationMarker(lat, lng);
      console.log('Location marker set');

      this.zone.run(() => {
        this.isMapReady = true;
      });
      this.presentToast('Map is ready');
    } catch (error: any) {
      console.error('Error creating map:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);

      const errorMessage =
        error?.message || error?.toString() || 'Unknown map error';
      this.presentToast(`Map Error: ${errorMessage}`);

      this.zone.run(() => {
        this.isMapReady = true; // Set to true even on error to not block the UI
      });
    }
  }

  private async setCurrentLocationMarker(lat: number, lng: number) {
    if (this.currentLocationMarker) {
      await this.newMap.removeMarker(this.currentLocationMarker);
    }
    const marker = await this.newMap.addMarker({
      coordinate: { lat, lng },
      title: 'Your Location',
      snippet: 'You are here',
      iconUrl: 'assets/current-location.png',
      iconSize: { width: 48, height: 48 },
      iconAnchor: { x: 24, y: 24 },
    });
    this.currentLocationMarker = marker;
  }

  private async startCabUpdates() {
    await this.updateCabMarkers();
    this.updateInterval = setInterval(() => {
      this.zone.run(() => this.updateCabMarkers());
    }, 5000);
  }

  private async updateCabMarkers() {
    await this.clearCabMarkers();
    const numCabs = 5;
    for (let i = 0; i < numCabs; i++) {
      const cabPosition = this.generateRandomCabPosition();
      const previousPosition =
        this.cabMarkers.find((cab) => cab.id === `cab-${i}`)?.position ||
        cabPosition;
      const direction = this.calculateDirection(previousPosition, cabPosition);
      const iconUrl = this.getDirectionalCabIcon(direction);

      const cabMarker = await this.newMap.addMarker({
        coordinate: cabPosition,
        title: `Cab ${i + 1}`,
        snippet: 'Available',
        iconUrl: iconUrl,
      });

      this.cabMarkers.push({
        id: `cab-${i}`,
        marker: cabMarker,
        position: cabPosition,
        previousPosition: previousPosition,
      });
    }
  }

  private calculateDirection(previous: LatLng, current: LatLng): string {
    const dx = current.lng - previous.lng;
    const dy = current.lat - previous.lat;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return 'east';
    if (angle >= 22.5 && angle < 67.5) return 'northeast';
    if (angle >= 67.5 && angle < 112.5) return 'north';
    if (angle >= 112.5 && angle < 157.5) return 'northwest';
    if (angle >= 157.5 || angle < -157.5) return 'west';
    if (angle >= -157.5 && angle < -112.5) return 'southwest';
    if (angle >= -112.5 && angle < -67.5) return 'south';
    return 'southeast';
  }

  private getDirectionalCabIcon(direction: string): string {
    return `assets/cab-${direction}.png`;
  }

  private generateRandomCabPosition(): LatLng {
    const radius = 0.01;
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radius;
    const movementFactor = 0.0001;
    const movementAngle = Math.random() * 2 * Math.PI;
    return {
      lat:
        this.currentLocation.lat +
        distance * Math.cos(angle) +
        movementFactor * Math.cos(movementAngle),
      lng:
        this.currentLocation.lng +
        distance * Math.sin(angle) +
        movementFactor * Math.sin(movementAngle),
    };
  }

  async getCurrentPosition() {
    try {
      console.log('Starting location fetch...');

      // Check internet connectivity
      if (!navigator.onLine) {
        console.log('No internet connection detected');
        await this.presentToast(
          'No internet connection. Please check your network.'
        );
        this.notification.scheduleNotification({
          title: 'No Internet',
          body: 'Please check your internet connection.',
          extra: { type: 'error' },
        });
        return;
      }

      console.log('Internet connection OK, requesting permissions...');

      // Request location permission with proper handling
      const permissionResult =
        await this.permissionService.requestLocationPermission();
      console.log('Permission result:', permissionResult);

      if (!permissionResult.granted) {
        console.log('Permission not granted');
        this.isLocationFetched = false;

        if (!permissionResult.canAskAgain) {
          // Permission permanently denied - show settings dialog
          console.log('Permission permanently denied');
          await this.presentToast(
            'Location permission denied. Tap to open settings.'
          );
          await this.permissionService.showOpenSettingsAlert();
        } else {
          // Permission denied but can ask again
          console.log('Permission denied, can ask again');
          await this.presentToast(
            'Location permission is required to show nearby cabs.'
          );
          this.notification.scheduleNotification({
            title: 'Permission Required',
            body: 'Location access is needed to find cabs near you.',
            extra: { type: 'warning' },
          });
        }
        return;
      }

      console.log('Permission granted, fetching location...');

      // Permission granted - get location with timeout handling
      const locationPromise = Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Location request timeout')), 15000)
      );

      const coordinates = await Promise.race([locationPromise, timeoutPromise]);
      console.log('Location fetched:', coordinates);

      const { latitude, longitude } = coordinates.coords;
      console.log('Coordinates:', latitude, longitude);

      // Update current location
      this.currentLocation = { lat: latitude, lng: longitude };

      this.zone.run(async () => {
        this.isLocationFetched = true;
        console.log('Creating map...');
        await this.createMap(latitude, longitude);
        console.log('Fetching address...');
        this.pickupAddress = await this.geocodingService.getAddressFromLatLng(
          latitude,
          longitude
        );
        console.log('Address fetched:', this.pickupAddress);
        this.userService.setCurrentLocation({ lat: latitude, lng: longitude });
      });
    } catch (error: any) {
      console.error('Error getting location:', error);
      console.error('Error type:', typeof error);
      console.error('Error details:', JSON.stringify(error));
      this.isLocationFetched = false;

      // Handle specific error types
      if (error.message?.includes('timeout')) {
        console.log('Location timeout error');
        await this.presentToast(
          'Location request timed out. Please try again.'
        );
        this.notification.scheduleNotification({
          title: 'Location Timeout',
          body: 'Could not get your location in time. Please ensure GPS is enabled.',
          extra: { type: 'error' },
        });
      } else if (error.message?.includes('denied')) {
        console.log('Location denied error');
        await this.presentToast('Location access denied.');
      } else {
        console.log('Generic location error');
        await this.presentToast(
          `Location error: ${error.message || 'Unknown error'}`
        );
        this.notification.scheduleNotification({
          title: 'Location Error',
          body: 'Unable to get your current location. Please check location settings.',
          extra: { type: 'error' },
        });
      }
    }
  }

  async recenterToCurrentLocation() {
    try {
      // Check permission first
      const hasPermission =
        await this.permissionService.isLocationPermissionGranted();

      if (!hasPermission) {
        await this.presentToast(
          'Location permission required to recenter map.'
        );
        const granted =
          await this.permissionService.requestPermissionWithFallback();
        if (!granted) {
          return;
        }
      }

      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });

      const { latitude, longitude } = coordinates.coords;
      await this.setCurrentLocationMarker(latitude, longitude);
      this.currentLocation = { lat: latitude, lng: longitude };

      // Update camera to new location
      if (this.newMap) {
        await this.newMap.setCamera({
          coordinate: { lat: latitude, lng: longitude },
          zoom: 18,
        });
      }

      await this.presentToast('Location updated successfully.');
    } catch (error) {
      console.error('Error recentering map:', error);
      await this.presentToast('Unable to get current location.');
      this.notification.scheduleNotification({
        title: 'Location Error',
        body: 'Unable to recenter. Please check your location settings.',
        extra: { type: 'error' },
      });
    }
  }
}
