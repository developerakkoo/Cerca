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
  private destinationSubscription: Subscription | null = null;
  private isCleanupInProgress = false;
  private isMapCreationInProgress = false;

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private toastController: ToastController,
    private permissionService: PermissionService
  ) {}

  ngAfterViewInit() {
    // Initial map creation happens here
  }

  async ionViewDidEnter() {
    // Recreate map when entering the view
    console.log('🗺️ Tab1 entered, initializing map...');
    await this.presentToast('🗺️ Tab1: Entering view');

    // Force cleanup first to ensure clean state
    if (this.newMap) {
      console.log('🗺️ Cleaning up existing map before recreation...');
      await this.presentToast('🗺️ Tab1: Cleaning old map...');
      await this.cleanupMap();
    }

    setTimeout(async () => {
      console.log('🗺️ Creating fresh map instance...');
      await this.presentToast('🗺️ Tab1: Creating new map...');
      this.getCurrentPosition();
    }, 500);
  }

  async ionViewDidLeave() {
    console.log('🗺️ Tab1 leaving, cleaning up map...');
    // Don't show toast when navigating away (it can be annoying)
    // await this.presentToast('🗺️ Tab1: Leaving, destroying map');
    await this.cleanupMap();
  }

  ngOnDestroy() {
    // Unsubscribe from all subscriptions
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
      this.pickupSubscription = null;
    }
    if (this.destinationSubscription) {
      this.destinationSubscription.unsubscribe();
      this.destinationSubscription = null;
    }

    // Clear interval if it exists
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Cleanup map as fallback (in case ionViewWillLeave wasn't called)
    //this.cleanupMap();
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
  private clearUpdateInterval() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('✅ Update interval cleared');
    }
  }

  private async cleanupMap() {
    if (this.newMap) {
      try {
        await this.clearCabMarkers();
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
        }
        await this.newMap.destroy();
        this.newMap = undefined as any;
        this.isMapReady = false;
        this.isLocationFetched = false;
        // Clear marker references
        this.currentLocationMarker = undefined;
        this.cabMarkers = [];
        console.log('🗺️ Map cleaned up successfully');
        await this.presentToast('✅ Tab1: Map destroyed');
      } catch (error) {
        console.error('Error cleaning up map:', error);
        await this.presentToast('❌ Tab1: Cleanup error');
        // Reset flags and clear marker references anyway
        this.newMap = undefined as any;
        this.isMapReady = false;
        this.isLocationFetched = false;
        this.currentLocationMarker = undefined;
        this.cabMarkers = [];
      }
    }
  }


  private async clearCabMarkers() {
    if (!this.newMap) {
      this.cabMarkers = [];
      return;
    }

    for (const cab of this.cabMarkers) {
      try {
        await this.newMap.removeMarker(cab.marker);
      } catch (error) {
        console.log('Marker already removed or invalid:', cab.id);
        // Continue with other markers
      }
    }
    this.cabMarkers = [];
  }

  getPickUpAddress() {
    // Unsubscribe from existing subscription if any
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    // Store subscription for cleanup
    this.pickupSubscription = this.userService.pickup$.subscribe((pickup) => {
      this.pickupAddress = pickup;
      console.log('Pickup Address On Tab1');
      console.log(this.pickupAddress);
    });
  }

  getDestinationAddress() {
    // Unsubscribe from existing subscription if any
    if (this.destinationSubscription) {
      this.destinationSubscription.unsubscribe();
    }
    // Store subscription for cleanup
    this.destinationSubscription = this.userService.destination$.subscribe((destination) => {
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
        id: 'map', // Unique ID for tab1 page
        element: this.mapRef.nativeElement,
        apiKey: environment.apiKey,

        config: {
          fullscreenControl:false,
          mapTypeControl:false,
          streetViewControl:false,
          zoomControl:false,
          gestureHandling:'greedy',
          keyboardShortcuts:false,
          scrollwheel:false,
          disableDoubleClickZoom:true,
          androidLiteMode:false,
          
          center: {
            lat: lat,
            lng: lng,
          },
          mapId: environment.mapId,
          zoom: 18,
          colorScheme: 'dark',
        },
      });

      console.log('Map created successfully');

      // Use local newMap variable for operations to avoid TypeScript issues
      await newMap.setMapType(MapType.Normal);
      console.log('Map type set');

      // await newMap.enableClustering();
      // console.log('Clustering enabled');

      // Disable native current location to use accurate GPS coordinates instead
      // The native location might use less accurate network-based location
      await newMap.enableCurrentLocation(false);
      console.log('Native current location disabled - using accurate GPS coordinates');

      // Explicitly set camera to accurate location to ensure map centers correctly
      await newMap.setCamera({
        coordinate: { lat: lat, lng: lng },
        zoom: 18,
        animate: false,
      });
      console.log('Camera set to accurate location:', lat, lng);

      // Assign to instance variable after operations
      this.zone.run(() => {
        this.newMap = newMap;
      });

      await this.setCurrentLocationMarker(lat, lng);
      console.log('Location marker set at accurate coordinates');

      this.zone.run(() => {
        this.isMapReady = true;
        // Reset flag after successful map creation
        this.isMapCreationInProgress = false;
      });
      await this.presentToast('✅ Tab1: Map created & ready!');
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
    // Only try to remove marker if it exists and map is valid
    if (this.currentLocationMarker && this.newMap) {
      try {
        await this.newMap.removeMarker(this.currentLocationMarker);
      } catch (error) {
        console.log('Previous location marker already removed or invalid');
        // Continue to add new marker
      }
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

  // Disabled: Cab updates interval is not used and causes performance issues
  // If needed in the future, ensure proper lifecycle management:
  // - Start in ionViewDidEnter after map is ready
  // - Stop in ionViewDidLeave and cleanupMap
  // - Clear interval in ngOnDestroy
  /*
  private async startCabUpdates() {
    // Ensure interval is cleared before starting new one
    this.clearUpdateInterval();
    
    if (!this.newMap || !this.isMapReady) {
      console.log('⚠️ Cannot start cab updates: map not ready');
      return;
    }
    
    await this.updateCabMarkers();
    this.updateInterval = setInterval(() => {
      if (this.newMap && this.isMapReady) {
      this.zone.run(() => this.updateCabMarkers());
      } else {
        // Map destroyed, stop interval
        this.clearUpdateInterval();
      }
    }, 5000);
  }
  */

  // private async updateCabMarkers() {
  //   await this.clearCabMarkers();
  //   const numCabs = 5;
  //   for (let i = 0; i < numCabs; i++) {
  //     const cabPosition = this.generateRandomCabPosition();
  //     const previousPosition =
  //       this.cabMarkers.find((cab) => cab.id === `cab-${i}`)?.position ||
  //       cabPosition;
  //     const direction = this.calculateDirection(previousPosition, cabPosition);
  //     const iconUrl = this.getDirectionalCabIcon(direction);

  //     const cabMarker = await this.newMap.addMarker({
  //       coordinate: cabPosition,
  //       title: `Cab ${i + 1}`,
  //       snippet: 'Available',
  //       iconUrl: iconUrl,
  //     });

  //     this.cabMarkers.push({
  //       id: `cab-${i}`,
  //       marker: cabMarker,
  //       position: cabPosition,
  //       previousPosition: previousPosition,
  //     });
  //   }
  // }

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
      // Using longer timeout to allow GPS to get accurate fix
      const locationPromise = Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000, // Increased to 15 seconds for better GPS accuracy
        maximumAge: 0, // Always get fresh location, no cache
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Location request timeout')), 20000) // Increased to 20 seconds
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
        timeout: 15000, // Increased to 15 seconds for better GPS accuracy
        maximumAge: 0, // Always get fresh location, no cache
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
