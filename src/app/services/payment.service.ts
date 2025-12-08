import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { environment } from 'src/environments/environment';

declare var Razorpay: any;

export interface RazorpayOrderResponse {
  message: string;
  order: {
    id: string;
    entity: string;
    amount: number;
    amount_paid: number;
    amount_due: number;
    currency: string;
    receipt: string;
    status: string;
    attempts: number;
    created_at: number;
  };
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayError {
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
}

export interface PaymentOptions {
  name?: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: {
    [key: string]: string;
  };
  theme?: {
    color: string;
  };
  onSuccess?: (response: RazorpayPaymentResponse) => void;
  onFailure?: (error: RazorpayError) => void;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private apiUrl = environment.apiUrl;
  private razorpayConfig = environment.razorpay || {
    key: 'rzp_test_Rp3ejYlVfY449V',
    name: 'Cerca',
    description: 'Taxi Booking Service',
    theme: { color: '#FF4C5A' },
  };

  constructor(
    private http: HttpClient,
    private toastController: ToastController
  ) {}

  /**
   * Initiate payment by creating Razorpay order
   */
  initiatePayment(amount: number): Observable<RazorpayOrderResponse> {
    return this.http.post<RazorpayOrderResponse>(
      `${this.apiUrl}/payment/initiate`,
      { amount }
    );
  }

  /**
   * Open Razorpay checkout modal
   */
  openRazorpayCheckout(
    orderId: string,
    amount: number,
    customOptions?: PaymentOptions
  ): Promise<RazorpayPaymentResponse> {
    return new Promise((resolve, reject) => {
      // Check if Razorpay is loaded
      if (typeof Razorpay === 'undefined') {
        reject(new Error('Razorpay SDK not loaded. Please check if the script is included.'));
        return;
      }

      console.log('Razorpay Config:', this.razorpayConfig);
      console.log('Amount:', amount);
      console.log('Order ID:', orderId);
      console.log('Custom Options:', customOptions);
      const options = {
        key: this.razorpayConfig.key,
        amount: amount * 100, // Convert to paise
        currency: 'INR',
        name: customOptions?.name || this.razorpayConfig.name,
        description: customOptions?.description || this.razorpayConfig.description,
        image: customOptions?.image || '',
        order_id: orderId,
        handler: (response: RazorpayPaymentResponse) => {
          console.log('Payment Success:', response);
          if (customOptions?.onSuccess) {
            customOptions.onSuccess(response);
          }
          resolve(response);
        },
        prefill: customOptions?.prefill || {},
        notes: customOptions?.notes || {},
        theme: customOptions?.theme || this.razorpayConfig.theme,
      };

      const rzp = new Razorpay(options);

      rzp.on('payment.failed', (response: RazorpayError) => {
        console.error('Payment Error:', response.error);
        
        const errorMessage = response.error.description || 'Payment failed. Please try again.';
        
        // Log detailed error info
        console.error('Payment Error Details:', {
          code: response.error.code,
          description: response.error.description,
          source: response.error.source,
          step: response.error.step,
          reason: response.error.reason,
          orderId: response.error.metadata?.order_id,
          paymentId: response.error.metadata?.payment_id,
        });

        this.showToast(errorMessage, 'danger');
        
        if (customOptions?.onFailure) {
          customOptions.onFailure(response);
        }
        
        reject(response);
      });

      rzp.open();
    });
  }

  /**
   * Handle payment success
   */
  async handlePaymentSuccess(
    paymentResponse: RazorpayPaymentResponse,
    callback?: (response: RazorpayPaymentResponse) => void
  ): Promise<void> {
    console.log('Payment Success:', paymentResponse);
    
    await this.showToast('Payment successful!', 'success');
    
    if (callback) {
      callback(paymentResponse);
    }
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(
    error: RazorpayError,
    callback?: (error: RazorpayError) => void
  ): Promise<void> {
    const errorMessage = error.error?.description || 'Payment failed. Please try again.';
    
    console.error('Payment Failure:', error);
    await this.showToast(errorMessage, 'danger');
    
    if (callback) {
      callback(error);
    }
  }

  /**
   * Complete payment flow: initiate -> checkout -> handle result
   */
  async processPayment(
    amount: number,
    onSuccess: (response: RazorpayPaymentResponse) => void,
    onFailure?: (error: RazorpayError) => void,
    customOptions?: PaymentOptions
  ): Promise<void> {
    try {
      // Step 1: Initiate payment to create order
      const orderResponse = await this.initiatePayment(amount).toPromise();
      
      if (!orderResponse ||  !orderResponse.order.id) {
        throw new Error('Failed to create payment order');
      }
      console.log('Order Response:', orderResponse);
      console.log('Order ID:', orderResponse.order.id);

      // Step 2: Open Razorpay checkout
      const paymentResponse = await this.openRazorpayCheckout(
        orderResponse.order.id,
        amount,
        {
          ...customOptions,
          onSuccess: (response) => {
            this.handlePaymentSuccess(response, onSuccess);
          },
          onFailure: (error) => {
            this.handlePaymentFailure(error, onFailure);
          },
        }
      );

      // Payment success is handled in the handler callback
    } catch (error: any) {
      console.error('Payment processing error:', error);
      const errorMessage = error.message || 'Failed to process payment. Please try again.';
      await this.showToast(errorMessage, 'danger');
      
      if (onFailure) {
        onFailure(error);
      }
    }
  }

  /**
   * Show toast notification
   */
  private async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}

