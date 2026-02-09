import {
  Component,
  OnInit,
  OnDestroy,
  NgZone,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef,
} from '@angular/core';
import { ToastController, ModalController, LoadingController } from '@ionic/angular';
import { UserService } from '../services/user.service';
import { GeocodingService } from '../services/geocoding.service';
import { SettingsService, VehicleServices } from '../services/settings.service';
import { RideService } from '../services/ride.service';
import { FareService, FareBreakdown } from '../services/fare.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { SearchPage, SearchModalResult } from '../pages/search/search.page';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from '../../environments/environment';
import { Geolocation } from '@capacitor/geolocation';
import { PermissionService } from '../services/permission.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('map') mapRef!: ElementRef;

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
  
  // Map and confirm mode properties
  map: GoogleMap | null = null;
  isMapReady = false;
  confirmMode: 'pickup' | 'destination' | null = null;
  confirmAddress: string = '';
  confirmLat: number = 0;
  confirmLng: number = 0;
  isLoadingAddress = false;
  mapError: string | null = null;
  showMapOnLoad = true; // Show map when page loads with current location
  
  // Stored coordinates for fare calculation (avoid re-geocoding)
  pickupCoords: { lat: number; lng: number } | null = null;
  destinationCoords: { lat: number; lng: number } | null = null;
  
  private geocodeTimeout: any = null;
  private cameraCheckInterval: any = null;
  
  // Subscriptions
  private pickupSubscription: Subscription | null = null;
  private destinationSubscription: Subscription | null = null;
  private vehicleServicesSubscription: Subscription | null = null;

  constructor(
    private zone: NgZone,
    private toastController: ToastController,
    private userService: UserService,
    private geocodingService: GeocodingService,
    private settingsService: SettingsService,
    private fareService: FareService,
    private modalController: ModalController,
    private loadingCtrl: LoadingController,
    private router: Router,
    private changeDetectorRef: ChangeDetectorRef,
    private permissionService: PermissionService
  ) {}

  ngOnInit() {
    this.initializeSubscriptions();
    this.loadVehicleServices();
    this.getCurrentLocation();
  }

  ngAfterViewInit() {
    // Wait for view to initialize, then check if we need to load map
    setTimeout(() => {
      if (this.showMapOnLoad && this.confirmLat && this.confirmLng) {
        this.waitForMapRef().then((ready) => {
          if (ready) {
            this.initializeMap();
          }
        });
      }
    }, 100);
  }

  /**
   * Get current location of the user and set as pickup address
   */
  async getCurrentLocation() {
    try {
      const permissionResult = await this.permissionService.requestLocationPermission();
      if (!permissionResult.granted) {
        // Permission denied - silently fail, user can still use search
        console.log('Location permission denied');
        return;
      }
      
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
      
      const location = { 
        lat: coordinates.coords.latitude, 
        lng: coordinates.coords.longitude 
      };
      
      this.userService.setCurrentLocation(location);
      console.log('Current location set:', location);
      
      // Geocode the location to get address
      try {
        const address = await this.geocodingService.getAddressFromLatLng(
          location.lat,
          location.lng
        );
        
        // Set as pickup address
        this.zone.run(() => {
          this.pickupAddress = address;
          this.pickupCoords = location;
          this.confirmLat = location.lat;
          this.confirmLng = location.lng;
          this.confirmAddress = address;
        });
        
        this.userService.setPickup(address);
        console.log('Pickup address set from current location:', address);
        
        // Initialize map with current location after a short delay to ensure view is ready
        setTimeout(async () => {
          const mapRefReady = await this.waitForMapRef();
          if (mapRefReady && this.showMapOnLoad) {
            await this.initializeMap();
          }
        }, 300);
        
      } catch (geocodeError) {
        console.error('Error geocoding current location:', geocodeError);
        // Still set coordinates even if geocoding fails
        this.zone.run(() => {
          this.confirmLat = location.lat;
          this.confirmLng = location.lng;
          this.pickupCoords = location;
        });
        
        // Try to initialize map anyway
        setTimeout(async () => {
          const mapRefReady = await this.waitForMapRef();
          if (mapRefReady && this.showMapOnLoad) {
            await this.initializeMap();
          }
        }, 300);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      // Don't show error to user - they can still use search
    }
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
    // Cleanup map
    this.cleanupMap();
    // Clear geocode timeout
    if (this.geocodeTimeout) {
      clearTimeout(this.geocodeTimeout);
    }
    // Clear camera check interval
    if (this.cameraCheckInterval) {
      clearInterval(this.cameraCheckInterval);
    }
  }

  ionViewDidEnter() {
    // Refresh vehicle services when entering view
    this.loadVehicleServices();
  }

  private initializeSubscriptions() {
    // Subscribe to pickup changes
    this.pickupSubscription = this.userService.pickup$.subscribe((pickup) => {
      this.zone.run(() => {
        this.pickupAddress = pickup || '';
        this.calculateFares();
      });
    });

    // Subscribe to destination changes
    this.destinationSubscription = this.userService.destination$.subscribe((destination) => {
      this.zone.run(() => {
        this.destinationAddress = destination || '';
        this.calculateFares();
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
      let lat = result.location.lat;
      let lng = result.location.lng;
      
      // Fallback to current location if search result is invalid
      if (!lat || !lng) {
        const currentLocation = this.userService.getCurrentLocation();
        if (currentLocation && currentLocation.lat) {
          lat = currentLocation.lat;
          lng = currentLocation.lng;
        } else {
          await this.presentToast('Invalid location. Please try again.');
          return;
        }
      }
      
      // Enter confirm mode with map
      this.zone.run(() => {
        this.confirmMode = type;
        this.confirmLat = lat;
        this.confirmLng = lng;
        this.confirmAddress = result.address || 'Current location';
      });
      
      // Wait for view to update
      this.changeDetectorRef.detectChanges();
      
      // Wait for mapRef to be available
      const mapRefReady = await this.waitForMapRef();
      if (!mapRefReady) {
        this.zone.run(() => {
          this.mapError = 'Map container not ready. Please try again.';
          this.isMapReady = false;
        });
        return;
      }
      
      // If map already exists, just update camera position
      if (this.map && this.isMapReady) {
        try {
          await this.map.setCamera({
            coordinate: {
              lat: lat,
              lng: lng,
            },
            zoom: 19,
            animate: true,
          });
          // Update reverse geocode
          this.reverseGeocode();
        } catch (error) {
          console.error('Error updating map camera:', error);
          // Fallback to reinitialize
          await this.initializeMap();
        }
      } else {
        // Initialize map if not already loaded
        await this.initializeMap();
      }
    }
  }

  /**
   * Wait for mapRef to be available in the DOM
   */
  private async waitForMapRef(maxAttempts = 10, interval = 100): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (this.mapRef?.nativeElement) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    return false;
  }

  onVehicleSelect(event: any) {
    this.selectedVehicle = event.detail.value;
    // Recalculate fares when vehicle changes (in case promo code applies differently)
    this.calculateFares();
  }

  /**
   * Initialize map for location confirmation
   */
  async initializeMap() {
    if (!this.mapRef?.nativeElement) {
      console.error('Map ref not available');
      this.zone.run(() => {
        this.isMapReady = false;
        this.mapError = 'Map container not ready';
      });
      return;
    }

    if (!this.confirmLat || !this.confirmLng) {
      console.error('Invalid coordinates');
      this.zone.run(() => {
        this.isMapReady = false;
        this.mapError = 'Invalid location coordinates';
      });
      return;
    }

    try {
      // Cleanup existing map
      await this.cleanupMap();
      
      // Reset error state
      this.zone.run(() => {
        this.mapError = null;
      });

      // Create map
      this.map = await GoogleMap.create({
        id: 'tab1-map',
        element: this.mapRef.nativeElement,
        apiKey: environment.apiKey,
        config: {
          center: {
            lat: this.confirmLat,
            lng: this.confirmLng,
          },
          zoom: 19,
          mapId: environment.mapId,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        },
      });

      // Set ready state AFTER map operations complete
      setTimeout(async () => {
        try {
          if (this.map) {
            await this.map.setMapType(MapType.Normal);
            await this.map.setCamera({
              coordinate: {
                lat: this.confirmLat,
                lng: this.confirmLng,
              },
              zoom: 19,
              animate: false,
            });
            this.setupMapMovementListener();
            
            this.zone.run(() => {
              this.isMapReady = true;
            });
          }
        } catch (error) {
          console.error('Map setup error:', error);
          this.zone.run(() => {
            this.isMapReady = false;
            this.mapError = 'Failed to setup map';
          });
        }
      }, 500);
      
    } catch (error) {
      console.error('Error initializing map:', error);
      this.zone.run(() => {
        this.isMapReady = false;
        this.mapError = error instanceof Error ? error.message : 'Failed to load map';
      });
    }
  }

  /**
   * Setup map movement listeners to detect center position changes
   */
  private setupMapMovementListener() {
    if (!this.map) return;
    
    let lastKnownLat = this.confirmLat;
    let lastKnownLng = this.confirmLng;
    
    const updateCenterFromBounds = async (data: any) => {
      if (!this.map) return;
      
      try {
        let newLat: number | null = null;
        let newLng: number | null = null;
        
        // Priority 1: Extract direct camera target/center from event data
        if (data?.center) {
          const center = data.center;
          if (typeof center.lat === 'number' && typeof center.lng === 'number') {
            newLat = center.lat;
            newLng = center.lng;
          } else if (typeof center.latitude === 'number' && typeof center.longitude === 'number') {
            newLat = center.latitude;
            newLng = center.longitude;
          }
        } else if (data?.target) {
          const target = data.target;
          if (typeof target.lat === 'number' && typeof target.lng === 'number') {
            newLat = target.lat;
            newLng = target.lng;
          } else if (typeof target.latitude === 'number' && typeof target.longitude === 'number') {
            newLat = target.latitude;
            newLng = target.longitude;
          }
        } else if (data?.coordinate) {
          const coordinate = data.coordinate;
          if (typeof coordinate.lat === 'number' && typeof coordinate.lng === 'number') {
            newLat = coordinate.lat;
            newLng = coordinate.lng;
          } else if (typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number') {
            newLat = coordinate.latitude;
            newLng = coordinate.longitude;
          }
        }
        
        // Priority 2: For web platform, use Google Maps JS API getCenter()
        if ((!newLat || !newLng) && typeof google !== 'undefined' && google.maps && this.mapRef?.nativeElement) {
          try {
            const mapElement = this.mapRef.nativeElement;
            const mapInstance = (mapElement as any)._map;
            
            if (mapInstance && mapInstance.getCenter) {
              const center = mapInstance.getCenter();
              if (center && typeof center.lat === 'function' && typeof center.lng === 'function') {
                newLat = center.lat();
                newLng = center.lng();
              }
            }
          } catch (error) {
            console.debug('Web map center access failed (non-critical):', error);
          }
        }
        
        // Priority 3: Use getMapBounds() and calculate center
        if ((!newLat || !newLng) && this.map) {
          try {
            const bounds = await this.map.getMapBounds();
            if (bounds && bounds.northeast && bounds.southwest) {
              newLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
              newLng = (bounds.northeast.lng + bounds.southwest.lng) / 2;
            }
          } catch (error) {
            console.debug('getMapBounds failed (non-critical):', error);
          }
        }
        
        // Priority 4: Fallback - Calculate center from bounds in event data
        if ((!newLat || !newLng) && data?.bounds) {
          const bounds = data.bounds;
          if (bounds.northeast && bounds.southwest) {
            newLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
            newLng = (bounds.northeast.lng + bounds.southwest.lng) / 2;
          }
        }
        
        // Update coordinates if we got valid values and they're significantly different
        if (newLat && newLng && !isNaN(newLat) && !isNaN(newLng)) {
          const threshold = 0.0001;
          const latDiff = Math.abs(newLat - lastKnownLat);
          const lngDiff = Math.abs(newLng - lastKnownLng);
          
          if (latDiff > threshold || lngDiff > threshold) {
            lastKnownLat = newLat;
            lastKnownLng = newLng;
            
            this.zone.run(() => {
              this.confirmLat = newLat!;
              this.confirmLng = newLng!;
            });
            
            // Trigger reverse geocoding
            this.reverseGeocode();
          }
        }
      } catch (error) {
        console.error('Center update error:', error);
      }
    };
    
    // Set up native event listeners
    try {
      this.map.setOnCameraIdleListener((data) => {
        updateCenterFromBounds(data);
      });
      
      this.map.setOnBoundsChangedListener((data) => {
        updateCenterFromBounds(data);
      });
    } catch (error) {
      console.warn('Failed to set up map event listeners, falling back to polling:', error);
      
      // Fallback to polling
      const checkCenter = async () => {
        if (!this.map || !this.mapRef?.nativeElement) return;
        
        try {
          let newLat: number | null = null;
          let newLng: number | null = null;
          
          if (typeof google !== 'undefined' && google.maps && this.mapRef?.nativeElement) {
            try {
              const mapElement = this.mapRef.nativeElement;
              const mapInstance = (mapElement as any)._map;
              
              if (mapInstance && mapInstance.getCenter) {
                const center = mapInstance.getCenter();
                if (center && typeof center.lat === 'function' && typeof center.lng === 'function') {
                  newLat = center.lat();
                  newLng = center.lng();
                }
              }
            } catch (error) {
              console.debug('Web map center access failed (non-critical):', error);
            }
          }
          
          if ((!newLat || !newLng) && this.map && typeof this.map.getMapBounds === 'function') {
            try {
              const bounds = await this.map.getMapBounds();
              if (bounds && bounds.northeast && bounds.southwest) {
                newLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
                newLng = (bounds.northeast.lng + bounds.southwest.lng) / 2;
              }
            } catch (error) {
              console.debug('getMapBounds failed (non-critical):', error);
            }
          }
          
          if (newLat && newLng && !isNaN(newLat) && !isNaN(newLng)) {
            const threshold = 0.0001;
            const latDiff = Math.abs(newLat - lastKnownLat);
            const lngDiff = Math.abs(newLng - lastKnownLng);
            
            if (latDiff > threshold || lngDiff > threshold) {
              lastKnownLat = newLat;
              lastKnownLng = newLng;
              
              this.zone.run(() => {
                this.confirmLat = newLat;
                this.confirmLng = newLng;
              });
              
              this.reverseGeocode();
            }
          }
        } catch (error) {
          console.debug('Polling center check error (non-critical):', error);
        }
      };
      
      this.cameraCheckInterval = setInterval(() => {
        if (this.isMapReady && this.map && this.confirmMode) {
          checkCenter();
        } else {
          if (this.cameraCheckInterval) {
            clearInterval(this.cameraCheckInterval);
            this.cameraCheckInterval = null;
          }
        }
      }, 500);
    }
  }

  /**
   * Reverse geocode current map center to get address
   */
  private async reverseGeocode() {
    if (!this.confirmLat || !this.confirmLng) return;

    // Clear existing timeout
    if (this.geocodeTimeout) {
      clearTimeout(this.geocodeTimeout);
    }

    // Debounce geocoding
    this.geocodeTimeout = setTimeout(async () => {
      this.zone.run(() => {
        this.isLoadingAddress = true;
      });

      try {
        const address = await this.geocodingService.getAddressFromLatLng(
          this.confirmLat,
          this.confirmLng
        );

        this.zone.run(() => {
          this.confirmAddress = address;
          this.isLoadingAddress = false;
        });
      } catch (error) {
        console.error('Error reverse geocoding:', error);
        this.zone.run(() => {
          this.isLoadingAddress = false;
        });
      }
    }, 500);
  }

  /**
   * Confirm the selected location
   */
  async confirmLocation() {
    if (!this.confirmLat || !this.confirmLng || !this.confirmAddress || !this.confirmMode) {
      return;
    }

    const address = this.confirmAddress;
    const coords = { lat: this.confirmLat, lng: this.confirmLng };

    if (this.confirmMode === 'pickup') {
      this.zone.run(() => {
        this.pickupAddress = address;
        this.pickupCoords = coords;
        this.userService.setPickup(address);
      });
    } else if (this.confirmMode === 'destination') {
      this.zone.run(() => {
        this.destinationAddress = address;
        this.destinationCoords = coords;
        this.userService.setDestination(address);
      });
    }

    // Exit confirm mode but keep map visible
    this.zone.run(() => {
      this.confirmMode = null;
      this.confirmAddress = '';
      // Keep confirmLat/Lng for map to remain visible
      // Don't set isMapReady to false - keep map visible
    });
  }

  /**
   * Cancel location confirmation and return to inputs
   */
  async cancelConfirm() {
    this.zone.run(() => {
      this.confirmMode = null;
      this.confirmAddress = '';
      // Keep map visible with current location
      // Don't clear confirmLat/Lng or isMapReady
    });
  }

  /**
   * Cleanup map instance
   */
  private async cleanupMap() {
    if (this.cameraCheckInterval) {
      clearInterval(this.cameraCheckInterval);
      this.cameraCheckInterval = null;
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

      // Use stored pickup coordinates if available (from map confirmation)
      if (this.pickupCoords) {
        pickupLocation = {
          latitude: this.pickupCoords.lat,
          longitude: this.pickupCoords.lng
        };
      } else if (currentLocation && currentLocation.lat) {
        // Use current location as pickup if available
        pickupLocation = {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng
        };
      } else {
        // Fallback: Try to geocode pickup address
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

      // Use stored destination coordinates if available (from map confirmation)
      if (this.destinationCoords) {
        dropoffLocation = {
          latitude: this.destinationCoords.lat,
          longitude: this.destinationCoords.lng
        };
      } else {
        // Fallback: Geocode dropoff address
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
      }

      if (!pickupLocation || !dropoffLocation) {
        throw new Error('Could not determine locations');
      }

      // Calculate ETAs for vehicles
      this.calculateVehicleETAs();

      // Get user ID for promo code validation (if needed in future)
      // const userId = await this.userService.getUserId();

      // Call fare calculation API
      this.fareService.calculateAllFares(
        pickupLocation,
        dropoffLocation
        // promoCode and userId can be added later if needed
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

  async goToPayment() {
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
      // Use stored coordinates if available (from map confirmation), otherwise geocode
      let dropoffLocation;
      if (this.destinationCoords) {
        dropoffLocation = { lat: this.destinationCoords.lat, lng: this.destinationCoords.lng };
      } else {
        dropoffLocation = await this.geocodingService.getLatLngFromAddress(
          this.destinationAddress
        );
      }

      // Use stored pickup coordinates if available, otherwise use current location or geocode
      let pickupLocation;
      if (this.pickupCoords) {
        pickupLocation = { lat: this.pickupCoords.lat, lng: this.pickupCoords.lng };
      } else if (currentLocation && currentLocation.lat) {
        pickupLocation = currentLocation;
      } else {
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
