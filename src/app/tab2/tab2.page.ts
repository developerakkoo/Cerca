import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { RideService, Ride } from '../services/ride.service';
import { UserService } from '../services/user.service';
import { SocketService } from '../services/socket.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { AlertController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit, OnDestroy {
  activeBookings: Ride[] = [];
  pastBookings: Ride[] = [];
  displayedActiveBookings: Ride[] = [];
  displayedPastBookings: Ride[] = [];
  isLoading = false;
  isActive = true;
  
  // Pagination settings
  private readonly INITIAL_DISPLAY_COUNT = 4;
  private readonly LOAD_MORE_COUNT = 5;
  activeDisplayCount = 0;
  pastDisplayCount = 0;

  // Timer properties
  private readonly TIMEOUT_DURATION = 180; // 3 minutes in seconds
  private timerIntervals: Map<string, any> = new Map();
  timeRemaining: Map<string, number> = new Map();

  // Socket subscriptions
  private socketSubscriptions: Subscription[] = [];
  private rideStatusSubscription?: Subscription;
  private currentRideSubscription?: Subscription;

  constructor(
    private rideService: RideService,
    private userService: UserService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    private socketService: SocketService
  ) {}

  async ngOnInit() {
    await this.loadRides();
    this.setupSocketListeners();
    this.setupRideStatusMonitoring();
    this.setupCurrentRideSubscription();
  }

  async ionViewDidEnter() {
    await this.loadRides();
    // Timers will be started in loadRides() via startTimersForRequestedRides()
  }

  async loadRides() {
    try {
      this.isLoading = true;
      
      // Get current user
      const user = await firstValueFrom(this.userService.user$);
      if (!user || !user.isLoggedIn || !user._id) {
        console.log('User not logged in, cannot fetch rides');
        this.activeBookings = [];
        this.pastBookings = [];
        this.isLoading = false;
        return;
      }

      // Fetch rides from API
      const rides = await firstValueFrom(
        this.rideService.getUserRides(user._id)
      );

      console.log(rides);
      
      // Filter rides into active and past
      // Defensive filtering: explicitly exclude cancelled rides from active bookings
      // Include 'arrived' status as it's still an active ride
      this.activeBookings = rides.filter(
        (ride) =>
          ride.status !== 'cancelled' &&
          (ride.status === 'requested' ||
          ride.status === 'accepted' ||
          ride.status === 'arrived' ||
          ride.status === 'in_progress')
      );

      this.pastBookings = rides.filter(
        (ride) =>
          ride.status === 'completed' || ride.status === 'cancelled'
      );

      // Sort by updatedAt (most recent activity first), fallback to createdAt
      const getSortDate = (ride: Ride): number => {
        const updatedAt = ride.updatedAt ? new Date(ride.updatedAt).getTime() : null;
        const createdAt = ride.createdAt ? new Date(ride.createdAt).getTime() : null;
        return updatedAt || createdAt || 0;
      };

      this.activeBookings.sort(
        (a, b) => getSortDate(b) - getSortDate(a)
      );
      this.pastBookings.sort(
        (a, b) => getSortDate(b) - getSortDate(a)
      );

      // Reset display counts and show initial rides
      this.activeDisplayCount = 0;
      this.pastDisplayCount = 0;
      this.updateDisplayedRides();

      // Start timers for requested rides
      this.startTimersForRequestedRides();

      // Monitor status changes and stop timers for accepted rides
      this.monitorRideStatusChanges();
    } catch (error) {
      console.error('Error loading rides:', error);
      this.activeBookings = [];
      this.pastBookings = [];
      this.displayedActiveBookings = [];
      this.displayedPastBookings = [];
    } finally {
      this.isLoading = false;
    }
  }

  updateDisplayedRides() {
    // Update displayed active bookings
    const nextActiveCount = Math.min(
      this.activeDisplayCount + (this.activeDisplayCount === 0 ? this.INITIAL_DISPLAY_COUNT : this.LOAD_MORE_COUNT),
      this.activeBookings.length
    );
    this.displayedActiveBookings = this.activeBookings.slice(0, nextActiveCount);
    this.activeDisplayCount = nextActiveCount;

    // Update displayed past bookings
    const nextPastCount = Math.min(
      this.pastDisplayCount + (this.pastDisplayCount === 0 ? this.INITIAL_DISPLAY_COUNT : this.LOAD_MORE_COUNT),
      this.pastBookings.length
    );
    this.displayedPastBookings = this.pastBookings.slice(0, nextPastCount);
    this.pastDisplayCount = nextPastCount;
  }

  loadMoreActive() {
    const nextCount = Math.min(
      this.activeDisplayCount + this.LOAD_MORE_COUNT,
      this.activeBookings.length
    );
    this.displayedActiveBookings = this.activeBookings.slice(0, nextCount);
    this.activeDisplayCount = nextCount;
  }

  loadMorePast() {
    const nextCount = Math.min(
      this.pastDisplayCount + this.LOAD_MORE_COUNT,
      this.pastBookings.length
    );
    this.displayedPastBookings = this.pastBookings.slice(0, nextCount);
    this.pastDisplayCount = nextCount;
  }

  hasMoreActive(): boolean {
    return this.activeDisplayCount < this.activeBookings.length;
  }

  hasMorePast(): boolean {
    return this.pastDisplayCount < this.pastBookings.length;
  }

  segmentChanged(event: any) {
    if (event.detail.value === 'active') {
      this.isActive = true;
    } else {
      this.isActive = false;
    }
  }

  /**
   * Check if ride details are enabled (for Full Day bookings, only enable when scheduled time arrives)
   */
  isRideDetailsEnabled(ride: Ride): boolean {
    // For Full Day bookings, check if the scheduled start time has arrived
    if (ride.bookingType === 'FULL_DAY' && ride.bookingMeta?.startTime) {
      try {
        const startTime = new Date(ride.bookingMeta.startTime);
        const now = new Date();
        return now >= startTime; // Enable only if current time >= start time
      } catch (error) {
        console.error('Error parsing start time:', error);
        return false; // Disable if there's an error parsing the date
      }
    }
    // For instant rides or other booking types, always enable
    return true;
  }

  navigateToActiveRide(rideId: string, ride?: Ride) {
    // If ride is provided, check if details are enabled
    if (ride && !this.isRideDetailsEnabled(ride)) {
      console.log('Ride details not yet enabled for this Full Day booking');
      return; // Don't navigate if disabled
    }
    console.log(rideId);
    this.router.navigate(['/active-ordere', rideId]);
  }

  formatDate(date: Date | string): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatTime(date: Date | string): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'requested':
      case 'accepted':
      case 'arrived':
      case 'in_progress':
        return 'success';
      case 'completed':
        return 'primary';
      case 'cancelled':
        return 'danger';
      default:
        return 'medium';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'requested':
        return 'Requested';
      case 'accepted':
        return 'Accepted';
      case 'arrived':
        return 'Driver Arrived';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  getDriverName(ride: Ride): string {
    return ride.driver?.name || 'Not assigned';
  }

  getVehicleInfo(ride: Ride): string {
    if (!ride.driver?.vehicleInfo) return 'N/A';
    const { color, make, model } = ride.driver.vehicleInfo;
    return `${color} ${make} ${model}`;
  }

  callDriver(phone?: string) {
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      console.log('Driver phone number not available');
    }
  }

  /**
   * Calculate time remaining in seconds based on createdAt timestamp
   */
  calculateTimeRemaining(createdAt: Date | string): number {
    if (!createdAt) return 0;
    const created = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const elapsed = Math.floor((now - created) / 1000); // elapsed seconds
    const remaining = this.TIMEOUT_DURATION - elapsed;
    return Math.max(0, remaining); // Don't return negative
  }

  /**
   * Format seconds as MM:SS
   */
  formatTimer(seconds: number): string {
    if (seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get formatted timer for a ride
   */
  getTimerText(ride: Ride): string {
    const rideId = ride._id;
    const remaining = this.timeRemaining.get(rideId) ?? this.calculateTimeRemaining(ride.createdAt);
    return this.formatTimer(remaining);
  }

  /**
   * Check if timer is low (< 30 seconds)
   */
  isTimerLow(ride: Ride): boolean {
    const rideId = ride._id;
    const remaining = this.timeRemaining.get(rideId) ?? this.calculateTimeRemaining(ride.createdAt);
    return remaining > 0 && remaining <= 30;
  }

  /**
   * Start timer for a requested ride
   */
  startTimer(rideId: string, createdAt: Date | string): void {
    // Stop existing timer if any
    this.stopTimer(rideId);

    // Calculate initial remaining time
    const remaining = this.calculateTimeRemaining(createdAt);
    this.timeRemaining.set(rideId, remaining);

    // If already expired, cancel immediately
    if (remaining <= 0) {
      this.autoCancelRide(rideId);
      return;
    }

    // Start interval to update timer every second
    const interval = setInterval(() => {
      const currentRemaining = this.timeRemaining.get(rideId) ?? 0;
      
      if (currentRemaining <= 0) {
        // Time expired, auto-cancel
        this.stopTimer(rideId);
        this.autoCancelRide(rideId);
      } else {
        // Update remaining time
        this.timeRemaining.set(rideId, currentRemaining - 1);
      }
    }, 1000);

    this.timerIntervals.set(rideId, interval);
  }

  /**
   * Stop timer for a ride
   */
  stopTimer(rideId: string): void {
    const interval = this.timerIntervals.get(rideId);
    if (interval) {
      clearInterval(interval);
      this.timerIntervals.delete(rideId);
    }
    this.timeRemaining.delete(rideId);
  }

  /**
   * Start timers for all requested rides
   */
  startTimersForRequestedRides(): void {
    // Stop all existing timers first
    this.stopAllTimers();

    // Start timers for requested rides
    this.activeBookings.forEach((ride) => {
      if (ride.status === 'requested' && ride.createdAt) {
        this.startTimer(ride._id, ride.createdAt);
      }
    });
  }

  /**
   * Stop all timers
   */
  stopAllTimers(): void {
    this.timerIntervals.forEach((interval, rideId) => {
      clearInterval(interval);
    });
    this.timerIntervals.clear();
    this.timeRemaining.clear();
  }

  /**
   * Auto-cancel ride when timer expires
   */
  async autoCancelRide(rideId: string): Promise<void> {
    try {
      const ride = this.activeBookings.find((r) => r._id === rideId);
      if (!ride || ride.status !== 'requested') {
        return; // Ride already cancelled or accepted
      }

      console.log('⏰ Auto-cancelling ride due to timeout:', rideId);
      
      // Cancel the ride by emitting socket event directly
      const user = await firstValueFrom(this.userService.user$);
      if (user && user._id) {
        this.socketService.emit('rideCancelled', {
          rideId: rideId,
          cancelledBy: 'rider',
          userId: user._id,
          reason: 'No driver accepted within 3 minutes',
        });
      }

      // Show toast notification
      const toast = await this.toastController.create({
        message: 'Ride cancelled automatically - No driver accepted within 3 minutes',
        duration: 3000,
        color: 'warning',
        position: 'top',
      });
      await toast.present();

      // Reload rides to update UI after a short delay
      setTimeout(() => {
        this.loadRides();
      }, 1000);
    } catch (error) {
      console.error('Error auto-cancelling ride:', error);
    }
  }

  /**
   * Cancel ride immediately when user clicks timer button
   */
  async cancelRideImmediately(ride: Ride): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Cancel Ride',
      message: 'Are you sure you want to cancel this ride?',
      buttons: [
        {
          text: 'No',
          role: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          role: 'confirm',
          handler: async () => {
            try {
              // Stop timer
              this.stopTimer(ride._id);

              // Cancel the ride by emitting socket event directly
              const user = await firstValueFrom(this.userService.user$);
              if (user && user._id) {
                this.socketService.emit('rideCancelled', {
                  rideId: ride._id,
                  cancelledBy: 'rider',
                  userId: user._id,
                  reason: 'Cancelled by user',
                });
              }

              // Show toast notification
              const toast = await this.toastController.create({
                message: 'Ride cancelled successfully',
                duration: 2000,
                color: 'success',
                position: 'top',
              });
              await toast.present();

              // Reload rides to update UI after a short delay
              setTimeout(() => {
                this.loadRides();
              }, 1000);
            } catch (error) {
              console.error('Error cancelling ride:', error);
              const toast = await this.toastController.create({
                message: 'Failed to cancel ride. Please try again.',
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

  /**
   * Check and cancel expired rides
   */
  checkAndCancelExpiredRides(): void {
    this.activeBookings.forEach((ride) => {
      if (ride.status === 'requested' && ride.createdAt) {
        const remaining = this.calculateTimeRemaining(ride.createdAt);
        if (remaining <= 0) {
          this.autoCancelRide(ride._id);
        }
      }
    });
  }

  /**
   * Monitor ride status changes and stop timers when rides are accepted
   */
  monitorRideStatusChanges(): void {
    this.activeBookings.forEach((ride) => {
      const rideId = ride._id;
      
      // If ride is no longer requested, stop its timer
      if (ride.status !== 'requested') {
        this.stopTimer(rideId);
      }
      
      // If ride is requested but doesn't have a timer, start one
      if (ride.status === 'requested' && !this.timerIntervals.has(rideId) && ride.createdAt) {
        this.startTimer(rideId, ride.createdAt);
      }
    });
  }

  /**
   * Setup socket event listeners for real-time ride updates
   */
  private setupSocketListeners(): void {
    // Listen for ride cancelled events
    const rideCancelledSub = this.socketService.on<any>('rideCancelled').subscribe((data) => {
      console.log('📢 Ride cancelled event received in booking tab:', data);
      const rideId = data?.ride?._id || data?.rideId;
      if (rideId) {
        // Stop timer for this ride
        this.stopTimer(rideId);
        // Refresh rides list to update UI
        this.loadRides();
      }
    });
    this.socketSubscriptions.push(rideCancelledSub);

    // Listen for no driver found events
    const noDriverFoundSub = this.socketService.on<{ rideId: string; message: string }>('noDriverFound').subscribe((data) => {
      console.log('📢 No driver found event received in booking tab:', data);
      const rideId = data?.rideId;
      if (rideId) {
        // Stop timer for this ride
        this.stopTimer(rideId);
        // Refresh rides list to update UI
        this.loadRides();
      }
    });
    this.socketSubscriptions.push(noDriverFoundSub);

    // Listen for ride accepted events
    const rideAcceptedSub = this.socketService.on<Ride>('rideAccepted').subscribe((ride) => {
      console.log('📢 Ride accepted event received in booking tab:', ride);
      if (ride?._id) {
        // Stop timer for this ride (no longer requested)
        this.stopTimer(ride._id);
        // Refresh rides list to update UI
        this.loadRides();
      }
    });
    this.socketSubscriptions.push(rideAcceptedSub);

    // Listen for driver arrived events
    const driverArrivedSub = this.socketService.on<Ride>('driverArrived').subscribe((ride) => {
      console.log('📢 Driver arrived event received in booking tab:', ride);
      if (ride?._id) {
        // Stop timer for this ride if it was requested
        this.stopTimer(ride._id);
        // Refresh rides list to update UI with 'arrived' status
        this.loadRides();
      }
    });
    this.socketSubscriptions.push(driverArrivedSub);

    // Listen for ride started events
    const rideStartedSub = this.socketService.on<Ride>('rideStarted').subscribe((ride) => {
      console.log('📢 Ride started event received in booking tab:', ride);
      if (ride?._id) {
        // Stop timer for this ride if it was requested
        this.stopTimer(ride._id);
        // Refresh rides list to update UI with 'in_progress' status
        this.loadRides();
      }
    });
    this.socketSubscriptions.push(rideStartedSub);

    // Listen for ride completed events
    const rideCompletedSub = this.socketService.on<Ride>('rideCompleted').subscribe((ride) => {
      console.log('📢 Ride completed event received in booking tab:', ride);
      if (ride?._id) {
        // Stop timer for this ride
        this.stopTimer(ride._id);
        // Refresh rides list to move ride from active to past bookings
        this.loadRides();
      }
    });
    this.socketSubscriptions.push(rideCompletedSub);
  }

  /**
   * Setup real-time ride status monitoring
   */
  private setupRideStatusMonitoring(): void {
    // Subscribe to ride status changes from RideService
    this.rideStatusSubscription = this.rideService.getRideStatus().subscribe((status) => {
      console.log('📢 Ride status changed in booking tab:', status);
      
      // Refresh rides list for any status change to ensure UI is up to date
      // This handles transitions between all statuses (requested → accepted → arrived → in_progress → completed)
      firstValueFrom(this.rideService.getCurrentRide()).then((ride) => {
        if (ride?._id) {
          // Stop timer if ride is no longer requested
          // Check the actual ride status since RideStatus type doesn't include 'requested'
          const rideStatus = ride.status;
          if (rideStatus !== 'requested') {
            this.stopTimer(ride._id);
          }
        }
        // Refresh rides list to update UI with new status
        this.loadRides();
      }).catch((error) => {
        console.error('Error getting current ride:', error);
        // Still refresh rides list even if we can't get current ride
        this.loadRides();
      });
    });
  }

  /**
   * Setup subscription to current ride updates
   * This ensures booking tab stays in sync with ride state changes
   */
  private setupCurrentRideSubscription(): void {
    this.currentRideSubscription = this.rideService.getCurrentRide().subscribe((ride) => {
      if (ride) {
        console.log('📢 Current ride updated in booking tab:', ride._id, ride.status);
        // Refresh rides list to ensure active bookings reflect current state
        // Only refresh if we're on the active tab to avoid unnecessary API calls
        if (this.isActive) {
          this.loadRides();
        }
      } else {
        // Ride cleared - refresh to remove from active bookings if it was there
        console.log('📢 Current ride cleared in booking tab');
        if (this.isActive) {
          this.loadRides();
        }
      }
    });
  }

  ngOnDestroy() {
    // Cleanup all timers
    this.stopAllTimers();
    
    // Unsubscribe from all socket events
    this.socketSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.socketSubscriptions = [];

    // Unsubscribe from ride status monitoring
    if (this.rideStatusSubscription && !this.rideStatusSubscription.closed) {
      this.rideStatusSubscription.unsubscribe();
    }

    // Unsubscribe from current ride updates
    if (this.currentRideSubscription && !this.currentRideSubscription.closed) {
      this.currentRideSubscription.unsubscribe();
    }
  }
}
