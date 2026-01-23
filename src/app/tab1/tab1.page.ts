import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  NgZone,
  OnInit,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';
import { UserService } from '../services/user.service';
import { PermissionService } from '../services/permission.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
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
  private routerSubscription: Subscription | null = null;
  private isCleanupInProgress = false;
  private isMapCreationInProgress = false;
  private previousRoute: string = '';

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private toastController: ToastController,
    private permissionService: PermissionService,
    private router: Router
  ) {}

  ngAfterViewInit() {
    // Initial map creation happens here
  }

  /**
   * Initialize map - can be called from lifecycle hooks or router events
   * This method is idempotent and safe to call multiple times
   */
  private async initializeMap(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.isMapCreationInProgress) {
      console.log('🗺️ Map initialization already in progress, skipping...');
      return;
    }

    console.log('🗺️ Tab1 initializing map...');
    
    // Always reset state to show loading overlay
    this.zone.run(() => {
      this.isMapReady = false;
      this.isLocationFetched = false;
    });

    // Always cleanup to ensure clean state (even if map doesn't exist)
    if (this.newMap) {
      console.log('🗺️ Cleaning up existing map before recreation...');
      await this.cleanupMap();
    } else {
      // Reset map-related state even if map doesn't exist
      this.newMap = undefined as any;
      this.currentLocationMarker = undefined;
      this.cabMarkers = [];
    }

    // Wait for ViewChild to be ready and verify map element exists
    const maxRetries = 5;
    let retryCount = 0;
    
    const tryCreateMap = async () => {
      // Check if mapRef and nativeElement are available
      if (!this.mapRef || !this.mapRef.nativeElement) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`🗺️ Map element not ready, retrying... (${retryCount}/${maxRetries})`);
          setTimeout(tryCreateMap, 200);
          return;
        } else {
          console.error('❌ Map element not available after retries');
          this.zone.run(() => {
            this.isMapReady = true; // Set to true to hide loading overlay
            this.isMapCreationInProgress = false;
          });
          // Toast removed - map initialization feedback not needed
          return;
        }
      }

      // Map element is ready, proceed with map creation
      console.log('🗺️ Map element ready, creating fresh map instance...');
      this.isMapCreationInProgress = true;
      this.getCurrentPosition();
    };

    // Start retry logic after a short delay to allow ViewChild to initialize
    setTimeout(tryCreateMap, 100);
  }

  async ionViewWillEnter() {
    // Backup lifecycle hook - fires before ionViewDidEnter
    console.log('🗺️ Tab1 will enter, initializing map...');
    await this.initializeMap();
  }

  async ionViewDidEnter() {
    // Primary lifecycle hook - fires after view is entered
    console.log('🗺️ Tab1 did enter, initializing map...');
    await this.initializeMap();
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
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
      this.routerSubscription = null;
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
    // Initialize previous route to track navigation direction
    this.previousRoute = this.router.url;
    
    this.initializePickupSubscription();
    this.getPickUpAddress();
    this.getDestinationAddress();
    
    // Subscribe to router events to detect navigation both TO and AWAY from tab1
    // This handles cases where ionViewDidEnter/ionViewDidLeave don't fire reliably
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const currentRoute = event.urlAfterRedirects;
        const wasOnTab1 = this.isTab1Route(this.previousRoute);
        const isOnTab1 = this.isTab1Route(currentRoute);
        
        // Navigating TO tab1 (from any other route)
        if (!wasOnTab1 && isOnTab1) {
          console.log('🗺️ Router detected navigation TO tab1:', currentRoute);
          // Small delay to ensure view is ready
          setTimeout(() => {
            this.initializeMap();
          }, 100);
        }
        
        // Navigating AWAY from tab1 (to any other route)
        if (wasOnTab1 && !isOnTab1) {
          console.log('🗺️ Router detected navigation AWAY from tab1:', currentRoute);
          // Cleanup map when leaving tab1
          this.cleanupMap();
        }
        
        // Update previous route for next navigation event
        this.previousRoute = currentRoute;
      });
  }
  
  /**
   * Helper method to check if a route is tab1
   * @param url The URL to check
   * @returns true if the URL is tab1 route, false otherwise
   */
  private isTab1Route(url: string): boolean {
    return url.includes('/tabs/tabs/tab1') || 
           url === '/tabs/tabs/tab1' ||
           url.includes('/tabs/tab1');
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
        // await this.presentToast('✅ Tab1: Map destroyed');
      } catch (error) {
        console.error('Error cleaning up map:', error);
        // await this.presentToast('❌ Tab1: Cleanup error');
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
      // Verify mapRef and nativeElement exist before creating map
      if (!this.mapRef) {
        throw new Error('Map reference (ViewChild) is not available');
      }
      
      if (!this.mapRef.nativeElement) {
        throw new Error('Map element (nativeElement) is not available. Element may not be in DOM yet.');
      }

      console.log('Creating map with coordinates:', lat, lng);
      console.log('API Key:', environment.apiKey ? 'Present' : 'Missing');
      console.log('Map ID:', environment.mapId);
      console.log('Map element available:', !!this.mapRef.nativeElement);

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
      // Toast removed - map initialization feedback not needed
    } catch (error: any) {
      console.error('Error creating map:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);

      const errorMessage =
        error?.message || error?.toString() || 'Unknown map error';
      
      // Reset map creation flag
      this.isMapCreationInProgress = false;
      
      // If error is about missing element, keep isMapReady false to show loading overlay
      // Otherwise, set to true to not block UI
      const isElementError = errorMessage.includes('not available') || 
                            errorMessage.includes('nativeElement') ||
                            errorMessage.includes('ViewChild');
      
      this.zone.run(() => {
        if (isElementError) {
          // Keep loading overlay visible for element errors - retry will happen
          this.isMapReady = false;
        } else {
          // For other errors, hide loading overlay to not block UI
          this.isMapReady = true;
        }
      });
      
      // Toast removed - map error feedback not needed
      console.error('Map Error:', errorMessage);
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
        enableHighAccuracy: true, // Use GPS, not network location
        timeout: 20000, // Increased to 20 seconds for better GPS accuracy
        maximumAge: 0, // Always get fresh location, no cache
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Location request timeout')), 25000) // Increased to 25 seconds
      );

      const coordinates = await Promise.race([locationPromise, timeoutPromise]);
      console.log('Location fetched:', coordinates);

      const { latitude, longitude, accuracy } = coordinates.coords;
      console.log('Coordinates:', latitude, longitude);
      console.log('Location accuracy:', accuracy, 'meters');

      // Validate location accuracy - warn if accuracy is poor (> 50 meters)
      if (accuracy && accuracy > 50) {
        console.warn('⚠️ Location accuracy is poor:', accuracy, 'meters. GPS may not have accurate fix.');
      }

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
        enableHighAccuracy: true, // Use GPS, not network location
        timeout: 20000, // Increased to 20 seconds for better GPS accuracy
        maximumAge: 0, // Always get fresh location, no cache
      });

      const { latitude, longitude, accuracy } = coordinates.coords;
      console.log('📍 Recenter map - Location accuracy:', accuracy, 'meters');
      
      // Validate location accuracy - warn if accuracy is poor (> 50 meters)
      if (accuracy && accuracy > 50) {
        console.warn('⚠️ Location accuracy is poor:', accuracy, 'meters. GPS may not have accurate fix.');
      }
      
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
