import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { PaymentService } from '../../services/payment.service';
import { RideService, Ride } from '../../services/ride.service';
import { Storage } from '@ionic/storage-angular';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-ride-payment',
  templateUrl: './ride-payment.page.html',
  styleUrls: ['./ride-payment.page.scss'],
  standalone: false,
})
export class RidePaymentPage implements OnInit {
  rideId: string = '';
  userId: string | null = null;
  fare: number = 0;
  pickupAddress: string = '';
  dropoffAddress: string = '';
  duration: number = 0;
  isProcessing: boolean = false;
  paymentSuccess: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private paymentService: PaymentService,
    private rideService: RideService,
    private storage: Storage,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private http: HttpClient
  ) {}

  async ngOnInit() {
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
          
          // Navigate back to active-order page to show rating modal
          setTimeout(() => {
            this.router.navigate(['/active-ordere'], {
              queryParams: { showRating: 'true' },
              replaceUrl: false
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
      await loading.dismiss();
      this.isProcessing = false;
      console.error('Payment error:', error);
      await this.showToast(error.message || 'Payment failed. Please try again.', 'danger');
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
