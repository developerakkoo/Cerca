import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface PendingDueItem {
  disputeId: string;
  rideId: string;
  issueType: string;
  status: string;
  amountRemaining: number;
  fare: number;
  paymentMethod?: string;
  createdAt?: string;
}

export interface PendingDuesResponse {
  items: PendingDueItem[];
  totalPendingDues: number;
  bookingBlocked: boolean;
  bookingBlockedReason: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentDisputeService {
  constructor(private http: HttpClient) {}

  async getPendingDues(userId: string, headers: Record<string, string>): Promise<PendingDuesResponse> {
    const res = await firstValueFrom(
      this.http.get<{ success: boolean; data: PendingDuesResponse }>(
        `${environment.apiUrl}/users/${userId}/pending-dues`,
        { headers }
      )
    );
    return (
      res?.data || {
        items: [],
        totalPendingDues: 0,
        bookingBlocked: false,
        bookingBlockedReason: null,
      }
    );
  }

  async checkBookingEligibility(
    userId: string,
    headers: Record<string, string>
  ): Promise<{ canBook: boolean; message?: string }> {
    try {
      await firstValueFrom(
        this.http.get(`${environment.apiUrl}/users/${userId}/booking-eligibility`, {
          headers,
        })
      );
      return { canBook: true };
    } catch (err: any) {
      return {
        canBook: false,
        message: err?.error?.message || 'Cannot book until pending dues are cleared',
      };
    }
  }

  payWithWallet(userId: string, headers: Record<string, string>, idempotencyKey?: string) {
    return this.http.post(
      `${environment.apiUrl}/users/${userId}/pending-dues/pay-wallet`,
      { idempotencyKey: idempotencyKey || `dues_${userId}_${Date.now()}` },
      { headers }
    );
  }

  createRazorpayOrder(userId: string, headers: Record<string, string>) {
    return this.http.post<{ success: boolean; data: { order: any; amount: number; key: string } }>(
      `${environment.apiUrl}/users/${userId}/pending-dues/pay-online`,
      {},
      { headers }
    );
  }

  verifyRazorpayPayment(
    userId: string,
    headers: Record<string, string>,
    razorpay_payment_id: string,
    razorpay_order_id: string
  ) {
    return this.http.post(
      `${environment.apiUrl}/users/${userId}/pending-dues/verify-payment`,
      { razorpay_payment_id, razorpay_order_id },
      { headers }
    );
  }
}
