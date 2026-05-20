import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, NavigationStart } from '@angular/router';
import {
  Platform,
  LoadingController,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { PaymentService } from '../../services/payment.service';
import { RideService } from '../../services/ride.service';
import { Storage } from '@ionic/storage-angular';
import { Location } from '@angular/common';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { GoogleMapLifecycleService } from '../../services/google-map-lifecycle.service';

@Component({
  selector: 'app-ride-payment',
  templateUrl: './ride-payment.page.html',
  styleUrls: ['./ride-payment.page.scss'],
  standalone: false,
})
export class RidePaymentPage implements OnInit, OnDestroy, ViewWillEnter, ViewWillLeave {
  rideId: string = '';
  userId: string | null = null;
  fare: number = 0;
  pickupAddress: string = '';
  dropoffAddress: string = '';
  duration: number = 0;
  pickupWaitCharge: number = 0;
  paymentSuccess: boolean = false;
  switchedToCash: boolean = false;
  switchingToCash: boolean = false;

  isLoadingPaymentContext = true;
  loadError: string | null = null;

  private backButtonSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private platform: Platform,
    private location: Location,
    private paymentService: PaymentService,
    private rideService: RideService,
    private storage: Storage,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private mapLifecycle: GoogleMapLifecycleService
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.mapLifecycle.suspendAll();
    document.documentElement.classList.add('opaque-app-shell');
    this.location.replaceState(this.router.url);
  }

  ionViewWillLeave(): void {
    document.documentElement.classList.remove('opaque-app-shell');
  }

  async ngOnInit() {
    this.location.replaceState(this.router.url);

    this.rideId = this.route.snapshot.paramMap.get('rideId') || '';
    this.userId = await this.storage.get('userId');

    if (!this.rideId) {
      await this.showToast('Ride ID not found', 'danger');
      this.router.navigate(['/tabs/tabs/tab1']);
      return;
    }

    if (!this.userId) {
      await this.showToast('User not authenticated', 'danger');
      this.router.navigate(['/tabs/tabs/tab1']);
      return;
    }

    this.setupBackButtonPrevention();
    this.setupRouterPrevention();

    await this.loadPaymentContext();
  }

  async loadPaymentContext() {
    this.isLoadingPaymentContext = true;
    this.loadError = null;

    try {
      const summary = await this.rideService.fetchRidePaymentSummary(
        this.rideId,
        String(this.userId)
      );

      if (summary) {
        if (summary.paymentStatus === 'completed') {
          this.paymentSuccess = true;
          setTimeout(() => {
            this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
          }, 600);
          return;
        }

        this.fare = summary.amountDue;
        this.pickupAddress = summary.pickupAddress;
        this.dropoffAddress = summary.dropoffAddress;
        this.duration = summary.actualDuration;
        this.pickupWaitCharge = summary.pickupWaitCharge;

        if (!summary.canPayOnline || this.fare <= 0) {
          this.loadError =
            'Unable to load a valid fare for this ride. Please try again or contact support.';
        }
      } else {
        const ride = await this.rideService.fetchRideById(this.rideId);
        if (ride) {
          if (ride.paymentStatus === 'completed') {
            this.paymentSuccess = true;
            setTimeout(() => {
              this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
            }, 600);
            return;
          }
          this.fare = this.rideService.resolvePayableFare(ride);
          this.pickupAddress = ride.pickupAddress || '';
          this.dropoffAddress = ride.dropoffAddress || '';
          this.duration = ride.actualDuration || 0;
          this.pickupWaitCharge =
            ride.fareBreakdown?.pickupWaitCharge ??
            ride.pickupWait?.totalPickupWaitCharge ??
            0;
          if (this.fare <= 0) {
            this.loadError =
              'Unable to load a valid fare for this ride. Please try again or contact support.';
          }
        } else {
          this.loadError = 'Could not load ride details. Check your connection and retry.';
        }
      }
    } catch (error) {
      console.warn('loadPaymentContext failed:', error);
      this.loadError = 'Could not load payment details. Please retry.';
    } finally {
      this.isLoadingPaymentContext = false;
    }
  }

  private setupBackButtonPrevention() {
    if (this.platform.is('android')) {
      this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(9999, () => {
        if (!this.paymentSuccess && !this.switchedToCash) {
          this.showToast('Please complete payment to continue', 'warning');
        } else {
          this.location.back();
        }
      });
    }
  }

  private setupRouterPrevention() {
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationStart))
      .subscribe((event: any) => {
        const currentUrl = this.router.url;
        const targetUrl = event.url;

        if (this.paymentSuccess || this.switchedToCash) {
          return;
        }

        if (targetUrl === currentUrl) {
          return;
        }

        if (currentUrl.includes('/ride-payment') && !targetUrl.includes('/ride-payment')) {
          event.preventDefault();
          this.showToast('Please complete payment to continue', 'warning');
        }
      });
  }

  ngOnDestroy() {
    if (this.backButtonSubscription) {
      this.backButtonSubscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  async payNow() {
    if (this.paymentSuccess || this.loadError) {
      return;
    }

    if (!this.userId || !this.rideId || this.fare <= 0) {
      await this.showToast('Invalid payment details', 'danger');
      return;
    }

    try {
      await this.paymentService.processRidePayment(
        this.rideId,
        this.userId,
        this.fare,
        async (response) => {
          this.paymentSuccess = true;
          await this.showToast('Payment successful!', 'success');

          try {
            const updatedRide = await this.rideService.fetchRideById(this.rideId);
            if (updatedRide) {
              await this.rideService.applyServerRide(updatedRide);
              await this.rideService.clearPaymentNavigationGuard(this.rideId);
            }
          } catch (refreshError) {
            console.warn('Failed to refresh ride state:', refreshError);
          }

          if (this.backButtonSubscription) {
            this.backButtonSubscription.unsubscribe();
          }
          if (this.routerSubscription) {
            this.routerSubscription.unsubscribe();
          }

          setTimeout(() => {
            this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
          }, 600);
        },
        async (error) => {
          console.error('Payment failed:', error);
        }
      );
    } catch (error: any) {
      console.error('Payment error:', error);
      await this.showToast(
        error?.message || error?.error?.description || 'Payment cancelled or failed.',
        'danger'
      );
    }
  }

  async payInCash() {
    if (this.paymentSuccess || this.switchedToCash || !this.rideId || this.loadError) {
      return;
    }
    this.switchingToCash = true;
    const loading = await this.loadingCtrl.create({
      message: 'Switching to cash...',
      spinner: 'crescent'
    });
    await loading.present();
    try {
      const updatedRide = await firstValueFrom(
        this.rideService.switchRideToCash(this.rideId)
      );
      await loading.dismiss();
      this.switchedToCash = true;
      if (updatedRide) {
        await this.rideService.applyServerRide(updatedRide);
      }
      if (this.backButtonSubscription) {
        this.backButtonSubscription.unsubscribe();
      }
      if (this.routerSubscription) {
        this.routerSubscription.unsubscribe();
      }
      await this.showToast('Pay in cash selected. Please pay the driver.', 'success');
      this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
    } catch (error: any) {
      await loading.dismiss();
      this.switchingToCash = false;
      const msg =
        error?.error?.message || error?.message || 'Could not switch to cash. Please try again.';
      await this.showToast(msg, 'danger');
    }
  }

  async showToast(message: string, color: string = 'dark') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }
}
