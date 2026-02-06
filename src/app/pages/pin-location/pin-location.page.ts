import {
  Component,
  OnInit,
  OnDestroy,
  NgZone,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { GeocodingService } from '../../services/geocoding.service';
import { UserService } from '../../services/user.service';
import { environment } from '../../../environments/environment';
import { ModalController } from '@ionic/angular';
import { SearchModalResult } from '../search/search.page';

@Component({
  selector: 'app-pin-location',
  templateUrl: './pin-location.page.html',
  styleUrls: ['./pin-location.page.scss'],
  standalone: false,
})
export class PinLocationPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('map') mapRef!: ElementRef;

  // Map properties
  map: GoogleMap | null = null;
  isMapReady = false;
  isMapInitializing = false;

  // Location properties
  initialLat: number = 0;
  initialLng: number = 0;
  currentLat: number = 0;
  currentLng: number = 0;
  currentAddress: string = '';
  isLoadingAddress = false;

  // Context properties
  isPickup: 'true' | 'false' | undefined;
  addressMode: 'add' | 'edit' | null = null;
  addressId: string | null = null;
  returnTo: string | null = null;
  isModalMode = false;

  // Debouncing
  private geocodeTimeout: any = null;
  private cameraMoveListener: any = null;
  private centerMarkerId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    // Get route params
    this.route.queryParams.subscribe((params) => {
      this.initialLat = parseFloat(params['lat']) || 0;
      this.initialLng = parseFloat(params['lng']) || 0;
      this.currentLat = this.initialLat;
      this.currentLng = this.initialLng;
      this.currentAddress = params['address'] || '';
      this.isPickup = params['isPickup'] === 'true' || params['isPickup'] === 'false' ? params['isPickup'] : undefined;
      this.addressMode = params['addressMode'] === 'add' ? 'add' : params['addressMode'] === 'edit' ? 'edit' : null;
      this.addressId = params['addressId'] || null;
      this.returnTo = params['returnTo'] || null;
      this.isModalMode = params['modalMode'] === 'true';

      // Don't initialize map here - wait for view to be ready
    });
  }

  /**
   * Initialize map after view is initialized
   */
  ngAfterViewInit() {
    // Wait for view to be fully rendered before initializing map
    setTimeout(() => {
      if (this.initialLat && this.initialLng && !this.isMapReady && !this.isMapInitializing) {
        this.initializeMap();
        
        // If no address provided, reverse geocode initial location after map is ready
        if (!this.currentAddress) {
          setTimeout(() => {
            this.reverseGeocode();
          }, 2000);
        }
      }
    }, 500);
  }

  ngOnDestroy() {
    // Clear geocoding timeout
    if (this.geocodeTimeout) {
      clearTimeout(this.geocodeTimeout);
    }

    // Remove camera listener
    if (this.cameraMoveListener) {
      this.cameraMoveListener.remove();
    }

    // Cleanup map
    this.cleanupMap();
  }

  /**
   * Initialize Google Maps
   */
  private async initializeMap() {
    if (this.isMapInitializing || this.isMapReady) {
      return;
    }

    if (!this.initialLat || !this.initialLng) {
      console.warn('Cannot initialize map: coordinates not available');
      return;
    }

    if (!this.mapRef || !this.mapRef.nativeElement) {
      console.warn('Map element not found, retrying...');
      setTimeout(() => this.initializeMap(), 500);
      return;
    }

    try {
      this.isMapInitializing = true;

      const mapElement = this.mapRef?.nativeElement || document.getElementById('pin-location-map');
      if (!mapElement) {
        console.error('Map element not found');
        this.isMapInitializing = false;
        return;
      }

      // Create map
      this.map = await GoogleMap.create({
        id: 'pin-location-map',
        element: mapElement,
        apiKey: environment.apiKey,
        config: {
          center: {
            lat: this.initialLat,
            lng: this.initialLng,
          },
          zoom: 19,
          mapId: environment.mapId,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        },
      });

      // Set map ready
      this.zone.run(() => {
        this.isMapReady = true;
        this.isMapInitializing = false;
      });

      // Defer other map operations
      setTimeout(async () => {
        try {
          if (this.map) {
            await this.map.setMapType(MapType.Normal);
            await this.map.setCamera({
              coordinate: {
                lat: this.initialLat,
                lng: this.initialLng,
              },
              zoom: 19,
              animate: false,
            });

            // Add a center marker to track the pin position
            await this.addCenterMarker();

            // Set up camera move listener
            this.setupCameraListener();
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
   * Add a center marker to track the pin position
   */
  private async addCenterMarker() {
    if (!this.map) return;

    try {
      // Remove existing marker if any
      if (this.centerMarkerId) {
        await this.map.removeMarker(this.centerMarkerId).catch(() => {});
      }

      // Add invisible marker at center to track position
      // We'll use a very small transparent marker
      this.centerMarkerId = await this.map.addMarker({
        coordinate: {
          lat: this.currentLat,
          lng: this.currentLng,
        },
        title: 'Center',
        iconSize: {
          width: 1,
          height: 1,
        },
      });
    } catch (error) {
      console.warn('Error adding center marker:', error);
    }
  }

  /**
   * Setup camera movement listener
   * Uses touch/pan events on the map element to detect when user drags the map
   */
  private async setupCameraListener() {
    if (!this.map || !this.mapRef) return;

    try {
      const mapElement = this.mapRef.nativeElement;
      if (!mapElement) return;

      // Track if user is currently dragging
      let isDragging = false;
      let dragTimeout: any = null;

      // Listen for touch/pointer events to detect map dragging
      const handleStart = () => {
        isDragging = true;
      };

      const handleEnd = () => {
        isDragging = false;
        // When user stops dragging, wait a bit then update center marker and address
        if (dragTimeout) {
          clearTimeout(dragTimeout);
        }
        dragTimeout = setTimeout(async () => {
          await this.updateCenterMarker();
        }, 300);
      };

      // Add event listeners
      mapElement.addEventListener('touchstart', handleStart, { passive: true });
      mapElement.addEventListener('touchend', handleEnd, { passive: true });
      mapElement.addEventListener('touchcancel', handleEnd, { passive: true });
      mapElement.addEventListener('mousedown', handleStart);
      mapElement.addEventListener('mouseup', handleEnd);

      // Don't poll continuously - only update when user actually drags
      // The touch events will handle user interactions

      // Store cleanup function
      this.cameraMoveListener = {
        remove: () => {
          if (dragTimeout) {
            clearTimeout(dragTimeout);
          }
          mapElement.removeEventListener('touchstart', handleStart);
          mapElement.removeEventListener('touchend', handleEnd);
          mapElement.removeEventListener('touchcancel', handleEnd);
          mapElement.removeEventListener('mousedown', handleStart);
          mapElement.removeEventListener('mouseup', handleEnd);
        }
      };
    } catch (error) {
      console.error('Error setting up camera listener:', error);
    }
  }

  /**
   * Update center coordinate from map
   * Uses Google Maps JavaScript API if available, otherwise uses fallback
   */
  private async updateCenterMarker() {
    if (!this.map || !this.mapRef) return;

    try {
      // Try to use Google Maps JavaScript API if available
      if (typeof google !== 'undefined' && google.maps && this.mapRef.nativeElement) {
        // Access the native map instance through the element
        const mapElement = this.mapRef.nativeElement;
        const mapInstance = (mapElement as any)._map;
        
        if (mapInstance && mapInstance.getCenter) {
          const center = mapInstance.getCenter();
          if (center) {
            const newLat = center.lat();
            const newLng = center.lng();

            const latDiff = Math.abs(newLat - this.currentLat);
            const lngDiff = Math.abs(newLng - this.currentLng);
            const threshold = 0.0001; // ~11 meters

            if (latDiff > threshold || lngDiff > threshold) {
              this.zone.run(() => {
                this.currentLat = newLat;
                this.currentLng = newLng;
              });

              // Update center marker
              if (this.centerMarkerId) {
                await this.map.removeMarker(this.centerMarkerId).catch(() => {});
              }
              this.centerMarkerId = await this.map.addMarker({
                coordinate: { lat: newLat, lng: newLng },
                title: 'Center',
                iconSize: { width: 1, height: 1 },
              });

              this.debouncedReverseGeocode();
              return;
            }
          }
        }
      }

      // Fallback: If JS API not available, just trigger geocoding for current coordinates
      // The coordinates will be updated based on user interaction
      this.debouncedReverseGeocode();
    } catch (error) {
      console.warn('Error updating center marker:', error);
      // Fallback: still try to geocode current coordinates
      this.debouncedReverseGeocode();
    }
  }

  /**
   * Debounced reverse geocoding
   */
  private debouncedReverseGeocode() {
    // Clear existing timeout
    if (this.geocodeTimeout) {
      clearTimeout(this.geocodeTimeout);
    }

    // Set new timeout
    this.geocodeTimeout = setTimeout(() => {
      this.reverseGeocode();
    }, 500); // Wait 500ms after user stops moving map
  }

  /**
   * Reverse geocode current center coordinate
   */
  private async reverseGeocode() {
    if (!this.currentLat || !this.currentLng) return;

    this.zone.run(() => {
      this.isLoadingAddress = true;
    });

    try {
      const address = await this.geocodingService.getAddressFromLatLng(
        this.currentLat,
        this.currentLng
      );

      this.zone.run(() => {
        this.currentAddress = address;
        this.isLoadingAddress = false;
      });
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      this.zone.run(() => {
        this.isLoadingAddress = false;
        // Keep previous address on error
      });
    }
  }

  /**
   * Confirm location selection
   */
  async confirmLocation() {
    // Ensure we have valid coordinates
    if (!this.currentLat || !this.currentLng) {
      return;
    }

    // If opened as modal, dismiss with result
    if (this.isModalMode) {
      try {
        const modal = await this.modalController.getTop();
        if (modal) {
          const result: SearchModalResult = {
            address: this.currentAddress,
            location: { lat: this.currentLat, lng: this.currentLng },
            isPickup: this.isPickup,
          };
          await this.modalController.dismiss(result);
          return;
        }
      } catch (error) {
        console.warn('Error dismissing modal:', error);
        // Fall through to router navigation
      }
    }

    // Handle returnTo navigation
    if (this.returnTo) {
      if (this.returnTo === 'tab4') {
        this.router.navigate(['/tabs/tabs/tab4'], {
          queryParams: {
            returnTo: 'tab4',
            isPickup: this.isPickup,
            address: this.currentAddress,
            lat: this.currentLat,
            lng: this.currentLng,
          },
        });
      } else if (this.returnTo === 'date-wise') {
        this.router.navigate(['/tabs/tabs/tab4/date-wise'], {
          queryParams: {
            returnTo: 'date-wise',
            isPickup: this.isPickup,
            address: this.currentAddress,
            lat: this.currentLat,
            lng: this.currentLng,
          },
        });
      }
      return;
    }

    // Address management mode
    if (this.addressMode) {
      // Navigate back to search page with updated location
      this.router.navigate(['/search'], {
        queryParams: {
          mode: this.addressMode,
          addressId: this.addressId,
          returnTo: this.returnTo,
          address: this.currentAddress,
          lat: this.currentLat,
          lng: this.currentLng,
        },
      });
      return;
    }

    // Normal flow: update UserService and navigate to tab1
    if (this.isPickup === 'true') {
      this.userService.setPickup(this.currentAddress);
    } else if (this.isPickup === 'false') {
      this.userService.setDestination(this.currentAddress);
    }

    this.router.navigate(['/tabs/tabs/tab1']);
  }

  /**
   * Go back
   */
  async goBack() {
    if (this.isModalMode) {
      try {
        const modal = await this.modalController.getTop();
        if (modal) {
          await this.modalController.dismiss();
          return;
        }
      } catch (error) {
        console.warn('Error dismissing modal:', error);
      }
    }
    
    // Fallback to router navigation
    this.router.navigate(['/search'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  /**
   * Cleanup map instance
   */
  private async cleanupMap() {
    // Remove center marker
    if (this.map && this.centerMarkerId) {
      try {
        await this.map.removeMarker(this.centerMarkerId).catch(() => {});
      } catch (error) {
        console.warn('Error removing center marker:', error);
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
}

