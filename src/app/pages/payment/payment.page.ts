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

@Component({
  selector: 'app-payment',
  templateUrl: './payment.page.html',
  styleUrls: ['./payment.page.scss'],
  standalone: false,
})
export class PaymentPage implements OnInit {
  // Payment details
  baseFare: number = 0;
  discountAmount: number = 0;
  totalAmount: number = 0;
  selectedPaymentMethod: string = 'cash';
  walletBalance: number = 0;
  isWalletSelected: boolean = false;
  insufficientBalance: boolean = false;

  // Promo code
  promoCode: string = '';
  promoApplied: boolean = false;
  promoMessage: string = '';

  // Pending ride details
  private pendingRideDetails: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private rideService: RideService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
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

    // Get the base fare from the route parameters
    this.route.queryParams.subscribe((params) => {
      if (params['vehicle']) {
        // Set base fare based on vehicle type
        switch (params['vehicle']) {
          case 'small':
            this.baseFare = 299;
            break;
          case 'medium':
            this.baseFare = 499;
            break;
          case 'large':
            this.baseFare = 699;
            break;
        }
        this.calculateTotal();
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

  applyPromo() {
    // Simulate promo code validation
    if (this.promoCode.toLowerCase() === 'welcome50') {
      this.promoApplied = true;
      this.discountAmount = Math.floor(this.baseFare * 0.5); // 50% discount
      this.promoMessage = '50% discount applied successfully!';
      this.calculateTotal();
      this.checkWalletBalance(); // Recheck wallet balance after discount
    } else {
      this.promoApplied = false;
      this.discountAmount = 0;
      this.promoMessage = 'Invalid promo code';
      this.calculateTotal();
      this.checkWalletBalance(); // Recheck wallet balance after removing discount
    }
  }

  calculateTotal() {
    this.totalAmount = this.baseFare - this.discountAmount;
    this.checkWalletBalance(); // Recheck wallet balance after total calculation
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
      // Process payment
      if (this.isWalletSelected) {
        // Deduct amount from wallet
        const success = await this.userService
          .deductFromWallet(this.totalAmount)
          .toPromise();
        if (!success) {
          throw new Error('Failed to deduct from wallet');
        }
      }

      console.log('✅ Payment processed:', {
        amount: this.totalAmount,
        method: this.selectedPaymentMethod,
        promoApplied: this.promoApplied,
        discountAmount: this.discountAmount,
      });

      // TODO: Calculate actual fare based on distance
      const estimatedDistance = 5.2;

      // Convert payment method to backend format
      let paymentMethod: 'CASH' | 'RAZORPAY' | 'WALLET' = 'CASH';
      if (this.selectedPaymentMethod === 'wallet') {
        paymentMethod = 'WALLET';
      } else if (this.selectedPaymentMethod === 'razorpay') {
        paymentMethod = 'RAZORPAY';
      }

      // Request ride via Socket.IO
      await this.rideService.requestRide({
        pickupLocation: this.pendingRideDetails.pickupLocation,
        dropoffLocation: this.pendingRideDetails.dropoffLocation,
        pickupAddress: this.pendingRideDetails.pickupAddress,
        dropoffAddress: this.pendingRideDetails.dropoffAddress,
        fare: this.totalAmount,
        distanceInKm: estimatedDistance,
        service: 'Sedan',
        // service:
        //   this.pendingRideDetails.selectedVehicle === 'small'
        //     ? 'sedan'
        //     : this.pendingRideDetails.selectedVehicle,
        rideType: 'normal',
        paymentMethod: paymentMethod,
      });

      // Clear pending ride details
      this.userService.clearPendingRideDetails();

      await loading.dismiss();

      // Navigation to cab-searching is handled by RideService
      console.log('🚗 Ride request sent, navigating to cab-searching...');
    } catch (error) {
      await loading.dismiss();
      console.error('❌ Payment or ride request failed:', error);
      await this.showToast(
        'Failed to process payment. Please try again.',
        'danger'
      );
    }
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
