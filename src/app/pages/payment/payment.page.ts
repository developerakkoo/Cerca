import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  LoadingController,
  ToastController,
  AlertController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user.service';
import { RideService } from '../../services/ride.service';
import { PaymentService } from '../../services/payment.service';
import { WalletService } from '../../services/wallet.service';
import { CouponService } from '../../services/coupon.service';
import {
  SettingsService,
  PricingConfigurations,
  VehicleServices,
  PaymentFeatures,
} from '../../services/settings.service';
import { FareService } from '../../services/fare.service';
import { Storage } from '@ionic/storage-angular';
import { environment } from 'src/environments/environment';
import { PaymentDisputeService } from '../../services/payment-dispute.service';
import { calculateFallbackInstantFare } from '../../utils/fare-pricing.util';
import { GoogleMapLifecycleService } from '../../services/google-map-lifecycle.service';
import {
  formatInrDisplay,
  formatInrWithSymbol,
} from '../../utils/money-display.util';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.page.html',
  styleUrls: ['./payment.page.scss'],
  standalone: false,
})
export class PaymentPage implements OnInit, ViewWillEnter, ViewWillLeave {
  // Fare breakdown
  baseFare: number = 0; // Vehicle service base price
  distanceFare: number = 0; // Distance × perKmRate
  timeFare: number = 0; // Duration × perMinuteRate
  subtotal: number = 0; // Base fare + distance fare + time fare
  finalFare: number = 0; // After minimum fare check
  discountAmount: number = 0;
  totalAmount: number = 0; // Ride fare + pending cancellation dues (checkout total)
  /** Fare for the new ride only (excludes pending driver-cancel settlements). */
  rideFarePayable: number = 0;
  /** Pending driver in-progress cancel — additionalDue sum from backend. */
  cancellationOutstandingTotal: number = 0;
  /** Pending payment dispute dues from completed rides */
  paymentDisputeOutstandingTotal: number = 0;
  paymentDisputeBlocked = false;
  paymentDisputeBlockedReason: string | null = null;
  outstandingItems: Array<{
    rideId: string;
    additionalDue: number;
    summary?: string;
    allowedSettlementMethods?: Array<'wallet' | 'razorpay' | 'cash'>;
    isPostRideOnlineBooking?: boolean;
    paymentMethod?: string;
  }> = [];
  estimatedDuration: number = 0; // Estimated duration in minutes
  
  // Payment details
  selectedPaymentMethod: string = 'cash';
  walletBalance: number = 0;
  isWalletSelected: boolean = false;
  insufficientBalance: boolean = false;

  // Promo code
  promoCode: string = '';
  promoApplied: boolean = false;
  promoMessage: string = '';
  validatedPromoCode: string | null = null;

  // Settings
  pricingConfig: PricingConfigurations | null = null;
  vehicleServices: VehicleServices | null = null;
  minimumFareApplied: boolean = false;
  /** From GET /admin/settings/public — drives wallet/Razorpay timing copy and prepaid Razorpay */
  paymentFeatures: PaymentFeatures | null = null;

  // Pending ride details
  private pendingRideDetails: any = null;

  private userId: string | null = null;

  // Ride For (Myself or Other Person)
  rideFor: 'SELF' | 'OTHER' = 'SELF';
  
  // Passenger details (for OTHER rides)
  passengerName: string = '';
  passengerPhone: string = '';
  passengerRelation: string = '';
  passengerNotes: string = '';
  useRiderContact: boolean = false;
  
  // Validation errors
  passengerNameError: string = '';
  passengerPhoneError: string = '';
  
  // Rider contact info (for useRiderContact toggle)
  private riderPhone: string = '';

  // Error state
  paymentError: string | null = null;
  /** Set when tab1 quote snapshot disagrees with fresh calculate-fare (blocks checkout). */
  fareQuoteBlockedMessage: string | null = null;
  /** Net trip fare from last successful calculate-fare (avoids double-subtracting promo). */
  private tripFarePayableFromApi: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private rideService: RideService,
    private paymentService: PaymentService,
    private walletService: WalletService,
    private couponService: CouponService,
    private settingsService: SettingsService,
    private fareService: FareService,
    private storage: Storage,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private http: HttpClient,
    private paymentDisputeService: PaymentDisputeService,
    private mapLifecycle: GoogleMapLifecycleService
  ) {}

  get insufficientBalanceTopUpDisplay(): string {
    return formatInrDisplay(
      Math.max(0, this.totalAmount - this.walletBalance)
    );
  }

  async ionViewWillEnter(): Promise<void> {
    await this.mapLifecycle.suspendAll();
    document.documentElement.classList.add('opaque-app-shell');
  }

  ionViewWillLeave(): void {
    document.documentElement.classList.remove('opaque-app-shell');
  }

  async ngOnInit() {
    // Load user ID
    await this.loadUserId();
    
    // Get pending ride details
    this.pendingRideDetails = this.userService.getPendingRideDetails();

    if (!this.pendingRideDetails) {
      console.warn('No pending ride details found');
      // Navigate back to home
      this.router.navigate(['/tabs/tabs/tab1']);
      return;
    }

    console.log('📦 Pending ride details:', this.pendingRideDetails);

    // Restore rideFor and passenger info if present in pending details
    if (this.pendingRideDetails.rideFor) {
      this.rideFor = this.pendingRideDetails.rideFor;
    }
    if (this.pendingRideDetails.passenger) {
      this.passengerName = this.pendingRideDetails.passenger.name || '';
      this.passengerPhone = this.pendingRideDetails.passenger.phone || '';
      this.passengerRelation = this.pendingRideDetails.passenger.relation || '';
      this.passengerNotes = this.pendingRideDetails.passenger.notes || '';
    }

    // Get rider phone number for "use my contact" toggle
    this.userService.getUser().subscribe((user) => {
      if (user && user.phoneNumber) {
        this.riderPhone = user.phoneNumber;
      }
    });

    // Get wallet balance from user service
    this.userService.getWalletBalance().subscribe((balance) => {
      this.walletBalance = balance;
      this.checkWalletBalance();
    });
    
    // Also fetch wallet balance directly from wallet service for accurate balance
    if (this.userId) {
      this.walletService.getWalletBalance(this.userId).subscribe((response) => {
        if (response.success) {
          this.walletBalance = response.data.walletBalance;
          this.checkWalletBalance();
        }
      });
    }

    // Load settings (vehicle services and pricing configurations)
    this.loadSettings();

    await this.loadOutstandingDriverCancelSettlements();
    await this.loadPaymentDisputeDues();
  }

  private async loadPaymentDisputeDues(): Promise<void> {
    if (!this.userId) return;
    try {
      const opts = await this.authHeaders();
      const headers: Record<string, string> = {};
      if (opts.headers) {
        opts.headers.keys().forEach((k) => {
          const v = opts.headers!.get(k);
          if (v) headers[k] = v;
        });
      }
      const dues = await this.paymentDisputeService.getPendingDues(this.userId, headers);
      this.paymentDisputeOutstandingTotal = dues.totalPendingDues || 0;
      this.paymentDisputeBlocked = dues.bookingBlocked || false;
      this.paymentDisputeBlockedReason = dues.bookingBlockedReason;
      this.calculateTotal();
    } catch (e) {
      console.warn('loadPaymentDisputeDues:', e);
    }
  }

  private async authHeaders(): Promise<{ headers: HttpHeaders } | Record<string, never>> {
    const token = await this.storage.get('token');
    if (!token) {
      return {};
    }
    return {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
    };
  }

  /**
   * Pending charges from driver cancelling during an in-progress trip.
   */
  private async loadOutstandingDriverCancelSettlements(): Promise<void> {
    if (!this.userId) {
      return;
    }
    try {
      const opts = await this.authHeaders();
      const res = await firstValueFrom(
        this.http.get<{
          success?: boolean;
          data?: {
            items?: Array<{
              rideId: string;
              additionalDue: number;
              summary?: string;
            }>;
            totalAdditionalDue?: number;
          };
        }>(
          `${environment.apiUrl}/users/${this.userId}/outstanding-driver-cancel-settlements`,
          opts
        )
      );
      const data = res?.data;
      this.outstandingItems = data?.items || [];
      this.cancellationOutstandingTotal = Number(data?.totalAdditionalDue) || 0;
      this.calculateTotal();
    } catch (e) {
      console.warn('loadOutstandingDriverCancelSettlements:', e);
      this.outstandingItems = [];
      this.cancellationOutstandingTotal = 0;
      this.calculateTotal();
    }
  }

  /**
   * Settle pending driver-cancel charges using the correct method per ride.
   */
  private async settleOutstandingDriverCancelSettlements(): Promise<boolean> {
    if (this.cancellationOutstandingTotal <= 0 || this.outstandingItems.length === 0) {
      return true;
    }
    if (!this.userId) {
      return false;
    }

    const toPay = this.outstandingItems.filter((i) => (i.additionalDue || 0) > 0);
    const opts = await this.authHeaders();
    const base = `${environment.apiUrl}/api/rides`;

    const loading = await this.loadingCtrl.create({
      message: 'Paying previous trip charges...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      for (const item of toPay) {
        const due = Number(item.additionalDue) || 0;
        const methods = item.allowedSettlementMethods || [];
        const isPostRide = item.isPostRideOnlineBooking === true;

        if (methods.includes('razorpay') && due >= 10) {
          const orderRes = await firstValueFrom(
            this.http.post<{ data?: { orderId?: string; amount?: number } }>(
              `${base}/${item.rideId}/driver-cancel-settlement/pay-order`,
              { userId: this.userId },
              opts
            )
          );
          const d = orderRes?.data;
          if (!d?.orderId || d.amount == null) {
            throw new Error('Could not start online payment');
          }
          const pay = await this.paymentService.openRazorpayCheckout(
            d.orderId,
            d.amount,
            { description: 'Previous trip cancellation charge' }
          );
          await firstValueFrom(
            this.http.post(
              `${base}/${item.rideId}/driver-cancel-settlement/verify-razorpay`,
              {
                userId: this.userId,
                razorpay_payment_id: pay.razorpay_payment_id,
              },
              opts
            )
          );
          continue;
        }

        if (methods.includes('wallet') && !isPostRide) {
          const balanceRes = await this.walletService
            .getWalletBalance(this.userId)
            .toPromise();
          const bal =
            balanceRes?.success && balanceRes.data
              ? balanceRes.data.walletBalance
              : 0;
          if (bal < due) {
            await loading.dismiss();
            await this.promptDriverCancelSettlementPage(
              item.rideId,
              `Add ${formatInrWithSymbol(due - bal)} to your wallet or pay online.`
            );
            return false;
          }
          await firstValueFrom(
            this.http.post(
              `${base}/${item.rideId}/driver-cancel-settlement/pay-wallet`,
              { userId: this.userId },
              opts
            )
          );
          continue;
        }

        await loading.dismiss();
        await this.promptDriverCancelSettlementPage(
          item.rideId,
          'Please clear your previous trip charge before booking another ride.'
        );
        return false;
      }

      await loading.dismiss();
      await this.loadOutstandingDriverCancelSettlements();
      await this.refreshWalletBalance();
      await this.showToast('Previous trip charges cleared.', 'success');
      return true;
    } catch (err: any) {
      await loading.dismiss();
      const code = err?.error?.code || err?.code;
      if (code === 'PAYMENT_MODE_ONLINE_REQUIRED') {
        const first = toPay[0];
        if (first) {
          await this.promptDriverCancelSettlementPage(first.rideId);
          return false;
        }
      }
      const msg =
        err?.error?.message ||
        err?.message ||
        'Could not pay previous trip charges.';
      await this.showToast(msg, 'danger');
      return false;
    }
  }

  private async promptDriverCancelSettlementPage(
    rideId: string,
    message?: string
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Previous trip charge',
      message:
        message ||
        'Please pay the charge from your last trip before booking a new one.',
      buttons: [
        { text: 'Later', role: 'cancel' },
        {
          text: 'Pay now',
          handler: () => {
            void this.router.navigate([
              '/driver-cancel-settlement',
              rideId,
            ]);
          },
        },
      ],
    });
    await alert.present();
  }

  private async loadUserId() {
    this.userId = await this.storage.get('userId');
    if (!this.userId) {
      console.warn('User ID not found');
    }
  }

  /**
   * Load settings (vehicle services and pricing configurations)
   */
  private loadSettings() {
    // Load vehicle services
    this.settingsService.getVehicleServices().subscribe({
      next: (services) => {
        this.vehicleServices = services;
        this.calculateFare();
      },
      error: (error) => {
        console.error('Error loading vehicle services:', error);
        // Use defaults
        this.vehicleServices = this.settingsService.getCurrentVehicleServices();
        this.calculateFare();
      }
    });

    // Load pricing configurations
    this.settingsService.getPricingConfigurations().subscribe({
      next: (config) => {
        this.pricingConfig = config;
        this.calculateFare();
      },
      error: (error) => {
        console.error('Error loading pricing configurations:', error);
        // Use defaults
        this.pricingConfig = this.settingsService.getCurrentPricingConfigurations() || {
          baseFare: 0,
          perKmRate: 12,
          minimumFare: 100,
          cancellationFees: 50,
          platformFees: 10,
          driverCommissions: 90
        };
        this.calculateFare();
      }
    });

    this.settingsService.getPaymentFeatures().subscribe({
      next: (pf) => {
        this.paymentFeatures = pf;
      },
      error: () => {
        this.paymentFeatures = {
          prepaidWalletEnabled: true,
          prepaidRazorpayEnabled: false,
        };
      },
    });
  }

  onPaymentMethodChange(event: any) {
    this.selectedPaymentMethod = event.detail.value;
    this.isWalletSelected = event.detail.value === 'wallet';
    this.checkWalletBalance();
  }

  private checkWalletBalance() {
    if (this.isWalletSelected) {
      this.insufficientBalance = this.walletBalance < this.totalAmount;
    } else {
      this.insufficientBalance = false;
    }
  }

  async applyPromo() {
    if (!this.promoCode || !this.promoCode.trim()) {
      this.promoMessage = 'Please enter a promo code';
      return;
    }

    if (!this.userId) {
      this.promoMessage = 'User not authenticated';
      return;
    }

    // Canonical tier keys (backend / coupons)
    const v = this.pendingRideDetails?.selectedVehicle;
    const service =
      v === 'cercaZip' ? 'cercaZip' : v === 'cercaGlide' ? 'cercaGlide' : 'cercaTitan';

    const loading = await this.loadingCtrl.create({
      message: 'Validating promo code...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const response = await this.couponService
        .validateCoupon({
          couponCode: this.promoCode.trim().toUpperCase(),
          userId: this.userId,
          rideFare: this.finalFare, // Use final fare (after minimum fare check)
          service: service,
          rideType: 'normal',
        })
        .toPromise();

      await loading.dismiss();

      if (response && response.success && response.data) {
        this.promoApplied = true;
        this.validatedPromoCode = this.promoCode.trim().toUpperCase();
        this.promoMessage = response.message || 'Promo code applied successfully!';
        this.calculateFare();
      } else {
        this.promoApplied = false;
        this.validatedPromoCode = null;
        this.discountAmount = 0;
        this.promoMessage = response?.message || 'Invalid promo code';
        this.calculateFare();
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error validating promo code:', error);
      this.promoApplied = false;
      this.validatedPromoCode = null;
      this.discountAmount = 0;
      this.promoMessage = 'Failed to validate promo code. Please try again.';
      this.calculateFare();
    }
  }

  calculateTotal() {
    // Ride portion only (what we send as fare for the new booking)
    if (this.tripFarePayableFromApi != null && Number.isFinite(this.tripFarePayableFromApi)) {
      this.rideFarePayable = Math.round(this.tripFarePayableFromApi * 100) / 100;
    } else {
      this.rideFarePayable = Math.max(0, this.finalFare - this.discountAmount);
      this.rideFarePayable = Math.round(this.rideFarePayable * 100) / 100;
    }
    // Checkout total includes pending driver-cancel settlements
    this.totalAmount =
      Math.round((this.rideFarePayable + this.cancellationOutstandingTotal) * 100) /
      100;
    this.checkWalletBalance();
  }

  getWalletAmountUsed(): number {
    return Math.round(Math.min(this.walletBalance, this.totalAmount) * 100) / 100;
  }

  getRemainingAmount(): number {
    return Math.round(Math.max(0, this.totalAmount - this.walletBalance) * 100) / 100;
  }

  async proceedToPayment() {
    if (!this.pendingRideDetails) {
      await this.showToast('Ride details not found', 'danger');
      this.router.navigate(['/tabs/tabs/tab1']);
      return;
    }

    if (this.fareQuoteBlockedMessage) {
      await this.showToast(this.fareQuoteBlockedMessage, 'warning');
      return;
    }

    if (!this.userId) {
      await this.showToast('User not authenticated', 'danger');
      return;
    }

    // Validate passenger info if booking for someone else
    if (this.rideFor === 'OTHER') {
      if (!this.validatePassengerInfo()) {
        await this.showToast('Please fill in all required passenger details', 'warning');
        return;
      }
    }

    // Re-check wallet balance before processing
    try {
      const balanceResponse = await this.walletService.getWalletBalance(this.userId).toPromise();
      if (balanceResponse && balanceResponse.success) {
        this.walletBalance = balanceResponse.data.walletBalance;
        this.checkWalletBalance();
      }
    } catch (error) {
      console.warn('⚠️ Failed to refresh wallet balance before payment:', error);
      // Continue with payment using cached balance
    }

    if (this.paymentDisputeOutstandingTotal > 0 || this.paymentDisputeBlocked) {
      const alert = await this.alertCtrl.create({
        header: 'Pending payment required',
        message:
          this.paymentDisputeBlockedReason ||
          'Please clear previous ride payment before booking another ride.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Pay now',
            handler: () => {
              this.router.navigate(['/pending-dues']);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    if (this.cancellationOutstandingTotal > 0) {
      const settled = await this.settleOutstandingDriverCancelSettlements();
      if (!settled) {
        return;
      }
    }

    // Process payment based on method
    if (this.selectedPaymentMethod === 'wallet') {
      if (this.insufficientBalance) {
        // Wallet has insufficient balance - use hybrid payment
        await this.handleHybridPayment();
      } else {
        // Wallet has sufficient balance - deduct and start ride
        await this.handleWalletPayment();
      }
    } else if (this.selectedPaymentMethod === 'cash') {
      // Cash payment - start ride directly
      await this.handleCashPayment();
    } else if (this.selectedPaymentMethod === 'razorpay') {
      // Pay Online - no upfront payment, pay after ride
      await this.handlePayOnlinePayment();
    }
  }

  /**
   * Handle Pay Online (Razorpay): post-ride by default; prepaid full fare when Settings.paymentFeatures.prepaidRazorpayEnabled
   */
  private async handlePayOnlinePayment() {
    const prepaidOnline = this.paymentFeatures?.prepaidRazorpayEnabled === true;
    const ridePay = this.rideFarePayable;

    if (!prepaidOnline) {
      const loading = await this.loadingCtrl.create({
        message: 'Requesting ride...',
        spinner: 'crescent',
      });
      await loading.present();

      try {
        await this.requestRideAfterPayment('RAZORPAY');
        await loading.dismiss();
      } catch (error: any) {
        await loading.dismiss();
        console.error('❌ Pay Online ride request failed:', error);

        let errorMessage = 'Failed to request ride. Please try again.';
        if (error?.message) {
          if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('connection')) {
            errorMessage = 'Network error. Please check your internet connection and try again.';
          } else if (error.message.toLowerCase().includes('already have an active ride')) {
            errorMessage = 'You already have an active ride. Please cancel it first.';
          } else {
            errorMessage = error.message;
          }
        }

        await this.showToast(errorMessage, 'danger');
        this.paymentError = errorMessage;
      }
      return;
    }

    try {
      await this.paymentService.processPayment(
        ridePay,
        async (paymentResponse) => {
          console.log('✅ Razorpay prepaid ride payment:', paymentResponse);
          await this.requestRideAfterPayment('RAZORPAY', {
            razorpayPaymentId: paymentResponse.razorpay_payment_id,
            razorpayAmountPaid: ridePay,
          });
        },
        async (error: any) => {
          console.error('❌ Razorpay prepaid payment failed:', error);
          let errorMessage = 'Payment cancelled or failed. Please try again.';
          if (error?.error?.description) {
            errorMessage = error.error.description;
          } else if (error?.message) {
            errorMessage = error.message;
          }
          await this.showToast(errorMessage, 'danger');
        },
        {
          name: 'Cerca',
          description: `Ride fare ${formatInrWithSymbol(ridePay)}`,
          prefill: {},
          notes: {
            purpose: 'prepaid_ride_payment',
            rideAmount: ridePay.toString(),
          },
        }
      );
    } catch (error: any) {
      console.error('❌ Error initiating prepaid Razorpay:', error);
      await this.showToast(error?.message || 'Failed to start payment.', 'danger');
    }
  }

  /**
   * Handle wallet payment when balance is sufficient
   */
  private async handleWalletPayment() {
    const prepaidWallet = this.paymentFeatures?.prepaidWalletEnabled !== false;
    const walletTimingMsg = prepaidWallet
      ? `${formatInrWithSymbol(this.totalAmount)} will be deducted from your wallet when you confirm booking (held for this ride). Final fare may adjust at trip end.`
      : `${formatInrWithSymbol(this.totalAmount)} will be deducted from your wallet when the ride completes.`;
    // Show confirmation modal first
    const confirmAlert = await this.alertCtrl.create({
      header: 'Confirm Wallet Payment',
      message: `${walletTimingMsg} Do you want to proceed?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            console.log('Wallet payment cancelled');
          }
        },
        {
          text: 'Proceed',
          handler: async () => {
            await this.processWalletPayment();
          }
        }
      ]
    });
    
    await confirmAlert.present();
  }

  /**
   * Process wallet payment after confirmation
   */
  private async processWalletPayment() {
    const loading = await this.loadingCtrl.create({
      message: 'Processing payment...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Validate balance is sufficient (don't deduct yet - payment happens at ride completion)
      const balanceCheck = await this.walletService.getWalletBalance(this.userId!).toPromise();
      if (balanceCheck && balanceCheck.success) {
        const currentBalance = balanceCheck.data.walletBalance;
        if (currentBalance < this.totalAmount) {
          await loading.dismiss();
          this.walletBalance = currentBalance;
          this.checkWalletBalance();
          await this.showToast('Insufficient wallet balance. Please add money.', 'warning');
          return;
        }
      }

      // Server deducts pure WALLET at booking when prepaidWalletEnabled (default)
      await this.requestRideAfterPayment('WALLET');
      await loading.dismiss();
      
      const prepaidWallet = this.paymentFeatures?.prepaidWalletEnabled !== false;
      const toastMsg = prepaidWallet
        ? `Ride booked. ${formatInrWithSymbol(this.totalAmount)} deducted from wallet for this booking.`
        : `Ride booked. ${formatInrWithSymbol(this.totalAmount)} will be deducted from wallet at ride completion.`;
      const toast = await this.toastCtrl.create({
        message: toastMsg,
        duration: 3000,
        color: 'success',
        position: 'top'
      });
      await toast.present();
    } catch (error: any) {
      await loading.dismiss();
      console.error('❌ Wallet payment failed:', error);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Failed to process wallet payment. Please try again.';
      if (error?.message) {
        if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('connection')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (error.message.toLowerCase().includes('insufficient')) {
          errorMessage = 'Insufficient wallet balance. Please add money.';
        } else {
          errorMessage = error.message;
        }
      }
      
      await this.showToast(errorMessage, 'danger');
      this.paymentError = errorMessage;
    }
  }

  /**
   * Handle hybrid payment (wallet + Razorpay) when balance is insufficient
   */
  private async handleHybridPayment() {
    const walletAmountUsed = Math.min(this.walletBalance, this.totalAmount);
    const razorpayAmountPaid = Math.round((this.totalAmount - walletAmountUsed) * 100) / 100;
    const minimumGatewayAmount = 10;

    try {
      if (razorpayAmountPaid > 0 && razorpayAmountPaid < minimumGatewayAmount) {
        await this.showToast(
          `Remaining amount is ₹${razorpayAmountPaid}. Minimum online payment is ₹${minimumGatewayAmount}. Please add to wallet or pay cash.`,
          'warning'
        );
        return;
      }

      // Open Razorpay for remaining amount
      await this.paymentService.processPayment(
        razorpayAmountPaid,
        async (paymentResponse) => {
          console.log('✅ Razorpay payment successful:', paymentResponse);

          try {
            await this.requestRideAfterPayment('RAZORPAY', {
              walletAmountUsed,
              razorpayAmountPaid,
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
            });
          } catch (rideError: any) {
            console.error('❌ Ride request failed after hybrid payment:', rideError);
            await this.showToast(
              'Payment successful but ride request failed. Please try booking again.',
              'warning'
            );
            await this.refreshWalletBalance();
          }
        },
        async (error: any) => {
          console.error('❌ Razorpay payment failed:', error);

          let errorMessage = 'Payment cancelled or failed. Please try again.';
          if (error?.error?.description) {
            errorMessage = error.error.description;
          } else if (error?.message) {
            if (error.message.toLowerCase().includes('cancelled') || error.message.toLowerCase().includes('cancel')) {
              errorMessage = 'Payment cancelled. You can try again.';
            } else if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('connection')) {
              errorMessage = 'Network error. Please check your internet connection and try again.';
            } else {
              errorMessage = error.message;
            }
          }

          await this.showToast(errorMessage, 'danger');
        },
        {
          name: 'Cerca',
          description: `Pay ₹${razorpayAmountPaid} now + Wallet ₹${walletAmountUsed}`,
          prefill: {},
          notes: {
            purpose: 'hybrid_ride_payment',
            rideAmount: this.totalAmount.toString(),
            walletAmountUsed: walletAmountUsed.toString(),
            razorpayAmountPaid: razorpayAmountPaid.toString(),
          },
        }
      );
    } catch (error: any) {
      console.error('❌ Error initiating wallet top-up:', error);
      const errorMessage = error?.message || 'Failed to initiate payment. Please try again.';
      await this.showToast(errorMessage, 'danger');
    }
  }

  /**
   * Handle cash payment
   */
  private async handleCashPayment() {
    const loading = await this.loadingCtrl.create({
      message: 'Requesting ride...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Start ride directly for cash payment
      try {
        await this.requestRideAfterPayment('CASH');
        await loading.dismiss();
      } catch (rideError: any) {
        await loading.dismiss();
        console.error('❌ Cash payment ride request failed:', rideError);
        
        let errorMessage = 'Failed to request ride. Please try again.';
        if (rideError?.message) {
          if (rideError.message.toLowerCase().includes('network') || rideError.message.toLowerCase().includes('connection')) {
            errorMessage = 'Network error. Please check your internet connection and try again.';
          } else if (rideError.message.toLowerCase().includes('already have an active ride')) {
            errorMessage = 'You already have an active ride. Please cancel it first.';
          } else {
            errorMessage = rideError.message;
          }
        }
        
        await this.showToast(errorMessage, 'danger');
      }
    } catch (error: any) {
      await loading.dismiss();
      console.error('❌ Cash payment failed:', error);
      const errorMessage = error?.message || 'Failed to process cash payment. Please try again.';
      await this.showToast(errorMessage, 'danger');
    }
  }

  /**
   * Refresh wallet balance from backend
   */
  private async refreshWalletBalance(): Promise<void> {
    if (!this.userId) return;

    try {
      const response = await this.walletService.getWalletBalance(this.userId).toPromise();
      if (response && response.success) {
        this.walletBalance = response.data.walletBalance;
        this.checkWalletBalance();
        // Also update user service balance
        this.userService.getWalletBalance().subscribe();
      }
    } catch (error) {
      console.warn('⚠️ Failed to refresh wallet balance:', error);
      // Don't throw - this is a background operation
    }
  }

  private async requestRideAfterPayment(
    paymentMethod: 'CASH' | 'WALLET' | 'RAZORPAY',
    paymentDetails?: {
      razorpayPaymentId?: string;
      walletAmountUsed?: number;
      razorpayAmountPaid?: number;
    }
  ) {
    try {
      console.log('✅ Payment processed:', {
        rideFare: this.rideFarePayable,
        checkoutTotal: this.totalAmount,
        method: paymentMethod,
        promoApplied: this.promoApplied,
        discountAmount: this.discountAmount,
      });

      // Use actual distance from pending ride details or fallback to default
      const estimatedDistance = this.pendingRideDetails?.distanceInKm || 5.2;

      const v = this.pendingRideDetails?.selectedVehicle;
      const service =
        v === 'cercaZip' ? 'cercaZip' : v === 'cercaGlide' ? 'cercaGlide' : 'cercaTitan';

      // Log fare information before sending
      console.log('[Fare Tracking] Sending ride request:', {
        fare: this.rideFarePayable,
        baseFare: this.baseFare,
        distanceFare: this.distanceFare,
        timeFare: this.timeFare,
        subtotal: this.subtotal,
        finalFare: this.finalFare,
        discountAmount: this.discountAmount,
        promoApplied: this.promoApplied,
        distanceInKm: estimatedDistance,
        estimatedDuration: this.estimatedDuration,
        service: service,
        paymentMethod: paymentMethod
      });

      // Prepare passenger info if booking for someone else
      let passengerInfo = undefined;
      if (this.rideFor === 'OTHER') {
        passengerInfo = {
          name: this.passengerName.trim(),
          phone: this.useRiderContact && this.riderPhone ? this.riderPhone : this.passengerPhone.trim(),
          ...(this.passengerRelation && { relation: this.passengerRelation }),
          ...(this.passengerNotes && { notes: this.passengerNotes.trim() }),
        };
      }

      // Request ride via Socket.IO (fare = new ride only; outstanding was settled separately)
      await this.rideService.requestRide({
        pickupLocation: this.pendingRideDetails.pickupLocation,
        dropoffLocation: this.pendingRideDetails.dropoffLocation,
        pickupAddress: this.pendingRideDetails.pickupAddress,
        dropoffAddress: this.pendingRideDetails.dropoffAddress,
        fare: this.rideFarePayable,
        distanceInKm: estimatedDistance,
        estimatedDuration: this.estimatedDuration, // Send estimated duration to backend
        service: service,
        rideType: 'normal',
        paymentMethod: paymentMethod,
        rideFor: this.rideFor,
        ...(passengerInfo && { passenger: passengerInfo }),
        ...(paymentDetails?.razorpayPaymentId && { razorpayPaymentId: paymentDetails.razorpayPaymentId }),
        ...(paymentDetails?.walletAmountUsed !== undefined && { walletAmountUsed: paymentDetails.walletAmountUsed }),
        ...(paymentDetails?.razorpayAmountPaid !== undefined && { razorpayAmountPaid: paymentDetails.razorpayAmountPaid }),
        // Promo code if applied
        ...(this.validatedPromoCode && { promoCode: this.validatedPromoCode }),
      });

      if (paymentMethod !== 'CASH') {
        await this.refreshWalletBalance();
      }

      // Clear pending ride details
      this.userService.clearPendingRideDetails();

      // Navigation to cab-searching is handled by RideService
      console.log('🚗 Ride request sent, navigating to cab-searching...');
    } catch (error: any) {
      console.error('❌ Ride request failed:', error);
      const errorMessage = error?.message || 'Failed to request ride. Please try again.';
      await this.showToast(errorMessage, 'danger');
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Calculate fare using backend API
   * This ensures consistency with tab1 page and uses backend as source of truth
   */
  private calculateFare() {
    // Wait for required data to be loaded
    if (!this.pendingRideDetails || !this.pendingRideDetails.pickupLocation || !this.pendingRideDetails.dropoffLocation) {
      return;
    }

    const vehicle = this.pendingRideDetails.selectedVehicle || 'cercaZip';

    // Call backend API for fare calculation
    this.fareService.calculateFare(
      {
        latitude: this.pendingRideDetails.pickupLocation.latitude,
        longitude: this.pendingRideDetails.pickupLocation.longitude
      },
      {
        latitude: this.pendingRideDetails.dropoffLocation.latitude,
        longitude: this.pendingRideDetails.dropoffLocation.longitude
      },
      vehicle as 'cercaZip' | 'cercaGlide' | 'cercaTitan',
      this.validatedPromoCode || undefined,
      this.userId || undefined
    ).subscribe({
      next: (response) => {
        if (response.success && response.data.fareBreakdown) {
          const breakdown = response.data.fareBreakdown;
          
          // Update fare components from backend response
          this.baseFare = breakdown.baseFare;
          this.distanceFare = breakdown.distanceFare;
          this.timeFare = breakdown.timeFare;
          this.subtotal = breakdown.subtotal;
          // Payable trip total after promo (matches driver collection / ride.fare contract)
          this.finalFare = breakdown.finalFare;
          this.estimatedDuration = response.data.estimatedDuration;
          this.minimumFareApplied = breakdown.fareAfterMinimum > breakdown.subtotal;

          this.tripFarePayableFromApi = breakdown.finalFare;
          if (this.validatedPromoCode && (breakdown.discount || 0) > 0) {
            this.discountAmount = breakdown.discount;
          }

          const snap = this.pendingRideDetails?.fareQuoteSnapshot;
          if (
            snap &&
            snap.quotedFinalFare != null &&
            Number.isFinite(Number(snap.quotedFinalFare)) &&
            !this.promoApplied
          ) {
            const q = Number(snap.quotedFinalFare);
            const a = Number(breakdown.finalFare);
            if (Number.isFinite(q) && Number.isFinite(a) && Math.abs(q - a) > 0.05) {
              this.fareQuoteBlockedMessage = `The fare changed since you chose your trip (was ${formatInrWithSymbol(q)}, now ${formatInrWithSymbol(a)}). Go back to refresh and confirm.`;
            } else {
              this.fareQuoteBlockedMessage = null;
            }
          } else {
            this.fareQuoteBlockedMessage = null;
          }

          // Recalculate total with current discount
          this.calculateTotal();
          this.checkWalletBalance();
        } else {
          console.error('Failed to calculate fare from backend');
          this.fareQuoteBlockedMessage = null;
          // Fallback to frontend calculation if backend fails
          this.calculateFareFallback();
        }
      },
      error: (error) => {
        console.error('Error calculating fare from backend:', error);
        this.fareQuoteBlockedMessage = null;
        // Fallback to frontend calculation if backend fails
        this.calculateFareFallback();
      }
    });
  }

  /**
   * Fallback fare calculation using frontend logic
   * Used when backend API is unavailable
   */
  private calculateFareFallback() {
    // Wait for both settings to be loaded
    if (!this.vehicleServices || !this.pricingConfig || !this.pendingRideDetails) {
      return;
    }

    const vehicle = this.pendingRideDetails.selectedVehicle || 'cercaZip';
    const distance = this.pendingRideDetails.distanceInKm || 0;

    // Get base fare and perMinuteRate from vehicle service
    let vehicleBasePrice = 0;
    let perMinuteRate = 0;
    switch (vehicle) {
      case 'cercaZip':
        vehicleBasePrice = this.vehicleServices.cercaZip?.price || 299;
        perMinuteRate = this.vehicleServices.cercaZip?.perMinuteRate || 2;
        break;
      case 'cercaGlide':
        vehicleBasePrice = this.vehicleServices.cercaGlide?.price || 499;
        perMinuteRate = this.vehicleServices.cercaGlide?.perMinuteRate || 3;
        break;
      case 'cercaTitan':
        vehicleBasePrice = this.vehicleServices.cercaTitan?.price || 699;
        perMinuteRate = this.vehicleServices.cercaTitan?.perMinuteRate || 4;
        break;
      default:
        vehicleBasePrice = 299;
        perMinuteRate = 2;
    }

    // Calculate estimated duration (in minutes)
    this.estimatedDuration = this.pendingRideDetails.estimatedDuration || Math.round(distance * 2);
    if (this.estimatedDuration < 1) {
      this.estimatedDuration = 1; // Minimum 1 minute
    }

    const fallback = calculateFallbackInstantFare({
      basePrice: vehicleBasePrice,
      distanceKm: distance,
      durationMin: this.estimatedDuration,
      perMinuteRate,
      pricing: this.pricingConfig,
    });
    this.baseFare = fallback.baseFare;
    this.distanceFare = fallback.distanceFare;
    this.timeFare = fallback.timeFare;
    this.subtotal = fallback.subtotal;
    this.finalFare = fallback.finalFare;
    this.minimumFareApplied = fallback.minimumFareApplied;

    this.tripFarePayableFromApi = null;
    this.fareQuoteBlockedMessage = null;

    // Recalculate total with current discount
    this.calculateTotal();
    this.checkWalletBalance();
  }

  private async showToast(message: string, color: string = 'dark') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }

  /**
   * Handle rideFor segment change
   */
  onRideForChange(event: any) {
    this.rideFor = event.detail.value;
    
    // Clear passenger form if switching to SELF
    if (this.rideFor === 'SELF') {
      this.passengerName = '';
      this.passengerPhone = '';
      this.passengerRelation = '';
      this.passengerNotes = '';
      this.useRiderContact = false;
      this.passengerNameError = '';
      this.passengerPhoneError = '';
    }
  }

  /**
   * Format phone number (remove non-digits, limit to 10 digits)
   */
  formatPhoneNumber() {
    // Remove all non-digit characters
    this.passengerPhone = this.passengerPhone.replace(/\D/g, '');
    
    // Limit to 10 digits
    if (this.passengerPhone.length > 10) {
      this.passengerPhone = this.passengerPhone.substring(0, 10);
    }
    
    // Clear error when user types
    if (this.passengerPhoneError) {
      this.passengerPhoneError = '';
    }
  }

  /**
   * Validate passenger name
   */
  validatePassengerName(): boolean {
    if (this.rideFor !== 'OTHER') {
      return true;
    }

    const name = this.passengerName.trim();
    if (!name) {
      this.passengerNameError = 'Passenger name is required';
      return false;
    }
    if (name.length < 2) {
      this.passengerNameError = 'Name must be at least 2 characters';
      return false;
    }
    this.passengerNameError = '';
    return true;
  }

  /**
   * Validate passenger phone
   */
  validatePassengerPhone(): boolean {
    if (this.rideFor !== 'OTHER') {
      return true;
    }

    // If using rider contact, skip validation
    if (this.useRiderContact && this.riderPhone) {
      this.passengerPhoneError = '';
      return true;
    }

    const phone = this.passengerPhone.trim();
    if (!phone) {
      this.passengerPhoneError = 'Passenger phone is required';
      return false;
    }
    if (phone.length !== 10) {
      this.passengerPhoneError = 'Phone number must be 10 digits';
      return false;
    }
    // Indian phone validation: must start with 6-9
    if (!/^[6-9]/.test(phone)) {
      this.passengerPhoneError = 'Phone number must start with 6, 7, 8, or 9';
      return false;
    }
    this.passengerPhoneError = '';
    return true;
  }

  /**
   * Validate all passenger info
   */
  validatePassengerInfo(): boolean {
    if (this.rideFor !== 'OTHER') {
      return true;
    }

    const nameValid = this.validatePassengerName();
    const phoneValid = this.validatePassengerPhone();

    return nameValid && phoneValid;
  }

  /**
   * Handle "use rider contact" toggle change
   */
  onUseRiderContactChange() {
    if (this.useRiderContact) {
      // Clear phone error since we're using rider's phone
      this.passengerPhoneError = '';
    } else {
      // Re-validate passenger phone if toggle is off
      this.validatePassengerPhone();
    }
  }

  retryPayment() {
    this.paymentError = null;
    this.proceedToPayment();
  }

  goBack() {
    this.router.navigate(['/tabs/tabs/tab1']);
  }
}
