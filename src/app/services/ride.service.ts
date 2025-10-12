import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
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
    // Ride request confirmation
    this.socketService.on<Ride>('rideRequested').subscribe((ride) => {
      console.log('✅ Ride requested successfully:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('searching');
      this.storeRide(ride);
      this.showToast('🔍 Searching for nearby drivers...');
    });

    // Driver accepted ride
    this.socketService.on<Ride>('rideAccepted').subscribe((ride) => {
      console.log('✅ Driver accepted ride:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('accepted');
      this.storeRide(ride);
      this.showToast(`🚗 Driver found! ${ride.driver?.name} is on the way`);
      this.showDriverAcceptedAlert(ride.driver!);
      this.router.navigate(['/driver-details'], {
        state: { driver: ride.driver, ride },
      });
    });

    // Driver location updates
    this.socketService
      .on<{ location: Location; estimatedTime: number }>('driverLocationUpdate')
      .subscribe((data) => {
        console.log('📍 Driver location update:', data);
        this.driverLocation$.next(data.location);
        if (data.estimatedTime) {
          this.driverETA$.next(data.estimatedTime);
        }
      });

    // Driver arrived at pickup
    this.socketService.on<Ride>('driverArrived').subscribe((ride) => {
      console.log('✅ Driver arrived:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('arrived');
      this.storeRide(ride);
      this.showDriverArrivedAlert(ride);
    });

    // Ride started
    this.socketService.on<Ride>('rideStarted').subscribe((ride) => {
      console.log('✅ Ride started:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('in_progress');
      this.storeRide(ride);
      this.showToast('🎉 Ride started! Have a safe journey');
      this.router.navigate(['/active-ordere'], {
        state: { ride },
      });
    });

    // Live ride location updates
    this.socketService
      .on<{ location: Location }>('rideLocationUpdate')
      .subscribe((data) => {
        console.log('📍 Ride location update:', data);
        this.driverLocation$.next(data.location);
      });

    // Ride completed
    this.socketService.on<Ride>('rideCompleted').subscribe((ride) => {
      console.log('✅ Ride completed:', ride);
      this.currentRide$.next(ride);
      this.rideStatus$.next('completed');
      this.storeRide(ride);
      this.showToast('✅ Ride completed!');
      // Active order page will show rating UI automatically
    });

    // Ride cancelled
    this.socketService
      .on<{ ride: Ride; reason: string }>('rideCancelled')
      .subscribe((data) => {
        console.log('❌ Ride cancelled:', data);
        this.currentRide$.next(null);
        this.rideStatus$.next('cancelled');
        this.clearRide();
        this.showToast('Ride cancelled');
        this.router.navigate(['/tabs/tab1']);
      });

    // Ride errors
    this.socketService
      .on<{ message: string }>('rideError')
      .subscribe((error) => {
        console.error('❌ Ride error:', error);
        this.rideErrors$.next(error.message);
        this.showToast(`Error: ${error.message}`, 'danger');
      });

    // Rating submitted
    this.socketService.on<any>('ratingSubmitted').subscribe((data) => {
      console.log('⭐ Rating submitted:', data);
      this.showToast('Thank you for your feedback!');
      this.clearRide();
      this.router.navigate(['/tabs/tab1']);
    });
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

      // Ensure socket is connected
      if (!this.socketService.isConnected()) {
        await this.socketService.waitForConnection();
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
  sendMessage(message: string): void {
    const ride = this.currentRide$.value;
    if (!ride) return;

    this.socketService.emit('sendMessage', {
      rideId: ride._id,
      message,
      from: 'rider',
    });
  }

  /**
   * Trigger emergency alert
   */
  async triggerEmergency(): Promise<void> {
    const ride = this.currentRide$.value;
    if (!ride) return;

    try {
      const userId = await this.storage.get('userId');

      this.socketService.emit('emergencyAlert', {
        rideId: ride._id,
        userId,
        location: {
          latitude: ride.pickupLocation.coordinates[1],
          longitude: ride.pickupLocation.coordinates[0],
        },
      });

      await this.showAlert(
        'Emergency Alert Sent',
        'Emergency services have been notified.'
      );
    } catch (error) {
      console.error('Error triggering emergency:', error);
    }
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
