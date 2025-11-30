import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom, Subscription } from 'rxjs';
import { SocketService } from './socket.service';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';
import { ToastController, AlertController } from '@ionic/angular';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface LocationWithAddress extends Location {
  address: string;
}

export interface DriverInfo {
  _id: string;
  name: string;
  phone: string;
  rating: number;
  totalTrips: number;
  profilePic?: string;
  vehicleInfo: {
    make: string;
    model: string;
    color: string;
    licensePlate: string;
    year?: number;
  };
}

export interface Ride {
  _id: string;
  rider: string;
  driver?: DriverInfo;
  status:
    | 'requested'
    | 'searching'
    | 'accepted'
    | 'arrived'
    | 'in_progress'
    | 'completed'
    | 'cancelled';
  pickupLocation: {
    type: string;
    coordinates: [number, number];
  };
  dropoffLocation: {
    type: string;
    coordinates: [number, number];
  };
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  distanceInKm: number;
  service: 'sedan' | 'suv' | 'auto';
  rideType: 'normal' | 'whole_day' | 'custom';
  paymentMethod: 'CASH' | 'RAZORPAY' | 'WALLET';
  startOtp: string;
  stopOtp: string;
  actualStartTime?: Date;
  actualEndTime?: Date;
  actualDuration?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type RideStatus =
  | 'idle'
  | 'searching'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

@Injectable({
  providedIn: 'root',
})
export class RideService {
  private currentRide$ = new BehaviorSubject<Ride | null>(null);
  private rideStatus$ = new BehaviorSubject<RideStatus>('idle');
  private driverLocation$ = new BehaviorSubject<Location | null>(null);
  private driverETA$ = new BehaviorSubject<number>(0);
  private rideErrors$ = new Subject<string>();

  // Store all socket subscriptions for cleanup
  private socketSubscriptions: Subscription[] = [];

  constructor(
    private socketService: SocketService,
    private storage: Storage,
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {
    this.initStorage();
    this.setupSocketListeners();
  }

  private async initStorage() {
    await this.storage.create();
  }

  /**
   * Setup all socket event listeners
   */
  private setupSocketListeners(): void {
    // Clean up any existing subscriptions first
    this.cleanupSocketListeners();

    // Ride request confirmation
    const rideRequestedSub = this.socketService.on<Ride>('rideRequested').subscribe((ride) => {
      console.log('✅ Ride requested successfully:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('searching');
      this.storeRide(ride);
      this.showToast('🔍 Searching for nearby drivers...');
    });
    this.socketSubscriptions.push(rideRequestedSub);

    // No driver found event
    const noDriverFoundSub = this.socketService
      .on<{ rideId: string; message: string }>('noDriverFound')
      .subscribe((data) => {
        console.warn('⚠️ No driver found:', data);
        // Emit error message FIRST so UI can set showNoDriverFound flag
        // before status change handler runs
        this.rideErrors$.next(data.message || 'No drivers found nearby. Please try again later.');
        // Use setTimeout to ensure error subscription processes first
        setTimeout(() => {
          // Update ride status to cancelled/idle
          this.rideStatus$.next('cancelled');
          // Clear the current ride
          this.currentRide$.next(null);
          this.clearRide();
        }, 0);
        // Don't navigate - let the UI component handle it
      });
    this.socketSubscriptions.push(noDriverFoundSub);

    // Driver accepted ride
    const rideAcceptedSub = this.socketService.on<Ride>('rideAccepted').subscribe((ride) => {
      console.log('✅ Driver accepted ride:', ride);
      console.log('📦 Full ride object:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('accepted');
      this.storeRide(ride);
      this.showToast(`🚗 Driver found! ${ride.driver?.name} is on the way`);
      this.showDriverAcceptedAlert(ride.driver!);
      
      // Navigate to active-ordere page (not driver-details)
      this.router.navigate(['/active-ordere'], {
        replaceUrl: true, // Replace history so back goes to tab1
      });
    });
    this.socketSubscriptions.push(rideAcceptedSub);

    // Driver location updates
    const driverLocationSub = this.socketService
      .on<{ location: Location; estimatedTime: number }>('driverLocationUpdate')
      .subscribe((data) => {
        console.log('📍 Driver location update:', data);
        this.driverLocation$.next(data.location);
        if (data.estimatedTime) {
          this.driverETA$.next(data.estimatedTime);
        }
      });
    this.socketSubscriptions.push(driverLocationSub);

    // Driver arrived at pickup
    const driverArrivedSub = this.socketService.on<Ride>('driverArrived').subscribe((ride) => {
      console.log('✅ Driver arrived:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('arrived');
      this.storeRide(ride);
      this.showDriverArrivedAlert(ride);
    });
    this.socketSubscriptions.push(driverArrivedSub);

    // Ride started
    const rideStartedSub = this.socketService.on<Ride>('rideStarted').subscribe((ride) => {
      console.log('✅ Ride started:', ride);
      console.log('📦 Full ride object:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('in_progress');
      this.storeRide(ride);
      this.showToast('🎉 Ride started! Have a safe journey');
      // Already on active-ordere, just update state
    });
    this.socketSubscriptions.push(rideStartedSub);

    // Live ride location updates
    const rideLocationSub = this.socketService
      .on<{ location: Location }>('rideLocationUpdate')
      .subscribe((data) => {
        console.log('📍 Ride location update:', data);
        this.driverLocation$.next(data.location);
      });
    this.socketSubscriptions.push(rideLocationSub);

    // Ride completed
    const rideCompletedSub = this.socketService.on<Ride>('rideCompleted').subscribe((ride) => {
      console.log('✅ Ride completed:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('completed');
      this.storeRide(ride);
      this.showToast('✅ Ride completed!');
      // Active order page will show rating UI automatically
    });
    this.socketSubscriptions.push(rideCompletedSub);

    // Ride cancelled
    const rideCancelledSub = this.socketService
      .on<{ ride: Ride; reason: string }>('rideCancelled')
      .subscribe((data) => {
        console.log('❌ Ride cancelled:', data);
        this.currentRide$.next(null);
        this.rideStatus$.next('cancelled');
        this.clearRide();
        this.showToast('Ride cancelled');
        this.router.navigate(['/tabs/tab1'], {
          replaceUrl: true, // Clear navigation stack
        });
      });
    this.socketSubscriptions.push(rideCancelledSub);

    // Ride errors
    const rideErrorSub = this.socketService
      .on<{ message: string }>('rideError')
      .subscribe((error) => {
        console.error('❌ Ride error:', error);
        this.rideErrors$.next(error.message);
        this.showToast(`Error: ${error.message}`, 'danger');
      });
    this.socketSubscriptions.push(rideErrorSub);

    // Rating submitted
    const ratingSubmittedSub = this.socketService.on<any>('ratingSubmitted').subscribe((data) => {
      console.log('⭐ Rating submitted:', data);
      this.showToast('Thank you for your feedback!');
      this.clearRide();
      this.router.navigate(['/tabs/tab1'], {
        replaceUrl: true, // Clear navigation stack
      });
    });
    this.socketSubscriptions.push(ratingSubmittedSub);

    // Message sent confirmation
    const messageSentSub = this.socketService.on<any>('messageSent').subscribe((data) => {
      console.log('💬 Message sent:', data);
    });
    this.socketSubscriptions.push(messageSentSub);

    // Receive message from driver
    const receiveMessageSub = this.socketService.on<any>('receiveMessage').subscribe((message) => {
      console.log('📨 New message from driver:', message);
      // This will be handled by the driver-chat page
    });
    this.socketSubscriptions.push(receiveMessageSub);

    // Ride messages (all chat history)
    const rideMessagesSub = this.socketService.on<any[]>('rideMessages').subscribe((messages) => {
      console.log('📚 Ride messages loaded:', messages);
      // This will be handled by the driver-chat page
    });
    this.socketSubscriptions.push(rideMessagesSub);

    // Emergency alert confirmation
    const emergencyAlertSub = this.socketService.on<any>('emergencyAlertCreated').subscribe((data) => {
      console.log('🚨 Emergency alert created:', data);
      this.showToast('Emergency alert sent successfully!', 'success');
    });
    this.socketSubscriptions.push(emergencyAlertSub);

    // Notifications
    const notificationsSub = this.socketService.on<any[]>('notifications').subscribe((notifications) => {
      console.log('🔔 Notifications received:', notifications);
      // This will be handled by the notifications page
    });
    this.socketSubscriptions.push(notificationsSub);

    // Notification marked as read
    const notificationMarkedReadSub = this.socketService.on<any>('notificationMarkedRead').subscribe((data) => {
      console.log('✅ Notification marked as read:', data);
    });
    this.socketSubscriptions.push(notificationMarkedReadSub);

    // Message errors
    const messageErrorSub = this.socketService
      .on<{ message: string }>('messageError')
      .subscribe((error) => {
        console.error('❌ Message error:', error);
        this.showToast(`Message error: ${error.message}`, 'danger');
      });
    this.socketSubscriptions.push(messageErrorSub);

    // Emergency errors
    const emergencyErrorSub = this.socketService
      .on<{ message: string }>('emergencyError')
      .subscribe((error) => {
        console.error('❌ Emergency error:', error);
        this.showToast(`Emergency error: ${error.message}`, 'danger');
      });
    this.socketSubscriptions.push(emergencyErrorSub);

    // Rating errors
    const ratingErrorSub = this.socketService
      .on<{ message: string }>('ratingError')
      .subscribe((error) => {
        console.error('❌ Rating error:', error);
        this.showToast(`Rating error: ${error.message}`, 'danger');
      });
    this.socketSubscriptions.push(ratingErrorSub);

    // General error event
    const errorEventSub = this.socketService
      .on<{ message: string }>('errorEvent')
      .subscribe((error) => {
        console.error('❌ General error:', error);
        this.showToast(`Error: ${error.message}`, 'danger');
      });
    this.socketSubscriptions.push(errorEventSub);
  }

  /**
   * Cleanup all socket subscriptions
   */
  private cleanupSocketListeners(): void {
    this.socketSubscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.socketSubscriptions = [];
  }

  /**
   * Request a new ride
   */
  async requestRide(rideData: {
    pickupLocation: Location;
    dropoffLocation: Location;
    pickupAddress: string;
    dropoffAddress: string;
    fare: number;
    distanceInKm: number;
    service: string;
    rideType: string;
    paymentMethod: string;
  }): Promise<void> {
    try {
      // Get user ID
      const userId = await this.storage.get('userId');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Ensure socket is connected (NO TIMEOUT - wait indefinitely)
      console.log('🔌 Checking socket connection status...');
      if (!this.socketService.isConnected()) {
        console.log('⏳ Socket not connected, waiting for connection...');
        await this.socketService.waitForConnection(); // No timeout parameter = infinite wait
        console.log('✅ Socket connected! Proceeding with ride request...');
      } else {
        console.log('✅ Socket already connected!');
      }

      // Prepare ride request
      const request = {
        rider: userId,
        riderId: userId,
        userSocketId: this.socketService.getSocketId(),
        pickupLocation: {
          longitude: rideData.pickupLocation.longitude,
          latitude: rideData.pickupLocation.latitude,
        },
        dropoffLocation: {
          longitude: rideData.dropoffLocation.longitude,
          latitude: rideData.dropoffLocation.latitude,
        },
        pickupAddress: rideData.pickupAddress,
        dropoffAddress: rideData.dropoffAddress,
        fare: rideData.fare,
        distanceInKm: rideData.distanceInKm,
        service: rideData.service,
        rideType: rideData.rideType,
        paymentMethod: rideData.paymentMethod,
      };

      console.log('📤 Requesting ride:', request);

      // Emit ride request
      this.socketService.emit('newRideRequest', request);

      // Update status
      this.rideStatus$.next('searching');

      // Navigate to searching page
      this.router.navigate(['/cab-searching']);
    } catch (error) {
      console.error('Error requesting ride:', error);
      this.showToast('Failed to request ride. Please try again.', 'danger');
      throw error;
    }
  }

  /**
   * Cancel current ride
   */
  async cancelRide(reason?: string): Promise<void> {
    const ride = this.currentRide$.value;
    if (!ride) {
      throw new Error('No active ride to cancel');
    }

    try {
      const userId = await this.storage.get('userId');

      this.socketService.emit('rideCancelled', {
        rideId: ride._id,
        cancelledBy: 'rider',
        userId: userId,
        reason: reason || 'User cancelled',
      });

      console.log('📤 Ride cancellation requested');
    } catch (error) {
      console.error('Error cancelling ride:', error);
      this.showToast('Failed to cancel ride', 'danger');
      throw error;
    }
  }

  /**
   * Submit rating for completed ride
   */
  async submitRating(
    rating: number,
    review?: string,
    tags?: string[]
  ): Promise<void> {
    const ride = this.currentRide$.value;
    if (!ride) {
      throw new Error('No ride to rate');
    }

    try {
      const userId = await this.storage.get('userId');

      this.socketService.emit('submitRating', {
        rideId: ride._id,
        ratedBy: userId,
        ratedByModel: 'User',
        ratedTo: ride.driver?._id,
        ratedToModel: 'Driver',
        rating,
        review: review || '',
        tags: tags || [],
      });

      console.log('⭐ Rating submitted:', { rating, review, tags });
    } catch (error) {
      console.error('Error submitting rating:', error);
      this.showToast('Failed to submit rating', 'danger');
      throw error;
    }
  }

  /**
   * Send message to driver
   */
  sendMessage(message: string, messageType: string = 'text'): void {
    const ride = this.currentRide$.value;
    if (!ride || !ride.driver) {
      console.warn('No active ride or driver to send message to');
      return;
    }

    this.socketService.emit('sendMessage', {
      rideId: ride._id,
      senderId: ride.rider,
      senderModel: 'User',
      receiverId: ride.driver._id,
      receiverModel: 'Driver',
      message: message,
      messageType: messageType, // 'text', 'location', 'audio'
    });
  }

  /**
   * Get ride messages
   */
  getRideMessages(rideId: string): void {
    this.socketService.emit('getRideMessages', {
      rideId: rideId,
    });
  }

  /**
   * Trigger emergency alert
   */
  async triggerEmergency(
    location: { latitude: number; longitude: number },
    reason: string = 'other',
    description?: string
  ): Promise<void> {
    const ride = this.currentRide$.value;
    if (!ride) {
      this.showToast('No active ride', 'warning');
      return;
    }

    try {
      const userId = await this.storage.get('userId');

      this.socketService.emit('emergencyAlert', {
        rideId: ride._id,
        triggeredBy: userId,
        triggeredByModel: 'User',
        location: {
          longitude: location.longitude,
          latitude: location.latitude,
        },
        reason: reason, // 'accident', 'harassment', 'unsafe_driving', 'medical', 'other'
        description: description || '',
      });

      await this.showAlert(
        '🚨 Emergency Alert Sent',
        'Emergency services and support team have been notified. Help is on the way.'
      );
    } catch (error) {
      console.error('Error triggering emergency:', error);
      this.showToast('Failed to send emergency alert', 'danger');
    }
  }

  /**
   * Get notifications
   */
  async getNotifications(): Promise<void> {
    try {
      const userId = await this.storage.get('userId');

      this.socketService.emit('getNotifications', {
        userId: userId,
        userModel: 'User',
      });
    } catch (error) {
      console.error('Error getting notifications:', error);
    }
  }

  /**
   * Mark notification as read
   */
  markNotificationRead(notificationId: string): void {
    this.socketService.emit('markNotificationRead', {
      notificationId: notificationId,
    });
  }

  /**
   * Get current ride
   */
  getCurrentRide(): Observable<Ride | null> {
    return this.currentRide$.asObservable();
  }

  /**
   * Get current ride value
   */
  getCurrentRideValue(): Ride | null {
    return this.currentRide$.value;
  }

  /**
   * Get ride status
   */
  getRideStatus(): Observable<RideStatus> {
    return this.rideStatus$.asObservable();
  }

  /**
   * Get driver location
   */
  getDriverLocation(): Observable<Location | null> {
    return this.driverLocation$.asObservable();
  }

  /**
   * Get driver ETA
   */
  getDriverETA(): Observable<number> {
    return this.driverETA$.asObservable();
  }

  /**
   * Get ride errors
   */
  getRideErrors(): Observable<string> {
    return this.rideErrors$.asObservable();
  }

  /**
   * Store ride in local storage
   */
  private async storeRide(ride: Ride): Promise<void> {
    try {
      await this.storage.set('currentRide', ride);
      await this.storage.set('rideStatus', ride.status);
    } catch (error) {
      console.error('Error storing ride:', error);
    }
  }

  /**
   * Clear ride from storage
   */
  private async clearRide(): Promise<void> {
    try {
      await this.storage.remove('currentRide');
      await this.storage.remove('rideStatus');
    } catch (error) {
      console.error('Error clearing ride:', error);
    }
  }

  /**
   * Restore ride from storage (on app restart)
   */
  async restoreRide(): Promise<void> {
    try {
      const ride = await this.storage.get('currentRide');
      const status = await this.storage.get('rideStatus');

      if (ride && status && status !== 'completed' && status !== 'cancelled') {
        this.currentRide$.next(ride);
        this.rideStatus$.next(status);

        // Navigate to appropriate page based on status
        if (status === 'searching') {
          this.router.navigate(['/cab-searching']);
        } else if (status === 'accepted' || status === 'arrived') {
          this.router.navigate(['/driver-details'], {
            state: { driver: ride.driver, ride },
          });
        } else if (status === 'in_progress') {
          this.router.navigate(['/active-ordere'], { state: { ride } });
        }
      }
    } catch (error) {
      console.error('Error restoring ride:', error);
    }
  }

  /**
   * Show toast notification
   */
  private async showToast(
    message: string,
    color: string = 'success'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }

  /**
   * Show driver accepted alert
   */
  private async showDriverAcceptedAlert(driver: DriverInfo): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '🚗 Driver Found!',
      message: `
        <strong>${driver.name}</strong> is coming to pick you up<br><br>
        <strong>Vehicle:</strong> ${driver.vehicleInfo.color} ${driver.vehicleInfo.make} ${driver.vehicleInfo.model}<br>
        <strong>Plate:</strong> ${driver.vehicleInfo.licensePlate}<br>
        <strong>Rating:</strong> ⭐ ${driver.rating}
      `,
      buttons: ['OK'],
    });
    await alert.present();
  }

  /**
   * Show driver arrived alert
   */
  private async showDriverArrivedAlert(ride: Ride): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '🎉 Driver Arrived!',
      message: `
        Your driver is waiting for you.<br><br>
        <strong>Share this OTP to start your ride:</strong><br>
        <div style="font-size: 32px; font-weight: bold; color: #0984E3; text-align: center; margin: 16px 0;">
          ${ride.startOtp}
        </div>
      `,
      buttons: [
        {
          text: 'Copy OTP',
          handler: () => {
            this.copyToClipboard(ride.startOtp);
            this.showToast('OTP copied to clipboard');
          },
        },
        'OK',
      ],
    });
    await alert.present();
  }

  /**
   * Show alert
   */
  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  /**
   * Copy text to clipboard
   */
  private copyToClipboard(text: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }
}
