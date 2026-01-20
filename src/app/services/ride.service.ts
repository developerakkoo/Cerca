import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom, Subscription } from 'rxjs';
import { SocketService } from './socket.service';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

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
  private unreadCounts$ = new BehaviorSubject<Map<string, number>>(new Map());

  // Store all socket subscriptions for cleanup
  private socketSubscriptions: Subscription[] = [];

  constructor(
    private socketService: SocketService,
    private storage: Storage,
    private router: Router,
    private toastCtrl: ToastController,
    private http: HttpClient
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
      
      // Navigate to active-ordere page (not driver-details)
      this.router.navigate(['/active-ordere'], {
        replaceUrl: true, // Replace history so back goes to tab1
      });
    });
    this.socketSubscriptions.push(rideAcceptedSub);

    // Driver location updates
    const driverLocationSub = this.socketService
      .on<{ location: Location | { coordinates: [number, number] }; estimatedTime?: number }>('driverLocationUpdate')
      .subscribe((data) => {
        console.log('📍 Driver location update:', data);
        
        // Transform location format if needed
        let location: Location;
        if ('coordinates' in data.location) {
          // Backend sends {coordinates: [lng, lat]}
          location = {
            latitude: data.location.coordinates[1],
            longitude: data.location.coordinates[0],
          };
        } else {
          // Already in correct format
          location = data.location as Location;
        }
        
        this.driverLocation$.next(location);
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
      .on<{ location: Location | { coordinates: [number, number] } }>('rideLocationUpdate')
      .subscribe((data) => {
        console.log('📍 Ride location update:', data);
        
        // Transform location format if needed
        let location: Location;
        if ('coordinates' in data.location) {
          // Backend sends {coordinates: [lng, lat]}
          location = {
            latitude: data.location.coordinates[1],
            longitude: data.location.coordinates[0],
          };
        } else {
          // Already in correct format
          location = data.location as Location;
        }
        
        this.driverLocation$.next(location);
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
      .on<{ message: string; code?: string; details?: string }>('rideError')
      .subscribe((error) => {
        console.error('❌ Ride error:', error);
        console.error('   Error code:', error.code);
        console.error('   Error details:', error.details);
        
        // Parse error message to show user-friendly message
        let userMessage = error.message || 'Failed to process ride request';
        
        // Map common error codes to user-friendly messages
        if (error.code === 'PAYMENT_NOT_VERIFIED' || error.code === 'PAYMENT_VERIFICATION_FAILED') {
          userMessage = 'Payment verification failed. Please try again.';
        } else if (error.code === 'PAYMENT_AMOUNT_MISMATCH') {
          userMessage = 'Payment amount mismatch. Please try again.';
        } else if (error.message && error.message.includes('Invalid service')) {
          userMessage = 'Service not available. Please try again later.';
        } else if (error.message && error.message.includes('FULL_DAY booking requires')) {
          userMessage = 'Please select both start and end date/time for full day booking.';
        } else if (error.message && error.message.includes('RENTAL booking requires')) {
          userMessage = 'Please select start date and rental duration.';
        } else if (error.message && error.message.includes('DATE_WISE booking requires')) {
          userMessage = 'Please select at least one date for booking.';
        } else if (error.message && error.message.includes('Admin settings not found')) {
          userMessage = 'Service temporarily unavailable. Please try again later.';
        }
        
        this.rideErrors$.next(userMessage);
        this.showToast(userMessage, 'danger');
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

    // Note: receiveMessage listener removed - handled by DriverChatPage directly
    // This ensures proper separation of concerns and prevents duplicate message processing

    // Unread count updated from backend
    const unreadCountUpdatedSub = this.socketService
      .on<{ rideId: string; receiverId: string; receiverModel: string; count: number }>('unreadCountUpdated')
      .subscribe((data) => {
        console.log('🔔 Unread count updated:', data);
        console.log('   Ride ID:', data.rideId);
        console.log('   Count:', data.count);
        console.log('   Receiver:', data.receiverId, `(${data.receiverModel})`);
        
        // Update unread count for the specific ride
        const currentCounts = this.unreadCounts$.value;
        currentCounts.set(data.rideId, data.count);
        this.unreadCounts$.next(new Map(currentCounts));
        
        console.log('✅ Unread count updated in state - rideId:', data.rideId, 'count:', data.count);
      });
    this.socketSubscriptions.push(unreadCountUpdatedSub);

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
    razorpayPaymentId?: string;
    walletAmountUsed?: number;
    razorpayAmountPaid?: number;
    promoCode?: string;
    bookingType?: 'FULL_DAY' | 'RENTAL' | 'DATE_WISE' | 'INSTANT';
    bookingMeta?: {
      startTime?: Date | string;
      endTime?: Date | string;
      days?: number;
      dates?: Date[] | string[];
    };
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

      // Prepare ride request with GeoJSON Point format for locations
      const request: any = {
        rider: userId,
        riderId: userId,
        userSocketId: this.socketService.getSocketId(),
        pickupLocation: {
          type: 'Point',
          coordinates: [rideData.pickupLocation.longitude, rideData.pickupLocation.latitude]
        },
        dropoffLocation: {
          type: 'Point',
          coordinates: [rideData.dropoffLocation.longitude, rideData.dropoffLocation.latitude]
        },
        pickupAddress: rideData.pickupAddress,
        dropoffAddress: rideData.dropoffAddress,
        fare: rideData.fare,
        distanceInKm: rideData.distanceInKm,
        service: rideData.service,
        rideType: rideData.rideType,
        paymentMethod: rideData.paymentMethod,
      };
      
      // Add booking type and meta if provided
      if (rideData.bookingType) {
        request.bookingType = rideData.bookingType;
      }
      
      if (rideData.bookingMeta) {
        const bookingMeta: any = {};
        
        // Handle FULL_DAY booking
        if (rideData.bookingType === 'FULL_DAY') {
          if (rideData.bookingMeta.startTime) {
            bookingMeta.startTime = rideData.bookingMeta.startTime instanceof Date 
              ? rideData.bookingMeta.startTime.toISOString() 
              : rideData.bookingMeta.startTime;
          }
          if (rideData.bookingMeta.endTime) {
            bookingMeta.endTime = rideData.bookingMeta.endTime instanceof Date 
              ? rideData.bookingMeta.endTime.toISOString() 
              : rideData.bookingMeta.endTime;
          }
        }
        
        // Handle RENTAL booking
        if (rideData.bookingType === 'RENTAL') {
          if (rideData.bookingMeta.days !== undefined) {
            bookingMeta.days = rideData.bookingMeta.days;
          }
          if (rideData.bookingMeta.startTime) {
            bookingMeta.startTime = rideData.bookingMeta.startTime instanceof Date 
              ? rideData.bookingMeta.startTime.toISOString() 
              : rideData.bookingMeta.startTime;
          }
        }
        
        // Handle DATE_WISE booking
        if (rideData.bookingType === 'DATE_WISE' && rideData.bookingMeta.dates) {
          bookingMeta.dates = rideData.bookingMeta.dates.map(date => 
            date instanceof Date ? date.toISOString() : date
          );
        }
        
        request.bookingMeta = bookingMeta;
      }
      
      // Add hybrid payment details if present
      if (rideData.razorpayPaymentId) {
        request.razorpayPaymentId = rideData.razorpayPaymentId;
      }
      if (rideData.walletAmountUsed !== undefined) {
        request.walletAmountUsed = rideData.walletAmountUsed;
      }
      if (rideData.razorpayAmountPaid !== undefined) {
        request.razorpayAmountPaid = rideData.razorpayAmountPaid;
      }
      // Add promo code if present
      if (rideData.promoCode) {
        request.promoCode = rideData.promoCode;
      }

      console.log('📤 Requesting ride:', request);
      console.log('   Service:', request.service);
      console.log('   Booking Type:', request.bookingType);
      console.log('   Booking Meta:', request.bookingMeta);

      // Emit ride request
      this.socketService.emit('newRideRequest', request);

      // Update status
      this.rideStatus$.next('searching');

      // Navigate to searching page
      this.router.navigate(['/cab-searching']);
    } catch (error: any) {
      console.error('Error requesting ride:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error?.message);
      console.error('   Error stack:', error?.stack);
      
      // Show user-friendly error message
      let errorMessage = 'Failed to request ride. Please try again.';
      if (error?.message) {
        errorMessage = error.message;
      }
      
      this.showToast(errorMessage, 'danger');
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
   * Send message to driver via socket
   */
  async sendMessage(message: string, messageType: string = 'text'): Promise<void> {
    console.log('📤 ========================================');
    console.log('📤 [RideService] sendMessage() called');
    console.log('📤 ========================================');
    console.log('📝 Message text:', message);
    console.log('📝 Message type:', messageType);
    
    const ride = this.currentRide$.value;
    console.log('🚗 Current ride:', ride ? { id: ride._id, driver: ride.driver?._id, rider: ride.rider } : 'null');
    
    if (!ride || !ride.driver) {
      console.error('❌ [RideService] Cannot send message:');
      console.error('   - Ride exists:', !!ride);
      console.error('   - Driver exists:', !!ride?.driver);
      console.error('========================================');
      return;
    }

    // Get user ID from storage if ride.rider is not available
    let senderId = ride.rider;
    if (!senderId || typeof senderId !== 'string') {
      console.warn('⚠️ [RideService] ride.rider is not a valid string, fetching from storage...');
      senderId = await this.storage.get('userId');
      console.log('👤 [RideService] User ID from storage:', senderId || 'null');
    }
    
    if (!senderId) {
      console.error('❌ [RideService] Cannot determine sender ID');
      console.error('   ride.rider:', ride.rider);
      console.error('   userId from storage:', await this.storage.get('userId'));
      console.error('========================================');
      return;
    }

    // Check socket connection status
    const isSocketConnected = this.socketService.isConnected();
    const socketId = this.socketService.getSocketId();
    console.log('🔌 Socket connection status:', isSocketConnected ? 'CONNECTED' : 'DISCONNECTED');
    console.log('🔌 Socket ID:', socketId || 'null');
    
    if (!isSocketConnected) {
      console.error('❌ [RideService] Socket is not connected! Cannot send message via socket.');
      console.error('   Message will only be sent via REST API.');
      console.error('   Attempting to reconnect socket...');
      
      // Try to reconnect socket by reinitializing
      try {
        const userId = await this.storage.get('userId');
        if (userId) {
          console.log('🔄 [RideService] Reinitializing socket connection...');
          // Reset initialization flag and reconnect
          (this.socketService as any).isInitialized = false;
          await this.socketService.initialize({ userId, userType: 'rider' });
          
          // Wait for connection (socket connection is async)
          console.log('⏳ [RideService] Waiting for socket connection...');
          let retries = 0;
          const maxRetries = 5;
          while (retries < maxRetries && !this.socketService.isConnected()) {
            await new Promise(resolve => setTimeout(resolve, 500));
            retries++;
            console.log(`   Retry ${retries}/${maxRetries}...`);
          }
          
          // Check again
          const stillConnected = this.socketService.isConnected();
          const newSocketId = this.socketService.getSocketId();
          console.log('🔌 [RideService] Socket connection after retry:', stillConnected ? 'CONNECTED' : 'DISCONNECTED');
          console.log('🔌 [RideService] New socket ID:', newSocketId || 'null');
          
          if (!stillConnected) {
            console.error('❌ [RideService] Socket still not connected after retry');
            console.error('   Will proceed with REST API only');
            console.error('========================================');
            // Don't emit socket event, REST API will handle it
            return;
          }
          
          console.log('✅ [RideService] Socket reconnected successfully!');
        } else {
          console.error('❌ [RideService] No userId found, cannot reconnect socket');
          console.error('========================================');
          return;
        }
      } catch (error) {
        console.error('❌ [RideService] Error reconnecting socket:', error);
        console.error('   Error type:', error?.constructor?.name);
        console.error('   Error message:', error instanceof Error ? error.message : String(error));
        console.error('   Stack trace:', error instanceof Error ? error.stack : 'N/A');
        console.error('========================================');
        return; // Exit early, REST API will handle it
      }
    }

    const messageData = {
      rideId: ride._id,
      senderId: senderId,
      senderModel: 'User',
      receiverId: ride.driver._id,
      receiverModel: 'Driver',
      message: message,
      messageType: messageType, // 'text', 'location', 'audio'
    };

    console.log('📦 [RideService] Message data to emit:', messageData);
    console.log('📡 [RideService] Attempting to emit sendMessage event...');
    
    try {
      this.socketService.emit('sendMessage', messageData);
      console.log('✅ [RideService] sendMessage event emitted successfully');
      console.log('========================================');
    } catch (error) {
      console.error('❌ [RideService] Error emitting sendMessage event:', error);
      console.error('   Error details:', error);
      console.error('========================================');
    }
  }

  /**
   * Send message to driver via REST API (for persistence)
   */
  async sendMessageViaAPI(message: string, messageType: string = 'text'): Promise<any> {
    console.log('🌐 ========================================');
    console.log('🌐 [RideService] sendMessageViaAPI() called');
    console.log('🌐 ========================================');
    console.log('📝 Message text:', message);
    console.log('📝 Message type:', messageType);
    
    try {
      const ride = this.currentRide$.value;
      console.log('🚗 [RideService] Current ride:', ride ? { id: ride._id, driver: ride.driver?._id } : 'null');
      
      if (!ride || !ride.driver) {
        console.error('❌ [RideService] No active ride or driver');
        throw new Error('No active ride or driver to send message to');
      }

      const userId = await this.storage.get('userId');
      const token = await this.storage.get('token');
      console.log('👤 [RideService] User ID:', userId || 'null');
      console.log('🔑 [RideService] Token exists:', !!token);

      if (!userId || !token) {
        console.error('❌ [RideService] User not authenticated');
        throw new Error('User not authenticated');
      }

      const requestBody = {
        rideId: ride._id,
        senderId: userId,
        senderModel: 'User',
        receiverId: ride.driver._id,
        receiverModel: 'Driver',
        message: message,
        messageType: messageType,
      };

      console.log('📤 [RideService] Sending message via API for ride:', ride._id);
      console.log('📦 [RideService] Request body:', requestBody);
      console.log('🌐 [RideService] API URL:', `${environment.apiUrl}/messages`);

      const response = await firstValueFrom(
        this.http.post<{ message: string; data: any }>(
          `${environment.apiUrl}/messages`,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      console.log('✅ [RideService] Message sent via API successfully');
      console.log('📦 [RideService] Response status:', response ? 'OK' : 'null');
      console.log('📦 [RideService] Response data:', response.data);
      console.log('========================================');
      
      return response.data;
    } catch (error: any) {
      console.error('❌ [RideService] Error sending message via API:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error?.message);
      console.error('   HTTP status:', error?.status);
      console.error('   Response data:', error?.error);
      console.error('========================================');
      throw error;
    }
  }

  /**
   * Join a ride room for real-time messaging
   */
  async joinRideRoom(rideId: string, userId?: string, userType: 'User' | 'Driver' = 'User'): Promise<void> {
    console.log('🚪 ========================================');
    console.log('🚪 [RideService] joinRideRoom() called');
    console.log('🚪 ========================================');
    console.log('🆔 Ride ID:', rideId);
    console.log('👤 User Type:', userType);
    
    try {
      // Get userId if not provided
      let finalUserId = userId;
      if (!finalUserId && userType === 'User') {
        finalUserId = await this.storage.get('userId');
      }
      
      if (!finalUserId) {
        console.error('❌ [RideService] Cannot join room: userId not found');
        throw new Error('User ID is required to join room');
      }
      
      // Ensure socket is connected
      if (!this.socketService.isConnected()) {
        console.warn('⚠️ [RideService] Socket not connected, waiting for connection...');
        await this.socketService.waitForConnection(10000);
      }
      
      const roomData = {
        rideId: rideId,
        userId: userType === 'User' ? finalUserId : undefined,
        driverId: userType === 'Driver' ? finalUserId : undefined,
        userType: userType,
      };
      
      console.log('📤 [RideService] Emitting joinRideRoom event:', roomData);
      this.socketService.emit('joinRideRoom', roomData);
      
      // Wait for confirmation (optional - can be handled via listener)
      console.log('✅ [RideService] joinRideRoom event emitted');
      console.log('========================================');
    } catch (error) {
      console.error('❌ [RideService] Error joining room:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error instanceof Error ? error.message : String(error));
      console.log('========================================');
      throw error;
    }
  }

  /**
   * Leave a ride room
   */
  async leaveRideRoom(rideId: string): Promise<void> {
    console.log('🚪 ========================================');
    console.log('🚪 [RideService] leaveRideRoom() called');
    console.log('🚪 ========================================');
    console.log('🆔 Ride ID:', rideId);
    
    try {
      if (!this.socketService.isConnected()) {
        console.warn('⚠️ [RideService] Socket not connected, cannot leave room');
        return;
      }
      
      const roomData = {
        rideId: rideId,
      };
      
      console.log('📤 [RideService] Emitting leaveRideRoom event:', roomData);
      this.socketService.emit('leaveRideRoom', roomData);
      
      console.log('✅ [RideService] leaveRideRoom event emitted');
      console.log('========================================');
    } catch (error) {
      console.error('❌ [RideService] Error leaving room:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error instanceof Error ? error.message : String(error));
      console.log('========================================');
    }
  }

  /**
   * Get ride messages via socket
   */
  getRideMessages(rideId: string): void {
    this.socketService.emit('getRideMessages', {
      rideId: rideId,
    });
  }

  /**
   * Get ride messages via REST API (fallback/primary method)
   */
  async getRideMessagesViaAPI(rideId: string): Promise<any[]> {
    console.log('📡 ========================================');
    console.log('📡 [RideService] getRideMessagesViaAPI() called');
    console.log('📡 ========================================');
    console.log('🆔 [RideService] Ride ID:', rideId);
    console.log('⏰ [RideService] Request timestamp:', new Date().toISOString());
    
    try {
      const apiUrl = `${environment.apiUrl}/messages/ride/${rideId}`;
      console.log('🌐 [RideService] API URL:', apiUrl);
      console.log('📡 [RideService] Fetching messages via API...');
      
      const response = await firstValueFrom(
        this.http.get<{ messages?: any[]; data?: any[]; count?: number }>(
          apiUrl
        )
      );

      console.log('✅ [RideService] API call completed');
      console.log('📦 [RideService] Raw API response:', response);
      console.log('📦 [RideService] Response type:', typeof response);
      console.log('📦 [RideService] Is array:', Array.isArray(response));

      // Handle different response formats
      if (response) {
        if (Array.isArray(response)) {
          console.log('✅ [RideService] Messages found (array format):', response.length);
          console.log('========================================');
          return response;
        } else if (response.messages && Array.isArray(response.messages)) {
          console.log('✅ [RideService] Messages found (messages property):', response.messages.length);
          console.log('   Response keys:', Object.keys(response));
          console.log('========================================');
          return response.messages;
        } else if (response.data && Array.isArray(response.data)) {
          console.log('✅ [RideService] Messages found (data property):', response.data.length);
          console.log('   Response keys:', Object.keys(response));
          console.log('========================================');
          return response.data;
        } else {
          console.warn('⚠️ [RideService] Unexpected response format:', response);
          console.warn('   Response keys:', Object.keys(response));
          console.warn('   Response type:', typeof response);
        }
      }

      console.warn('⚠️ [RideService] No messages found in response');
      console.log('========================================');
      return [];
    } catch (error: any) {
      console.error('❌ [RideService] Error fetching messages via API:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error?.message);
      if (error.error) {
        console.error('   Error details:', error.error);
      }
      if (error.status) {
        console.error('   HTTP Status:', error.status);
      }
      if (error.statusText) {
        console.error('   Status Text:', error.statusText);
      }
      console.log('========================================');
      return [];
    }
  }

  /**
   * Get unread message count for a ride
   */
  async getUnreadCountForRide(rideId: string): Promise<number> {
    try {
      const userId = await this.storage.get('userId');
      if (!userId) {
        return 0;
      }

      const response = await this.http
        .get<{ unreadCount: number }>(
          `${environment.apiUrl}/messages/ride/${rideId}/unread-count?receiverId=${userId}&receiverModel=User`
        )
        .toPromise();

      const count = response?.unreadCount || 0;
      
      // Update local state
      const currentCounts = this.unreadCounts$.value;
      currentCounts.set(rideId, count);
      this.unreadCounts$.next(new Map(currentCounts));

      return count;
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
  }

  /**
   * Mark all messages as read for a ride
   */
  async markMessagesAsRead(rideId: string): Promise<void> {
    try {
      const userId = await this.storage.get('userId');
      if (!userId) {
        return;
      }

      await this.http
        .patch(
          `${environment.apiUrl}/messages/ride/${rideId}/read-all`,
          { receiverId: userId }
        )
        .toPromise();

      // Update local state
      const currentCounts = this.unreadCounts$.value;
      currentCounts.set(rideId, 0);
      this.unreadCounts$.next(new Map(currentCounts));

      console.log('✅ Messages marked as read for ride:', rideId);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  /**
   * Get unread counts observable
   */
  getUnreadCounts(): Observable<Map<string, number>> {
    return this.unreadCounts$.asObservable();
  }

  /**
   * Get unread count for a specific ride
   */
  getUnreadCountForRideValue(rideId: string): number {
    return this.unreadCounts$.value.get(rideId) || 0;
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

      await this.showToast(
        '🚨 Emergency alert sent. Help is on the way.',
        'primary'
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
   * Delete all notifications for the current user
   */
  async deleteAllNotifications(): Promise<void> {
    try {
      const userId = await this.storage.get('userId');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      await this.http
        .request('DELETE', `${environment.apiUrl}/notifications/all/${userId}`, {
          body: { recipientModel: 'User' },
        })
        .toPromise();

      console.log('✅ All notifications deleted successfully');
    } catch (error: any) {
      console.error('Error deleting all notifications:', error);
      throw new Error(
        error?.message || 'Failed to delete all notifications'
      );
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
   * Get all rides for a specific user
   * @param userId - The user ID to fetch rides for
   * @returns Observable of Ride array
   */
  getUserRides(userId: string): Observable<Ride[]> {
    return this.http.get<Ride[]>(`${environment.apiUrl}/rides/rides/user/${userId}`);
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
   * Copy text to clipboard
   */
  private copyToClipboard(text: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }
}
