import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { ActivatedRoute, Router, NavigationStart } from '@angular/router';
import { GoogleMap, LatLngBounds, MapType } from '@capacitor/google-maps';
import { interval, Subscription, firstValueFrom, take } from 'rxjs';
import { filter } from 'rxjs/operators';
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
import { RideShareService } from 'src/app/services/ride-share.service';
import {
  computePickupWaitPreview,
  DEFAULT_PICKUP_WAIT_POLICY_PREVIEW,
} from 'src/app/utils/pickup-wait-preview.util';
import { SearchPage, SearchModalResult } from '../search/search.page';

@Component({
  selector: 'app-active-ordere',
  templateUrl: './active-ordere.page.html',
  styleUrls: ['./active-ordere.page.scss'],
  standalone: false,
})
export class ActiveOrderePage implements OnInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map!: GoogleMap;
  private modalElement: HTMLElement | null = null;
  private driverMarkerId?: string;
  private userMarkerId?: string;
  private destinationMarkerId?: string;
  private routeLineId!: string;
  private routePolylines: string[] = []; // Store multiple polyline IDs
  private modalObserver?: MutationObserver;
  private modalCheckInterval?: any;

  // Socket.IO subscriptions
  private rideSubscription?: Subscription;
  private rideStatusSubscription?: Subscription;
  private driverLocationSubscription?: Subscription;
  private driverETASubscription?: Subscription;
  private backButtonSubscription?: Subscription;
  private unreadCountSubscription?: Subscription;
  private routerSubscription?: Subscription;

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

  /** Serializes native map driver-marker ops to prevent overlapping remove/add → duplicate cabs. */
  private driverMarkerOpChain: Promise<void> = Promise.resolve();
  private lastDriverMarkerLat = 0;
  private lastDriverMarkerLng = 0;
  private lastRouteRedrawAt = 0;
  private lastRouteDriverLat = 0;
  private lastRouteDriverLng = 0;
  private lastRouteTargetKey = '';
  private lastCameraUpdate = 0;
  private static readonly DRIVER_MARKER_DEDUP_METERS = 12;
  private static readonly ROUTE_REDRAW_MIN_INTERVAL_MS = 20_000;
  private static readonly ROUTE_REDRAW_MOVE_METERS = 80;

  pickupLocation = '';
  destinationLocation = '';
  arrivalTime = '0';
  isDriverArrived = false;
  currentRideStatus: RideStatus = 'idle';
  statusText = 'Preparing...';
  isDriverModalOpen = true;
  unreadMessageCount: number = 0;
  isSharing: boolean = false;
  emergencyTriggered: boolean = false;

  /** Live pickup-wait estimate while status is arrived (server bill is computed at ride start). */
  pickupWaitChargePreview = 0;
  pickupWaitFreeRemainingSec: number | null = null;
  private pickupWaitTickerSub?: Subscription;

  get pickupWaitFreeMinPart(): number {
    if (this.pickupWaitFreeRemainingSec == null) return 0;
    return Math.floor(this.pickupWaitFreeRemainingSec / 60);
  }

  get pickupWaitFreeSecPart(): number {
    if (this.pickupWaitFreeRemainingSec == null) return 0;
    return this.pickupWaitFreeRemainingSec % 60;
  }

  /** INSTANT rides only; active until completed/cancelled. */
  get canChangeDestination(): boolean {
    if (!this.currentRide || this.isViewOnlyMode) return false;
    const bt = this.currentRide.bookingType || 'INSTANT';
    if (bt !== 'INSTANT') return false;
    const s = this.currentRide.status;
    return ['requested', 'accepted', 'arrived', 'in_progress'].includes(s);
  }

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

  // Navigation tracking
  fromBookings = false; // Track if navigated from Bookings tab
  isViewOnlyMode = false; // Track if viewing past ride (read-only)

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rideService: RideService,
    private alertCtrl: AlertController,
    private http: HttpClient,
    private platform: Platform,
    private modalController: ModalController,
    private ngZone: NgZone,
    private toastController: ToastController,
    private rideShareService: RideShareService
  ) {}

  async ngOnInit() {
    // Check navigation state to determine source
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as any || {};
    this.fromBookings = state['fromBookings'] === true;

    // Get ride ID from route params FIRST (if viewing past ride)
    const rideId = this.route.snapshot.paramMap.get('rideId');

    // If rideId is provided, fetch it first (supports viewing past/completed rides)
    if (rideId) {
      console.log('🔍 [ActiveOrderPage] RideId in route params, fetching ride details...');
      try {
        await this.fetchRideDetailsFromAPI(rideId);
        
        // Check if this is a completed/cancelled ride (view-only mode)
        if (this.currentRide && 
            (this.currentRide.status === 'completed' || this.currentRide.status === 'cancelled')) {
          this.isViewOnlyMode = true;
          console.log('📖 [ActiveOrderPage] Viewing past ride in read-only mode:', this.currentRide.status);
          // Don't join socket rooms for past rides - just display data
        } else {
          // Active ride - proceed with normal flow
          this.isViewOnlyMode = false;
        }
        
        // Initialize map after API fetch completes
        if (this.userLocation.latitude && this.userLocation.longitude) {
          await this.initializeMapIfNeeded();
        }
        
        // Set up back button handler
        this.setupBackButtonHandler();
        
        // Setup modal pointer-events fix
        this.setupModalPointerEventsFix();
        
        // Only open modal for active rides
        if (!this.isViewOnlyMode) {
          this.isDriverModalOpen = true;
        }
        
        return; // Skip active ride sync check since we have rideId
      } catch (error) {
        console.error('❌ [ActiveOrderPage] Error fetching ride details:', error);
        // If fetch fails, redirect to home or bookings based on source
        if (this.fromBookings) {
          this.router.navigate(['/tabs/tabs/tab2'], { replaceUrl: true });
        } else {
          this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
        }
        return;
      }
    }

    // No rideId in route - check for active ride (normal flow)
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
        this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
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
        this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
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
    
    // Setup modal pointer-events fix for header clickability
    this.setupModalPointerEventsFix();

    // Listen for navigation events to close modal
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationStart))
      .subscribe((event: NavigationStart) => {
        const currentUrl = this.router.url;
        const targetUrl = event.url;
        
        // If navigating away from active-order page, close modal
        if (currentUrl.includes('/active-ordere') && !targetUrl.includes('/active-ordere')) {
          this.isDriverModalOpen = false;
          // Also dismiss any open modals (chat modal)
          this.modalController.dismiss();
        }
      });

    // Check if we should show rating modal (e.g., after payment completion)
    const showRatingParam = this.route.snapshot.queryParamMap.get('showRating');
    if (showRatingParam === 'true' && !this.hasShownRating) {
      // Wait a bit for ride state to load, then show rating
      setTimeout(() => {
        this.ngZone.run(() => {
          if (this.currentRide && this.currentRideStatus === 'completed') {
            this.showRating = true;
            this.hasShownRating = true;
            console.log('⭐ Showing rating dialog from query param');
          }
        });
      }, 1000);
    }

    // Subscribe to current ride
    this.rideSubscription = this.rideService
      .getCurrentRide()
      .subscribe(async (ride) => {
        if (ride) {
          const priorRide = this.currentRide;
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

          // Drop-off moved (socket / API): refresh marker + route
          if (
            priorRide &&
            priorRide._id === ride._id &&
            priorRide.dropoffLocation?.coordinates &&
            ride.dropoffLocation?.coordinates
          ) {
            const pc = priorRide.dropoffLocation.coordinates;
            const nc = ride.dropoffLocation.coordinates;
            if (pc[0] !== nc[0] || pc[1] !== nc[1]) {
              if (rideStatus === 'in_progress' || this.destinationMarkerId) {
                await this.addDestinationMarker();
                await this.updateDriverMarker({ forceRoute: true });
              }
            }
          }

          // Initialize map if not already done
          await this.initializeMapIfNeeded();

          // Join ride room immediately for event reception (only for active rides, not view-only mode)
          if (ride._id && !this.isViewOnlyMode) {
            console.log('🚪 [ActiveOrderePage] Joining ride room...');
            const rideIdStr = String(ride._id);
            try {
              await this.rideService.joinRideRoom(rideIdStr, undefined, 'User');
              console.log('✅ [ActiveOrderePage] Joined ride room successfully');
            } catch (error) {
              console.error('❌ [ActiveOrderePage] Error joining room:', error);
              // Retry after a short delay
              setTimeout(async () => {
                try {
                  await this.rideService.joinRideRoom(rideIdStr, undefined, 'User');
                  console.log('✅ [ActiveOrderePage] Retry: Joined ride room successfully');
                } catch (retryError) {
                  console.error('❌ [ActiveOrderePage] Retry: Error joining room:', retryError);
                }
              }, 2000);
            }
          } else if (this.isViewOnlyMode) {
            console.log('📖 [ActiveOrderePage] View-only mode - skipping socket room join');
          }

          // Fetch unread message count for this ride
          if (ride._id) {
            await this.rideService.getUnreadCountForRide(ride._id);
          }

          this.syncPickupWaitTicker();
        } else {
          this.stopPickupWaitTicker();
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

          // Update marker on map in real-time (serialized + throttled inside)
          void this.updateDriverMarker();

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

  async ionViewDidEnter() {
    console.log('🔄 [ActiveOrderPage] ionViewDidEnter - Re-establishing connections');
    
    // Ensure map is initialized when view enters
    if (!this.isMapInitialized && this.userLocation.latitude && this.userLocation.longitude) {
      await this.initializeMapIfNeeded();
    }
    
    // Only open modal if we're on the active-order page and have an active ride
    const currentUrl = this.router.url;
    if (currentUrl.includes('/active-ordere') && this.currentRide && !this.isDriverModalOpen) {
      this.isDriverModalOpen = true;
    }
    
    // Re-establish socket connections if we have an active ride
    if (this.currentRide && !this.isViewOnlyMode) {
      const rideId = this.currentRide._id;
      
      // Re-join ride room to receive events
      try {
        console.log('🚪 [ActiveOrderPage] Re-joining ride room:', rideId);
        await this.rideService.joinRideRoom(rideId != null ? String(rideId) : '', undefined, 'User');
        console.log('✅ [ActiveOrderPage] Re-joined ride room successfully');
      } catch (error) {
        console.error('❌ [ActiveOrderPage] Error re-joining room:', error);
      }
      
      // Refresh ride state from backend to get latest data
      try {
        console.log('🔄 [ActiveOrderPage] Refreshing ride state from backend');
        await this.fetchRideDetailsFromAPI(rideId);
        console.log('✅ [ActiveOrderPage] Ride state refreshed');
      } catch (error) {
        console.error('❌ [ActiveOrderPage] Error refreshing ride state:', error);
      }
      
      // Fetch unread message count
      try {
        await this.rideService.getUnreadCountForRide(rideId);
      } catch (error) {
        console.error('❌ [ActiveOrderPage] Error fetching unread count:', error);
      }
    }
  }

  ionViewWillLeave() {
    // Close modal immediately
    this.isDriverModalOpen = false;
    
    // Dismiss any open modals (chat modal, etc.)
    this.modalController.dismiss();
    
    // Keep room membership across page transitions; server auto-rejoin logic
    // and session continuity are more important than aggressive leave/join churn.
    
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
    this.routerSubscription?.unsubscribe();
    this.stopPickupWaitTicker();

    // Clear all timeouts
    if (this.ratingTimeout) {
      clearTimeout(this.ratingTimeout);
      this.ratingTimeout = undefined;
    }
    if (this.rateUsTimeout) {
      clearTimeout(this.rateUsTimeout);
      this.rateUsTimeout = undefined;
    }

    // Cleanup modal observer and interval
    if (this.modalObserver) {
      this.modalObserver.disconnect();
    }
    if (this.modalCheckInterval) {
      clearInterval(this.modalCheckInterval);
    }
    
    // Remove overlay if it exists
    const overlay = document.getElementById('header-click-overlay');
    if (overlay) {
      overlay.remove();
    }

    // Destroy map
    if (this.map) {
      this.map.destroy();
      this.map = undefined as any;
    }
    this.resetMapOverlayState();

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
        .get(`${environment.apiUrl}/api/rides/${rideId}`)
        .toPromise();

      console.log('📦 ========================================');
      console.log('📦 RIDE API RESPONSE');
      console.log('📦 ========================================');
      console.log('📦 Response:', response);
      console.log('========================================');

      // Update current ride with API data
      if (response) {
        this.currentRide = response as Ride;
        
        // Update ride service to sync with backend
        this.rideService['currentRide$'].next(response as Ride);
        
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

  private stopPickupWaitTicker(): void {
    this.pickupWaitTickerSub?.unsubscribe();
    this.pickupWaitTickerSub = undefined;
    this.pickupWaitChargePreview = 0;
    this.pickupWaitFreeRemainingSec = null;
  }

  /**
   * Updates every second while arrived + driverArrivedAt present.
   */
  private syncPickupWaitTicker(): void {
    this.stopPickupWaitTicker();
    if (!this.currentRide || this.currentRideStatus !== 'arrived') {
      return;
    }
    const raw = this.currentRide.driverArrivedAt;
    if (!raw) {
      return;
    }

    const tick = () => {
      const at = new Date(raw as string).getTime();
      if (Number.isNaN(at)) {
        return;
      }
      const waitSec = Math.floor((Date.now() - at) / 1000);
      const prev = computePickupWaitPreview(
        waitSec,
        DEFAULT_PICKUP_WAIT_POLICY_PREVIEW
      );
      this.pickupWaitChargePreview = prev.totalPickupWaitCharge;
      const freeSec = DEFAULT_PICKUP_WAIT_POLICY_PREVIEW.pickupWaitFreeMinutes * 60;
      this.pickupWaitFreeRemainingSec = Math.max(0, freeSec - waitSec);
    };

    tick();
    this.pickupWaitTickerSub = interval(1000).subscribe(() => {
      this.ngZone.run(() => tick());
    });
  }

  private async handleRideStatusChange(status: RideStatus) {
    this.currentRideStatus = status;

    switch (status) {
      case 'searching':
        this.stopPickupWaitTicker();
        this.statusText = 'Searching for Driver...';
        this.isDriverArrived = false;
        break;
      case 'accepted':
        this.stopPickupWaitTicker();
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
        this.syncPickupWaitTicker();
        break;
      case 'in_progress':
        this.stopPickupWaitTicker();
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
        void this.updateDriverMarker({ forceRoute: true });
        break;
      case 'completed':
        this.stopPickupWaitTicker();
        this.statusText = 'Ride Completed';
        // Close the driver modal first
        this.isDriverModalOpen = false;
        // Only show rating if we haven't shown it yet
        if (!this.hasShownRating) {
          // Clear any existing timeout
          if (this.ratingTimeout) {
            clearTimeout(this.ratingTimeout);
          }
          
          // Wait a bit for ride state to fully update, then check payment
          this.ratingTimeout = setTimeout(() => {
            this.ngZone.run(async () => {
              // Refetch ride from API to get latest fare (recalculated with actual duration)
              if (this.currentRide?._id) {
                try {
                  console.log('🔄 Refetching ride from API to get latest fare after completion');
                  await this.fetchRideDetailsFromAPI(this.currentRide._id);
                  console.log('✅ Ride refetched - Latest fare from DB:', this.currentRide?.fare);
                } catch (error) {
                  console.error('❌ Error refetching ride:', error);
                  // Continue with cached ride if refetch fails
                }
              }
              
              // Re-check current ride state to ensure we have latest data
              const latestRide = this.currentRide;
              console.log('💳 Checking payment requirement - paymentMethod:', latestRide?.paymentMethod, 'paymentStatus:', latestRide?.paymentStatus, 'fare:', latestRide?.fare);
              
              // Check if payment is needed (RAZORPAY with pending status)
              if (latestRide && 
                  latestRide.paymentMethod === 'RAZORPAY' && 
                  latestRide.paymentStatus === 'pending') {
                // Navigate to payment screen
                console.log('💳 Payment required - navigating to payment screen');
                this.router.navigate(['/ride-payment', latestRide._id], {
                  state: {
                    fare: latestRide.fare,
                    pickupAddress: latestRide.pickupAddress,
                    dropoffAddress: latestRide.dropoffAddress,
                    duration: latestRide.actualDuration || 0
                  },
                  replaceUrl: true // Prevent back navigation to this page
                });
              } else if (latestRide && 
                         latestRide.paymentMethod === 'WALLET' && 
                         latestRide.paymentStatus === 'completed') {
                // WALLET payment completed - show confirmation
                console.log('💳 Wallet payment completed - showing confirmation');
                const fareAmount = latestRide.fare || 0;
                const toast = await this.toastController.create({
                  message: `₹${fareAmount.toFixed(2)} deducted from wallet. Thank you!`,
                  duration: 3000,
                  color: 'success',
                  position: 'top',
                  icon: 'checkmark-circle'
                });
                await toast.present();
                
                // Show rating modal after a short delay
                setTimeout(() => {
                  this.showRating = true;
                  this.hasShownRating = true;
                  console.log('⭐ Showing rating dialog after wallet payment');
                }, 1000);
              } else {
                // Show rating modal (CASH or other payment methods)
                // Double-check ride is completed before showing rating
                if (latestRide && latestRide.status === 'completed') {
                  this.showRating = true;
                  this.hasShownRating = true;
                  console.log('⭐ Showing rating dialog');
                } else {
                  console.warn('⚠️ Ride not completed yet, skipping rating dialog');
                }
              }
              this.ratingTimeout = undefined;
            });
          }, 1500); // Wait 1.5 seconds for state to update
        }
        break;
      case 'cancelled':
        this.stopPickupWaitTicker();
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

  private resetMapOverlayState(): void {
    this.driverMarkerId = undefined;
    this.userMarkerId = undefined;
    this.destinationMarkerId = undefined;
    this.routePolylines = [];
    this.lastCameraUpdate = 0;
    this.lastDriverMarkerLat = 0;
    this.lastDriverMarkerLng = 0;
    this.lastRouteRedrawAt = 0;
    this.lastRouteDriverLat = 0;
    this.lastRouteDriverLng = 0;
    this.lastRouteTargetKey = '';
    this.driverMarkerOpChain = Promise.resolve();
  }

  private distanceMeters(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la = (a.lat * Math.PI) / 180;
    const lb = (b.lat * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
  }

  /** Whether the driver→target route polyline should be recomputed (Directions API). */
  private computeRouteRedrawNeeded(forceRoute: boolean): boolean {
    if (forceRoute) return true;
    const lat = this.driverLocation.latitude;
    const lng = this.driverLocation.longitude;
    if (!lat || !lng) return false;
    const driverCoord = { lat, lng };
    const routeKey =
      this.currentRideStatus === 'in_progress' ? 'dropoff' : 'pickup';
    if (this.lastRouteRedrawAt === 0) return true;
    if (routeKey !== this.lastRouteTargetKey) return true;
    if (Date.now() - this.lastRouteRedrawAt > ActiveOrderePage.ROUTE_REDRAW_MIN_INTERVAL_MS) {
      return true;
    }
    const moved = this.distanceMeters(driverCoord, {
      lat: this.lastRouteDriverLat,
      lng: this.lastRouteDriverLng,
    });
    return moved > ActiveOrderePage.ROUTE_REDRAW_MOVE_METERS;
  }

  private enqueueDriverMarkerUpdate(fn: () => Promise<void>): Promise<void> {
    const run = async () => {
      try {
        await fn();
      } catch (e) {
        console.error('Driver marker op failed:', e);
      }
    };
    const p = this.driverMarkerOpChain.then(run);
    this.driverMarkerOpChain = p;
    return p;
  }

  /**
   * Queue a driver cab marker + optional route update. Overlapping socket events are serialized.
   */
  private updateDriverMarker(options?: { forceRoute?: boolean }): Promise<void> {
    const forceRoute = options?.forceRoute === true;
    if (!this.isMapInitialized || !this.map) {
      return Promise.resolve();
    }
    const lat = this.driverLocation.latitude;
    const lng = this.driverLocation.longitude;
    if (!lat || !lng) {
      return Promise.resolve();
    }
    const needsRoute = this.computeRouteRedrawNeeded(forceRoute);
    const hasLastPlaced =
      this.lastDriverMarkerLat !== 0 && this.lastDriverMarkerLng !== 0;
    if (
      hasLastPlaced &&
      !forceRoute &&
      this.distanceMeters(
        { lat, lng },
        { lat: this.lastDriverMarkerLat, lng: this.lastDriverMarkerLng }
      ) < ActiveOrderePage.DRIVER_MARKER_DEDUP_METERS &&
      !needsRoute
    ) {
      return Promise.resolve();
    }
    return this.enqueueDriverMarkerUpdate(() =>
      this.updateDriverMarkerInternal({ forceRoute })
    );
  }

  private async updateDriverMarkerInternal(opts?: {
    initialFit?: boolean;
    forceRoute?: boolean;
  }): Promise<void> {
    if (!this.isMapInitialized || !this.map) return;

    if (!this.realDriver) {
      if (this.driverMarkerId) {
        try {
          await this.map.removeMarker(this.driverMarkerId);
        } catch {
          /* stale id */
        }
        this.driverMarkerId = undefined;
      }
      return;
    }

    const lat = this.driverLocation.latitude;
    const lng = this.driverLocation.longitude;
    if (!lat || !lng) return;

    const driverCoord = { lat, lng };
    const targetCoord =
      this.currentRideStatus === 'in_progress'
        ? {
            lat:
              this.currentRide?.dropoffLocation?.coordinates[1] ||
              this.userLocation.latitude,
            lng:
              this.currentRide?.dropoffLocation?.coordinates[0] ||
              this.userLocation.longitude,
          }
        : {
            lat: this.userLocation.latitude,
            lng: this.userLocation.longitude,
          };

    const routeKey =
      this.currentRideStatus === 'in_progress' ? 'dropoff' : 'pickup';
    const forceRoute = opts?.forceRoute === true;
    const redrawRoute =
      opts?.initialFit === true ||
      forceRoute ||
      this.lastRouteRedrawAt === 0 ||
      routeKey !== this.lastRouteTargetKey ||
      Date.now() - this.lastRouteRedrawAt >
        ActiveOrderePage.ROUTE_REDRAW_MIN_INTERVAL_MS ||
      this.distanceMeters(driverCoord, {
        lat: this.lastRouteDriverLat,
        lng: this.lastRouteDriverLng,
      }) > ActiveOrderePage.ROUTE_REDRAW_MOVE_METERS;

    try {
      if (this.driverMarkerId) {
        try {
          await this.map.removeMarker(this.driverMarkerId);
        } catch {
          /* stale id */
        }
        this.driverMarkerId = undefined;
      }

      const title =
        this.currentRideStatus === 'in_progress'
          ? 'Your Ride'
          : 'Driver Location';

      const driverMarkerResult = await this.map.addMarker({
        coordinate: driverCoord,
        title,
        snippet: this.realDriver?.name || 'Driver',
        iconUrl: 'assets/cab-east.png',
        iconSize: {
          width: 40,
          height: 40,
        },
      });
      this.driverMarkerId = driverMarkerResult;

      this.lastDriverMarkerLat = lat;
      this.lastDriverMarkerLng = lng;

      if (redrawRoute) {
        await this.clearRoute();
        await this.drawRouteToTarget(driverCoord, targetCoord);
        this.lastRouteRedrawAt = Date.now();
        this.lastRouteDriverLat = lat;
        this.lastRouteDriverLng = lng;
        this.lastRouteTargetKey = routeKey;
      }

      if (opts?.initialFit) {
        await this.map.setCamera({
          coordinate: {
            lat: (targetCoord.lat + driverCoord.lat) / 2,
            lng: (targetCoord.lng + driverCoord.lng) / 2,
          },
          zoom: 14,
        });
        this.lastCameraUpdate = Date.now();
      } else {
        const now = Date.now();
        if (!this.lastCameraUpdate || now - this.lastCameraUpdate > 10000) {
          this.lastCameraUpdate = now;
          const centerLat = (driverCoord.lat + targetCoord.lat) / 2;
          const centerLng = (driverCoord.lng + targetCoord.lng) / 2;
          const latDiff = Math.abs(driverCoord.lat - targetCoord.lat);
          const lngDiff = Math.abs(driverCoord.lng - targetCoord.lng);
          const maxDiff = Math.max(latDiff, lngDiff);
          let zoom = 15;
          if (maxDiff > 0.05) zoom = 12;
          else if (maxDiff > 0.02) zoom = 13;
          else if (maxDiff > 0.01) zoom = 14;
          await this.map.setCamera({
            coordinate: { lat: centerLat, lng: centerLng },
            zoom,
            animate: true,
          });
        }
      }
    } catch (error) {
      console.error('❌ Error updating driver marker:', error);
    }
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
    try {
      await this.initializeMap();
      this.isMapInitialized = true;
    } finally {
      this.isMapInitializing = false;
    }
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

      // Add driver marker if driver location is available (same path as socket updates)
      if (
        this.driverLocation.latitude &&
        this.driverLocation.longitude &&
        this.realDriver
      ) {
        await this.enqueueDriverMarkerUpdate(() =>
          this.updateDriverMarkerInternal({
            initialFit: true,
            forceRoute: true,
          })
        );
      }
    } catch (error) {
      console.error('❌ Error creating map:', error);
      throw error;
    }
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

  /**
   * Clear existing route polylines from map
   */
  private async clearRoute() {
    if (!this.map || this.routePolylines.length === 0) {
      return;
    }
    try {
      await this.map.removePolylines(this.routePolylines);
      this.routePolylines = [];
      console.log('🧹 Route polylines cleared');
    } catch (error) {
      console.error('Error clearing route:', error);
    }
  }

  /**
   * Draw route from driver to target using Google Directions API
   */
  private async drawRouteToTarget(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ) {
    if (!this.map) return;
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
    if (!this.map) return;
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

  onEmojiChange(event: any) {
    this.selectedEmoji = event.detail.value;
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

    // Don't allow chat if ride is for other person
    if (this.currentRide.rideFor === 'OTHER') {
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

    // Re-join ride room when user dismisses chat so ride events (e.g. driver arrived) are received again
    modal.onDidDismiss().then(async () => {
      if (this.currentRide && !this.isViewOnlyMode) {
        const rideId = this.currentRide._id;
        try {
          await this.rideService.joinRideRoom(rideId != null ? String(rideId) : '', undefined, 'User');
          await this.fetchRideDetailsFromAPI(rideId);
        } catch (error) {
          console.error('Error re-joining ride room after chat:', error);
        }
      }
    });
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
    // Close modal first
    this.isDriverModalOpen = false;
    
    // Dismiss any open modals
    this.modalController.dismiss();
    
    // Small delay to ensure modal closes before navigation
    setTimeout(() => {
      if (this.fromBookings) {
        // Return to Bookings tab if came from there
        this.router.navigate(['/tabs/tabs/tab2'], {
          replaceUrl: true,
        });
      } else {
        // Default to home
        this.router.navigate(['/tabs/tabs/tab1'], {
          replaceUrl: true,
        });
      }
    }, 100);
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
          handler: async (data: any) => {
            this.emergencyTriggered = true; // Prevent double-tap
            const reason = typeof data === 'string' ? data : (data?.reason || 'other');
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

  async openChangeDestination() {
    if (!this.currentRide || !this.canChangeDestination) return;

    const modal = await this.modalController.create({
      component: SearchPage,
      componentProps: {
        isPickup: 'false',
        destination: this.destinationLocation || '',
      },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<SearchModalResult>();
    if (!data?.location?.lat || data.location.lng == null || !data.address) {
      return;
    }

    const lat = data.location.lat;
    const lng = data.location.lng;

    try {
      const quoteRes = await firstValueFrom(
        this.rideService.getDestinationQuote(this.currentRide._id, lat, lng)
      );
      if (!quoteRes?.success) {
        const t = await this.toastController.create({
          message: 'Could not preview fare for this location',
          duration: 2500,
          color: 'warning',
          position: 'bottom',
        });
        await t.present();
        return;
      }

      const pricing = quoteRes.pricing as { newFare?: number; previousFare?: number } | undefined;
      const newFare = Number(pricing?.newFare ?? 0);
      const prevFare = Number(pricing?.previousFare ?? 0);

      const alert = await this.alertCtrl.create({
        header: 'Confirm new destination',
        message: `Estimated fare: ₹${newFare.toFixed(0)} (was ₹${prevFare.toFixed(0)}). Update destination?`,
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Confirm', role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      const rev = quoteRes.destinationRevision ?? this.currentRide.destinationRevision ?? 0;
      await firstValueFrom(
        this.rideService.updateRideDestination(this.currentRide._id, {
          dropoffLocation: { type: 'Point', coordinates: [lng, lat] },
          dropoffAddress: data.address,
          expectedRevision: rev,
        })
      );

      try {
        const rid =
          this.currentRide?._id != null ? String(this.currentRide._id) : '';
        if (rid) {
          await this.rideService.joinRideRoom(rid, undefined, 'User');
        }
      } catch (joinErr) {
        console.warn('joinRideRoom after destination update:', joinErr);
      }

      const ok = await this.toastController.create({
        message: 'Destination updated',
        duration: 2000,
        color: 'success',
        position: 'bottom',
      });
      await ok.present();
    } catch (e: any) {
      const msg =
        e?.error?.message ||
        e?.error?.error ||
        e?.message ||
        'Could not update destination';
      const errToast = await this.toastController.create({
        message: String(msg),
        duration: 3500,
        color: 'danger',
        position: 'bottom',
      });
      await errToast.present();
    }
  }

  async shareRide(event?: Event) {
    console.log('🔗 Share button clicked', event?.target);
    // Prevent event bubbling
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    console.log('🔗 Share button clicked', {
      currentRide: this.currentRide?._id,
      isSharing: this.isSharing,
      currentRideStatus: this.currentRideStatus,
      hasRide: !!this.currentRide
    });

    // Check if ride exists and is not completed/cancelled
    if (!this.currentRide) {
      console.warn('⚠️ No current ride available');
      const toast = await this.toastController.create({
        message: 'No active ride to share',
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    // Check if ride is completed or cancelled
    if (this.currentRideStatus === 'completed' || this.currentRideStatus === 'cancelled') {
      console.warn('⚠️ Cannot share completed or cancelled ride');
      const toast = await this.toastController.create({
        message: 'Cannot share a completed or cancelled ride',
        duration: 2000,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    // Prevent multiple simultaneous share attempts
    if (this.isSharing) {
      console.log('⏳ Already sharing, ignoring click');
      return;
    }

    try {
      this.isSharing = true;
      console.log('📤 Generating share link for ride:', this.currentRide._id);
      
      const shareUrl = await this.rideShareService.generateShareLink(this.currentRide._id);
      console.log('✅ Share URL generated:', shareUrl);
      
      // Show share modal with URL and options
      await this.showShareModal(shareUrl);
    } catch (error: any) {
      console.error('❌ Error sharing ride:', error);
      const errorMessage = error?.error?.message || error?.message || 'Failed to generate share link. Please try again.';
      const toast = await this.toastController.create({
        message: errorMessage,
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
    } finally {
      this.isSharing = false;
      console.log('✅ Share process completed, isSharing reset to false');
    }
  }

  /**
   * Show share modal with URL and copy/share options
   */
  private async showShareModal(shareUrl: string) {
    const alert = await this.alertCtrl.create({
      header: '🔗 Share Ride Link',
      message: 'Share this link to let others track your ride in real-time',
      cssClass: 'share-ride-alert',
      backdropDismiss: true,
      inputs: [
        {
          name: 'shareUrl',
          type: 'textarea',
          value: shareUrl,
          attributes: {
            readonly: true,
            rows: 3,
            maxlength: 500
          }
        }
      ],
      buttons: [
        {
          text: 'Copy Link',
          cssClass: 'share-alert-button-copy',
          handler: async () => {
            await this.copyShareUrl(shareUrl);
            return false; // Keep alert open
          }
        },
        {
          text: 'Share',
          cssClass: 'share-alert-button-share',
          handler: async () => {
            await this.openNativeShare(shareUrl);
            return false; // Keep alert open
          }
        },
        {
          text: 'Close',
          role: 'cancel',
          cssClass: 'share-alert-button-close'
        }
      ]
    });

    await alert.present();
  }

  /**
   * Copy share URL to clipboard
   */
  private async copyShareUrl(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      const toast = await this.toastController.create({
        message: '✅ Link copied to clipboard!',
        duration: 2000,
        color: 'success',
        position: 'top',
      });
      await toast.present();
    } catch (error) {
      console.error('❌ Error copying to clipboard:', error);
      // Fallback: try using execCommand
      try {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        const toast = await this.toastController.create({
          message: '✅ Link copied to clipboard!',
          duration: 2000,
          color: 'success',
          position: 'top',
        });
        await toast.present();
      } catch (fallbackError) {
        console.error('❌ Fallback copy also failed:', fallbackError);
        const toast = await this.toastController.create({
          message: 'Failed to copy link. Please copy manually.',
          duration: 3000,
          color: 'danger',
          position: 'top',
        });
        await toast.present();
      }
    }
  }

  /**
   * Open native share dialog
   */
  private async openNativeShare(shareUrl: string) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Track My Ride',
          text: 'Track my ride in real-time using this link:',
          url: shareUrl
        });
      } else {
        // No native share available, copy to clipboard instead
        await this.copyShareUrl(shareUrl);
        const toast = await this.toastController.create({
          message: 'Native share not available. Link copied to clipboard!',
          duration: 2000,
          color: 'primary',
          position: 'top',
        });
        await toast.present();
      }
    } catch (error: any) {
      // User cancelled share or error occurred
      if (error.name !== 'AbortError') {
        console.error('❌ Error sharing:', error);
        const toast = await this.toastController.create({
          message: 'Share cancelled or failed',
          duration: 2000,
          color: 'warning',
          position: 'top',
        });
        await toast.present();
      }
    }
  }

  /**
   * Fix modal pointer-events to allow header clicks
   * Modal covers entire screen, so we need to exclude header area
   */
  setupModalPointerEventsFix() {
    // Use MutationObserver to watch for modal element creation
    this.modalObserver = new MutationObserver(() => {
      const modal = document.querySelector('ion-modal.show-modal');
      if (modal) {
        this.fixModalPointerEvents(modal as HTMLElement);
      }
    });

    // Start observing
    this.modalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also check immediately and periodically
    const checkModal = () => {
      if (this.isDriverModalOpen) {
        const modal = document.querySelector('ion-modal.show-modal');
        if (modal) {
          this.fixModalPointerEvents(modal as HTMLElement);
        }
      }
    };

    // Check immediately
    setTimeout(checkModal, 100);

    // Check periodically when modal might be open
    this.modalCheckInterval = setInterval(checkModal, 500);
  }

  /**
   * Fix modal's pointer-events to exclude header area
   * The modal covers entire screen, so we create a "window" for the header
   */
  fixModalPointerEvents(modalElement: HTMLElement) {
    if (!modalElement) return;

    console.log('🔧 Fixing modal pointer-events for header area');

    // Method 1: Use CSS clip-path to exclude header area from pointer-events
    // This creates a "hole" in the modal's clickable area
    try {
      const modalId = modalElement.id || 'ion-overlay-4';
      const styleId = 'modal-header-pointer-fix';
      let styleEl = document.getElementById(styleId) as HTMLStyleElement;
      
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }

      // Use clip-path to exclude top 56px from modal's pointer-events
      // This makes clicks pass through to the header
      styleEl.textContent = `
        ion-modal#${modalId}.show-modal {
          clip-path: polygon(0 56px, 100% 56px, 100% 100%, 0 100%) !important;
        }
      `;
    } catch (e) {
      console.warn('Could not set clip-path via style element:', e);
    }

    // Method 2: Direct style manipulation as fallback
    try {
      (modalElement as any).style.clipPath = 'polygon(0 56px, 100% 56px, 100% 100%, 0 100%)';
    } catch (e) {
      console.warn('Could not set clip-path directly:', e);
    }

    // Method 3: Create a transparent overlay above modal in header area
    // This sits between modal and header, allowing clicks to pass through
    const overlayId = 'header-click-overlay';
    let overlay = document.getElementById(overlayId) as HTMLElement;
    
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      document.body.appendChild(overlay);
    }

    // Position overlay above modal but below header
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 56px !important;
      z-index: 99998 !important;
      pointer-events: none !important;
      background: transparent !important;
    `;
  }
}
