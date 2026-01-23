import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, LatLngBounds, MapType } from '@capacitor/google-maps';
import { interval, Subscription, firstValueFrom, take } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  RideService,
  Ride,
  RideStatus,
  Location,
  DriverInfo,
} from 'src/app/services/ride.service';
import { AlertController, Platform, ModalController, ToastController } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-active-ordere',
  templateUrl: './active-ordere.page.html',
  styleUrls: ['./active-ordere.page.scss'],
  standalone: false,
})
export class ActiveOrderePage implements OnInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map!: GoogleMap;
  private driverMarkerId!: string;
  private userMarkerId!: string;
  private destinationMarkerId!: string;
  private routeLineId!: string;
  private routePolylines: string[] = []; // Store multiple polyline IDs

  // Socket.IO subscriptions
  private rideSubscription?: Subscription;
  private rideStatusSubscription?: Subscription;
  private driverLocationSubscription?: Subscription;
  private driverETASubscription?: Subscription;
  private backButtonSubscription?: Subscription;
  private unreadCountSubscription?: Subscription;

  // Timeout references for cleanup
  private ratingTimeout?: any;
  private rateUsTimeout?: any;
  private hasShownRating = false; // Flag to prevent showing rating multiple times

  // Current ride data
  currentRide: Ride | null = null;
  driver: {
    name: string;
    rating: number;
    carNumber: string;
    carType: string;
    otp: string;
  } | null = null;

  private realDriver: DriverInfo | null = null;
  private userLocation: Location = { latitude: 0, longitude: 0 };
  private driverLocation: Location = { latitude: 0, longitude: 0 };
  private isMapInitialized = false;
  private isMapInitializing = false;
  private hasLoadedFromAPI = false;

  pickupLocation = '';
  destinationLocation = '';
  arrivalTime = '0';
  isDriverArrived = false;
  currentRideStatus: RideStatus = 'idle';
  statusText = 'Preparing...';
  isDriverModalOpen = true;
  unreadMessageCount: number = 0;

  // Rating properties
  showRating = false;
  showThankYou = false;
  showRateUs = false;
  selectedEmoji: number | null = null;
  emojis = [
    { emoji: '😊', label: 'Great', value: 5 },
    { emoji: '🙂', label: 'Good', value: 4 },
    { emoji: '😐', label: 'Okay', value: 3 },
    { emoji: '🙁', label: 'Poor', value: 2 },
    { emoji: '😞', label: 'Bad', value: 1 },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rideService: RideService,
    private alertCtrl: AlertController,
    private http: HttpClient,
    private platform: Platform,
    private modalController: ModalController,
    private ngZone: NgZone,
    private toastController: ToastController
  ) {}

  async ngOnInit() {
    // Sync ride state from backend first to ensure we have the latest state
    // This is critical for restoring rides after page navigation or browser refresh
    try {
      console.log('🔄 [ActiveOrderPage] Syncing ride state from backend...');
      await this.rideService.syncRideStateFromBackend();
      console.log('✅ [ActiveOrderPage] Ride state sync completed');
      
      // Check if we have an active ride after sync
      // If not, redirect to home page (navigation guard)
      const currentRide = await firstValueFrom(
        this.rideService.getCurrentRide().pipe(take(1))
      );
      
      if (!currentRide) {
        console.log('⚠️ [ActiveOrderPage] No active ride found after sync, redirecting to home');
        this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
        return;
      }
      
      console.log('✅ [ActiveOrderPage] Active ride found:', currentRide._id);
    } catch (error) {
      console.error('❌ [ActiveOrderPage] Error syncing ride state:', error);
      // Check if we have a ride in memory even if sync failed
      const currentRide = await firstValueFrom(
        this.rideService.getCurrentRide().pipe(take(1))
      );
      
      if (!currentRide) {
        console.log('⚠️ [ActiveOrderPage] No active ride found, redirecting to home');
        this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
        return;
      }
    }

    // Only open modal if we're actually on the active-order page
    // Check current route to ensure we're on the right page
    const currentUrl = this.router.url;
    if (currentUrl.includes('/active-ordere')) {
      this.isDriverModalOpen = true;
    }
    
    // Set up Android back button handler
    this.setupBackButtonHandler();
    
    // Get ride ID from route params (if navigated with params)
    const rideId = this.route.snapshot.paramMap.get('rideId');

    if (rideId) {
      // Fetch ride details via API
      await this.fetchRideDetailsFromAPI(rideId);
      // Initialize map after API fetch completes
      if (this.userLocation.latitude && this.userLocation.longitude) {
        await this.initializeMapIfNeeded();
      }
    }

    // Subscribe to current ride
    this.rideSubscription = this.rideService
      .getCurrentRide()
      .subscribe(async (ride) => {
        if (ride) {
          console.log('📦 Current ride:', ride);
          console.log('📦 ========================================');
          console.log('📦 RIDE OBJECT DETAILS');
          console.log('📦 ========================================');
          console.log('📦 Ride ID:', ride._id);
          console.log('📦 Status:', ride.status);
          console.log('📦 Driver:', ride.driver);
          console.log('📦 Pickup:', ride.pickupAddress);
          console.log('📦 Dropoff:', ride.dropoffAddress);
          console.log('📦 Fare:', ride.fare);
          console.log('📦 Start OTP:', ride.startOtp);
          console.log('📦 Stop OTP:', ride.stopOtp);
          console.log('========================================');

          // Check if this is a new ride (different ride ID)
          const isNewRide = this.currentRide && this.currentRide._id !== ride._id;
          if (isNewRide) {
            console.log('🆕 New ride detected, resetting rating flag');
            this.hasShownRating = false;
          }

          this.currentRide = ride;
          this.realDriver = ride.driver || null;

          // Determine which OTP to use based on status
          const rideStatus = ride.status as RideStatus;
          // Set status immediately to prevent template issues
          if (!this.hasLoadedFromAPI) {
            this.currentRideStatus = rideStatus;
          }
          
          // Update status if it has changed (from socket updates)
          if (rideStatus !== this.currentRideStatus) {
            console.log('🔄 Ride status changed from socket:', this.currentRideStatus, '->', rideStatus);
            // Reset rating flag if status changes from completed to something else
            if (this.currentRideStatus === 'completed' && rideStatus !== 'completed') {
              this.hasShownRating = false;
            }
            await this.handleRideStatusChange(rideStatus);
          }
          
          const otpToUse = (rideStatus === 'in_progress') 
            ? (ride.stopOtp || 'N/A')
            : (ride.startOtp || 'N/A');

          // Map driver data to simplified format for template
          if (ride.driver) {
            const vehicleInfo: any = ride.driver.vehicleInfo || {};
            this.driver = {
              name: ride.driver.name || 'N/A',
              rating: ride.driver.rating || 0,
              carNumber: vehicleInfo.licensePlate || 'N/A',
              carType: vehicleInfo.color && vehicleInfo.make && vehicleInfo.model
                ? `${vehicleInfo.color} ${vehicleInfo.make} ${vehicleInfo.model}`
                : (vehicleInfo.vehicleType || 'N/A'),
              otp: otpToUse,
            };
            console.log('✅ Driver OTP set from ride subscription:', this.driver.otp, 'for status:', rideStatus);
          }

          this.pickupLocation = ride.pickupAddress;
          this.destinationLocation = ride.dropoffAddress;

          // Set user location from ride
          this.userLocation = {
            latitude: ride.pickupLocation.coordinates[1],
            longitude: ride.pickupLocation.coordinates[0],
          };

          // Initialize map if not already done
          await this.initializeMapIfNeeded();

          // Join ride room for real-time messaging (when ride has driver)
          if (ride._id && ride.driver) {
            console.log('🚪 [ActiveOrderePage] Joining ride room...');
            try {
              await this.rideService.joinRideRoom(ride._id, undefined, 'User');
              console.log('✅ [ActiveOrderePage] Joined ride room successfully');
            } catch (error) {
              console.error('❌ [ActiveOrderePage] Error joining room:', error);
            }
          }

          // Fetch unread message count for this ride
          if (ride._id) {
            await this.rideService.getUnreadCountForRide(ride._id);
          }
        }
      });

    // Subscribe to ride status
    this.rideStatusSubscription = this.rideService
      .getRideStatus()
      .subscribe((status) => {
        console.log('🔄 Ride status update received:', status);
        console.log('🔄 Current status:', this.currentRideStatus);
        console.log('🔄 Has loaded from API:', this.hasLoadedFromAPI);
        
        // If we've loaded from API and receive 'idle', ignore it (it's the initial BehaviorSubject value)
        // Only ignore if we already have a valid non-idle status
        if (this.hasLoadedFromAPI && status === 'idle' && this.currentRideStatus !== 'idle') {
          console.log('⚠️ Ignoring initial idle status from subscription (already have status from API)');
          return;
        }
        
        // Don't override a valid status with idle if we have a current ride
        if (status === 'idle' && this.currentRide && this.currentRideStatus !== 'idle') {
          console.log('⚠️ Ignoring idle status update (have active ride with status:', this.currentRideStatus, ')');
          return;
        }
        
        this.handleRideStatusChange(status);
      });

    // Subscribe to driver location updates (both driverLocationUpdate and rideLocationUpdate)
    this.driverLocationSubscription = this.rideService
      .getDriverLocation()
      .subscribe((location) => {
        if (location) {
          console.log('📍 Driver location update received:', location);
          console.log('📍 Previous location:', this.driverLocation);
          console.log('📍 New location:', location);

          this.driverLocation = location;

          // Update marker on map in real-time
          this.updateDriverMarker();

          console.log('✅ Driver marker updated on map');
        }
      });

    // Subscribe to driver ETA updates
    this.driverETASubscription = this.rideService
      .getDriverETA()
      .subscribe((eta) => {
        if (eta) {
          this.arrivalTime = Math.ceil(eta).toString();
        }
      });

    // Subscribe to unread message counts
    this.unreadCountSubscription = this.rideService
      .getUnreadCounts()
      .subscribe((counts) => {
        if (this.currentRide) {
          this.unreadMessageCount = counts.get(this.currentRide._id) || 0;
        }
      });

    // Load initial ride data
    const ride = this.rideService.getCurrentRideValue();
    if (ride) {
      this.currentRide = ride;
      this.realDriver = ride.driver || null;

      // Determine which OTP to use based on status
      const rideStatus = ride.status as RideStatus;
      const otpToUse = (rideStatus === 'in_progress') 
        ? (ride.stopOtp || 'N/A')
        : (ride.startOtp || 'N/A');

      // Map driver data to simplified format for template
      if (ride.driver) {
        const vehicleInfo: any = ride.driver.vehicleInfo || {};
        this.driver = {
          name: ride.driver.name || 'N/A',
          rating: ride.driver.rating || 0,
          carNumber: vehicleInfo.licensePlate || 'N/A',
          carType: vehicleInfo.color && vehicleInfo.make && vehicleInfo.model
            ? `${vehicleInfo.color} ${vehicleInfo.make} ${vehicleInfo.model}`
            : (vehicleInfo.vehicleType || 'N/A'),
          otp: otpToUse,
        };
      }

      this.pickupLocation = ride.pickupAddress;
      this.destinationLocation = ride.dropoffAddress;

      this.userLocation = {
        latitude: ride.pickupLocation.coordinates[1],
        longitude: ride.pickupLocation.coordinates[0],
      };

      // Set initial status based on ride status
      const initialStatus = this.rideService.getRideStatus();
      initialStatus.subscribe((status) => {
        this.handleRideStatusChange(status);
      });

      await this.initializeMapIfNeeded();
    }
  }

  async   ionViewDidEnter() {
    // Ensure map is initialized when view enters
    if (!this.isMapInitialized && this.userLocation.latitude && this.userLocation.longitude) {
      await this.initializeMapIfNeeded();
    }
    
    // Only open modal if we're on the active-order page and have an active ride
    const currentUrl = this.router.url;
    if (currentUrl.includes('/active-ordere') && this.currentRide && !this.isDriverModalOpen) {
      this.isDriverModalOpen = true;
    }
  }

  ionViewWillLeave() {
    // Always close modal when leaving the page
    this.isDriverModalOpen = false;
    // Reset rating flag when leaving (for new rides)
    if (this.currentRideStatus !== 'completed') {
      this.hasShownRating = false;
    }
  }

  // ionViewDidLeave() {
  //   this.isDriverModalOpen = false;
  // }

  ngOnDestroy() {
    // Always close modal when component is destroyed
    this.isDriverModalOpen = false;
    this.isMapInitialized = false;
    this.isMapInitializing = false;
    
    // Unsubscribe from all subscriptions
    this.rideSubscription?.unsubscribe();
    this.rideStatusSubscription?.unsubscribe();
    this.driverLocationSubscription?.unsubscribe();
    this.driverETASubscription?.unsubscribe();
    this.backButtonSubscription?.unsubscribe();
    this.unreadCountSubscription?.unsubscribe();

    // Clear all timeouts
    if (this.ratingTimeout) {
      clearTimeout(this.ratingTimeout);
      this.ratingTimeout = undefined;
    }
    if (this.rateUsTimeout) {
      clearTimeout(this.rateUsTimeout);
      this.rateUsTimeout = undefined;
    }

    // Destroy map
    if (this.map) {
      this.map.destroy();
      this.map = undefined as any;
    }
    
    // Reset rating flag
    this.hasShownRating = false;
  }

  /**
   * Fetch ride details from API
   */
  private async fetchRideDetailsFromAPI(rideId: string) {
    try {
      console.log('🔍 Fetching ride details via API for ride:', rideId);

      const response = await this.http
        .get(`${environment.apiUrl}/rides/rides/${rideId}`)
        .toPromise();

      console.log('📦 ========================================');
      console.log('📦 RIDE API RESPONSE');
      console.log('📦 ========================================');
      console.log('📦 Response:', response);
      console.log('========================================');

      // Update current ride with API data
      if (response) {
        this.currentRide = response as Ride;
        
        // Set status immediately so template renders correctly
        const status = this.currentRide.status as RideStatus;
        this.currentRideStatus = status;
        
        // Determine which OTP to use based on status
        const otpToUse = (status === 'in_progress') 
          ? (this.currentRide.stopOtp || 'N/A')
          : (this.currentRide.startOtp || 'N/A');
        
        console.log('🔍 Setting OTP for status:', status, 'OTP:', otpToUse);
        
        // Process the ride data
        if (this.currentRide.driver) {
          this.realDriver = this.currentRide.driver;
          const vehicleInfo: any = this.currentRide.driver.vehicleInfo || {};
          this.driver = {
            name: this.currentRide.driver.name || 'N/A',
            rating: this.currentRide.driver.rating || 0,
            carNumber: vehicleInfo.licensePlate || 'N/A',
            carType: vehicleInfo.color && vehicleInfo.make && vehicleInfo.model
              ? `${vehicleInfo.color} ${vehicleInfo.make} ${vehicleInfo.model}`
              : (vehicleInfo.vehicleType || 'N/A'),
            otp: otpToUse,
          };
          console.log('✅ Driver OTP set to:', this.driver.otp);
          console.log('✅ Current ride status:', this.currentRideStatus);
        }

        // Set user location from ride
        if (this.currentRide.pickupLocation?.coordinates) {
          this.userLocation = {
            latitude: this.currentRide.pickupLocation.coordinates[1],
            longitude: this.currentRide.pickupLocation.coordinates[0],
          };
        }

        this.pickupLocation = this.currentRide.pickupAddress || '';
        this.destinationLocation = this.currentRide.dropoffAddress || '';

        // Mark that we've loaded from API
        this.hasLoadedFromAPI = true;

        // Set initial status (this will also update statusText and other status-related properties)
        if (this.currentRide.status) {
          this.handleRideStatusChange(status);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching ride details:', error);
      console.error('📝 Error details:', error);
    }
  }

  private async handleRideStatusChange(status: RideStatus) {
    this.currentRideStatus = status;

    switch (status) {
      case 'searching':
        this.statusText = 'Searching for Driver...';
        this.isDriverArrived = false;
        break;
      case 'accepted':
        this.statusText = 'Driver is Coming';
        this.isDriverArrived = false;
        break;
      case 'arrived':
        this.statusText = 'Driver Arrived';
        this.isDriverArrived = true;
        this.arrivalTime = '0';
        // Ensure start OTP is shown when driver arrives
        if (this.currentRide && this.driver) {
          this.driver = {
            ...this.driver,
            otp: this.currentRide.startOtp || 'N/A',
          };
        }
        break;
      case 'in_progress':
        this.statusText = 'Ride in Progress';
        this.isDriverArrived = false; // Hide OTP section during ride
        // Show stop OTP during ride
        if (this.currentRide && this.driver) {
          this.driver = {
            ...this.driver,
            otp: this.currentRide.stopOtp || 'N/A',
          };
        }
        // Add destination marker when ride starts
        await this.addDestinationMarker();
        break;
      case 'completed':
        this.statusText = 'Ride Completed';
        // Close the driver modal first
        this.isDriverModalOpen = false;
        // Only show rating if we haven't shown it yet
        if (!this.hasShownRating) {
          // Clear any existing timeout
          if (this.ratingTimeout) {
            clearTimeout(this.ratingTimeout);
          }
          // Show rating modal after 2 seconds (giving time for modal to close)
          this.ratingTimeout = setTimeout(() => {
            this.ngZone.run(() => {
              this.showRating = true;
              this.hasShownRating = true;
              console.log('⭐ Showing rating dialog');
            });
            this.ratingTimeout = undefined;
          }, 2000);
        }
        break;
      case 'cancelled':
        this.statusText = 'Ride Cancelled';
        // Navigate back to home with replaceUrl
        this.router.navigate(['/tabs/tabs/tab1'], {
          replaceUrl: true, // Clear navigation stack
        });
        break;
      default:
        this.statusText = 'Preparing...';
        break;
    }

    console.log('📊 Status updated:', status, '| Text:', this.statusText);
  }

  /**
   * Initialize map if needed (with guards to prevent duplicate initialization)
   */
  private async initializeMapIfNeeded() {
    // Prevent duplicate initialization
    if (this.isMapInitialized || this.isMapInitializing) {
      console.log('⚠️ Map already initialized or initializing, skipping...');
      return;
    }

    if (!this.userLocation.latitude || !this.userLocation.longitude) {
      console.warn('⚠️ User location not set yet, cannot initialize map');
      return;
    }

    // Check if map element exists
    const mapElement = document.getElementById('mymap');
    if (!mapElement) {
      console.warn('⚠️ Map element not found, waiting for view to be ready...');
      // Retry after a short delay
      setTimeout(() => this.initializeMapIfNeeded(), 500);
      return;
    }

    this.isMapInitializing = true;
    await this.initializeMap();
    this.isMapInitialized = true;
    this.isMapInitializing = false;
  }

  private async initializeMap() {
    if (!this.userLocation.latitude || !this.userLocation.longitude) {
      console.warn('⚠️ User location not set yet');
      return;
    }

    const mapElement = document.getElementById('mymap');
    if (!mapElement) {
      console.error('❌ Map element not found');
      return;
    }

    const mapCenter = {
      lat: this.userLocation.latitude,
      lng: this.userLocation.longitude,
    };

    const mapOptions = {
      center: mapCenter,
      zoom: 15,
      mapId: environment.mapId,
      styles: [],
    };

    try {
      this.map = await GoogleMap.create({
        id: 'active-order-map',
        element: mapElement,
        apiKey: environment.apiKey,
        config: {
          ...mapOptions,
          mapId: environment.mapId,
          
        },
      });

      console.log('✅ Active order map created');

      // Add user marker
      const userMarkerResult = await this.map.addMarker({
        coordinate: mapCenter,
        title: 'Your Location',
        snippet: 'You are here',
        iconSize: {
          width: 40,
          height: 40,
        },
        iconUrl: 'assets/user.png',
      });
      this.userMarkerId = userMarkerResult;

      // Add driver marker if driver location is available
      if (
        this.driverLocation.latitude &&
        this.driverLocation.longitude &&
        this.realDriver
      ) {
        await this.addDriverMarker();
      }
    } catch (error) {
      console.error('❌ Error creating map:', error);
      this.isMapInitializing = false;
      throw error;
    }
  }

  private async addDriverMarker() {
    if (!this.map || !this.realDriver) return;

    const driverCoord = {
      lat: this.driverLocation.latitude,
      lng: this.driverLocation.longitude,
    };

    const driverMarkerResult = await this.map.addMarker({
      coordinate: driverCoord,
      title: 'Driver Location',
      snippet: this.realDriver.name,
      iconUrl: 'assets/cab-east.png',
      iconSize: {
        width: 40,
        height: 40,
      },
    });
    this.driverMarkerId = driverMarkerResult;

    // Draw route using Google Directions API
    const userCoord = {
      lat: this.userLocation.latitude,
      lng: this.userLocation.longitude,
    };

    await this.drawRouteToTarget(driverCoord, userCoord);

    // Fit map to show both markers
    await this.map.setCamera({
      coordinate: {
        lat: (userCoord.lat + driverCoord.lat) / 2,
        lng: (userCoord.lng + driverCoord.lng) / 2,
      },
      zoom: 14,
    });
  }

  private async addDestinationMarker() {
    if (!this.map || !this.currentRide) return;

    console.log('🎯 Adding destination marker');

    // Remove existing destination marker if any
    if (this.destinationMarkerId) {
      try {
        await this.map.removeMarker(this.destinationMarkerId);
      } catch (error) {
        console.error('Error removing old destination marker:', error);
      }
    }

    const destinationCoord = {
      lat: this.currentRide.dropoffLocation.coordinates[1],
      lng: this.currentRide.dropoffLocation.coordinates[0],
    };

    console.log('🎯 Destination coordinates:', destinationCoord);

    const destinationMarkerResult = await this.map.addMarker({
      coordinate: destinationCoord,
      title: 'Destination',
      snippet: this.currentRide.dropoffAddress,
      iconUrl: 'assets/current-location.png',
      iconSize: {
        width: 40,
        height: 40,
      },
    });
    this.destinationMarkerId = destinationMarkerResult;

    console.log('✅ Destination marker added');
  }

  private async updateDriverMarker() {
    if (!this.isMapInitialized || !this.map) {
      console.warn(
        '⚠️ Cannot update driver marker - map not initialized yet'
      );
      return;
    }

    if (!this.driverLocation.latitude || !this.driverLocation.longitude) {
      console.warn(
        '⚠️ Cannot update driver marker - driver location not available'
      );
      return;
    }

    // If driver marker doesn't exist yet, create it
    if (!this.driverMarkerId && this.realDriver) {
      console.log('🆕 Creating initial driver marker');
      await this.addDriverMarker();
      return;
    }

    // Update existing marker position (using removeMarker + addMarker as workaround)
    try {
      console.log('🔄 Updating driver marker position...');

      if (this.driverMarkerId) {
        await this.map.removeMarker(this.driverMarkerId);
      }

      // Remove old route polylines
      await this.clearRoute();

      const driverCoord = {
        lat: this.driverLocation.latitude,
        lng: this.driverLocation.longitude,
      };

      console.log('📍 Driver coordinates:', driverCoord);

      // Re-add driver marker
      const driverMarkerResult = await this.map.addMarker({
        coordinate: driverCoord,
        title:
          this.currentRideStatus === 'in_progress'
            ? 'Your Ride'
            : 'Driver Location',
        snippet: this.realDriver?.name || 'Driver',
        iconUrl: 'assets/cab-east.png',
        iconSize: {
          width: 40,
          height: 40,
        },
      });
      this.driverMarkerId = driverMarkerResult;

      // Determine which location to connect based on ride status
      const targetCoord =
        this.currentRideStatus === 'in_progress'
          ? {
              // During ride, show route to destination
              lat:
                this.currentRide?.dropoffLocation.coordinates[1] ||
                this.userLocation.latitude,
              lng:
                this.currentRide?.dropoffLocation.coordinates[0] ||
                this.userLocation.longitude,
            }
          : {
              // Before ride starts, show route to pickup
              lat: this.userLocation.latitude,
              lng: this.userLocation.longitude,
            };

      console.log('🎯 Target coordinates:', targetCoord);

      // Draw route using Google Directions API
      await this.drawRouteToTarget(driverCoord, targetCoord);

      // Auto-adjust camera to show both markers (but not too frequently)
      // Only adjust every 5th update to avoid jerky camera movements
      const now = Date.now();
      if (!this.lastCameraUpdate || now - this.lastCameraUpdate > 10000) {
        this.lastCameraUpdate = now;

        // Calculate center point between driver and target
        const centerLat = (driverCoord.lat + targetCoord.lat) / 2;
        const centerLng = (driverCoord.lng + targetCoord.lng) / 2;

        // Calculate appropriate zoom level based on distance
        const latDiff = Math.abs(driverCoord.lat - targetCoord.lat);
        const lngDiff = Math.abs(driverCoord.lng - targetCoord.lng);
        const maxDiff = Math.max(latDiff, lngDiff);

        let zoom = 15;
        if (maxDiff > 0.05) zoom = 12;
        else if (maxDiff > 0.02) zoom = 13;
        else if (maxDiff > 0.01) zoom = 14;

        await this.map.setCamera({
          coordinate: {
            lat: centerLat,
            lng: centerLng,
          },
          zoom: zoom,
          animate: true,
        });

        console.log('📷 Camera adjusted to show both locations');
      }

      console.log('✅ Driver marker and route updated successfully');
    } catch (error) {
      console.error('❌ Error updating driver marker:', error);
    }
  }

  private lastCameraUpdate = 0;

  /**
   * Clear existing route polylines from map
   */
  private async clearRoute() {
    if (this.routePolylines.length > 0) {
      try {
        await this.map.removePolylines(this.routePolylines);
        this.routePolylines = [];
        console.log('🧹 Route polylines cleared');
      } catch (error) {
        console.error('Error clearing route:', error);
      }
    }
  }

  /**
   * Draw route from driver to target using Google Directions API
   */
  private async drawRouteToTarget(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ) {
    try {
      console.log('🗺️ Fetching route from Google Directions API...');
      console.log('📍 Origin:', origin);
      console.log('📍 Destination:', destination);

      // Use Google Maps JavaScript Directions Service
      const route = await this.getDirectionsRoute(origin, destination);

      if (route && route.length > 0) {
        console.log('✅ Route received with', route.length, 'points');

        // Draw the route on the map
        const polylineResult = await this.map.addPolylines([
          {
            path: route,
            strokeColor: '#0984E3',
            strokeOpacity: 0.8,
            strokeWeight: 5,
          },
        ]);

        this.routePolylines = polylineResult;
        console.log('✅ Route drawn on map');
      } else {
        console.warn('⚠️ No route found, falling back to straight line');
        // Fallback to straight line if no route found
        await this.drawStraightLine(origin, destination);
      }
    } catch (error) {
      console.error('❌ Error fetching route:', error);
      // Fallback to straight line on error
      await this.drawStraightLine(origin, destination);
    }
  }

  /**
   * Get directions route using Google Maps JavaScript API
   */
  private async getDirectionsRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<{ lat: number; lng: number }[]> {
    return new Promise((resolve, reject) => {
      // Check if Google Maps JavaScript API is loaded
      if (typeof google === 'undefined' || !google.maps) {
        console.warn('⚠️ Google Maps JavaScript API not loaded');
        reject(new Error('Google Maps API not loaded'));
        return;
      }

      const directionsService = new google.maps.DirectionsService();

      const request: google.maps.DirectionsRequest = {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        travelMode: google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          const route = result.routes[0];
          const path: { lat: number; lng: number }[] = [];

          // Extract all points from the route
          route.legs.forEach((leg) => {
            leg.steps.forEach((step) => {
              step.path.forEach((point) => {
                path.push({
                  lat: point.lat(),
                  lng: point.lng(),
                });
              });
            });
          });

          resolve(path);
        } else {
          console.warn('⚠️ Directions request failed:', status);
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
  }

  /**
   * Draw a straight line (fallback when Directions API fails)
   */
  private async drawStraightLine(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ) {
    try {
      const polylineResult = await this.map.addPolylines([
        {
          path: [origin, destination],
          strokeColor: '#0984E3',
          strokeOpacity: 0.8,
          strokeWeight: 5,
        },
      ]);
      this.routePolylines = polylineResult;
      console.log('✅ Straight line drawn as fallback');
    } catch (error) {
      console.error('❌ Error drawing straight line:', error);
    }
  }

  selectEmoji(value: number) {
    this.selectedEmoji = value;
  }

  async submitRating() {
    if (this.selectedEmoji === null) return;

    try {
      // Submit rating via Socket.IO
      await this.rideService.submitRating(this.selectedEmoji);
      console.log('⭐ Rating submitted:', this.selectedEmoji);

      // Show thank you message
      this.showRating = false;
      this.showThankYou = true;

      // Clear any existing timeout
      if (this.rateUsTimeout) {
        clearTimeout(this.rateUsTimeout);
      }
      // Navigate to home after showing thank you message
      this.rateUsTimeout = setTimeout(() => {
        this.showThankYou = false;
        this.navigateToHome();
        this.rateUsTimeout = undefined;
      }, 2000);
    } catch (error) {
      console.error('Error submitting rating:', error);
      // Even on error, navigate away
      this.navigateToHome();
    }
  }

  /**
   * Skip rating dialog and navigate to home
   */
  skipRatingDialog() {
    this.showRating = false;
    this.hasShownRating = true;
    this.navigateToHome();
  }

  /**
   * Navigate to home page
   */
  private navigateToHome() {
    this.router.navigate(['/tabs/tabs/tab1'], {
      replaceUrl: true, // Clear navigation stack
    });
  }

  rateOnStore() {
    // Here you would typically open the app store
    const storeUrl = this.isIOS()
      ? 'https://apps.apple.com/app/your-app-id'
      : 'https://play.google.com/store/apps/details?id=your.app.id';

    window.open(storeUrl, '_blank');
    this.showRateUs = false;
    // Navigate to home after opening store
    setTimeout(() => {
      this.navigateToHome();
    }, 500);
  }

  skipRating() {
    this.showRateUs = false;
    this.navigateToHome();
  }

  private isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  navigateToDriverDetails() {
    // Disabled - driver details navigation is no longer available
    // Close modal first
    // this.isDriverModalOpen = false;
    // // Small delay to ensure modal closes before navigation
    // setTimeout(() => {
    //   if (this.realDriver) {
    //     this.router.navigate(['/driver-details', this.realDriver._id]);
    //   }
    // }, 100);
  }

  callDriver() {
    // Get driver phone number from realDriver (DriverInfo has phone property)
    const phoneNumber = this.realDriver?.phone;
    
    if (!phoneNumber) {
      // Show error if phone number is not available
      this.alertCtrl.create({
        header: 'Phone Number Not Available',
        message: 'Driver phone number is not available.',
        buttons: ['OK']
      }).then(alert => alert.present());
      return;
    }

    // Open phone dialer using tel: protocol
    window.location.href = `tel:${phoneNumber}`;
  }

  async chatWithDriver() {
    if (!this.currentRide) {
      return;
    }

    // Mark messages as read before opening chat
    await this.rideService.markMessagesAsRead(this.currentRide._id);
    
    // Import the chat page component dynamically
    const { DriverChatPage } = await import('../driver-chat/driver-chat.page');
    
    // Create and present the modal
    const modal = await this.modalController.create({
      component: DriverChatPage,
      componentProps: {
        ride: this.currentRide
      },
      cssClass: 'chat-modal',
      showBackdrop: true,
      backdropDismiss: true
    });

    await modal.present();
  }

  /**
   * Set up Android back button handler
   */
  private setupBackButtonHandler() {
    if (this.platform.is('android')) {
      // Use Ionic Platform backButton Observable
      this.backButtonSubscription = this.platform.backButton.subscribe(() => {
        if (this.isDriverModalOpen) {
          // If modal is open, close it
          this.isDriverModalOpen = false;
        } else {
          // Otherwise, navigate back normally
          this.handleBackButton();
        }
      });
    }
  }

  /**
   * Handle back button click (from header or system)
   */
  handleBackButton() {
    if (this.isDriverModalOpen) {
      // Close modal if open
      this.isDriverModalOpen = false;
    } else {
      // Navigate back
      this.router.navigate(['/tabs/tab1'], {
        replaceUrl: true,
      });
    }
  }

  async triggerEmergency() {
    const alert = await this.alertCtrl.create({
      header: '🚨 Emergency Alert',
      message:
        'Are you in danger? This will immediately notify emergency services and our support team.',
      inputs: [
        {
          name: 'reason',
          type: 'radio',
          label: 'Accident',
          value: 'accident',
        },
        {
          name: 'reason',
          type: 'radio',
          label: 'Harassment',
          value: 'harassment',
        },
        {
          name: 'reason',
          type: 'radio',
          label: 'Unsafe Driving',
          value: 'unsafe_driving',
          checked: true,
        },
        {
          name: 'reason',
          type: 'radio',
          label: 'Medical Emergency',
          value: 'medical',
        },
        {
          name: 'reason',
          type: 'radio',
          label: 'Other',
          value: 'other',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Send Alert',
          role: 'confirm',
          cssClass: 'alert-button-confirm',
          handler: async (reason) => {
            try {
              // Get current location
              const location = {
                latitude: this.userLocation.latitude,
                longitude: this.userLocation.longitude,
              };

              console.log('🚨 Triggering emergency with reason:', reason);
              console.log('📍 Location:', location);

              // Trigger emergency via Socket.IO
              await this.rideService.triggerEmergency(location, reason);

              // Show success message
              const toast = await this.toastController.create({
                message: '🚨 Emergency alert sent successfully',
                duration: 3000,
                color: 'danger',
                position: 'top',
              });
              await toast.present();
            } catch (error: any) {
              console.error('❌ Error triggering emergency:', error);
              const toast = await this.toastController.create({
                message: error?.message || 'Failed to send emergency alert. Please try again.',
                duration: 3000,
                color: 'danger',
                position: 'top',
              });
              await toast.present();
            }
          },
        },
      ],
    });

    await alert.present();
  }
}
