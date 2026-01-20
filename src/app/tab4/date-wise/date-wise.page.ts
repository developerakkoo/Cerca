import { Component, OnInit } from '@angular/core';
import { NavController, LoadingController, ToastController } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { RideService } from '../../services/ride.service';
import { GeocodingService } from '../../services/geocoding.service';

interface LocationData {
  address: string;
  latitude: number;
  longitude: number;
}

@Component({
  selector: 'app-date-wise',
  templateUrl: './date-wise.page.html',
  styleUrls: ['./date-wise.page.scss'],
  standalone: false,
})
export class DateWisePage implements OnInit {
  bookingType: 'single' | 'multiple' = 'single';
  selectedDates: string[] = [];
  selectedTime: string | null = null;
  pickupLocation: LocationData | null = null;
  dropoffLocation: LocationData | null = null;
  pickupAddress: string = '';
  dropoffAddress: string = '';
  minDate = new Date().toISOString();
  isLoading: boolean = false;

  timeSlots: string[] = [
    '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM',
    '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
    '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'
  ];

  constructor(
    private navCtrl: NavController,
    private router: Router,
    private route: ActivatedRoute,
    private rideService: RideService,
    private geocodingService: GeocodingService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    // Check if returning from location selection
    this.route.queryParams.subscribe(params => {
      if (params['returnTo'] === 'date-wise' && params['address']) {
        const isPickup = params['isPickup'] === 'true';
        const address = params['address'];
        const lat = parseFloat(params['lat']);
        const lng = parseFloat(params['lng']);
        
        if (isPickup) {
          this.pickupAddress = address;
          this.pickupLocation = { address, latitude: lat, longitude: lng };
        } else {
          this.dropoffAddress = address;
          this.dropoffLocation = { address, latitude: lat, longitude: lng };
        }
      }
    });
  }

  setBookingType(type: 'single' | 'multiple') {
    this.bookingType = type;
    this.selectedDates = [];
  }

  onDateSelect(event: any) {
    const value = event.detail.value;
    if (this.bookingType === 'single') {
      this.selectedDates = Array.isArray(value) ? [value[0]] : [value];
    } else {
      this.selectedDates = Array.isArray(value) ? value : [value];
    }
  }

  selectTime(time: string) {
    this.selectedTime = time;
  }

  removeDate(date: string) {
    this.selectedDates = this.selectedDates.filter(d => d !== date);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }

  openLocationPicker(isPickup: boolean) {
    this.router.navigate(['/search'], {
      queryParams: {
        isPickup: isPickup ? 'true' : 'false',
        returnTo: 'date-wise',
        [isPickup ? 'pickup' : 'destination']: isPickup ? this.pickupAddress : this.dropoffAddress
      }
    });
  }

  isFormValid(): boolean {
    return (
      this.selectedDates.length > 0 &&
      this.selectedTime !== null &&
      this.pickupLocation !== null &&
      this.dropoffLocation !== null
    );
  }

  goBack() {
    this.navCtrl.back();
  }

  async bookRide() {
    if (!this.isFormValid()) {
      const toast = await this.toastCtrl.create({
        message: 'Please fill all required fields',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    if (!this.pickupLocation || !this.dropoffLocation) {
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Processing your booking...',
      spinner: 'crescent'
    });
    await loading.present();
    this.isLoading = true;

    try {
      // Convert time string to Date objects for each selected date
      const datesWithTime = this.selectedDates.map(dateStr => {
        const [time, period] = this.selectedTime!.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }
        
        const date = new Date(dateStr);
        date.setHours(hours, minutes, 0, 0);
        return date.toISOString();
      });

      // Calculate distance (simplified - backend will recalculate)
      const distanceInKm = this.calculateDistance(
        this.pickupLocation.latitude,
        this.pickupLocation.longitude,
        this.dropoffLocation.latitude,
        this.dropoffLocation.longitude
      );

      // Calculate fare: ₹500 per date
      const fare = this.selectedDates.length * 500;

      await this.rideService.requestRide({
        pickupLocation: {
          latitude: this.pickupLocation.latitude,
          longitude: this.pickupLocation.longitude
        },
        dropoffLocation: {
          latitude: this.dropoffLocation.latitude,
          longitude: this.dropoffLocation.longitude
        },
        pickupAddress: this.pickupAddress,
        dropoffAddress: this.dropoffAddress,
        fare: fare,
        distanceInKm: distanceInKm,
        service: 'sedan', // Default service
        rideType: 'custom',
        paymentMethod: 'CASH',
        bookingType: 'DATE_WISE',
        bookingMeta: {
          dates: datesWithTime
        }
      });

      await loading.dismiss();
      this.isLoading = false;
    } catch (error: any) {
      await loading.dismiss();
      this.isLoading = false;
      console.error('Booking error:', error);
      const toast = await this.toastCtrl.create({
        message: error.message || 'Failed to book ride. Please try again.',
        duration: 3000,
        color: 'danger'
      });
      await toast.present();
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
