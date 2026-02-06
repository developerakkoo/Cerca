import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap } from '@capacitor/google-maps';
import { Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SharedRideService, SharedRide } from 'src/app/services/shared-ride.service';
import { SocketService } from 'src/app/services/socket.service';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-shared-ride',
  templateUrl: './shared-ride.page.html',
  styleUrls: ['./shared-ride.page.scss'],
  standalone: false,
})
export class SharedRidePage implements OnInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map!: GoogleMap;
  private driverMarkerId!: string;
  private pickupMarkerId!: string;
  private dropoffMarkerId!: string;
  private routeLineId!: string;

  shareToken: string | null = null;
  ride: SharedRide | null = null;
  isLoading = true;
  error: string | null = null;
  errorReason: string | null = null;

  private rideSubscription?: Subscription;
  private socketSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sharedRideService: SharedRideService,
    private socketService: SocketService,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  async ngOnInit() {
    // Get token from query params
    this.route.queryParams.subscribe(async (params) => {
      this.shareToken = params['token'] || null;
      
      if (!this.shareToken) {
        this.error = 'Invalid share link';
        this.errorReason = 'INVALID_TOKEN';
        this.isLoading = false;
        return;
      }

      await this.loadRide();
    });
  }

  async loadRide() {
    if (!this.shareToken) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Fetch ride data
      this.ride = await this.sharedRideService.fetchSharedRide(this.shareToken);

      // Initialize map
      await this.initializeMap();

      // Subscribe to real-time updates if socket is available
      // Note: Socket connection may require authentication, so we'll use it if already connected
      if (this.socketService.isConnected()) {
        this.subscribeToUpdates();
      } else {
        console.warn('Socket not connected - real-time updates will not be available');
      }

      this.isLoading = false;
    } catch (error: any) {
      console.error('Error loading shared ride:', error);
      this.error = error?.error?.message || error?.message || 'Failed to load ride';
      this.errorReason = error?.error?.reason || 'UNKNOWN';
      this.isLoading = false;
    }
  }

  async initializeMap() {
    if (!this.ride || !this.mapContainer) return;

    try {
      const mapRef = document.getElementById('shared-ride-map');
      if (!mapRef) return;

      this.map = await GoogleMap.create({
        id: 'shared-ride-map',
        element: mapRef,
        apiKey: environment.apiKey,
        config: {
          center: {
            lat: this.ride.pickupLocation.coordinates[1],
            lng: this.ride.pickupLocation.coordinates[0],
          },
          zoom: 14,
        },
      });

      // Add pickup marker
      this.pickupMarkerId = await this.map.addMarker({
        coordinate: {
          lat: this.ride.pickupLocation.coordinates[1],
          lng: this.ride.pickupLocation.coordinates[0],
        },
        title: 'Pickup',
        snippet: this.ride.pickupAddress,
        iconUrl: 'assets/pickup-marker.png', // You may need to add this asset
      });

      // Add dropoff marker
      this.dropoffMarkerId = await this.map.addMarker({
        coordinate: {
          lat: this.ride.dropoffLocation.coordinates[1],
          lng: this.ride.dropoffLocation.coordinates[0],
        },
        title: 'Destination',
        snippet: this.ride.dropoffAddress,
        iconUrl: 'assets/dropoff-marker.png', // You may need to add this asset
      });

      // Fit bounds to show both markers
      await this.map.setCamera({
        coordinate: {
          lat: (this.ride.pickupLocation.coordinates[1] + this.ride.dropoffLocation.coordinates[1]) / 2,
          lng: (this.ride.pickupLocation.coordinates[0] + this.ride.dropoffLocation.coordinates[0]) / 2,
        },
        zoom: 12,
      });
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  subscribeToUpdates() {
    if (!this.shareToken) return;

    // Subscribe to ride updates
    this.rideSubscription = this.sharedRideService
      .subscribeToSharedRide(this.shareToken)
      .subscribe((updatedRide) => {
        this.ride = updatedRide;
        this.updateMap();
      });

    // Subscribe to current ride changes
    this.socketSubscription = this.sharedRideService
      .getCurrentRide()
      .subscribe((ride) => {
        if (ride) {
          this.ride = ride;
        }
      });
  }

  async updateMap() {
    if (!this.map || !this.ride) return;

    // Update driver marker if driver location is available
    // This would be updated via socket events
  }

  getStatusText(): string {
    if (!this.ride) return '';
    
    const statusMap: { [key: string]: string } = {
      'requested': 'Searching for driver',
      'accepted': 'Driver on the way',
      'arrived': 'Driver arrived',
      'in_progress': 'Ride in progress',
      'completed': 'Ride completed',
      'cancelled': 'Ride cancelled'
    };

    return statusMap[this.ride.status] || this.ride.status;
  }

  goHome() {
    this.router.navigate(['/']);
  }

  ngOnDestroy() {
    this.rideSubscription?.unsubscribe();
    this.socketSubscription?.unsubscribe();
    this.sharedRideService.clearRide();
    
    if (this.map) {
      this.map.destroy();
    }
  }
}

