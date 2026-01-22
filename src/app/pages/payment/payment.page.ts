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
  
  // Hybrid payment properties
  walletAmountToUse: number = 0;
  razorpayAmountToPay: number = 0;
  canUseWallet: boolean = false;

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
      this.updateHybridPaymentFlags();
    });
    
    // Also fetch wallet balance directly from wallet service for accurate balance
    if (this.userId) {
      this.walletService.getWalletBalance(this.userId).subscribe((response) => {
        if (response.success) {
          this.walletBalance = response.data.walletBalance;
          this.updateHybridPaymentFlags();
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
    this.calculateHybridPayment();
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
    this.calculateHybridPayment();
  }
  
  /**
   * Update hybrid payment flags and calculations
   */
  updateHybridPaymentFlags() {
    // Check if wallet can be used (balance >= 100)
    this.canUseWallet = this.walletBalance >= 100;
    this.calculateHybridPayment();
  }
  
  /**
   * Calculate hybrid payment amounts
   */
  calculateHybridPayment() {
    if (this.selectedPaymentMethod === 'razorpay' && this.canUseWallet) {
      // Use wallet up to total amount
      this.walletAmountToUse = Math.min(this.walletBalance, this.totalAmount);
      // Pay remaining via Razorpay
      this.razorpayAmountToPay = Math.max(0, this.totalAmount - this.walletAmountToUse);
    } else {
      // No wallet usage
      this.walletAmountToUse = 0;
      if (this.selectedPaymentMethod === 'razorpay') {
        this.razorpayAmountToPay = this.totalAmount;
      } else {
        this.razorpayAmountToPay = 0;
      }
    }
  }

  async proceedToPayment() {
    if (this.isWalletSelected && this.insufficientBalance) {
      await this.showToast('Insufficient wallet balance', 'danger');
      return;
    }

    if (!this.pendingRideDetails) {
      await this.showToast('Ride details not found', 'danger');
      this.router.navigate(['/tabs/tab1']);
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Processing payment...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Convert payment method to backend format
      let paymentMethod: 'CASH' | 'RAZORPAY' | 'WALLET' = 'CASH';
      if (this.selectedPaymentMethod === 'wallet') {
        paymentMethod = 'WALLET';
      } else if (this.selectedPaymentMethod === 'razorpay') {
        paymentMethod = 'RAZORPAY';
      }

      // Process payment based on method
      if (this.selectedPaymentMethod === 'wallet') {
        // Deduct amount from wallet using WalletService
        if (!this.userId) {
          throw new Error('User ID not found');
        }
        const response = await this.walletService
          .deductFromWallet(this.userId, {
            amount: this.totalAmount,
            description: `Ride payment of ₹${this.totalAmount}`,
          })
          .toPromise();
        if (!response || !response.success) {
          throw new Error(response?.message || 'Failed to deduct from wallet');
        }
        console.log('✅ Wallet payment processed:', response);
      } else if (this.selectedPaymentMethod === 'razorpay') {
        // Calculate payment amounts
        this.calculateHybridPayment();
        
        // If hybrid payment (wallet + Razorpay)
        if (this.canUseWallet && this.walletAmountToUse > 0) {
          // Process Razorpay payment for remaining amount only
          await this.paymentService.processPayment(
            this.razorpayAmountToPay,
            async (paymentResponse) => {
              // Razorpay payment successful - create ride with hybrid payment details
              console.log('✅ Razorpay payment successful:', paymentResponse);
              console.log(`💰 Processing hybrid payment - Wallet: ₹${this.walletAmountToUse}, Razorpay: ₹${this.razorpayAmountToPay}`);
              
              try {
                // Create ride with hybrid payment details
                // Backend will automatically process wallet deduction
                await this.requestRideAfterPayment(
                  paymentMethod,
                  paymentResponse.razorpay_payment_id,
                  true // isHybridPayment flag
                );
                
                // Refresh wallet balance after ride creation
                if (this.userId) {
                  await this.walletService.getWalletBalance(this.userId).toPromise();
                  console.log('✅ Wallet balance refreshed after hybrid payment');
                }
              } catch (error) {
                console.error('❌ Error creating ride after hybrid payment:', error);
                await loading.dismiss();
                await this.showToast('Failed to create ride. Please contact support.', 'danger');
              }
            },
            async (error) => {
              // Razorpay payment failed - no wallet deduction yet
              console.error('❌ Razorpay payment failed:', error);
              await loading.dismiss();
              await this.showToast('Payment failed. Please try again.', 'danger');
            },
            {
              name: 'Cerca',
              description: `Ride payment - ₹${this.razorpayAmountToPay} online${this.walletAmountToUse > 0 ? ` (₹${this.walletAmountToUse} from wallet)` : ''}`,
              prefill: {
                // You can add user details here if available
              },
              notes: {
                rideId: 'pending',
                hybridPayment: 'true',
                walletAmount: this.walletAmountToUse.toString(),
              },
            }
          );
          
          // Dismiss loading here as Razorpay modal will handle the UI
          await loading.dismiss();
          return; // Exit early as ride request will be handled in payment success callback
        } else {
          // Full Razorpay payment (no wallet usage)
          await this.paymentService.processPayment(
            this.totalAmount,
            async (paymentResponse) => {
              // Payment successful - refresh wallet balance and proceed with ride request
              console.log('✅ Razorpay payment successful:', paymentResponse);
              
              // Refresh wallet balance after successful payment
              if (this.userId) {
                try {
                  await this.walletService.getWalletBalance(this.userId).toPromise();
                  console.log('✅ Wallet balance refreshed after Razorpay payment');
                } catch (error) {
                  console.warn('⚠️ Failed to refresh wallet balance:', error);
                  // Continue with ride request even if wallet refresh fails
                }
              }
              
              await this.requestRideAfterPayment(paymentMethod, paymentResponse.razorpay_payment_id);
            },
            async (error) => {
              // Payment failed
              console.error('❌ Razorpay payment failed:', error);
              await loading.dismiss();
              await this.showToast('Payment failed. Please try again.', 'danger');
            },
            {
              name: 'Cerca',
              description: `Ride payment of ₹${this.totalAmount}`,
              prefill: {
                // You can add user details here if available
              },
              notes: {
                rideId: 'pending', // Will be updated after ride is created
              },
            }
          );
          
          // Dismiss loading here as Razorpay modal will handle the UI
          await loading.dismiss();
          return; // Exit early as ride request will be handled in payment success callback
        }
      }

      // For cash and wallet payments, proceed directly to ride request
      await this.requestRideAfterPayment(paymentMethod);
      await loading.dismiss();
    } catch (error) {
      await loading.dismiss();
      console.error('❌ Payment or ride request failed:', error);
      await this.showToast(
        'Failed to process payment. Please try again.',
        'danger'
      );
    }
  }

  private async requestRideAfterPayment(
    paymentMethod: 'CASH' | 'RAZORPAY' | 'WALLET',
    razorpayPaymentId?: string,
    isHybridPayment: boolean = false
  ) {
    try {
      console.log('✅ Payment processed:', {
        amount: this.totalAmount,
        method: paymentMethod,
        promoApplied: this.promoApplied,
        discountAmount: this.discountAmount,
        razorpayPaymentId: razorpayPaymentId || 'N/A',
      });

      // Use actual distance from pending ride details or fallback to default
      const estimatedDistance = this.pendingRideDetails?.distanceInKm || 5.2;

      // Determine service type from vehicle selection
      const service = this.pendingRideDetails?.selectedVehicle === 'small' 
        ? 'sedan' 
        : this.pendingRideDetails?.selectedVehicle === 'medium'
        ? 'suv'
        : 'auto';

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
        // Store Razorpay payment ID if available
        ...(razorpayPaymentId && { razorpayPaymentId }),
        // Hybrid payment details
        ...(isHybridPayment && {
          walletAmountUsed: this.walletAmountToUse,
          razorpayAmountPaid: this.razorpayAmountToPay,
        }),
        // Promo code if applied
        ...(this.validatedPromoCode && { promoCode: this.validatedPromoCode }),
      });
      
      // Hybrid payment details are passed to backend via ride request
      // Backend will automatically process wallet deduction during ride creation
      if (isHybridPayment) {
        console.log('💰 Hybrid payment details sent to backend:', {
          walletAmount: this.walletAmountToUse,
          razorpayAmount: this.razorpayAmountToPay,
          razorpayPaymentId,
        });
      }

      // Clear pending ride details
      this.userService.clearPendingRideDetails();

      // Navigation to cab-searching is handled by RideService
      console.log('🚗 Ride request sent, navigating to cab-searching...');
    } catch (error) {
      console.error('❌ Ride request failed:', error);
      await this.showToast('Failed to request ride. Please try again.', 'danger');
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
