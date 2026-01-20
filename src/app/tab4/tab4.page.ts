import { Component, OnInit } from '@angular/core';
import { AnimationController, Platform, LoadingController, ToastController, ModalController } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { RideService } from '../services/ride.service';
import { GeocodingService } from '../services/geocoding.service';
import { UserService } from '../services/user.service';
import { environment } from '../../environments/environment';

interface Service {
  id: number;
  name: string;
  description: string;
  price: number;
  duration: string;
  icon: string;
}

interface LocationData {
  address: string;
  latitude: number;
  longitude: number;
}

@Component({
  selector: 'app-tab4',
  templateUrl: './tab4.page.html',
  styleUrls: ['./tab4.page.scss'],
  standalone: false,
})
export class Tab4Page implements OnInit {
  services: Service[] = [
    {
      id: 1,
      name: 'Full Day Cab',
      description: 'Book a cab for the entire day',
      price: 1500,
      duration: '24 hours',
      icon: 'car-outline'
    },
    {
      id: 2,
      name: 'Rental Service',
      description: 'Long-term cab rental service',
      price: 5000,
      duration: '7 days',
      icon: 'time-outline'
    },
    {
      id: 3,
      name: 'Date-wise Booking',
      description: 'Book for specific dates',
      price: 2000,
      duration: 'Custom',
      icon: 'calendar-outline'
    }
  ];

  selectedService: Service | null = null;
  selectedBookingType: 'fullDay' | 'rental' | 'dateWise' = 'fullDay';
  
  // Full Day fields
  fullDayStartDate: string = '';
  fullDayStartTime: string = '';
  fullDayEndDate: string = '';
  fullDayEndTime: string = '';
  
  // Rental fields
  rentalStartDate: string = '';
  rentalDays: number = 7;
  rentalDayOptions: number[] = [7, 15, 30];
  
  // Location fields
  pickupLocation: LocationData | null = null;
  dropoffLocation: LocationData | null = null;
  pickupAddress: string = '';
  dropoffAddress: string = '';
  
  // Common fields
  minDate: string = new Date().toISOString();
  maxDate: string = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString();
  isLoading: boolean = false;
  
  // Modal state
  showDateModal: boolean = false;
  showTimeModal: boolean = false;
  currentDateField: 'fullDayStartDate' | 'fullDayEndDate' | 'rentalStartDate' | null = null;
  currentTimeField: 'fullDayStartTime' | 'fullDayEndTime' | null = null;
  
  // Available services from backend
  availableServices: Array<{ name: string; price: number }> = [];
  selectedServiceName: string = 'sedan'; // Default fallback

  constructor(
    private animationCtrl: AnimationController,
    private platform: Platform,
    private router: Router,
    private route: ActivatedRoute,
    private rideService: RideService,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
    private http: HttpClient
  ) {}

  async ngOnInit() {
    this.animateServices();
    await this.loadAvailableServices();
    
    // Check if returning from location selection
    this.route.queryParams.subscribe(params => {
      if (params['returnTo'] === 'tab4' && params['address']) {
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

  async loadAvailableServices() {
    try {
      const settings = await this.http.get<any>(`${environment.apiUrl}/settings/settings`).toPromise();
      if (settings && settings.services && settings.services.length > 0) {
        this.availableServices = settings.services;
        // Use first available service as default
        this.selectedServiceName = settings.services[0].name;
        console.log('Available services loaded:', this.availableServices);
      } else {
        console.warn('No services found in settings, using default');
        // Fallback to default services
        this.availableServices = [{ name: 'sedan', price: 0 }];
      }
    } catch (error) {
      console.error('Error loading services:', error);
      // Fallback to default service
      this.availableServices = [{ name: 'sedan', price: 0 }];
      this.selectedServiceName = 'sedan';
    }
  }

  private animateServices() {
    const elements = document.querySelectorAll('.service-card');
    elements.forEach((element, index) => {
      const animation = this.animationCtrl.create()
        .addElement(element)
        .duration(300)
        .easing('ease-out')
        .fromTo('transform', 'translateY(20px)', 'translateY(0)')
        .fromTo('opacity', '0', '1')
        .delay(index * 100);

      animation.play();
    });
  }

  selectService(service: Service) {
    this.selectedService = service;
    this.animateSelection(service.id);
    if (service.id === 3) {
      this.router.navigate(['/tabs/tabs/tab4/date-wise']);
    } else if (service.id === 1) {
      this.selectedBookingType = 'fullDay';
    } else if (service.id === 2) {
      this.selectedBookingType = 'rental';
    }
  }

  private animateSelection(serviceId: number) {
    const element = document.querySelector(`#service-${serviceId}`);
    if (element) {
      const animation = this.animationCtrl.create()
        .addElement(element)
        .duration(200)
        .easing('ease-out')
        .keyframes([
          { offset: 0, transform: 'scale(1)' },
          { offset: 0.5, transform: 'scale(1.05)' },
          { offset: 1, transform: 'scale(1)' }
        ]);

      animation.play();
    }
  }

  openLocationPicker(isPickup: boolean) {
    this.router.navigate(['/search'], {
      queryParams: {
        isPickup: isPickup ? 'true' : 'false',
        returnTo: 'tab4',
        [isPickup ? 'pickup' : 'destination']: isPickup ? this.pickupAddress : this.dropoffAddress
      }
    });
  }

  calculateTotal(): number {
    if (!this.selectedService) return 0;

    if (this.selectedBookingType === 'fullDay') {
      return 1500; // Fixed price for full day
    } else if (this.selectedBookingType === 'rental') {
      return this.rentalDays * 700; // ₹700 per day
    }

    return 0;
  }

  validateForm(): boolean {
    if (!this.selectedService) return false;
    if (!this.pickupLocation || !this.dropoffLocation) return false;

    // Validate location coordinates
    if (isNaN(this.pickupLocation.latitude) || isNaN(this.pickupLocation.longitude) ||
        isNaN(this.dropoffLocation.latitude) || isNaN(this.dropoffLocation.longitude)) {
      return false;
    }

    if (this.selectedBookingType === 'fullDay') {
      if (!this.fullDayStartDate || !this.fullDayStartTime || !this.fullDayEndDate || !this.fullDayEndTime) {
        return false;
      }
      
      // Validate dates are valid
      const validation = this.validateBookingData();
      if (!validation.valid) {
        return false;
      }
    } else if (this.selectedBookingType === 'rental') {
      if (!this.rentalStartDate || !this.rentalDays) {
        return false;
      }
      
      // Validate rental date
      const validation = this.validateRentalData();
      if (!validation.valid) {
        return false;
      }
    }

    return true;
  }

  validateBookingData(): { valid: boolean; error?: string } {
    // Validate Full Day booking data
    if (this.selectedBookingType === 'fullDay') {
      if (!this.fullDayStartDate || !this.fullDayStartTime) {
        return { valid: false, error: 'Start date and time are required' };
      }
      if (!this.fullDayEndDate || !this.fullDayEndTime) {
        return { valid: false, error: 'End date and time are required' };
      }

      // Parse and validate dates
      let startDateStr = this.fullDayStartDate;
      let startTimeStr = this.fullDayStartTime;
      let endDateStr = this.fullDayEndDate;
      let endTimeStr = this.fullDayEndTime;

      // Ensure date is in YYYY-MM-DD format
      if (startDateStr && !startDateStr.includes('T')) {
        startDateStr = startDateStr.split('T')[0];
      }
      if (endDateStr && !endDateStr.includes('T')) {
        endDateStr = endDateStr.split('T')[0];
      }

      // Ensure time is in HH:MM format
      if (startTimeStr) {
        startTimeStr = startTimeStr.split(':').slice(0, 2).join(':');
      }
      if (endTimeStr) {
        endTimeStr = endTimeStr.split(':').slice(0, 2).join(':');
      }

      // Create Date objects and validate
      const startDateTime = new Date(`${startDateStr}T${startTimeStr}`);
      const endDateTime = new Date(`${endDateStr}T${endTimeStr}`);

      if (isNaN(startDateTime.getTime())) {
        return { valid: false, error: 'Invalid start date/time' };
      }
      if (isNaN(endDateTime.getTime())) {
        return { valid: false, error: 'Invalid end date/time' };
      }
      if (endDateTime <= startDateTime) {
        return { valid: false, error: 'End date/time must be after start date/time' };
      }
    }

    return { valid: true };
  }

  validateRentalData(): { valid: boolean; error?: string } {
    if (!this.rentalStartDate) {
      return { valid: false, error: 'Rental start date is required' };
    }
    if (!this.rentalDays || this.rentalDays <= 0) {
      return { valid: false, error: 'Rental duration must be at least 1 day' };
    }

    // Validate date
    let startDateStr = this.rentalStartDate;
    if (startDateStr && !startDateStr.includes('T')) {
      startDateStr = startDateStr.split('T')[0];
    }

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      return { valid: false, error: 'Invalid rental start date' };
    }

    return { valid: true };
  }

  async bookService() {
    // Validate form first
    if (!this.validateForm()) {
      const validation = this.selectedBookingType === 'fullDay' 
        ? this.validateBookingData() 
        : this.validateRentalData();
      
      const toast = await this.toastCtrl.create({
        message: validation.error || 'Please fill all required fields',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    if (!this.selectedService || !this.pickupLocation || !this.dropoffLocation) {
      return;
    }

    // Validate locations
    if (isNaN(this.pickupLocation.latitude) || isNaN(this.pickupLocation.longitude) ||
        isNaN(this.dropoffLocation.latitude) || isNaN(this.dropoffLocation.longitude)) {
      const toast = await this.toastCtrl.create({
        message: 'Invalid location coordinates. Please select locations again.',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Processing your booking...',
      spinner: 'crescent'
    });
    await loading.present();
    this.isLoading = true;

    try {
      // Calculate distance (simplified - backend will recalculate)
      const distanceInKm = this.calculateDistance(
        this.pickupLocation.latitude,
        this.pickupLocation.longitude,
        this.dropoffLocation.latitude,
        this.dropoffLocation.longitude
      );

      const fare = this.calculateTotal();

      let bookingType: 'FULL_DAY' | 'RENTAL' | 'DATE_WISE' | 'INSTANT' = 'INSTANT';
      let bookingMeta: any = {};

      if (this.selectedBookingType === 'fullDay') {
        bookingType = 'FULL_DAY';
        // Combine date and time strings properly
        let startDateStr = this.fullDayStartDate;
        let startTimeStr = this.fullDayStartTime;
        let endDateStr = this.fullDayEndDate;
        let endTimeStr = this.fullDayEndTime;
        
        // Ensure date is in YYYY-MM-DD format
        if (startDateStr && !startDateStr.includes('T')) {
          startDateStr = startDateStr.split('T')[0];
        }
        if (endDateStr && !endDateStr.includes('T')) {
          endDateStr = endDateStr.split('T')[0];
        }
        
        // Ensure time is in HH:MM format (remove seconds/milliseconds if present)
        if (startTimeStr) {
          startTimeStr = startTimeStr.split(':').slice(0, 2).join(':');
        }
        if (endTimeStr) {
          endTimeStr = endTimeStr.split(':').slice(0, 2).join(':');
        }
        
        // Validate dates before creating Date objects
        if (!startDateStr || !startTimeStr || !endDateStr || !endTimeStr) {
          throw new Error('All date and time fields are required');
        }

        const startDateTime = new Date(`${startDateStr}T${startTimeStr}`);
        const endDateTime = new Date(`${endDateStr}T${endTimeStr}`);
        
        if (isNaN(startDateTime.getTime())) {
          throw new Error('Invalid start date/time');
        }
        if (isNaN(endDateTime.getTime())) {
          throw new Error('Invalid end date/time');
        }
        if (endDateTime <= startDateTime) {
          throw new Error('End date/time must be after start date/time');
        }
        
        bookingMeta = {
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString()
        };
      } else if (this.selectedBookingType === 'rental') {
        bookingType = 'RENTAL';
        // Ensure date is in proper format
        let startDateStr = this.rentalStartDate;
        if (startDateStr && !startDateStr.includes('T')) {
          startDateStr = startDateStr.split('T')[0];
        }
        
        if (!startDateStr) {
          throw new Error('Rental start date is required');
        }
        
        const startDate = new Date(startDateStr);
        if (isNaN(startDate.getTime())) {
          throw new Error('Invalid rental start date');
        }
        
        if (!this.rentalDays || this.rentalDays <= 0) {
          throw new Error('Rental duration must be at least 1 day');
        }
        
        bookingMeta = {
          days: this.rentalDays,
          startTime: startDate.toISOString()
        };
      }

      // Use fetched service name or fallback
      const serviceName = this.selectedServiceName || 'sedan';

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
        service: serviceName,
        rideType: this.selectedBookingType === 'fullDay' ? 'whole_day' : 'custom',
        paymentMethod: 'CASH',
        bookingType: bookingType,
        bookingMeta: bookingMeta
      });

      await loading.dismiss();
      this.isLoading = false;
    } catch (error: any) {
      await loading.dismiss();
      this.isLoading = false;
      console.error('Booking error:', error);
      const errorMessage = error.message || 'Failed to book service. Please try again.';
      const toast = await this.toastCtrl.create({
        message: errorMessage,
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

  openDatePicker(field: 'fullDayStartDate' | 'fullDayEndDate' | 'rentalStartDate') {
    this.currentDateField = field;
    this.showDateModal = true;
  }

  openTimePicker(field: 'fullDayStartTime' | 'fullDayEndTime') {
    this.currentTimeField = field;
    this.showTimeModal = true;
  }

  onDateChange(event: any) {
    if (this.currentDateField && event.detail.value) {
      this[this.currentDateField] = event.detail.value;
    }
  }

  onTimeChange(event: any) {
    if (this.currentTimeField && event.detail.value) {
      this[this.currentTimeField] = event.detail.value;
    }
  }

  confirmDateSelection() {
    this.showDateModal = false;
    this.currentDateField = null;
  }

  confirmTimeSelection() {
    this.showTimeModal = false;
    this.currentTimeField = null;
  }

  closeDateModal() {
    this.showDateModal = false;
    this.currentDateField = null;
  }

  closeTimeModal() {
    this.showTimeModal = false;
    this.currentTimeField = null;
  }

  getDatePickerMin(): string {
    if (this.currentDateField === 'fullDayEndDate' && this.fullDayStartDate) {
      return this.fullDayStartDate;
    }
    return this.minDate;
  }

  getDatePickerValue(): string {
    if (this.currentDateField) {
      return this[this.currentDateField] || '';
    }
    return '';
  }

  getTimePickerValue(): string {
    if (this.currentTimeField) {
      return this[this.currentTimeField] || '';
    }
    return '';
  }

  formatDateDisplay(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  formatTimeDisplay(timeString: string): string {
    if (!timeString) return '';
    // Handle ISO time string or HH:MM format
    let time = timeString;
    if (time.includes('T')) {
      time = time.split('T')[1].split('.')[0];
    }
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  resetForm() {
    this.selectedService = null;
    this.pickupLocation = null;
    this.dropoffLocation = null;
    this.pickupAddress = '';
    this.dropoffAddress = '';
    this.fullDayStartDate = '';
    this.fullDayStartTime = '';
    this.fullDayEndDate = '';
    this.fullDayEndTime = '';
    this.rentalStartDate = '';
    this.rentalDays = 7;
  }
}
