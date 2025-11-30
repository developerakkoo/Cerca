import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, LatLngBounds, MapType } from '@capacitor/google-maps';
import { interval, Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  RideService,
  Ride,
  RideStatus,
  Location,
  DriverInfo,
} from 'src/app/services/ride.service';
import { AlertController } from '@ionic/angular';
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

  // Timeout references for cleanup
  private ratingTimeout?: any;
  private rateUsTimeout?: any;

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

  pickupLocation = '';
  destinationLocation = '';
  arrivalTime = '0';
  isDriverArrived = false;
  currentRideStatus: RideStatus = 'idle';
  statusText = 'Preparing...';

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
    private http: HttpClient
  ) {}

  async ngOnInit() {
    // Get ride ID from route params (if navigated with params)
    const rideId = this.route.snapshot.paramMap.get('rideId');

    if (rideId) {
      // Fetch ride details via API
      await this.fetchRideDetailsFromAPI(rideId);
    }

    // Subscribe to current ride
    this.rideSubscription = this.rideService
      .getCurrentRide()
      .subscribe((ride) => {
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

          this.currentRide = ride;
          this.realDriver = ride.driver || null;

          // Map driver data to simplified format for template
          if (ride.driver) {
            this.driver = {
              name: ride.driver.name,
              rating: ride.driver.rating,
              carNumber: ride.driver.vehicleInfo.licensePlate,
              carType: `${ride.driver.vehicleInfo.color} ${ride.driver.vehicleInfo.make} ${ride.driver.vehicleInfo.model}`,
              otp: ride.startOtp || 'N/A',
            };
          }

          this.pickupLocation = ride.pickupAddress;
          this.destinationLocation = ride.dropoffAddress;

          // Set user location from ride
          this.userLocation = {
            latitude: ride.pickupLocation.coordinates[1],
            longitude: ride.pickupLocation.coordinates[0],
          };

          // Initialize map if not already done
          if (!this.map && this.mapContainer) {
            this.initializeMap();
          }
        }
      });

    // Subscribe to ride status
    this.rideStatusSubscription = this.rideService
      .getRideStatus()
      .subscribe((status) => {
        console.log('🔄 Ride status update received:', status);
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

    // Load initial ride data
    const ride = this.rideService.getCurrentRideValue();
    if (ride) {
      this.currentRide = ride;
      this.realDriver = ride.driver || null;

      // Map driver data to simplified format for template
      if (ride.driver) {
        this.driver = {
          name: ride.driver.name,
          rating: ride.driver.rating,
          carNumber: ride.driver.vehicleInfo.licensePlate,
          carType: `${ride.driver.vehicleInfo.color} ${ride.driver.vehicleInfo.make} ${ride.driver.vehicleInfo.model}`,
          otp: ride.startOtp || 'N/A',
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

      await this.initializeMap();
    }
  }

  ngOnDestroy() {
    // Unsubscribe from all subscriptions
    this.rideSubscription?.unsubscribe();
    this.rideStatusSubscription?.unsubscribe();
    this.driverLocationSubscription?.unsubscribe();
    this.driverETASubscription?.unsubscribe();

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
    }
  }

  /**
   * Fetch ride details from API
   */
  private async fetchRideDetailsFromAPI(rideId: string) {
    try {
      console.log('🔍 Fetching ride details via API for ride:', rideId);

      const response = await this.http
        .get(`${environment.apiUrl}/rides/${rideId}`)
        .toPromise();

      console.log('📦 ========================================');
      console.log('📦 RIDE API RESPONSE');
      console.log('📦 ========================================');
      console.log('📦 Response:', response);
      console.log('========================================');

      // Update current ride with API data
      if (response) {
        this.currentRide = response as Ride;
        // Process the ride data
        if (this.currentRide.driver) {
          this.realDriver = this.currentRide.driver;
          this.driver = {
            name: this.currentRide.driver.name,
            rating: this.currentRide.driver.rating,
            carNumber: this.currentRide.driver.vehicleInfo.licensePlate,
            carType: `${this.currentRide.driver.vehicleInfo.color} ${this.currentRide.driver.vehicleInfo.make} ${this.currentRide.driver.vehicleInfo.model}`,
            otp: this.currentRide.startOtp || 'N/A',
          };
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
        break;
      case 'in_progress':
        this.statusText = 'Ride in Progress';
        this.isDriverArrived = false; // Hide OTP section during ride
        // Add destination marker when ride starts
        await this.addDestinationMarker();
        break;
      case 'completed':
        this.statusText = 'Ride Completed';
        // Clear any existing timeout
        if (this.ratingTimeout) {
          clearTimeout(this.ratingTimeout);
        }
        // Show rating modal after 2 seconds
        this.ratingTimeout = setTimeout(() => {
          this.showRating = true;
          this.ratingTimeout = undefined;
        }, 2000);
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

  private async initializeMap() {
    if (!this.userLocation.latitude || !this.userLocation.longitude) {
      console.warn('User location not set yet');
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

    this.map = await GoogleMap.create({
      id: 'active-order-map',
      element: document.getElementById('mymap')!,
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
    if (
      !this.map ||
      !this.driverLocation.latitude ||
      !this.driverLocation.longitude
    ) {
      console.warn(
        '⚠️ Cannot update driver marker - map or location not available'
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
      // Show rate us modal after thank you message
      this.rateUsTimeout = setTimeout(() => {
        this.showThankYou = false;
        this.showRateUs = true;
        this.rateUsTimeout = undefined;
      }, 2000);
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  }

  rateOnStore() {
    // Here you would typically open the app store
    const storeUrl = this.isIOS()
      ? 'https://apps.apple.com/app/your-app-id'
      : 'https://play.google.com/store/apps/details?id=your.app.id';

    window.open(storeUrl, '_blank');
    this.showRateUs = false;
  }

  skipRating() {
    this.showRateUs = false;
    this.router.navigate(['/tabs/tabs/tab1'], {
      replaceUrl: true, // Clear navigation stack
    });
  }

  private isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  navigateToDriverDetails() {
    if (this.realDriver) {
      this.router.navigate(['/driver-details', this.realDriver._id]);
    }
  }

  chatWithDriver() {
    this.router.navigate(['driver-chat']);
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
            // Get current location
            const location = {
              latitude: this.userLocation.latitude,
              longitude: this.userLocation.longitude,
            };

            // Trigger emergency via Socket.IO
            await this.rideService.triggerEmergency(location, reason);
          },
        },
      ],
    });

    await alert.present();
  }
}
