import {
  Component,
  OnInit,
  OnDestroy,
  NgZone,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { IonContent } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { PermissionService } from '../../services/permission.service';
import { ToastController, ModalController, LoadingController } from '@ionic/angular';
import { UserService } from '../../services/user.service';
import { GeocodingService } from '../../services/geocoding.service';
import { SettingsService, VehicleServices } from '../../services/settings.service';
import { RideService } from '../../services/ride.service';
import { FareService, FareBreakdown } from '../../services/fare.service';
import { MapService } from '../../services/map.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { SearchPage, SearchModalResult } from '../search/search.page';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-home-new',
  templateUrl: './home-new.page.html',
  styleUrls: ['./home-new.page.scss'],
  standalone: false,
})
export class HomeNewPage implements OnInit, OnDestroy {
  @ViewChild(IonContent, { static: false }) content!: IonContent;
  @ViewChild('map') mapRef!: ElementRef;

  // Header scroll visibility
  headerVisible = true;
  lastScrollTop = 0;

  // Map properties
  map: GoogleMap | null = null;
  isMapReady = false;
  isMapInitializing = false;

  private currentLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };
  isLocationFetched = false;
  isLoadingLocation = false;

  // Booking properties
  pickupAddress = '';
  destinationAddress = '';
  selectedVehicle: string = 'small';
  vehicleServices: VehicleServices | null = null;
  isLoadingServices = false;
  
  // Fare calculation properties
  calculatedFares: { cercaSmall?: FareBreakdown; cercaMedium?: FareBreakdown; cercaLarge?: FareBreakdown } = {};
  isCalculatingFares = false;
  fareCalculationError: string | null = null;
  private fareCalculationTimeout: any = null;
  
  // ETA properties
  vehicleETAs: { small?: string; medium?: string; large?: string } = {};
  
  // Route animation properties
  routeAnimationInProgress = false;
  basePolylineId: string | null = null;
  animatedPolylineId: string | null = null;
  pickupMarkerId: string | null = null;
  destinationMarkerId: string | null = null;
  private routeAnimationTimeout: any = null;
  
  // Computed property to show vehicle section only when both addresses are set
  get showVehicleSection(): boolean {
    return !!(this.pickupAddress && this.destinationAddress);
  }
  
  // Subscriptions
  private pickupSubscription: Subscription | null = null;
  private destinationSubscription: Subscription | null = null;
  private vehicleServicesSubscription: Subscription | null = null;

  constructor(
    private permissionService: PermissionService,
    private zone: NgZone,
    private toastController: ToastController,
    private userService: UserService,
    private geocodingService: GeocodingService,
    private settingsService: SettingsService,
    private fareService: FareService,
    private mapService: MapService,
    private modalController: ModalController,
    private loadingCtrl: LoadingController,
    private router: Router
  ) {}

  ngOnInit() {
    this.initializeSubscriptions();
    this.loadVehicleServices();
    this.getCurrentPosition();
  }

  ngOnDestroy() {
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    if (this.destinationSubscription) {
      this.destinationSubscription.unsubscribe();
    }
    if (this.vehicleServicesSubscription) {
      this.vehicleServicesSubscription.unsubscribe();
    }
    // Clear fare calculation timeout
    if (this.fareCalculationTimeout) {
      clearTimeout(this.fareCalculationTimeout);
    }
    // Clear route animation timeout
    if (this.routeAnimationTimeout) {
      clearTimeout(this.routeAnimationTimeout);
    }
    // Cleanup route animation
    this.cleanupRouteAnimation();
    // Cleanup map
    this.cleanupMap();
  }

  ionViewDidEnter() {
    // Refresh vehicle services when entering view
    this.loadVehicleServices();
  }

  onScroll(event: CustomEvent) {
    const scrollTop = event.detail.scrollTop;
    const scrollDiff = scrollTop - this.lastScrollTop;
    
    // Show header when scrolling up, hide when scrolling down
    if (scrollDiff > 10) {
      // Scrolling down
      this.headerVisible = false;
    } else if (scrollDiff < -10) {
      // Scrolling up
      this.headerVisible = true;
    }
    
    // Always show header at top
    if (scrollTop < 50) {
      this.headerVisible = true;
    }
    
    this.lastScrollTop = scrollTop;
  }

  private initializeSubscriptions() {
    // Subscribe to pickup changes
    this.pickupSubscription = this.userService.pickup$.subscribe((pickup) => {
      this.zone.run(() => {
        this.pickupAddress = pickup || '';
        this.calculateFares();
        // Update route when pickup changes
        this.triggerRouteAnimation();
      });
    });

    // Subscribe to destination changes
    this.destinationSubscription = this.userService.destination$.subscribe((destination) => {
      this.zone.run(() => {
        this.destinationAddress = destination || '';
        this.calculateFares();
        // Update route when destination changes
        this.triggerRouteAnimation();
      });
    });
  }

  private loadVehicleServices() {
    this.isLoadingServices = true;
    // Get current services from subject (may be cached)
    this.vehicleServices = this.settingsService.getCurrentVehicleServices();
    
      // Subscribe to updates
      if (!this.vehicleServicesSubscription) {
        this.vehicleServicesSubscription = this.settingsService.vehicleServices$.subscribe(
          (services) => {
            this.zone.run(() => {
              this.vehicleServices = services;
              this.isLoadingServices = false;
              // Calculate ETAs when services are loaded and addresses are set
              if (this.pickupAddress && this.destinationAddress) {
                this.calculateVehicleETAs();
              }
            });
          }
        );
      }

    // Fetch from API (will update subject)
    this.settingsService.getVehicleServices().subscribe({
      next: (services) => {
        this.zone.run(() => {
          this.vehicleServices = services;
          this.isLoadingServices = false;
          // Calculate ETAs when services are loaded and addresses are set
          if (this.pickupAddress && this.destinationAddress) {
            this.calculateVehicleETAs();
          }
        });
      },
      error: (error) => {
        console.error('Error loading vehicle services:', error);
        this.zone.run(() => {
          this.isLoadingServices = false;
        });
      }
    });
  }

  async getCurrentPosition() {
    this.isLoadingLocation = true;
    try {
      console.log('Starting location fetch...');

      if (!navigator.onLine) {
        await this.presentToast('No internet connection.');
        this.isLoadingLocation = false;
        return;
      }

      const permissionResult = await this.permissionService.requestLocationPermission();
      
      if (!permissionResult.granted) {
        this.isLoadingLocation = false;
        if (!permissionResult.canAskAgain) {
          await this.presentToast('Location permission denied. Tap to open settings.');
          await this.permissionService.showOpenSettingsAlert();
        } else {
          await this.presentToast('Location permission is required.');
        }
        return;
      }

      // Get location
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });

      const { latitude, longitude, accuracy } = coordinates.coords;
      
      // Update state
      this.currentLocation = { lat: latitude, lng: longitude };
      this.userService.setCurrentLocation({ lat: latitude, lng: longitude });
      
      // Geocode
      try {
        const address = await this.geocodingService.getAddressFromLatLng(latitude, longitude);
        this.zone.run(() => {
          this.pickupAddress = address;
          this.userService.setPickup(address);
          this.isLocationFetched = true;
          this.isLoadingLocation = false;
        });
        
        // Initialize map after location is fetched
        await this.initializeMap();
        
        // Add pickup marker at current location
        if (this.map && this.isMapReady) {
          await this.addPickupMarkerAtCurrentLocation();
        }
      } catch (geocodeError) {
        console.error('Error geocoding address:', geocodeError);
        this.isLoadingLocation = false;
        // Still try to initialize map even if geocoding fails
        await this.initializeMap();
        if (this.map && this.isMapReady) {
          await this.addPickupMarkerAtCurrentLocation();
        }
      }

    } catch (error: any) {
      console.error('Error getting location:', error);
      this.isLoadingLocation = false;
      await this.presentToast('Could not fetch location.');
    }
  }

  async onInputFocus(type: 'pickup' | 'destination') {
    const modal = await this.modalController.create({
      component: SearchPage,
      componentProps: {
        pickup: type === 'pickup' ? this.pickupAddress : '',
        destination: type === 'destination' ? this.destinationAddress : '',
        isPickup: type === 'pickup' ? 'true' : 'false',
      },
      showBackdrop: true,
      backdropDismiss: true,
      cssClass: 'search-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    
      if (data) {
        const result: SearchModalResult = data;
        if (type === 'pickup') {
          this.zone.run(() => {
            this.pickupAddress = result.address;
            this.userService.setPickup(result.address);
          });
          // Update pickup marker when address changes
          if (this.map && this.isMapReady) {
            await this.updatePickupMarker();
          }
        } else {
          this.zone.run(() => {
            this.destinationAddress = result.address;
            this.userService.setDestination(result.address);
          });
        }
        // Route will be updated automatically via subscription
      }
    }

  onVehicleSelect(event: any) {
    this.selectedVehicle = event.detail.value;
    // Recalculate fares when vehicle changes (in case promo code applies differently)
    this.calculateFares();
  }

  /**
   * Calculate driver ETA based on vehicle type
   * Returns estimated time in minutes as a string
   */
  calculateDriverETA(vehicleType: string): string {
    // Base ETA ranges (can be enhanced with real driver data)
    const etaRanges: { [key: string]: { min: number; max: number } } = {
      small: { min: 2, max: 4 },
      medium: { min: 3, max: 5 },
      large: { min: 4, max: 6 }
    };
    
    const range = etaRanges[vehicleType] || { min: 3, max: 5 };
    const eta = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    
    return `${eta} min`;
  }

  /**
   * Calculate ETAs for all vehicle types
   */
  private calculateVehicleETAs() {
    if (this.vehicleServices) {
      if (this.vehicleServices.cercaSmall?.enabled) {
        this.vehicleETAs.small = this.calculateDriverETA('small');
      }
      if (this.vehicleServices.cercaMedium?.enabled) {
        this.vehicleETAs.medium = this.calculateDriverETA('medium');
      }
      if (this.vehicleServices.cercaLarge?.enabled) {
        this.vehicleETAs.large = this.calculateDriverETA('large');
      }
    }
  }

  /**
   * Calculate fares for all vehicle types when pickup/destination changes
   * Uses debouncing to avoid excessive API calls
   */
  private calculateFares() {
    // Clear existing timeout
    if (this.fareCalculationTimeout) {
      clearTimeout(this.fareCalculationTimeout);
    }

    // Check if we have both pickup and destination addresses
    if (!this.pickupAddress || !this.destinationAddress) {
      // Clear calculated fares and ETAs if addresses are incomplete
      this.calculatedFares = {};
      this.vehicleETAs = {};
      this.fareCalculationError = null;
      return;
    }

    // Debounce fare calculation (wait 500ms after user stops typing)
    this.fareCalculationTimeout = setTimeout(() => {
      this.performFareCalculation();
      // Trigger route animation after fare calculation
      this.triggerRouteAnimation();
    }, 500);
  }

  /**
   * Perform the actual fare calculation API call
   */
  private async performFareCalculation() {
    try {
      this.isCalculatingFares = true;
      this.fareCalculationError = null;

      const currentLocation = this.userService.getCurrentLocation();
      
      // Get coordinates for pickup and dropoff
      let pickupLocation: { latitude: number; longitude: number } | null = null;
      let dropoffLocation: { latitude: number; longitude: number } | null = null;

      // Use current location as pickup if available
      if (currentLocation && currentLocation.lat) {
        pickupLocation = {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng
        };
      } else {
        // Try to geocode pickup address
        try {
          const geocodedPickup = await this.geocodingService.getLatLngFromAddress(this.pickupAddress);
          if (geocodedPickup) {
            pickupLocation = {
              latitude: geocodedPickup.lat,
              longitude: geocodedPickup.lng
            };
          }
        } catch (error) {
          console.error('Error geocoding pickup:', error);
        }
      }

      // Geocode dropoff address
      try {
        const geocodedDropoff = await this.geocodingService.getLatLngFromAddress(this.destinationAddress);
        if (geocodedDropoff) {
          dropoffLocation = {
            latitude: geocodedDropoff.lat,
            longitude: geocodedDropoff.lng
          };
        }
      } catch (error) {
        console.error('Error geocoding dropoff:', error);
      }

      if (!pickupLocation || !dropoffLocation) {
        throw new Error('Could not determine locations');
      }

      // Calculate ETAs for vehicles
      this.calculateVehicleETAs();

      // Call fare calculation API
      this.fareService.calculateAllFares(
        pickupLocation,
        dropoffLocation
      ).subscribe({
        next: (response) => {
          this.zone.run(() => {
            if (response.success && response.data.fares) {
              this.calculatedFares = response.data.fares;
              this.fareCalculationError = null;
              // Recalculate ETAs when fares are successfully calculated
              this.calculateVehicleETAs();
            } else {
              this.fareCalculationError = 'Failed to calculate fares';
              this.calculatedFares = {};
            }
            this.isCalculatingFares = false;
          });
        },
        error: (error) => {
          console.error('Error calculating fares:', error);
          this.zone.run(() => {
            this.fareCalculationError = 'Error calculating fares';
            this.calculatedFares = {};
            this.isCalculatingFares = false;
          });
        }
      });
    } catch (error) {
      console.error('Error in fare calculation:', error);
      this.zone.run(() => {
        this.fareCalculationError = 'Error calculating fares';
        this.calculatedFares = {};
        this.isCalculatingFares = false;
      });
    }
  }

  async bookRide() {
    if (!this.pickupAddress || !this.destinationAddress) {
      return;
    }

    const currentLocation = this.userService.getCurrentLocation();
    
    // Show loading
    const loading = await this.loadingCtrl.create({
      message: 'Preparing booking...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Get dropoff coordinates
      const dropoffLocation = await this.geocodingService.getLatLngFromAddress(
        this.destinationAddress
      );

      // Use current location as pickup if available, otherwise try to geocode pickup address
      let pickupLocation = currentLocation;
      if (!pickupLocation || !pickupLocation.lat) {
        const geocodedPickup = await this.geocodingService.getLatLngFromAddress(this.pickupAddress);
        if (geocodedPickup) {
          pickupLocation = { lat: geocodedPickup.lat, lng: geocodedPickup.lng };
        }
      }

      if (!pickupLocation || !pickupLocation.lat || !dropoffLocation) {
        throw new Error('Could not determine locations');
      }

      const distanceInKm = this.calculateDistance(
        pickupLocation.lat,
        pickupLocation.lng,
        dropoffLocation.lat,
        dropoffLocation.lng
      );

      this.userService.setPendingRideDetails({
        pickupAddress: this.pickupAddress,
        dropoffAddress: this.destinationAddress,
        selectedVehicle: this.selectedVehicle,
        pickupLocation: {
          latitude: pickupLocation.lat,
          longitude: pickupLocation.lng,
        },
        dropoffLocation: {
          latitude: dropoffLocation.lat,
          longitude: dropoffLocation.lng,
        },
        distanceInKm: distanceInKm,
      });

      await loading.dismiss();
      this.router.navigate(['/payment'], {
        queryParams: { vehicle: this.selectedVehicle },
      });

    } catch (error) {
      await loading.dismiss();
      console.error('Error preparing booking:', error);
      await this.presentToast('Could not calculate route. Please check addresses.');
    }
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const R = 6371; // Earth's radius in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Initialize Google Maps
   */
  private async initializeMap() {
    // Prevent multiple simultaneous initializations
    if (this.isMapInitializing || this.isMapReady) {
      return;
    }

    // Check if we have location
    if (!this.currentLocation.lat || !this.currentLocation.lng) {
      console.warn('Cannot initialize map: location not available');
      return;
    }

    // Check if map element exists
    if (!this.mapRef || !this.mapRef.nativeElement) {
      console.warn('Map element not found, retrying...');
      setTimeout(() => this.initializeMap(), 500);
      return;
    }

    try {
      this.isMapInitializing = true;

      const mapElement = this.mapRef?.nativeElement || document.getElementById('home-new-map');
      if (!mapElement) {
        console.error('Map element not found');
        this.isMapInitializing = false;
        return;
      }

      // Create map
      this.map = await GoogleMap.create({
        id: 'home-new-map',
        element: mapElement,
        apiKey: environment.apiKey,
        config: {
          center: {
            lat: this.currentLocation.lat,
            lng: this.currentLocation.lng,
          },
          zoom: 18,
          mapId: environment.mapId,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        },
      });

      // Set map ready immediately
      this.zone.run(() => {
        this.isMapReady = true;
        this.isMapInitializing = false;
      });

      // Defer other map operations
      setTimeout(async () => {
        try {
          if (this.map) {
            await this.map.setMapType(MapType.Normal);
            await this.map.enableCurrentLocation(false);
            await this.map.setCamera({
              coordinate: {
                lat: this.currentLocation.lat,
                lng: this.currentLocation.lng,
              },
              zoom: 18,
              animate: false,
            });
          }
        } catch (error) {
          console.warn('Map operations failed (non-critical):', error);
        }
      }, 500);

    } catch (error) {
      console.error('Error initializing map:', error);
      this.zone.run(() => {
        this.isMapInitializing = false;
        this.isMapReady = true;
      });
    }
  }

  /**
   * Add pickup marker at current location
   */
  private async addPickupMarkerAtCurrentLocation() {
    if (!this.map || !this.isMapReady || !this.currentLocation.lat) {
      return;
    }

    try {
      // Remove existing pickup marker if any
      if (this.pickupMarkerId) {
        await this.map.removeMarker(this.pickupMarkerId).catch(() => {});
      }

      // Add pickup marker at current location
      const markerId = await this.map.addMarker({
        coordinate: {
          lat: this.currentLocation.lat,
          lng: this.currentLocation.lng,
        },
        title: 'Pickup',
        snippet: this.pickupAddress || 'Your location',
        iconUrl: 'assets/icon/home.png',
        iconSize: {
          width: 32,
          height: 32,
        },
      });

      this.pickupMarkerId = markerId;
    } catch (error) {
      console.error('Error adding pickup marker:', error);
    }
  }

  /**
   * Update pickup marker when address changes
   */
  private async updatePickupMarker() {
    if (!this.map || !this.isMapReady || !this.pickupAddress) {
      return;
    }

    try {
      // Geocode the new pickup address
      const geocodedPickup = await this.geocodingService.getLatLngFromAddress(this.pickupAddress);
      if (!geocodedPickup) {
        return;
      }

      // Remove existing pickup marker
      if (this.pickupMarkerId) {
        await this.map.removeMarker(this.pickupMarkerId).catch(() => {});
      }

      // Add new pickup marker at geocoded location
      const markerId = await this.map.addMarker({
        coordinate: {
          lat: geocodedPickup.lat,
          lng: geocodedPickup.lng,
        },
        title: 'Pickup',
        snippet: this.pickupAddress,
        iconUrl: 'assets/icon/home.png',
        iconSize: {
          width: 32,
          height: 32,
        },
      });

      this.pickupMarkerId = markerId;
    } catch (error) {
      console.error('Error updating pickup marker:', error);
    }
  }

  /**
   * Trigger route animation when both pickup and destination are selected
   */
  private async triggerRouteAnimation() {
    // Clear existing timeout
    if (this.routeAnimationTimeout) {
      clearTimeout(this.routeAnimationTimeout);
    }

    // Check prerequisites
    if (!this.pickupAddress || !this.destinationAddress || !this.map || !this.isMapReady) {
      return;
    }

    // Check if Google Maps JavaScript API is loaded
    if (typeof google === 'undefined' || !google.maps) {
      console.warn('Google Maps JavaScript API not loaded, skipping route animation');
      return;
    }

    // Debounce route animation (wait 300ms after addresses are set)
    this.routeAnimationTimeout = setTimeout(async () => {
      try {
        // Get coordinates for both locations
        const currentLocation = this.userService.getCurrentLocation();
        
        let pickupCoords: { lat: number; lng: number } | null = null;
        let destCoords: { lat: number; lng: number } | null = null;

        // Geocode pickup address (can be different from current location)
        try {
          const geocodedPickup = await this.geocodingService.getLatLngFromAddress(this.pickupAddress);
          if (geocodedPickup) {
            pickupCoords = { lat: geocodedPickup.lat, lng: geocodedPickup.lng };
          }
        } catch (error) {
          console.error('Error geocoding pickup for route animation:', error);
        }

        // Geocode destination address
        try {
          const geocodedDest = await this.geocodingService.getLatLngFromAddress(this.destinationAddress);
          if (geocodedDest) {
            destCoords = { lat: geocodedDest.lat, lng: geocodedDest.lng };
          }
        } catch (error) {
          console.error('Error geocoding destination for route animation:', error);
        }

        if (pickupCoords && destCoords && this.map) {
          // Cleanup previous route and markers
          await this.cleanupRouteAnimation();

          // Set animation in progress
          this.zone.run(() => {
            this.routeAnimationInProgress = true;
          });

          // Fetch and animate route with markers
          const result = await this.mapService.fetchAndAnimateRoute(
            this.map,
            pickupCoords,
            destCoords,
            {
              addMarkers: true,
              pickupAddress: this.pickupAddress,
              destinationAddress: this.destinationAddress,
            }
          );

          // Store polyline and marker IDs
          this.basePolylineId = result.basePolylineId;
          this.animatedPolylineId = result.animatedPolylineId;
          
          // Update marker IDs (pickup marker might be replaced by route animation)
          if (result.pickupMarkerId) {
            // Remove old pickup marker if it exists
            if (this.pickupMarkerId && this.pickupMarkerId !== result.pickupMarkerId) {
              await this.map.removeMarker(this.pickupMarkerId).catch(() => {});
            }
            this.pickupMarkerId = result.pickupMarkerId;
          }
          this.destinationMarkerId = result.destinationMarkerId || null;

          // Animation complete
          this.zone.run(() => {
            this.routeAnimationInProgress = false;
          });
        }
      } catch (error) {
        console.error('Error animating route:', error);
        this.zone.run(() => {
          this.routeAnimationInProgress = false;
        });
      }
    }, 300);
  }

  /**
   * Cleanup route animation and remove polylines and markers
   */
  private async cleanupRouteAnimation() {
    try {
      // Cancel any ongoing animations
      if (this.map) {
        await this.mapService.cancelAnimation(this.map);
      }

      // Remove polylines
      const polylineIds: string[] = [];
      if (this.basePolylineId) {
        polylineIds.push(this.basePolylineId);
      }
      if (this.animatedPolylineId) {
        polylineIds.push(this.animatedPolylineId);
      }

      if (polylineIds.length > 0 && this.map) {
        await this.mapService.removeRoute(this.map, polylineIds);
      }

      // Remove destination marker (keep pickup marker)
      if (this.destinationMarkerId && this.map) {
        await this.mapService.removeMarkers(this.map, [this.destinationMarkerId]);
      }

      // Reset state
      this.basePolylineId = null;
      this.animatedPolylineId = null;
      this.destinationMarkerId = null;
      this.routeAnimationInProgress = false;
    } catch (error) {
      console.error('Error cleaning up route animation:', error);
    }
  }

  /**
   * Cleanup map instance
   */
  private async cleanupMap() {
    // Cleanup route animation first
    await this.cleanupRouteAnimation();

    // Remove pickup marker
    if (this.pickupMarkerId && this.map) {
      try {
        await this.map.removeMarker(this.pickupMarkerId);
      } catch (error) {
        console.error('Error removing pickup marker:', error);
      }
    }

    if (this.map) {
      try {
        await this.map.destroy();
        this.map = null;
        this.isMapReady = false;
      } catch (error) {
        console.error('Error cleaning up map:', error);
      }
    }
  }

  async presentToast(msg: string) {
    try {
      const toast = await this.toastController.create({
        message: msg,
        duration: 2000,
        position: 'bottom',
      });
      await toast.present();
    } catch (error) {
      console.error('Error presenting toast:', error);
    }
  }
}

