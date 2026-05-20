import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationStart } from '@angular/router';
import { Platform, LoadingController, ToastController } from '@ionic/angular';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Storage } from '@ionic/storage-angular';
import { Location } from '@angular/common';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  RideService,
  RiderInProgressCancelBilling,
  DriverCancelSettlementRequest,
} from '../../services/ride.service';
import type { DriverCancelSettlementAction } from '../../components/ride/driver-cancel-settlement-modal/driver-cancel-settlement-modal.component';

@Component({
  selector: 'app-driver-cancel-settlement',
  templateUrl: './driver-cancel-settlement.page.html',
  styleUrls: ['./driver-cancel-settlement.page.scss'],
  standalone: false,
})
export class DriverCancelSettlementPage implements OnInit, OnDestroy {
  rideId = '';
  userId: string | null = null;
  isLoading = true;
  loadError: string | null = null;
  settlementRequest: DriverCancelSettlementRequest | null = null;
  settlementComplete = false;

  private backButtonSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private platform: Platform,
    private location: Location,
    private http: HttpClient,
    private storage: Storage,
    private rideService: RideService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.location.replaceState(this.router.url);

    this.rideId = this.route.snapshot.paramMap.get('rideId') || '';
    this.userId = await this.storage.get('userId');

    if (!this.rideId || !this.userId) {
      this.loadError = 'Invalid session';
      this.isLoading = false;
      return;
    }

    await this.loadSettlement();
    this.setupBackButtonPrevention();
    this.setupRouterPrevention();
  }

  ionViewWillEnter() {
    this.location.replaceState(this.router.url);
  }

  private async loadSettlement() {
    this.isLoading = true;
    this.loadError = null;
    try {
      const nav = this.router.getCurrentNavigation();
      const state = (nav?.extras?.state || history.state || {}) as {
        reason?: string;
        cancellationReason?: string;
      };
      const params = new HttpParams().set('userId', String(this.userId));
      const res = await firstValueFrom(
        this.http.get<{
          success?: boolean;
          data?: {
            summary?: RiderInProgressCancelBilling | null;
            cancellationReason?: string | null;
            paymentMethod?: string | null;
          };
        }>(
          `${environment.apiUrl}/api/rides/${this.rideId}/rider-in-progress-cancel-billing`,
          { params }
        )
      );
      const summary = res?.data?.summary;
      if (!summary) {
        this.loadError = 'No settlement required for this trip.';
        this.isLoading = false;
        return;
      }

      const additional = Number(summary.additionalDue) || 0;
      const paymentMethod = (res?.data?.paymentMethod ||
        'CASH') as DriverCancelSettlementRequest['bookingPaymentMethod'];
      const allowed = summary.allowedSettlementMethods || [];
      const isPostRideOnline =
        allowed.length > 0
          ? !allowed.includes('wallet')
          : String(paymentMethod).toUpperCase() === 'RAZORPAY';

      const reason =
        state.reason ||
        state.cancellationReason ||
        res?.data?.cancellationReason ||
        'Driver ended the trip';

      this.settlementRequest = {
        rideId: this.rideId,
        reason,
        settlement: {
          partialDistanceKm: summary.partialDistanceKm,
          perKmRateUsed: summary.perKmRateUsed,
          perKmRateSource: summary.perKmRateSource,
          riderPenaltyAmount: summary.riderPenaltyAmount,
          driverPartialAmount: summary.driverPartialAmount,
          riderTotalCharge: summary.riderTotalCharge,
          prepaidTotal: summary.prepaidTotal,
          additionalDue: summary.additionalDue,
          refundDue: summary.refundDue,
          riderPaymentStatus: summary.riderPaymentStatus,
          allowedSettlementMethods: summary.allowedSettlementMethods,
        },
        isZeroDue: additional <= 0,
        bookingPaymentMethod: paymentMethod,
        isPostRideOnlineBooking: isPostRideOnline,
      };

      if (additional > 0) {
        await this.storage.set(
          'pendingDriverCancelSettlementRideId',
          this.rideId
        );
      }
    } catch (e: any) {
      this.loadError =
        e?.error?.message || e?.message || 'Could not load trip charges';
    } finally {
      this.isLoading = false;
    }
  }

  get blockExit(): boolean {
    if (this.settlementComplete) return false;
    const due = Number(this.settlementRequest?.settlement?.additionalDue) || 0;
    const status = this.settlementRequest?.settlement?.riderPaymentStatus;
    return due > 0 && status === 'pending';
  }

  private setupBackButtonPrevention() {
    if (this.platform.is('android')) {
      this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(
        9999,
        () => {
          if (this.blockExit) {
            void this.showToast(
              'Please pay or confirm how you will settle this trip charge.',
              'warning'
            );
          } else {
            this.location.back();
          }
        }
      );
    }
  }

  private setupRouterPrevention() {
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe((event: NavigationStart) => {
        if (!this.blockExit) return;
        const currentUrl = this.router.url;
        if (
          currentUrl.includes('/driver-cancel-settlement') &&
          !event.url.includes('/driver-cancel-settlement')
        ) {
          void this.showToast(
            'Please complete settlement before leaving.',
            'warning'
          );
        }
      });
  }

  async onSettlementAction(action: DriverCancelSettlementAction | undefined) {
    if (!this.settlementRequest) return;

    if (!action && this.blockExit) {
      const payLater = await this.showPayLaterAlert();
      if (!payLater) return;
      await this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
      return;
    }

    if (!action) {
      await this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Processing...',
      spinner: 'crescent',
    });
    await loading.present();
    try {
      await this.rideService.settleDriverCancellation(
        this.rideId,
        action,
        this.settlementRequest
      );
      this.settlementComplete = true;
    } catch {
      /* toast shown in service */
    } finally {
      await loading.dismiss();
    }
  }

  private async showPayLaterAlert(): Promise<boolean> {
    return new Promise((resolve) => {
      void this.showToast(
        'You can pay later from Pending payments or when booking your next ride.',
        'warning'
      );
      resolve(true);
    });
  }

  private async showToast(message: string, color: string = 'medium') {
    const t = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'top',
    });
    await t.present();
  }

  ngOnDestroy() {
    this.backButtonSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }
}
