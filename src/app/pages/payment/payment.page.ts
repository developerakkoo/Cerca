import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user.service';
import { RideService } from '../../services/ride.service';
import { PaymentService } from '../../services/payment.service';
import { WalletService } from '../../services/wallet.service';
import { CouponService } from '../../services/coupon.service';
import { SettingsService, PricingConfigurations, VehicleServices } from '../../services/settings.service';
import { Storage } from '@ionic/storage-angular';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.page.html',
  styleUrls: ['./payment.page.scss'],
  standalone: false,
})
export class PaymentPage implements OnInit {
  // Fare breakdown
  baseFare: number = 0; // Vehicle service base price
  distanceFare: number = 0; // Distance × perKmRate
  subtotal: number = 0; // Base fare + distance fare
  finalFare: number = 0; // After minimum fare check
  discountAmount: number = 0;
  totalAmount: number = 0; // Final amount after discount
  
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

  // Pending ride details
  private pendingRideDetails: any = null;

  private userId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private rideService: RideService,
    private paymentService: PaymentService,
    private walletService: WalletService,
    private couponService: CouponService,
    private settingsService: SettingsService,
    private storage: Storage,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    // Load user ID
    await this.loadUserId();
    
    // Get pending ride details
    this.pendingRideDetails = this.userService.getPendingRideDetails();

    if (!this.pendingRideDetails) {
      console.warn('No pending ride details found');
      // Navigate back to home
      this.router.navigate(['/tabs/tab1']);
      return;
    }

    console.log('📦 Pending ride details:', this.pendingRideDetails);

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

    // Determine service type from vehicle selection
    const service = this.pendingRideDetails?.selectedVehicle === 'small' 
      ? 'sedan' 
      : this.pendingRideDetails?.selectedVehicle === 'medium'
      ? 'suv'
      : 'auto';

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
        this.discountAmount = response.data.discountAmount;
        this.promoMessage = response.message || 'Promo code applied successfully!';
        this.calculateTotal();
        this.checkWalletBalance(); // Recheck wallet balance after discount
      } else {
        this.promoApplied = false;
        this.validatedPromoCode = null;
        this.discountAmount = 0;
        this.promoMessage = response?.message || 'Invalid promo code';
        this.calculateTotal();
        this.checkWalletBalance(); // Recheck wallet balance after removing discount
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error validating promo code:', error);
      this.promoApplied = false;
      this.validatedPromoCode = null;
      this.discountAmount = 0;
      this.promoMessage = 'Failed to validate promo code. Please try again.';
      this.calculateTotal();
      this.checkWalletBalance();
    }
  }

  calculateTotal() {
    // Total = final fare - discount
    this.totalAmount = Math.max(0, this.finalFare - this.discountAmount);
    this.totalAmount = Math.round(this.totalAmount * 100) / 100; // Round to 2 decimal places
    this.checkWalletBalance(); // Recheck wallet balance after total calculation
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
      this.router.navigate(['/tabs/tab1']);
      return;
    }

    if (!this.userId) {
      await this.showToast('User not authenticated', 'danger');
      return;
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
    }
  }

  /**
   * Handle wallet payment when balance is sufficient
   */
  private async handleWalletPayment() {
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

      // Don't deduct here - payment happens at ride completion
      // Just create the ride
      await this.requestRideAfterPayment('WALLET');
      await loading.dismiss();
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
    }
  }

  /**
   * Handle hybrid payment (wallet + Razorpay) when balance is insufficient
   */
  private async handleHybridPayment() {
    const walletAmountUsed = Math.min(this.walletBalance, this.totalAmount);
    const razorpayAmountPaid = Math.round((this.totalAmount - walletAmountUsed) * 100) / 100;
    const minimumGatewayAmount = 10;

    const loading = await this.loadingCtrl.create({
      message: 'Preparing payment...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      if (razorpayAmountPaid > 0 && razorpayAmountPaid < minimumGatewayAmount) {
        await loading.dismiss();
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
            await loading.dismiss();
          } catch (rideError: any) {
            await loading.dismiss();
            console.error('❌ Ride request failed after hybrid payment:', rideError);
            await this.showToast(
              'Payment successful but ride request failed. Please try booking again.',
              'warning'
            );
            await this.refreshWalletBalance();
          }
        },
        async (error: any) => {
          await loading.dismiss();
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
      await loading.dismiss();
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
        amount: this.totalAmount,
        method: paymentMethod,
        promoApplied: this.promoApplied,
        discountAmount: this.discountAmount,
      });

      // Use actual distance from pending ride details or fallback to default
      const estimatedDistance = this.pendingRideDetails?.distanceInKm || 5.2;

      // Determine service type from vehicle selection
      const service = this.pendingRideDetails?.selectedVehicle === 'small' 
        ? 'sedan' 
        : this.pendingRideDetails?.selectedVehicle === 'medium'
        ? 'suv'
        : 'auto';

      // Log fare information before sending
      console.log('[Fare Tracking] Sending ride request:', {
        fare: this.totalAmount,
        baseFare: this.baseFare,
        distanceFare: this.distanceFare,
        subtotal: this.subtotal,
        finalFare: this.finalFare,
        discountAmount: this.discountAmount,
        promoApplied: this.promoApplied,
        distanceInKm: estimatedDistance,
        service: service,
        paymentMethod: paymentMethod
      });

      // Request ride via Socket.IO
      await this.rideService.requestRide({
        pickupLocation: this.pendingRideDetails.pickupLocation,
        dropoffLocation: this.pendingRideDetails.dropoffLocation,
        pickupAddress: this.pendingRideDetails.pickupAddress,
        dropoffAddress: this.pendingRideDetails.dropoffAddress,
        fare: this.totalAmount,
        distanceInKm: estimatedDistance,
        service: service,
        rideType: 'normal',
        paymentMethod: paymentMethod,
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
   * Calculate fare based on distance and vehicle type
   * Formula: Base Fare + (Distance × Per Km Rate)
   * Then apply minimum fare check
   */
  private calculateFare() {
    // Wait for both settings to be loaded
    if (!this.vehicleServices || !this.pricingConfig || !this.pendingRideDetails) {
      return;
    }

    const vehicle = this.pendingRideDetails.selectedVehicle || 'small';
    const distance = this.pendingRideDetails.distanceInKm || 0;

    // Get base fare from vehicle service
    let vehicleBasePrice = 0;
    switch (vehicle) {
      case 'small':
        vehicleBasePrice = this.vehicleServices.cercaSmall?.price || 299;
        break;
      case 'medium':
        vehicleBasePrice = this.vehicleServices.cercaMedium?.price || 499;
        break;
      case 'large':
        vehicleBasePrice = this.vehicleServices.cercaLarge?.price || 699;
        break;
      default:
        vehicleBasePrice = 299;
    }

    // Calculate fare components
    this.baseFare = vehicleBasePrice;
    this.distanceFare = distance * this.pricingConfig.perKmRate;
    this.subtotal = this.baseFare + this.distanceFare;
    
    // Apply minimum fare check
    const minimumFare = this.pricingConfig.minimumFare;
    this.finalFare = Math.max(this.subtotal, minimumFare);
    this.minimumFareApplied = this.finalFare > this.subtotal;
    
    // Round to 2 decimal places
    this.baseFare = Math.round(this.baseFare * 100) / 100;
    this.distanceFare = Math.round(this.distanceFare * 100) / 100;
    this.subtotal = Math.round(this.subtotal * 100) / 100;
    this.finalFare = Math.round(this.finalFare * 100) / 100;

    // Recalculate total with current discount
    this.calculateTotal();
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
}
