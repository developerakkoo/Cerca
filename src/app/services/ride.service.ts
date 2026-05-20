import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom, Subscription, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SocketService } from './socket.service';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { type DriverCancelSettlementAction } from 'src/app/components/ride/driver-cancel-settlement-modal/driver-cancel-settlement-modal.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { PaymentService } from './payment.service';
import { WalletService } from './wallet.service';
import { Geolocation } from '@capacitor/geolocation';
import { formatInrWithSymbol } from '../utils/money-display.util';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface LocationWithAddress extends Location {
  address: string;
}

export interface PassengerInfo {
  name: string;
  phone: string;
  relation?: string;
  notes?: string;
}

export interface DriverInfo {
  _id: string;
  name: string;
  phone: string;
  rating: number;
  totalTrips: number;
  profilePic?: string;
  vehicleInfo?: {
    make?: string;
    model?: string;
    color?: string;
    licensePlate?: string;
    year?: number;
    vehicleType?: string;
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
  paymentStatus?: 'pending' | 'completed' | 'failed' | 'refunded';
  razorpayPaymentId?: string | null;
  walletAmountUsed?: number;
  /** Server-computed payable amount (user ride list / payment-summary). */
  amountDue?: number;
  payableAmountSource?: string;
  startOtp: string;
  stopOtp: string;
  actualStartTime?: Date;
  actualEndTime?: Date;
  actualDuration?: number;
  bookingType?: 'INSTANT' | 'FULL_DAY' | 'RENTAL' | 'DATE_WISE';
  bookingMeta?: {
    startTime?: Date | string;
    endTime?: Date | string;
    days?: number;
    dates?: Date[] | string[];
  };
  rideFor?: 'SELF' | 'OTHER';
  passenger?: {
    name?: string;
    phone?: string;
    relation?: string;
    notes?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  cancelledBy?: 'rider' | 'driver' | 'system';
  cancellationReason?: string;
  driverArrivedAt?: string | Date;
  startOtpVerifiedAt?: string | Date;
  stopOtpVerifiedAt?: string | Date;
  estimatedArrivalTime?: string | Date;
  fareBreakdown?: {
    baseFare?: number;
    distanceFare?: number;
    timeFare?: number;
    subtotal?: number;
    fareAfterMinimum?: number;
    discount?: number;
    pickupWaitCharge?: number;
    finalFare?: number;
  };
  pickupWait?: {
    waitStartedAt?: string | Date | null;
    waitEndedAt?: string | Date | null;
    waitDurationSeconds?: number;
    freeMinutesApplied?: number;
    tier1BillableMinutes?: number;
    tier2BillableMinutes?: number;
    amountTier1?: number;
    amountTier2?: number;
    totalPickupWaitCharge?: number;
    computedAt?: string | Date | null;
    policyVersion?: string | null;
  };
  driverInProgressCancelSettlement?: {
    partialDistanceKm?: number;
    perKmRateUsed?: number;
    perKmRateSource?: string;
    riderPenaltyAmount?: number;
    driverPartialAmount?: number;
    riderTotalCharge?: number;
    prepaidTotal?: number;
    additionalDue?: number;
    refundDue?: number;
    riderPaymentStatus?: string;
    fineRecipient?: string;
    allowedSettlementMethods?: Array<'wallet' | 'razorpay' | 'cash'>;
  };
  /** Rider-safe summary when driver cancels during in_progress (socket / API). */
  riderInProgressCancelBilling?: RiderInProgressCancelBilling;
  /** Rider-safe summary when rider cancels before start OTP (per-km + penalty). */
  riderBeforeStartCancelBilling?: RiderBeforeStartCancelBilling;
  settlementHiddenForRider?: boolean;
  /** Persisted when ride completes (e.g. driver_cancel_near_destination). */
  completionSource?: string;
  /** Increments on each successful PATCH /destination (optimistic concurrency). */
  destinationRevision?: number;
  razorpayAmountPaid?: number;
}

/** Billing breakdown for driver in-trip cancel (no coordinates). */
export interface RiderInProgressCancelBilling {
  partialDistanceKm?: number;
  perKmRateUsed?: number;
  perKmRateSource?: string;
  driverPartialAmount?: number;
  riderPenaltyAmount?: number;
  riderTotalCharge?: number;
  prepaidTotal?: number;
  additionalDue?: number;
  refundDue?: number;
  riderPaymentStatus?: string;
  allowedSettlementMethods?: Array<'wallet' | 'razorpay' | 'cash'>;
  billingNote?: string;
  settlementVersion?: number;
}

export interface RiderBeforeStartCancelBilling {
  travelledDistanceKm?: number;
  travelledAmount?: number;
  fixedPenaltyAmount?: number;
  totalCharge?: number;
  perKmRateUsed?: number;
  outstandingDue?: number;
  riderPaymentStatus?: string;
  prepaidWallet?: number;
  prepaidRazorpay?: number;
  razorpayRefundAmount?: number;
  billingNote?: string;
}

/**
 * State surfaced by RideService whenever the driver cancels mid-trip and the
 * rider needs to acknowledge / settle. The host page renders this via an inline
 * <ion-modal>+<ng-template> that hosts <app-driver-cancel-settlement-modal>.
 * Pushing state instead of dynamically creating the modal avoids the Ionic +
 * Angular AOT regression where ModalController.create({ component }) leaks the
 * component template as raw text into the page.
 */
export interface DriverCancelSettlementRequest {
  rideId: string;
  reason: string;
  settlement: NonNullable<Ride['driverInProgressCancelSettlement']>;
  isZeroDue: boolean;
  bookingPaymentMethod: Ride['paymentMethod'];
  isPostRideOnlineBooking: boolean;
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
  private emergencyLocationIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Pending driver-cancel settlement (driver ended the trip mid-way). The
   * active-ride / tab1 pages subscribe and host the modal inline; service
   * exposes settleDriverCancellation() for the dismiss handler.
   */
  private driverCancelSettlementSubject$ =
    new BehaviorSubject<DriverCancelSettlementRequest | null>(null);
  public readonly driverCancelSettlement$: Observable<DriverCancelSettlementRequest | null> =
    this.driverCancelSettlementSubject$.asObservable();

  // Store all socket subscriptions for cleanup
  private socketSubscriptions: Subscription[] = [];

  constructor(
    private socketService: SocketService,
    private storage: Storage,
    private router: Router,
    private toastCtrl: ToastController,
    private http: HttpClient,
    private paymentService: PaymentService,
    private walletService: WalletService
  ) {
    this.initStorage();
    this.setupSocketListeners();
    // Load ride state from storage on initialization
    // This restores state after app restart/browser refresh
    this.loadRideFromStorage();
  }

  private async initStorage() {
    await this.storage.create();
    void this.resumePendingDriverCancelSettlementIfAny();
    void this.resumePendingRidePaymentIfAny();
  }

  /**
   * After app restart: if we stored a pending driver-cancel settlement, prompt again.
   */
  private async resumePendingDriverCancelSettlementIfAny(): Promise<void> {
    try {
      const pendingId = await this.storage.get('pendingDriverCancelSettlementRideId');
      const userId = await this.storage.get('userId');
      if (!pendingId || !userId) {
        return;
      }
      const params = new HttpParams().set('userId', String(userId));
      const res = await firstValueFrom(
        this.http.get<{
          success?: boolean;
          data?: {
            summary?: RiderInProgressCancelBilling | null;
            cancellationReason?: string | null;
          };
        }>(`${environment.apiUrl}/api/rides/${pendingId}/rider-in-progress-cancel-billing`, {
          params,
        })
      );
      const summary = res?.data?.summary;
      if (summary) {
        const stub: Ride = {
          _id: String(pendingId),
          rider: String(userId),
          status: 'cancelled',
          cancelledBy: 'driver',
          pickupLocation: { type: 'Point', coordinates: [0, 0] },
          dropoffLocation: { type: 'Point', coordinates: [0, 0] },
          pickupAddress: '',
          dropoffAddress: '',
          fare: 0,
          distanceInKm: 0,
          service: 'sedan',
          rideType: 'normal',
          paymentMethod: 'CASH',
          startOtp: '',
          stopOtp: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await this.routeToDriverCancelSettlement(String(pendingId), 'resume', {
          reason:
            (res?.data?.cancellationReason as string) || 'Driver ended the trip',
        });
      }
    } catch (e) {
      console.warn('resumePendingDriverCancelSettlementIfAny:', e);
    }
  }

  /**
   * After app restart: resume post-ride Pay Online checkout if payment still pending.
   */
  private async resumePendingRidePaymentIfAny(): Promise<void> {
    try {
      const pendingId = await this.storage.get('pendingRidePaymentRideId');
      if (!pendingId) {
        return;
      }
      const ride = await this.fetchRideById(String(pendingId));
      if (ride && this.shouldCollectOnlinePayment(ride)) {
        await this.routeToPaymentIfRequired(ride, 'resume');
      } else {
        await this.storage.remove('pendingRidePaymentRideId');
      }
    } catch (e) {
      console.warn('resumePendingRidePaymentIfAny:', e);
    }
  }

  private async fetchRiderInProgressCancelBillingWithRetry(
    rideId: string,
    userId: string,
    attempts = 2
  ): Promise<RiderInProgressCancelBilling | null> {
    for (let i = 0; i < attempts; i++) {
      const billing = await this.fetchRiderInProgressCancelBilling(rideId, userId);
      if (billing) {
        return billing;
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return null;
  }

  /**
   * Single entry for terminal trip UX: post-ride payment or driver-cancel settlement.
   * Returns true when a payment/settlement screen was opened.
   */
  async handleTerminalTrip(
    ride: Ride,
    source: string,
    options?: { showCompletionToast?: boolean }
  ): Promise<boolean> {
    if (!ride?._id) {
      return false;
    }

    const rideId = String(ride._id);

    if (ride.status === 'completed') {
      await this.storage.remove('pendingDriverCancelSettlementRideId');
      this.currentRide$.next(ride);
      this.rideStatus$.next('completed');
      await this.storeRide(ride);

      const completionSource = (ride as Ride & { completionSource?: string })
        .completionSource;
      if (options?.showCompletionToast !== false) {
        if (completionSource === 'driver_cancel_near_destination') {
          this.showToast(
            'Trip closed at full fare to your destination (driver ended the trip near drop-off). Complete payment if required.',
            'primary'
          );
        } else {
          this.showToast('✅ Ride completed!');
        }
      }

      if (this.shouldCollectOnlinePayment(ride)) {
        await this.storage.set('pendingRidePaymentRideId', rideId);
      }

      const navigated = await this.routeToPaymentIfRequired(ride, source);
      if (!navigated) {
        await this.storage.remove('pendingRidePaymentRideId');
      }
      console.log(
        `[handleTerminalTrip] completed ride=${rideId} source=${source} paymentNav=${navigated}`
      );
      return navigated;
    }

    if (ride.status === 'cancelled' && ride.cancelledBy === 'driver') {
      let billing: RiderInProgressCancelBilling | null =
        (ride as Ride & { riderInProgressCancelBilling?: RiderInProgressCancelBilling })
          .riderInProgressCancelBilling ?? null;

      const userId = await this.storage.get('userId');
      if (!billing && userId) {
        billing = await this.fetchRiderInProgressCancelBillingWithRetry(
          rideId,
          String(userId)
        );
      }

      const showSettlement = billing != null;
      let navigated = false;

      if (showSettlement && billing) {
        const additional = Number(billing.additionalDue) || 0;
        if (additional > 0) {
          await this.storage.set('pendingDriverCancelSettlementRideId', rideId);
        } else {
          await this.storage.remove('pendingDriverCancelSettlementRideId');
        }
        navigated = await this.routeToDriverCancelSettlement(rideId, source, {
          reason: ride.cancellationReason || 'Driver ended the trip',
        });
      } else {
        await this.storage.remove('pendingDriverCancelSettlementRideId');
      }

      this.currentRide$.next(null);
      this.rideStatus$.next('cancelled');
      await this.clearRide();

      console.log(
        `[handleTerminalTrip] driver-cancel ride=${rideId} source=${source} settlementNav=${navigated}`
      );
      return navigated;
    }

    return false;
  }

  private mergeRideWithDriverCancelBilling(
    ride: Ride,
    billing: RiderInProgressCancelBilling
  ): Ride {
    return {
      ...ride,
      driverInProgressCancelSettlement: {
        partialDistanceKm: billing.partialDistanceKm,
        perKmRateUsed: billing.perKmRateUsed,
        perKmRateSource: billing.perKmRateSource,
        riderPenaltyAmount: billing.riderPenaltyAmount,
        driverPartialAmount: billing.driverPartialAmount,
        riderTotalCharge: billing.riderTotalCharge,
        prepaidTotal: billing.prepaidTotal,
        additionalDue: billing.additionalDue,
        refundDue: billing.refundDue,
        riderPaymentStatus: billing.riderPaymentStatus,
        allowedSettlementMethods: billing.allowedSettlementMethods,
      },
    };
  }

  private async fetchRiderInProgressCancelBilling(
    rideId: string,
    userId: string
  ): Promise<RiderInProgressCancelBilling | null> {
    try {
      const params = new HttpParams().set('userId', userId);
      const res = await firstValueFrom(
        this.http.get<{
          success?: boolean;
          data?: { summary?: RiderInProgressCancelBilling | null };
        }>(`${environment.apiUrl}/api/rides/${rideId}/rider-in-progress-cancel-billing`, {
          params,
        })
      );
      return res?.data?.summary ?? null;
    } catch (e) {
      console.warn('fetchRiderInProgressCancelBilling:', e);
      return null;
    }
  }

  private async handleRideCancelled(payload: any): Promise<void> {
    const ride: Ride = payload?.ride ?? payload;
    const reason: string =
      payload?.reason ?? ride?.cancellationReason ?? 'Ride cancelled';
    console.log('❌ Ride cancelled:', payload);

    const driverInProgressSettlement =
      ride?.cancelledBy === 'driver' && ride?._id;
    let navigatedToPaymentUi = false;

    if (driverInProgressSettlement) {
      navigatedToPaymentUi = await this.handleTerminalTrip(
        { ...ride, status: 'cancelled', cancellationReason: reason },
        'rideCancelled',
        { showCompletionToast: false }
      );
    }

    if (!driverInProgressSettlement) {
      this.currentRide$.next(null);
      this.rideStatus$.next('cancelled');
      await this.clearRide();
    }

    const showSettlement = navigatedToPaymentUi;

    if (!driverInProgressSettlement) {
      await this.storage.remove('pendingDriverCancelSettlementRideId');
    }

    const beforeStartBill = (ride as Ride & { riderBeforeStartCancelBilling?: RiderBeforeStartCancelBilling })
      .riderBeforeStartCancelBilling;
    if (ride?.cancelledBy === 'rider' && beforeStartBill?.totalCharge != null && beforeStartBill.totalCharge > 0) {
      const km = Number(beforeStartBill.travelledDistanceKm) || 0;
      const dist = Number(beforeStartBill.travelledAmount) || 0;
      const fee = Number(beforeStartBill.fixedPenaltyAmount) || 0;
      const total = Number(beforeStartBill.totalCharge) || 0;
      const due = Number(beforeStartBill.outstandingDue) || 0;
      let msg = `Cancellation charge: ${formatInrWithSymbol(total)} (distance ${formatInrWithSymbol(dist)} + fee ${formatInrWithSymbol(fee)}, ~${km.toFixed(1)} km).`;
      if (due > 0) {
        msg += ` Outstanding: ${formatInrWithSymbol(due)} — add money to your wallet.`;
      }
      if ((beforeStartBill.razorpayRefundAmount || 0) > 0) {
        msg += ` ${formatInrWithSymbol(beforeStartBill.razorpayRefundAmount)} refunded to your payment method.`;
      }
      this.showToast(msg, 'warning');
      const uid = await this.storage.get('userId');
      if (uid) {
        this.walletService.getWalletBalance(String(uid)).subscribe({
          error: () => undefined,
        });
      }
    } else if (!showSettlement) {
      const message = reason?.includes('No drivers found')
        ? 'No drivers found nearby. Ride cancelled.'
        : ride?.cancelledBy === 'driver'
        ? 'Ride was ended by driver.'
        : 'Ride cancelled';
      this.showToast(message);
    }

    if (
      !showSettlement &&
      !this.router.url.includes('cab-searching') &&
      !this.router.url.includes('driver-cancel-settlement')
    ) {
      this.router.navigate(['/tabs/tabs/tab1'], {
        replaceUrl: true,
      });
    }
  }

  /**
   * Load ride state from storage on service initialization
   * This provides a fallback if backend sync hasn't completed yet
   */
  private async loadRideFromStorage(): Promise<void> {
    try {
      const storedRide = await this.storage.get('currentRide');
      const storedStatus = await this.storage.get('rideStatus');
      
      if (storedRide && storedStatus) {
        // Only restore if status is still active
        const activeStatuses = ['requested', 'accepted', 'arrived', 'in_progress'];
        if (activeStatuses.includes(storedStatus)) {
          console.log('📦 [RideService] Restoring ride from storage:', storedRide._id);
          console.log('📦 [RideService] Stored status:', storedStatus);
          
          // Restore to BehaviorSubject
          this.currentRide$.next(storedRide);
          this.rideStatus$.next(storedStatus as RideStatus);
          
          console.log('✅ [RideService] Ride restored from storage');
          
          // Sync with backend to ensure we have the latest state
          // This will update if backend has newer information
          this.syncRideStateFromBackend().catch(err => {
            console.error('❌ [RideService] Error syncing after storage restore:', err);
          });
        } else {
          // Status is completed/cancelled, clear storage
          console.log('🧹 [RideService] Stored ride is not active, clearing storage');
          await this.clearRide();
        }
      }
    } catch (error) {
      console.error('❌ [RideService] Error loading ride from storage:', error);
      // Don't throw - this is a background operation
    }
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
      
      // Show toast notification
      const driverName = ride.driver?.name || 'Driver';
      this.showToast(`🚗 Driver found! ${driverName} is on the way`);
      
      // Navigate to active-ordere page
      // Check current route to avoid unnecessary navigation if already on target page
      const currentUrl = this.router.url;
      if (currentUrl.includes('/active-ordere')) {
        console.log('ℹ️ Already on active-ordere page, skipping navigation');
        return;
      }
      
      // Navigate to active-ordere page with error handling
      try {
        console.log('🚀 Navigating to active-ordere page from RideService...');
        this.router.navigate(['/active-ordere'], {
          replaceUrl: true, // Replace history so back goes to tab1
        }).then(() => {
          console.log('✅ Successfully navigated to active-ordere from RideService');
        }).catch((error) => {
          console.error('❌ Navigation error in RideService:', error);
          // Fallback: Try navigation again after a short delay
          setTimeout(() => {
            try {
              this.router.navigate(['/active-ordere'], {
                replaceUrl: true,
              });
            } catch (retryError) {
              console.error('❌ Retry navigation also failed:', retryError);
            }
          }, 500);
        });
      } catch (error) {
        console.error('❌ Error during navigation in RideService:', error);
      }
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
      console.log('✅ Ride completed event received (user app)');
      console.log('   Ride ID:', ride?._id);
      console.log('   Payment Method:', ride?.paymentMethod);
      console.log('   Payment Status:', ride?.paymentStatus);
      console.log('   Fare:', ride?.fare);

      void this.storage.remove('pendingDriverCancelSettlementRideId');
      void this.handleTerminalTrip(ride, 'rideCompleted');
    });
    this.socketSubscriptions.push(rideCompletedSub);

    const paymentRequiredSub = this.socketService
      .on<{
        rideId: string;
        amount: number;
        paymentMethod: string;
        reason?: string;
        ride?: Ride;
      }>('paymentRequired')
      .subscribe((payload) => {
        void (async () => {
          let ride: Ride | null =
            payload?.ride ||
            (this.currentRide$.value &&
            String(this.currentRide$.value._id) === String(payload?.rideId)
              ? this.currentRide$.value
              : null);
          if (!ride && payload?.rideId) {
            ride = await this.fetchRideById(payload.rideId);
          }
          if (ride) {
            await this.applyServerRide(ride);
            await this.storage.set('pendingRidePaymentRideId', String(ride._id));
            await this.routeToPaymentIfRequired(ride, 'paymentRequired');
          }
        })();
      });
    this.socketSubscriptions.push(paymentRequiredSub);

    // Ride cancelled
    const rideCancelledSub = this.socketService.on<any>('rideCancelled').subscribe((payload) => {
      void this.handleRideCancelled(payload);
    });
    this.socketSubscriptions.push(rideCancelledSub);

    const riderSettlementDoneSub = this.socketService
      .on<{ rideId: string; success?: boolean }>('riderSettlementCompleted')
      .subscribe((ev) => {
        if (ev?.success) {
          this.showToast('Payment settlement completed.');
        }
      });
    this.socketSubscriptions.push(riderSettlementDoneSub);

    // Ride errors
    const rideDestinationUpdatedSub = this.socketService
      .on<{ ride: Ride; pricing?: Record<string, unknown> }>('rideDestinationUpdated')
      .subscribe((payload) => {
        const r = payload?.ride;
        if (!r?._id) return;
        const current = this.currentRide$.value;
        if (current && String(current._id) === String(r._id)) {
          this.currentRide$.next(r);
          void this.storeRide(r);
          const nf = payload?.pricing && typeof (payload.pricing as { newFare?: number }).newFare === 'number'
            ? (payload.pricing as { newFare: number }).newFare
            : r.fare;
          this.showToast(`Destination updated. New fare: ${formatInrWithSymbol(nf)}`);
        }
      });
    this.socketSubscriptions.push(rideDestinationUpdatedSub);

    const rideErrorSub = this.socketService
      .on<{ message: string; code?: string; details?: string; rideId?: string }>('rideError')
      .subscribe((error) => {
        console.error('❌ Ride error:', error);
        console.error('   Error code:', error.code);
        console.error('   Error details:', error.details);
        
        // Parse error message to show user-friendly message
        let userMessage = error.message || 'Failed to process ride request';
        
        // Check if it's a "no driver found" error
        const errorLower = error.message?.toLowerCase() || '';
        const isNoDriverError = 
          error.code === 'NO_DRIVERS_FOUND' ||
          error.code === 'NO_DRIVER_ACCEPTED_TIMEOUT' ||
          errorLower.includes('no driver') || 
          errorLower.includes('no drivers') ||
          (errorLower.includes('within') && errorLower.includes('radius')) ||
          errorLower.includes('try again later');
        
        // Map common error codes to user-friendly messages
        if (error.code === 'DUPLICATE_RIDE_ATTEMPT' || (error.message && error.message.includes('already have an active ride'))) {
          userMessage = 'You already have an active ride. Please cancel it before booking a new one.';
        } else if (error.code === 'PAYMENT_NOT_VERIFIED' || error.code === 'PAYMENT_VERIFICATION_FAILED') {
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
        } else if (error.code === 'RIDER_CANCEL_BLOCKED_IN_PROGRESS') {
          userMessage =
            'You cannot cancel after the trip has started. Contact support if you need help.';
        } else if (
          error.code === 'RIDER_CANCEL_BLOCKED_IN_PROGRESS_GT_1KM' ||
          error.code === 'RIDER_CANCEL_BLOCKED_IN_PROGRESS_LT_1KM'
        ) {
          userMessage =
            error.message ||
            'You cannot cancel while this trip is in progress. Contact support if you need help.';
        } else if (error.code === 'DRIVER_CANCEL_LOCATION_UNAVAILABLE') {
          userMessage =
            error.message ||
            'Location could not be verified. Enable GPS and try again.';
        }
        
        // If it's a no driver found error, clear ride state
        if (isNoDriverError) {
          console.log('🚫 No driver found error - clearing ride state');
          this.currentRide$.next(null);
          this.rideStatus$.next('cancelled');
          this.clearRide().catch(err => {
            console.error('Error clearing ride on no driver found:', err);
          });
          
          // Navigate to tab1 if on cab-searching page
          if (this.router.url.includes('cab-searching')) {
            // Don't navigate immediately - let cab-searching page handle it
            // The error will be shown there
          }
        }
        
        this.rideErrors$.next(userMessage);
        this.showToast(userMessage, 'danger');
      });
    this.socketSubscriptions.push(rideErrorSub);

    // Emergency alert created (confirmation)
    const emergencyAlertCreatedSub = this.socketService
      .on<{ success: boolean; emergency: any }>('emergencyAlertCreated')
      .subscribe((data) => {
        console.log('🚨 Emergency alert created:', data);
        if (data.success) {
          if (data.emergency?._id) {
            this.startEmergencyLocationUpdates(data.emergency._id);
          }
          this.showToast('🚨 Emergency alert sent successfully', 'warning');
          // Clear ride state since emergency cancels the ride
          this.currentRide$.next(null);
          this.rideStatus$.next('cancelled');
          this.clearRide();
          this.router.navigate(['/tabs/tabs/tab1'], {
            replaceUrl: true,
          });
        }
      });
    this.socketSubscriptions.push(emergencyAlertCreatedSub);

    // Emergency alert (if other party triggers)
    const emergencyAlertSub = this.socketService
      .on<any>('emergencyAlert')
      .subscribe((emergency) => {
        console.log('🚨 Emergency alert received:', emergency);
        this.showToast('🚨 Emergency alert has been triggered', 'danger');
        // Clear ride state since emergency cancels the ride
        this.currentRide$.next(null);
        this.rideStatus$.next('cancelled');
        this.clearRide();
        this.router.navigate(['/tabs/tabs/tab1'], {
          replaceUrl: true,
        });
      });
    this.socketSubscriptions.push(emergencyAlertSub);

    // Emergency error
    const emergencyErrorSub = this.socketService
      .on<{ message: string }>('emergencyError')
      .subscribe((error) => {
        const msg = error?.message ?? '';
        const isResolved = msg.includes('no longer active') || msg.includes('Emergency no longer active');
        if (isResolved) {
          this.stopEmergencyLocationUpdates();
          this.showToast('Emergency has been resolved.', 'primary');
          return;
        }
        console.error('❌ Emergency error:', error);
        this.showToast(`Emergency alert failed: ${msg}`, 'danger');
      });
    this.socketSubscriptions.push(emergencyErrorSub);

    // Rating submitted
    const ratingSubmittedSub = this.socketService.on<any>('ratingSubmitted').subscribe((data) => {
      console.log('⭐ Rating submitted:', data);
      this.showToast('Thank you for your feedback!');
      this.clearRide();
      this.router.navigate(['/tabs/tabs/tab1'], {
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
    this.stopEmergencyLocationUpdates();
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
    estimatedDuration?: number; // Estimated duration in minutes
    service: string;
    rideType: string;
    paymentMethod: string;
    razorpayPaymentId?: string;
    walletAmountUsed?: number;
    razorpayAmountPaid?: number;
    promoCode?: string;
    rideFor?: 'SELF' | 'OTHER';
    passenger?: PassengerInfo;
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

      // Sync ride state from backend first to ensure accuracy
      await this.syncRideStateFromBackend();

      // Check for existing active ride to prevent duplicates
      const currentRide = this.currentRide$.value;
      if (currentRide) {
        const activeStatuses = ['requested', 'accepted', 'arrived', 'in_progress'];
        if (activeStatuses.includes(currentRide.status)) {
          const errorMessage = 'You already have an active ride. Please cancel it before booking a new one.';
          console.warn('Duplicate ride attempt prevented:', currentRide._id);
          this.showToast(errorMessage, 'warning');
          throw new Error(errorMessage);
        }
      }

      // Ensure socket is connected (30-second timeout to prevent hanging)
      console.log('🔌 Checking socket connection status...');
      if (!this.socketService.isConnected()) {
        console.log('⏳ Socket not connected, waiting for connection...');
        await this.socketService.waitForConnection(30000); // 30-second timeout
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
        estimatedDuration: rideData.estimatedDuration || 0, // Include estimated duration
        service: rideData.service,
        rideType: rideData.rideType,
        paymentMethod: rideData.paymentMethod,
        rideFor: rideData.rideFor || 'SELF', // Default to SELF if not provided
      };

      // Add passenger info if booking for someone else
      if (rideData.rideFor === 'OTHER' && rideData.passenger) {
        request.passenger = {
          name: rideData.passenger.name,
          phone: rideData.passenger.phone,
          ...(rideData.passenger.relation && { relation: rideData.passenger.relation }),
          ...(rideData.passenger.notes && { notes: rideData.passenger.notes }),
        };
      }
      
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
   * Trigger emergency alert
   */
  async triggerEmergency(
    location: { latitude: number; longitude: number },
    reason: string,
    description?: string
  ): Promise<void> {
    const ride = this.currentRide$.value;
    if (!ride) {
      const errorMsg = 'No active ride to trigger emergency for';
      console.error('❌', errorMsg);
      this.showToast(errorMsg, 'danger');
      throw new Error(errorMsg);
    }

    try {
      const userId = await this.storage.get('userId');
      if (!userId) {
        const errorMsg = 'User not authenticated';
        console.error('❌', errorMsg);
        this.showToast(errorMsg, 'danger');
        throw new Error(errorMsg);
      }

      // Validate location
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        const errorMsg = 'Invalid location. Using last known location.';
        console.warn('⚠️', errorMsg);
        // Try to use last known location from driverLocation or userLocation
        const lastLocation = this.driverLocation$.value;
        if (lastLocation) {
          location = {
            latitude: lastLocation.latitude,
            longitude: lastLocation.longitude,
          };
          console.log('📍 Using last known location:', location);
        } else {
          throw new Error('Location unavailable. Please enable GPS and try again.');
        }
      }

      // Validate reason
      if (!reason || reason.trim() === '') {
        reason = 'other'; // Default reason
        console.warn('⚠️ No reason provided, using default: other');
      }

      // Check socket connection
      if (!this.socketService.isConnected()) {
        console.warn('⚠️ Socket not connected, attempting to reconnect...');
        try {
          // Try to wait for connection
          await this.socketService.waitForConnection(5000); // 5 second timeout
        } catch (connError) {
          const errorMsg = 'Cannot connect to server. Please check your internet connection and try again.';
          console.error('❌', errorMsg);
          this.showToast(errorMsg, 'danger');
          throw new Error(errorMsg);
        }
      }

      console.log('🚨 ========================================');
      console.log('🚨 TRIGGERING EMERGENCY ALERT');
      console.log('🚨 ========================================');
      console.log('🚗 Ride ID:', ride._id);
      console.log('👤 User ID:', userId);
      console.log('📍 Location:', location);
      console.log('📝 Reason:', reason);
      console.log('========================================');

      // Emit emergency alert socket event
      this.socketService.emit('emergencyAlert', {
        rideId: ride._id,
        triggeredBy: userId,
        triggeredByModel: 'User',
        location: {
          longitude: location.longitude,
          latitude: location.latitude,
        },
        reason: reason,
        description: description || '',
      });

      console.log('✅ Emergency alert emitted successfully');
      console.log('⏳ Waiting for confirmation...');
      console.log('========================================');

      // Note: The actual confirmation will come via emergencyAlertCreated event
      // which is handled by the socket listener we added earlier
    } catch (error: any) {
      console.error('❌ Error triggering emergency:', error);
      const errorMsg = error?.message || 'Failed to trigger emergency alert. Please try again.';
      this.showToast(errorMsg, 'danger');
      throw error;
    }
  }

  /**
   * Stop sending emergency location updates (e.g. when emergency is resolved by admin).
   */
  private stopEmergencyLocationUpdates(): void {
    if (this.emergencyLocationIntervalId) {
      clearInterval(this.emergencyLocationIntervalId);
      this.emergencyLocationIntervalId = null;
    }
  }

  /**
   * Start sending periodic location updates to admin for live tracking (stops after 30 min)
   */
  private startEmergencyLocationUpdates(emergencyId: string): void {
    this.stopEmergencyLocationUpdates();
    const maxDurationMs = 30 * 60 * 1000;
    const intervalMs = 5000;
    let elapsed = 0;

    const sendUpdate = async () => {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true }).catch(() => null);
        if (pos?.coords && this.socketService.isConnected()) {
          this.socketService.emit('emergencyLocationUpdate', {
            emergencyId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: new Date().toISOString()
          });
        }
      } catch (_) {}
    };

    sendUpdate();
    this.emergencyLocationIntervalId = setInterval(() => {
      elapsed += intervalMs;
      if (elapsed >= maxDurationMs && this.emergencyLocationIntervalId) {
        clearInterval(this.emergencyLocationIntervalId);
        this.emergencyLocationIntervalId = null;
        return;
      }
      sendUpdate();
    }, intervalMs);
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

      try {
        const userId = await this.storage.get('userId');
        if (userId) {
          console.log('🔄 [RideService] Ensuring socket connection via SocketService...');
          await this.socketService.ensureConnected({ userId, userType: 'rider' });
          await this.socketService.waitForConnection(10000);

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
   * Switch a completed RAZORPAY (pending) ride to CASH payment (rider only).
   * Backend validates ride is completed, RAZORPAY, pending; updates paymentMethod to CASH and emits to driver.
   */
  switchRideToCash(rideId: string): Observable<Ride> {
    const url = `${environment.apiUrl}/api/rides/${rideId}/switch-to-cash`;
    return from(this.storage.get('token')).pipe(
      switchMap((token) => {
        if (!token) {
          throw new Error('User not authenticated');
        }
        return this.http.post<
          Ride | { success?: boolean; message?: string; data?: Ride }
        >(url, {}, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }),
      map((body) => {
        if (body && typeof body === 'object' && 'data' in body && (body as { data?: Ride }).data?._id) {
          return (body as { data: Ride }).data;
        }
        return body as Ride;
      })
    );
  }

  /**
   * Preview fare for a new drop-off (GET, does not persist).
   */
  getDestinationQuote(
    rideId: string,
    latitude: number,
    longitude: number,
    estimatedDuration?: number
  ): Observable<{
    success: boolean;
    destinationRevision?: number;
    pricing?: Record<string, unknown>;
    quotePreview?: Record<string, unknown>;
  }> {
    let url = `${environment.apiUrl}/api/rides/${rideId}/destination-quote?latitude=${encodeURIComponent(
      String(latitude)
    )}&longitude=${encodeURIComponent(String(longitude))}`;
    if (estimatedDuration != null && estimatedDuration > 0) {
      url += `&estimatedDuration=${encodeURIComponent(String(estimatedDuration))}`;
    }
    return from(this.storage.get('token')).pipe(
      switchMap((token) => {
        if (!token) {
          throw new Error('User not authenticated');
        }
        return this.http.get<{
          success: boolean;
          destinationRevision?: number;
          pricing?: Record<string, unknown>;
          quotePreview?: Record<string, unknown>;
        }>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      })
    );
  }

  /**
   * Apply new destination (PATCH). Sends expectedRevision when provided for concurrency control.
   */
  updateRideDestination(
    rideId: string,
    body: {
      dropoffLocation: { type: 'Point'; coordinates: [number, number] };
      dropoffAddress?: string;
      estimatedDuration?: number;
      expectedRevision?: number;
    }
  ): Observable<{
    success: boolean;
    ride: Ride;
    destinationRevision?: number;
    pricing?: Record<string, unknown>;
  }> {
    const url = `${environment.apiUrl}/api/rides/${rideId}/destination`;
    return from(this.storage.get('token')).pipe(
      switchMap((token) => {
        if (!token) {
          throw new Error('User not authenticated');
        }
        return this.http.patch<{
          success: boolean;
          ride: Ride;
          destinationRevision?: number;
          pricing?: Record<string, unknown>;
        }>(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      })
    );
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
   * @param limit - Optional limit for number of rides to return
   * @param status - Optional status filter (completed, cancelled, etc.)
   * @returns Observable of Ride array
   */
  getUserRides(userId: string, limit?: number, status?: string): Observable<Ride[]> {
    let url = `${environment.apiUrl}/rides/user/${userId}`;
    const params = new URLSearchParams();
    
    if (limit && limit > 0) {
      params.append('limit', limit.toString());
    }
    if (status) {
      params.append('status', status);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    return this.http.get<Ride[]>(url);
  }

  /**
   * Apply a server-sourced ride snapshot so `currentRide$` and `rideStatus$` stay in lockstep.
   * Use for API fetches, payment refresh, and backend reconciliation.
   */
  async applyServerRide(ride: Ride): Promise<void> {
    this.currentRide$.next(ride);
    this.rideStatus$.next(ride.status as RideStatus);
    await this.storeRide(ride);
  }

  /**
   * Sync ride state from backend
   * Reconciles with the full /rides/user list: resolves completed/cancelled from server when
   * the in-memory trip was still "active" (e.g. trip finished while app was in background).
   */
  async syncRideStateFromBackend(): Promise<void> {
    try {
      const userId = await this.storage.get('userId');
      if (!userId) {
        console.log('⚠️ No userId found, skipping ride state sync');
        return;
      }

      console.log('🔄 ========================================');
      console.log('🔄 SYNCING RIDE STATE FROM BACKEND');
      console.log('🔄 ========================================');
      console.log('👤 User ID:', userId);

      const rides = await firstValueFrom(
        this.http.get<Ride[]>(`${environment.apiUrl}/rides/user/${userId}`)
      );

      const activeStatuses: string[] = [
        'requested',
        'searching',
        'accepted',
        'arrived',
        'in_progress',
      ];
      const activeRides = rides.filter((ride) =>
        activeStatuses.includes(ride.status)
      );

      const frontendRide = this.currentRide$.value;

      console.log('📊 Backend active rides:', activeRides.length);
      console.log('📊 Frontend current ride:', frontendRide ? frontendRide._id : 'null');

      if (!frontendRide) {
        if (activeRides.length > 0) {
          const activeRide = activeRides[0];
          console.log('📦 Restoring active ride from backend (no local ride):', activeRide._id);
          await this.applyServerRide(activeRide);
        }
        console.log('✅ Ride state sync completed');
        return;
      }

      const match = rides.find(
        (r) => String(r._id) === String(frontendRide._id)
      );

      if (match) {
        if (
          match.status !== frontendRide.status ||
          (match.paymentStatus || '') !==
            (frontendRide.paymentStatus || '') ||
          Number(match.fare) !== Number(frontendRide.fare) ||
          this.isServerNewerMatch(match, frontendRide)
        ) {
          console.log('🔄 Reconciling local ride with backend');
          await this.applyServerRide(match);
        }
      } else {
        if (activeStatuses.includes(frontendRide.status)) {
          console.log('⚠️ Stale local active ride: not in user rides list; clearing');
          this.currentRide$.next(null);
          this.rideStatus$.next('idle');
          await this.clearRide();
        }
      }

      console.log('✅ Ride state sync completed');
      console.log('========================================');
    } catch (error) {
      console.error('❌ Error syncing ride state from backend:', error);
    }
  }

  private isServerNewerMatch(
    match: Ride,
    frontend: Ride
  ): boolean {
    if (!match.updatedAt || !frontend.updatedAt) {
      return false;
    }
    const t1 = new Date(match.updatedAt).getTime();
    const t0 = new Date(frontend.updatedAt).getTime();
    return t1 > t0;
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
      } else if (ride && status === 'completed') {
        await this.handleTerminalTrip(ride, 'restoreRide', {
          showCompletionToast: false,
        });
      }
    } catch (error) {
      console.error('Error restoring ride:', error);
    }
  }

  /**
   * Post-ride Pay Online: RAZORPAY with no upfront gateway payment at booking.
   */
  isPostRideRazorpay(ride: Ride | null | undefined): boolean {
    if (!ride) return false;
    return (
      ride.paymentMethod === 'RAZORPAY' &&
      !ride.razorpayPaymentId &&
      !(Number(ride.walletAmountUsed || 0) > 0.01)
    );
  }

  /**
   * Canonical payable amount for completed post-ride Pay Online (mirrors backend resolver).
   */
  resolvePayableFare(ride: Ride | null | undefined): number {
    if (!ride) return 0;
    const candidates = [
      ride.amountDue,
      ride.fare,
      ride.fareBreakdown?.finalFare,
      ride.fareBreakdown?.fareAfterMinimum,
      (ride as Ride & { fareAtBooking?: number }).fareAtBooking,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) {
        return Math.round(n * 100) / 100;
      }
    }
    return 0;
  }

  /** Completed ride still needs Razorpay checkout (post-ride Pay Online). */
  shouldCollectOnlinePayment(ride: Ride | null | undefined): boolean {
    if (!ride) return false;
    return (
      ride.status === 'completed' &&
      this.resolvePayableFare(ride) > 0 &&
      this.isPostRideRazorpay(ride) &&
      ride.paymentStatus === 'pending'
    );
  }

  /**
   * Fetch payment summary from backend (authoritative amount for ride-payment page).
   */
  async fetchRidePaymentSummary(
    rideId: string,
    userId: string
  ): Promise<{
    amountDue: number;
    pickupAddress: string;
    dropoffAddress: string;
    actualDuration: number;
    pickupWaitCharge: number;
    paymentStatus: string;
    canPayOnline: boolean;
    paymentMethod: string;
  } | null> {
    try {
      const params = new HttpParams().set('userId', userId);
      const res = await firstValueFrom(
        this.http.get<{
          success?: boolean;
          data?: {
            amountDue?: number;
            pickupAddress?: string;
            dropoffAddress?: string;
            actualDuration?: number;
            pickupWaitCharge?: number;
            paymentStatus?: string;
            canPayOnline?: boolean;
            paymentMethod?: string;
          };
        }>(`${environment.apiUrl}/api/rides/${rideId}/payment-summary`, {
          params,
        })
      );
      const d = res?.data;
      if (!d) return null;
      return {
        amountDue: Number(d.amountDue) || 0,
        pickupAddress: d.pickupAddress || '',
        dropoffAddress: d.dropoffAddress || '',
        actualDuration: Number(d.actualDuration) || 0,
        pickupWaitCharge: Number(d.pickupWaitCharge) || 0,
        paymentStatus: d.paymentStatus || 'pending',
        canPayOnline: Boolean(d.canPayOnline),
        paymentMethod: d.paymentMethod || 'RAZORPAY',
      };
    } catch (e) {
      console.warn('[fetchRidePaymentSummary]', e);
      return null;
    }
  }

  /**
   * Navigate to post-ride payment when required. Returns true if navigation occurred.
   */
  async routeToPaymentIfRequired(
    ride: Ride,
    source: string
  ): Promise<boolean> {
    if (!this.shouldCollectOnlinePayment(ride)) {
      return false;
    }

    const rideId = String(ride._id);
    const currentUrl = this.router.url || '';
    if (currentUrl.includes(`/ride-payment/${rideId}`)) {
      return true;
    }

    const guardKey = `paymentNav_${rideId}`;
    const lastNav = await this.storage.get(guardKey);
    if (lastNav) {
      const elapsed = Date.now() - Number(lastNav);
      if (elapsed < 3000) {
        console.log(
          `[routeToPaymentIfRequired] debounced duplicate nav (${source}) ride=${rideId}`
        );
        return true;
      }
    }

    console.log(
      `[routeToPaymentIfRequired] navigating to ride-payment (${source}) ride=${rideId}`
    );
    await this.storage.set(guardKey, String(Date.now()));
    const payableFare = this.resolvePayableFare(ride);
    await this.router.navigate(['/ride-payment', rideId], {
      state: {
        fare: payableFare,
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        duration: ride.actualDuration || 0,
      },
      replaceUrl: true,
    });
    return true;
  }

  /** Clear payment navigation guard after successful Razorpay settlement. */
  async clearPaymentNavigationGuard(rideId: string): Promise<void> {
    await this.storage.remove(`paymentNav_${rideId}`);
    await this.storage.remove('pendingRidePaymentRideId');
  }

  /**
   * Navigate to full-screen driver-cancel settlement (primary UX after driver ends trip early).
   */
  async routeToDriverCancelSettlement(
    rideId: string,
    source: string,
    options?: { reason?: string }
  ): Promise<boolean> {
    const rideIdStr = String(rideId);
    const currentUrl = this.router.url || '';
    if (currentUrl.includes(`/driver-cancel-settlement/${rideIdStr}`)) {
      return true;
    }

    const guardKey = `driverCancelNav_${rideIdStr}`;
    const lastNav = await this.storage.get(guardKey);
    if (lastNav) {
      const elapsed = Date.now() - Number(lastNav);
      if (elapsed < 3000) {
        console.log(
          `[routeToDriverCancelSettlement] debounced (${source}) ride=${rideIdStr}`
        );
        return true;
      }
    }

    console.log(
      `[routeToDriverCancelSettlement] navigating (${source}) ride=${rideIdStr}`
    );
    await this.storage.set(guardKey, String(Date.now()));
    await this.storage.set('pendingDriverCancelSettlementRideId', rideIdStr);

    await this.router.navigate(['/driver-cancel-settlement', rideIdStr], {
      replaceUrl: true,
      state: {
        reason: options?.reason || 'Driver ended the trip',
        cancellationReason: options?.reason,
      },
    });
    return true;
  }

  async clearDriverCancelNavigationGuard(rideId: string): Promise<void> {
    await this.storage.remove(`driverCancelNav_${rideId}`);
  }

  /** Fetch ride by id from REST API (used when paymentRequired has no embedded ride). */
  async fetchRideById(rideId: string): Promise<Ride | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<Ride>(`${environment.apiUrl}/api/rides/${rideId}`)
      );
      if (response?._id) {
        await this.applyServerRide(response);
        return response;
      }
      return null;
    } catch (e) {
      console.warn('[fetchRideById]', e);
      return null;
    }
  }

  /**
   * Strip any HTML-ish markup so that no upstream payload (cancellationReason,
   * server message, etc.) can bleed `<div ...>` strings into the modal.
   * Angular interpolation already escapes, so this is belt-and-suspenders to
   * avoid showing awkward literal angle brackets if a payload was crafted that
   * way.
   */
  private toPlainText(v: unknown): string {
    return String(v ?? '').replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Modal / alert when driver cancels during trip — charges and pay online or
   * cash. The actual modal is hosted inline on the active-ordere / tab1 page;
   * here we just publish the request state so the host page can react.
   */
  private async presentDriverCancelSettlementModal(
    ride: Ride,
    reason: string
  ): Promise<void> {
    const st = ride.driverInProgressCancelSettlement;
    if (!st || !ride._id) return;

    const additional = Number(st.additionalDue) || 0;
    const isZeroDue = additional <= 0;
    const reasonText = this.toPlainText(reason) || 'Not specified';

    this.driverCancelSettlementSubject$.next({
      rideId: String(ride._id),
      reason: reasonText,
      settlement: st,
      isZeroDue,
      bookingPaymentMethod: ride.paymentMethod,
      isPostRideOnlineBooking: this.isPostRideRazorpay(ride),
    });
  }

  /**
   * Public API used by the host page when the inline modal dismisses. Performs
   * the settlement HTTP work (acknowledge / wallet / razorpay / cash) and then
   * clears the pending state. If the user dismissed without picking an action
   * and there is a remaining due, we surface an informative toast.
   */
  public async settleDriverCancellation(
    rideId: string,
    action: DriverCancelSettlementAction | undefined,
    context?: DriverCancelSettlementRequest | null
  ): Promise<void> {
    const current =
      context ?? this.driverCancelSettlementSubject$.getValue();
    if (current && current.rideId !== rideId) {
      console.warn(
        '[settleDriverCancellation] rideId mismatch, ignoring',
        current.rideId,
        rideId
      );
      return;
    }
    if (!current && action) {
      throw new Error('Settlement details not loaded');
    }

    const additional = Number(current?.settlement?.additionalDue) || 0;
    const userId = await this.storage.get('userId');
    const base = `${environment.apiUrl}/api/rides`;

    const run = async (fn: () => Promise<void>) => {
      try {
        await fn();
        await this.showToast('Updated successfully');
        await this.storage.remove('pendingDriverCancelSettlementRideId');
        await this.clearDriverCancelNavigationGuard(rideId);
        this.driverCancelSettlementSubject$.next(null);
        if (!this.router.url.includes('/tabs/tabs/tab1')) {
          await this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
        }
      } catch (e: any) {
        const msg =
          e?.error?.message || e?.message || 'Something went wrong';
        await this.showToast(msg, 'danger');
        throw e;
      }
    };

    try {
      switch (action) {
        case 'acknowledge':
          await run(async () => {
            await firstValueFrom(
              this.http.post(`${base}/${rideId}/driver-cancel-settlement/acknowledge`, {
                userId,
              })
            );
          });
          break;
        case 'wallet': {
          if (current?.isPostRideOnlineBooking) {
            await this.showToast(
              'This trip was booked as Pay Online. Please use Pay online or pay the driver in cash.',
              'warning'
            );
            break;
          }
          await run(async () => {
            await firstValueFrom(
              this.http.post(`${base}/${rideId}/driver-cancel-settlement/pay-wallet`, {
                userId,
              })
            );
          });
          break;
        }
        case 'online':
          await run(async () => {
            const orderRes: { data?: { orderId?: string; amount?: number } } =
              await firstValueFrom(
                this.http.post<{
                  data?: { orderId?: string; amount?: number };
                }>(`${base}/${rideId}/driver-cancel-settlement/pay-order`, {
                  userId,
                })
              );
            const d = orderRes?.data;
            if (!d?.orderId || d.amount == null) {
              throw new Error('Could not start payment');
            }
            const pay = await this.paymentService.openRazorpayCheckout(
              d.orderId,
              d.amount,
              {
                description: 'Driver cancelled trip — settlement',
              }
            );
            await firstValueFrom(
              this.http.post(`${base}/${rideId}/driver-cancel-settlement/verify-razorpay`, {
                userId,
                razorpay_payment_id: pay.razorpay_payment_id,
              })
            );
          });
          break;
        case 'cash':
          await run(async () => {
            await firstValueFrom(
              this.http.post(`${base}/${rideId}/driver-cancel-settlement/confirm-cash`, {
                userId,
              })
            );
          });
          break;
        default:
          if (additional > 0) {
            await this.showToast(
              'This amount is still due. Pay from this screen or before your next booking.',
              'warning'
            );
          }
          break;
      }
    } catch {
      // run() rethrows after toast for page-level handling
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
