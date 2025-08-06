import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user.service';

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {}

  ngOnInit() {
    // Get wallet balance from user service
    this.userService.getWalletBalance().subscribe(balance => {
      this.walletBalance = balance;
      this.checkWalletBalance();
    });

    // Get the base fare from the route parameters
    this.route.queryParams.subscribe(params => {
      if (params['vehicle']) {
        // Set base fare based on vehicle type
        switch(params['vehicle']) {
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
      // Show error message for insufficient balance
      return;
    }

    try {
      if (this.isWalletSelected) {
        // Deduct amount from wallet
        await this.userService.deductFromWallet(this.totalAmount).toPromise();
      }

      console.log('Processing payment:', {
        amount: this.totalAmount,
        method: this.selectedPaymentMethod,
        promoApplied: this.promoApplied,
        discountAmount: this.discountAmount,
        walletBalance: this.walletBalance
      });

      // Navigate to cab searching page
      this.router.navigate(['/cab-searching']);
    } catch (error) {
      console.error('Payment processing failed:', error);
      // Handle payment failure
    }
  }
}
