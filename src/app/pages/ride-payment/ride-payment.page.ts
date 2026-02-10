import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, NavigationStart, NavigationEnd } from '@angular/router';
import { Platform, LoadingController, ToastController } from '@ionic/angular';
import { PaymentService } from '../../services/payment.service';
import { RideService, Ride } from '../../services/ride.service';
import { Storage } from '@ionic/storage-angular';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-ride-payment',
  templateUrl: './ride-payment.page.html',
  styleUrls: ['./ride-payment.page.scss'],
  standalone: false,
})
export class RidePaymentPage implements OnInit, OnDestroy {
  rideId: string = '';
  userId: string | null = null;
  fare: number = 0;
  pickupAddress: string = '';
  dropoffAddress: string = '';
  duration: number = 0;
  isProcessing: boolean = false;
  paymentSuccess: boolean = false;

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
    private http: HttpClient
  ) {}

  async ngOnInit() {
    // Replace history state to prevent browser back navigation
    this.location.replaceState(this.router.url);

    // Get rideId from route params
    this.rideId = this.route.snapshot.paramMap.get('rideId') || '';
    
    // Get userId from storage
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

    // Check if payment is already completed
    try {
      const ride = await this.http.get<Ride>(
        `${environment.apiUrl}/api/rides/${this.rideId}`
      ).toPromise();
      
      if (ride && ride.paymentStatus === 'completed') {
        // Payment already completed, redirect to active order page
        this.paymentSuccess = true;
        setTimeout(() => {
          this.router.navigate(['/active-ordere'], {
            queryParams: { showRating: 'true' },
            replaceUrl: true
          });
        }, 1000);
        return;
      }
    } catch (error) {
      console.warn('Failed to check ride payment status:', error);
    }

    // Get ride details from route state or query params
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as any || {};
    
    this.fare = state['fare'] || parseFloat(this.route.snapshot.queryParamMap.get('fare') || '0');
    this.pickupAddress = state['pickupAddress'] || this.route.snapshot.queryParamMap.get('pickup') || '';
    this.dropoffAddress = state['dropoffAddress'] || this.route.snapshot.queryParamMap.get('dropoff') || '';
    this.duration = state['duration'] || parseInt(this.route.snapshot.queryParamMap.get('duration') || '0', 10);

    // If no fare, try to get from current ride in service
    if (!this.fare) {
      this.rideService.getCurrentRide().subscribe((ride) => {
        if (ride && ride._id === this.rideId) {
          this.fare = ride.fare || 0;
          this.pickupAddress = ride.pickupAddress || '';
          this.dropoffAddress = ride.dropoffAddress || '';
          this.duration = ride.actualDuration || 0;
        }
      });
    }

    // Setup back button prevention
    this.setupBackButtonPrevention();

    // Setup router navigation prevention
    this.setupRouterPrevention();
  }

  ionViewWillEnter() {
    // Replace history state again when view enters
    this.location.replaceState(this.router.url);
  }

  /**
   * Setup hardware back button prevention
   */
  private setupBackButtonPrevention() {
    if (this.platform.is('android')) {
      // Use highest priority to override all other handlers
      this.backButtonSubscription = this.platform.backButton.subscribeWithPriority(9999, () => {
        if (!this.paymentSuccess) {
          // Prevent back navigation - show message
          this.showToast('Please complete payment to continue', 'warning');
        } else {
          // Allow navigation after payment success
          this.location.back();
        }
      });
    }
  }

  /**
   * Setup router navigation prevention
   */
  private setupRouterPrevention() {
    // Prevent navigation away from payment page until payment is completed
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationStart))
      .subscribe((event: any) => {
        const currentUrl = this.router.url;
        const targetUrl = event.url;
        
        // Allow navigation if payment is successful
        if (this.paymentSuccess) {
          return;
        }

        // Allow navigation if it's the same route (refresh)
        if (targetUrl === currentUrl) {
          return;
        }

        // Prevent navigation away from payment page
        if (currentUrl.includes('/ride-payment') && !targetUrl.includes('/ride-payment')) {
          event.preventDefault();
          this.showToast('Please complete payment to continue', 'warning');
        }
      });
  }

  ngOnDestroy() {
    // Clean up subscriptions
    if (this.backButtonSubscription) {
      this.backButtonSubscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  async payNow() {
    if (this.isProcessing || this.paymentSuccess) {
      return;
    }

    if (!this.userId || !this.rideId || this.fare <= 0) {
      await this.showToast('Invalid payment details', 'danger');
      return;
    }

    this.isProcessing = true;

    const loading = await this.loadingCtrl.create({
      message: 'Processing payment...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      await this.paymentService.processRidePayment(
        this.rideId,
        this.userId,
        this.fare,
        async (response) => {
          await loading.dismiss();
          this.isProcessing = false;
          this.paymentSuccess = true;
          
          // Show success animation
          await this.showToast('Payment successful!', 'success');
          
          // Refresh ride state from backend to get updated paymentStatus
          try {
            const updatedRide = await this.http.get<Ride>(
              `${environment.apiUrl}/api/rides/${this.rideId}`
            ).toPromise();
            
            if (updatedRide) {
              // Update ride service with latest state
              this.rideService['currentRide$'].next(updatedRide);
              console.log('✅ Ride state refreshed after payment - paymentStatus:', updatedRide.paymentStatus);
            }
          } catch (refreshError) {
            console.warn('⚠️ Failed to refresh ride state:', refreshError);
            // Continue anyway - webhook will update it
          }
          
          // Unsubscribe from back button handler to allow navigation
          if (this.backButtonSubscription) {
            this.backButtonSubscription.unsubscribe();
          }
          if (this.routerSubscription) {
            this.routerSubscription.unsubscribe();
          }

          // Navigate back to active-order page to show rating modal
          setTimeout(() => {
            this.router.navigate(['/active-ordere'], {
              queryParams: { showRating: 'true' },
              replaceUrl: true
            });
          }, 2000);
        },
        async (error) => {
          await loading.dismiss();
          this.isProcessing = false;
          console.error('Payment failed:', error);
          // Error toast is shown by payment service
        }
      );
    } catch (error: any) {
      console.error('Payment error:', error);
      await this.showToast(error?.message || error?.error?.description || 'Payment cancelled or failed.', 'danger');
    } finally {
      // Always close loading when payment flow ends (success, cancel, or error)
      // Handles Razorpay modal cancel/close where onFailure or catch may not run in some environments
      try {
        await loading.dismiss();
      } catch (_) {
        // Ignore if already dismissed
      }
      this.isProcessing = false;
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
