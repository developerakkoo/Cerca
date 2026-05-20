import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  AlertController,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { PaymentDisputeService, PendingDueItem } from '../../services/payment-dispute.service';
import { PaymentService } from '../../services/payment.service';
import { WalletService } from '../../services/wallet.service';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { formatInrWithSymbol } from '../../utils/money-display.util';

export interface DriverCancelDueItem {
  rideId: string;
  additionalDue: number;
  summary?: string;
  allowedSettlementMethods?: Array<'wallet' | 'razorpay' | 'cash'>;
  isPostRideOnlineBooking?: boolean;
}

@Component({
  selector: 'app-pending-dues',
  templateUrl: './pending-dues.page.html',
  styleUrls: ['./pending-dues.page.scss'],
  standalone: false,
})
export class PendingDuesPage implements OnInit {
  disputeItems: PendingDueItem[] = [];
  driverCancelItems: DriverCancelDueItem[] = [];
  disputeTotal = 0;
  driverCancelTotal = 0;
  totalPendingDues = 0;
  bookingBlocked = false;
  bookingBlockedReason: string | null = null;
  walletBalance = 0;
  userId: string | null = null;
  selectedMethod: 'wallet' | 'razorpay' = 'wallet';

  constructor(
    private paymentDisputeService: PaymentDisputeService,
    private walletService: WalletService,
    private paymentService: PaymentService,
    private http: HttpClient,
    private storage: Storage,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.userId = await this.storage.get('userId');
    await this.load();
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.storage.get('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async load() {
    if (!this.userId) return;
    const headers = await this.authHeaders();

    const dues = await this.paymentDisputeService.getPendingDues(
      this.userId,
      headers
    );
    this.disputeItems = dues.items;
    this.disputeTotal = dues.totalPendingDues;

    try {
      const res = await firstValueFrom(
        this.http.get<{
          success?: boolean;
          data?: { items?: DriverCancelDueItem[]; totalAdditionalDue?: number };
        }>(
          `${environment.apiUrl}/users/${this.userId}/outstanding-driver-cancel-settlements`,
          { headers }
        )
      );
      this.driverCancelItems = res?.data?.items || [];
      this.driverCancelTotal = Number(res?.data?.totalAdditionalDue) || 0;
    } catch {
      this.driverCancelItems = [];
      this.driverCancelTotal = 0;
    }

    this.totalPendingDues =
      Math.round((this.disputeTotal + this.driverCancelTotal) * 100) / 100;
    this.bookingBlocked =
      dues.bookingBlocked || this.driverCancelTotal > 0;
    this.bookingBlockedReason =
      this.driverCancelTotal > 0 && this.disputeTotal <= 0
        ? 'Please clear your previous trip charge before booking another ride.'
        : dues.bookingBlockedReason;

    try {
      const bal = await this.walletService
        .getWalletBalance(this.userId)
        .toPromise();
      if (bal?.success && bal.data) {
        this.walletBalance = bal.data.walletBalance;
      }
    } catch {
      /* ignore */
    }
  }

  openDriverCancelSettlement(rideId: string) {
    void this.router.navigate(['/driver-cancel-settlement', rideId]);
  }

  async pay() {
    if (!this.userId || this.totalPendingDues <= 0) return;

    if (this.driverCancelItems.length > 0) {
      const needsManual = this.driverCancelItems.some((item) => {
        const due = item.additionalDue || 0;
        const methods = item.allowedSettlementMethods || [];
        const isPostRide = item.isPostRideOnlineBooking === true;
        if (due < 10 && methods.includes('wallet') && !isPostRide) return false;
        if (methods.includes('razorpay') && due >= 10) return false;
        if (methods.includes('wallet') && !isPostRide) return false;
        return due > 0;
      });
      if (needsManual) {
        const first = this.driverCancelItems.find((i) => (i.additionalDue || 0) > 0);
        if (first) {
          await this.openDriverCancelSettlement(first.rideId);
          return;
        }
      }
    }

    if (this.selectedMethod === 'wallet' && this.disputeTotal > 0) {
      if (this.walletBalance < this.disputeTotal) {
        const t = await this.toastCtrl.create({
          message: `Add ${formatInrWithSymbol(this.disputeTotal - this.walletBalance)} to your wallet for dispute dues.`,
          color: 'warning',
          duration: 4000,
        });
        await t.present();
        return;
      }
    }

    const loading = await this.loadingCtrl.create({ message: 'Paying dues...' });
    await loading.present();
    try {
      const headers = await this.authHeaders();
      const base = `${environment.apiUrl}/api/rides`;

      for (const item of this.driverCancelItems.filter(
        (i) => (i.additionalDue || 0) > 0
      )) {
        const due = item.additionalDue || 0;
        const methods = item.allowedSettlementMethods || [];
        const isPostRide = item.isPostRideOnlineBooking === true;
        if (methods.includes('wallet') && !isPostRide) {
          await firstValueFrom(
            this.http.post(
              `${base}/${item.rideId}/driver-cancel-settlement/pay-wallet`,
              { userId: this.userId },
              { headers }
            )
          );
        }
      }

      if (this.disputeTotal > 0) {
        if (this.selectedMethod === 'wallet') {
          await firstValueFrom(
            this.paymentDisputeService.payWithWallet(this.userId, headers)
          );
        } else {
          const orderRes = await firstValueFrom(
            this.paymentDisputeService.createRazorpayOrder(this.userId, headers)
          );
          if (!orderRes?.success || !orderRes.data?.order) {
            throw new Error('Could not create payment order');
          }
          const { order } = orderRes.data;
          const checkout = await this.paymentService.openRazorpayCheckout(
            order.id,
            orderRes.data.amount,
            { description: 'Clear pending ride dues', name: 'Cerca' }
          );
          if (!checkout?.razorpay_payment_id) return;
          await firstValueFrom(
            this.paymentDisputeService.verifyRazorpayPayment(
              this.userId,
              headers,
              checkout.razorpay_payment_id,
              checkout.razorpay_order_id || order.id
            )
          );
        }
      }

      await loading.dismiss();
      await this.load();
      const t = await this.toastCtrl.create({
        message: 'Payments cleared.',
        color: 'success',
        duration: 3000,
      });
      await t.present();
      if (this.totalPendingDues <= 0) {
        this.router.navigate(['/tabs/tabs/tab1']);
      }
    } catch (err: any) {
      await loading.dismiss();
      const t = await this.toastCtrl.create({
        message: err?.error?.message || err?.message || 'Payment failed',
        color: 'danger',
        duration: 4000,
      });
      await t.present();
    }
  }
}
