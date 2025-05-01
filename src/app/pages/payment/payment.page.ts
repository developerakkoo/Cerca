import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

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
  
  // Promo code
  promoCode: string = '';
  promoApplied: boolean = false;
  promoMessage: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
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
  }

  applyPromo() {
    // Simulate promo code validation
    if (this.promoCode.toLowerCase() === 'welcome50') {
      this.promoApplied = true;
      this.discountAmount = Math.floor(this.baseFare * 0.5); // 50% discount
      this.promoMessage = '50% discount applied successfully!';
      this.calculateTotal();
    } else {
      this.promoApplied = false;
      this.discountAmount = 0;
      this.promoMessage = 'Invalid promo code';
      this.calculateTotal();
    }
  }

  calculateTotal() {
    this.totalAmount = this.baseFare - this.discountAmount;
  }

  proceedToPayment() {
    // Here you would typically:
    // 1. Validate the payment method
    // 2. Process the payment
    // 3. Show loading state
    // 4. Handle success/failure
    // 5. Navigate to success/failure page

    // For now, we'll just show an alert
    console.log('Processing payment:', {
      amount: this.totalAmount,
      method: this.selectedPaymentMethod,
      promoApplied: this.promoApplied,
      discountAmount: this.discountAmount
    });

    // Navigate to success page (you'll need to create this)
    this.router.navigate(['/cab-searching']);
  }
}
