import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { GeocodingService } from '../../services/geocoding.service';
import { UserService } from '../../services/user.service';
import { ModalController } from '@ionic/angular';
import { SearchModalResult } from '../search/search.page';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-pin-location',
  templateUrl: './pin-location.page.html',
  styleUrls: ['./pin-location.page.scss'],
  standalone: false,
})
export class PinLocationPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('map') mapRef!: ElementRef;

  map: GoogleMap | null = null;
  isMapReady = false;
  
  currentLat: number = 0;
  currentLng: number = 0;
  currentAddress: string = '';
  isLoadingAddress = false;
  
  // Route params
  isPickup: 'true' | 'false' | undefined;
  addressMode: 'add' | 'edit' | null = null;
  addressId: string | null = null;
  returnTo: string | null = null;
  isModalMode = false;
  
  private geocodeTimeout: any = null;
  private cameraCheckInterval: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    const params = this.route.snapshot.queryParams;
    this.currentLat = parseFloat(params['lat']) || 0;
    this.currentLng = parseFloat(params['lng']) || 0;
    this.currentAddress = params['address'] || '';
    this.isPickup = params['isPickup'] === 'true' || params['isPickup'] === 'false' ? params['isPickup'] : undefined;
    this.addressMode = params['addressMode'] === 'add' ? 'add' : params['addressMode'] === 'edit' ? 'edit' : null;
    this.addressId = params['addressId'] || null;
    this.returnTo = params['returnTo'] || null;
    this.isModalMode = params['modalMode'] === 'true';
  }

  async ngAfterViewInit() {
    if (this.currentLat && this.currentLng) {
      await this.initializeMap();
    }
  }

  ngOnDestroy() {
    if (this.geocodeTimeout) {
      clearTimeout(this.geocodeTimeout);
    }
    if (this.cameraCheckInterval) {
      clearInterval(this.cameraCheckInterval);
    }
    this.cleanupMap();
  }

  private async initializeMap() {
    if (!this.mapRef?.nativeElement) {
      return;
    }

    try {
      // Create map - simple, following Capacitor docs
      this.map = await GoogleMap.create({
        id: 'pin-location-map',
        element: this.mapRef.nativeElement || document.getElementById('pin-location-map') as HTMLElement,
        apiKey: environment.apiKey,
        config: {
          center: {
            lat: this.currentLat,
            lng: this.currentLng,
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

      this.zone.run(() => {
        this.isMapReady = true;
      });

      // Defer map operations to ensure map is fully ready (especially on Android)
      setTimeout(async () => {
        try {
          if (this.map) {
            // Critical: These operations are needed for Android map to be fully interactive
            await this.map.setMapType(MapType.Normal);
            await this.map.setCamera({
              coordinate: {
                lat: this.currentLat,
                lng: this.currentLng,
              },
              zoom: 19,
              animate: false,
            });

            // Setup map movement listener to detect center position
            this.setupMapMovementListener();

            // Initial geocode if no address
            if (!this.currentAddress) {
              this.reverseGeocode();
            }
          }
        } catch (error) {
          console.warn('Map setup operations failed (non-critical):', error);
        }
      }, 500);
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  private setupMapMovementListener() {
    // Use native Capacitor Google Maps event listeners for efficient center detection
    // This works on both web and native Android/iOS devices
    if (!this.map) return;
    
    let lastKnownLat = this.currentLat;
    let lastKnownLng = this.currentLng;
    
    // Handler function to update center position from camera idle/bounds changed events
    // Priority: Direct camera target > getMapBounds() > Web getCenter() > Bounds calculation
    const updateCenterFromBounds = async (data: any) => {
      if (!this.map) return;
      
      try {
        // Debug: Log event data structure to understand what's available
        if (data) {
          console.log('📍 Camera event data structure:', {
            hasBounds: !!data.bounds,
            hasCenter: !!data.center,
            hasTarget: !!data.target,
            hasCoordinate: !!data.coordinate,
            keys: Object.keys(data),
            data: data
          });
        }
        
        let newLat: number | null = null;
        let newLng: number | null = null;
        
        // Priority 1: Extract direct camera target/center from event data if available
        // This is the most accurate as it's the exact camera target position
        if (data?.center) {
          const center = data.center;
          if (typeof center.lat === 'number' && typeof center.lng === 'number') {
            newLat = center.lat;
            newLng = center.lng;
            console.log('✅ Using direct center from event data:', { lat: newLat, lng: newLng });
          } else if (typeof center.latitude === 'number' && typeof center.longitude === 'number') {
            newLat = center.latitude;
            newLng = center.longitude;
            console.log('✅ Using direct center (latitude/longitude) from event data:', { lat: newLat, lng: newLng });
          }
        } else if (data?.target) {
          const target = data.target;
          if (typeof target.lat === 'number' && typeof target.lng === 'number') {
            newLat = target.lat;
            newLng = target.lng;
            console.log('✅ Using direct target from event data:', { lat: newLat, lng: newLng });
          } else if (typeof target.latitude === 'number' && typeof target.longitude === 'number') {
            newLat = target.latitude;
            newLng = target.longitude;
            console.log('✅ Using direct target (latitude/longitude) from event data:', { lat: newLat, lng: newLng });
          }
        } else if (data?.coordinate) {
          const coordinate = data.coordinate;
          if (typeof coordinate.lat === 'number' && typeof coordinate.lng === 'number') {
            newLat = coordinate.lat;
            newLng = coordinate.lng;
            console.log('✅ Using direct coordinate from event data:', { lat: newLat, lng: newLng });
          } else if (typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number') {
            newLat = coordinate.latitude;
            newLng = coordinate.longitude;
            console.log('✅ Using direct coordinate (latitude/longitude) from event data:', { lat: newLat, lng: newLng });
          }
        }
        
        // Priority 2: For web platform, use Google Maps JS API getCenter() - most accurate for web
        // This provides the exact camera target that matches the pin position
        if ((!newLat || !newLng) && typeof google !== 'undefined' && google.maps && this.mapRef?.nativeElement) {
          try {
            const mapElement = this.mapRef.nativeElement;
            const mapInstance = (mapElement as any)._map;
            
            if (mapInstance && mapInstance.getCenter) {
              const center = mapInstance.getCenter();
              if (center && typeof center.lat === 'function' && typeof center.lng === 'function') {
                newLat = center.lat();
                newLng = center.lng();
                console.log('✅ Using web getCenter() API:', { lat: newLat, lng: newLng });
              }
            }
          } catch (error) {
            console.debug('Web map center access failed (non-critical):', error);
          }
        }
        
        // Priority 3: Use getMapBounds() and calculate center - should match camera target
        if ((!newLat || !newLng) && this.map) {
          try {
            const bounds = await this.map.getMapBounds();
            if (bounds && bounds.northeast && bounds.southwest) {
              // Calculate center from bounds - this should match camera target
              newLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
              newLng = (bounds.northeast.lng + bounds.southwest.lng) / 2;
              console.log('✅ Using getMapBounds() center calculation:', { 
                lat: newLat, 
                lng: newLng,
                bounds: {
                  northeast: bounds.northeast,
                  southwest: bounds.southwest
                }
              });
            }
          } catch (error) {
            console.debug('getMapBounds failed (non-critical):', error);
          }
        }
        
        // Priority 4: Fallback - Calculate center from bounds in event data
        if ((!newLat || !newLng) && data?.bounds) {
          const bounds = data.bounds;
          if (bounds.northeast && bounds.southwest) {
            // Calculate center from bounds
            newLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
            newLng = (bounds.northeast.lng + bounds.southwest.lng) / 2;
            console.log('⚠️ Using bounds calculation from event data (fallback):', { lat: newLat, lng: newLng });
          }
        }
        
        // Update coordinates if we got valid values and they're significantly different
        if (newLat && newLng && !isNaN(newLat) && !isNaN(newLng)) {
          const threshold = 0.0001;
          const latDiff = Math.abs(newLat - lastKnownLat);
          const lngDiff = Math.abs(newLng - lastKnownLng);
          
          if (latDiff > threshold || lngDiff > threshold) {
            console.log('📍 Updating coordinates:', {
              old: { lat: lastKnownLat, lng: lastKnownLng },
              new: { lat: newLat, lng: newLng },
              diff: { lat: latDiff, lng: lngDiff }
            });
            
            lastKnownLat = newLat;
            lastKnownLng = newLng;
            
            this.zone.run(() => {
              this.currentLat = newLat!;
              this.currentLng = newLng!;
            });
            
            // Trigger reverse geocoding (already debounced)
            this.reverseGeocode();
          } else {
            console.debug('📍 Coordinates unchanged (within threshold):', {
              lat: newLat,
              lng: newLng,
              diff: { lat: latDiff, lng: lngDiff }
            });
          }
        } else {
          console.warn('⚠️ Could not determine map center from any source');
        }
      } catch (error) {
        console.error('❌ Center update error:', error);
      }
    };
    
    // Set up native event listeners
    try {
      // Listen for camera idle events (fires when user stops dragging)
      this.map.setOnCameraIdleListener((data) => {
        updateCenterFromBounds(data);
      });
      
      // Also listen for bounds changed events as backup
      this.map.setOnBoundsChangedListener((data) => {
        updateCenterFromBounds(data);
      });
      
      console.log('✅ Map event listeners set up successfully');
    } catch (error) {
      console.warn('Failed to set up map event listeners, falling back to polling:', error);
      
      // Fallback to polling if event listeners fail
      // Use same priority order as updateCenterFromBounds
      const checkCenter = async () => {
        if (!this.map || !this.mapRef?.nativeElement) return;
        
        try {
          let newLat: number | null = null;
          let newLng: number | null = null;
          
          // Priority 1: For web platform, use Google Maps JS API getCenter() - most accurate
          if (typeof google !== 'undefined' && google.maps && this.mapRef?.nativeElement) {
            try {
              const mapElement = this.mapRef.nativeElement;
              const mapInstance = (mapElement as any)._map;
              
              if (mapInstance && mapInstance.getCenter) {
                const center = mapInstance.getCenter();
                if (center && typeof center.lat === 'function' && typeof center.lng === 'function') {
                  newLat = center.lat();
                  newLng = center.lng();
                  console.log('✅ [Polling] Using web getCenter() API:', { lat: newLat, lng: newLng });
                }
              }
            } catch (error) {
              console.debug('Web map center access failed (non-critical):', error);
            }
          }
          
          // Priority 2: Use getMapBounds() and calculate center
          if ((!newLat || !newLng) && this.map && typeof this.map.getMapBounds === 'function') {
            try {
              const bounds = await this.map.getMapBounds();
              if (bounds && bounds.northeast && bounds.southwest) {
                newLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
                newLng = (bounds.northeast.lng + bounds.southwest.lng) / 2;
                console.log('✅ [Polling] Using getMapBounds() center calculation:', { lat: newLat, lng: newLng });
              }
            } catch (error) {
              console.debug('getMapBounds failed (non-critical):', error);
            }
          }
          
          // Update coordinates if we got valid values
          if (newLat && newLng && !isNaN(newLat) && !isNaN(newLng)) {
            const threshold = 0.0001;
            const latDiff = Math.abs(newLat - lastKnownLat);
            const lngDiff = Math.abs(newLng - lastKnownLng);
            
            if (latDiff > threshold || lngDiff > threshold) {
              console.log('📍 [Polling] Updating coordinates:', {
                old: { lat: lastKnownLat, lng: lastKnownLng },
                new: { lat: newLat, lng: newLng },
                diff: { lat: latDiff, lng: lngDiff }
              });
              
              lastKnownLat = newLat;
              lastKnownLng = newLng;
              
              this.zone.run(() => {
                this.currentLat = newLat;
                this.currentLng = newLng;
              });
              
              this.reverseGeocode();
            }
          }
        } catch (error) {
          console.debug('Polling center check error (non-critical):', error);
        }
      };
      
      // Poll every 500ms as fallback
      this.cameraCheckInterval = setInterval(() => {
        if (this.isMapReady && this.map) {
          checkCenter();
        } else {
          if (this.cameraCheckInterval) {
            clearInterval(this.cameraCheckInterval);
          }
        }
      }, 500);
    }
  }

  private async reverseGeocode() {
    if (!this.currentLat || !this.currentLng) return;

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
        });
      }
    }, 500);
  }

  async confirmLocation() {
    if (!this.currentLat || !this.currentLng) return;

    if (this.isModalMode) {
      try {
        const modal = await this.modalController.getTop();
        if (modal && modal.component) {
          const result: SearchModalResult = {
            address: this.currentAddress,
            location: { lat: this.currentLat, lng: this.currentLng },
            isPickup: this.isPickup,
          };
          await modal.dismiss(result);
          return;
        }
      } catch (error) {
        console.warn('Error dismissing modal:', error);
      }
    }

    // Handle navigation based on context
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
      return;
    }

    if (this.returnTo === 'date-wise') {
      this.router.navigate(['/tabs/tabs/tab4/date-wise'], {
        queryParams: {
          returnTo: 'date-wise',
          isPickup: this.isPickup,
          address: this.currentAddress,
          lat: this.currentLat,
          lng: this.currentLng,
        },
      });
      return;
    }

    if (this.addressMode) {
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

    // Normal flow
    if (this.isPickup === 'true') {
      this.userService.setPickup(this.currentAddress);
    } else if (this.isPickup === 'false') {
      this.userService.setDestination(this.currentAddress);
    }

    this.router.navigate(['/tabs/tabs/tab1']);
  }

  async goBack() {
    if (this.isModalMode) {
      try {
        const modal = await this.modalController.getTop();
        if (modal && modal.component) {
          await modal.dismiss();
          return;
        }
      } catch (error) {
        console.warn('Error dismissing modal:', error);
      }
    }
    
    this.router.navigate(['/tabs/tabs/tab1']);
  }

  private async cleanupMap() {
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
