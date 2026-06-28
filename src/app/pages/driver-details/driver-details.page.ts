import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  AlertController,
  ModalController,
} from '@ionic/angular';
import {
  RideService,
  Ride,
  DriverInfo,
  Location,
} from 'src/app/services/ride.service';
import { Subscription, firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { phoneForDial } from 'src/app/utils/phone-dial';

interface DriverDetailsView {
  name: string;
  photo: string;
  rating: number;
  totalRatings: number;
  totalTrips: number;
  experienceYears: number;
  memberSinceYear: number | null;
  carType: string;
  carNumber: string;
}

type DriverApiRecord = DriverInfo & {
  completedRidesCount?: number;
  createdAt?: string | Date;
  totalRatings?: number;
  vehicleInfo?: DriverInfo['vehicleInfo'];
  vehicles?: Array<{
    make?: string;
    model?: string;
    color?: string;
    licensePlate?: string;
    vehicleType?: string;
    isActive?: boolean;
  }>;
};

@Component({
  selector: 'app-driver-details',
  templateUrl: './driver-details.page.html',
  styleUrls: ['./driver-details.page.scss'],
  standalone: false,
})
export class DriverDetailsPage implements OnInit, OnDestroy {
  driverDetails: DriverDetailsView = {
    name: 'Loading...',
    photo: 'assets/user.png',
    rating: 0,
    totalRatings: 0,
    totalTrips: 0,
    experienceYears: 0,
    memberSinceYear: null,
    carType: '—',
    carNumber: '—',
  };

  currentRide: Ride | null = null;
  driver: DriverInfo | null = null;
  driverLocation: Location | null = null;
  driverETA = 0;
  isDriverArrived = false;
  isLoading = true;
  loadError: string | null = null;
  returnTo: string | null = null;

  private rideSubscription?: Subscription;
  private rideStatusSubscription?: Subscription;
  private driverLocationSubscription?: Subscription;
  private driverETASubscription?: Subscription;
  private isProfileDrillDown = false;
  private routeDriverId: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private rideService: RideService,
    private http: HttpClient,
    private modalController: ModalController,
    private alertController: AlertController
  ) {
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state as {
      driver?: DriverInfo;
      ride?: Ride;
      returnTo?: string;
    } | undefined;

    if (state?.returnTo) {
      this.returnTo = state.returnTo;
      this.isProfileDrillDown = true;
    }
    if (state?.ride) {
      this.currentRide = state.ride;
    }
    if (state?.driver) {
      this.driver = state.driver;
      this.loadDriverDetails(state.driver);
    }
  }

  async ngOnInit() {
    this.routeDriverId =
      this.route.snapshot.paramMap.get('driverId') ||
      this.driver?._id ||
      this.currentRide?.driver?._id ||
      null;

    if (!this.currentRide) {
      const ride = this.rideService.getCurrentRideValue();
      if (ride) {
        this.currentRide = ride;
        if (!this.driver && ride.driver) {
          this.driver = ride.driver;
          this.loadDriverDetails(ride.driver);
        }
      }
    }

    if (this.routeDriverId) {
      await this.fetchDriverDetailsFromAPI(this.routeDriverId);
    } else {
      this.isLoading = false;
    }

    this.rideSubscription = this.rideService.getCurrentRide().subscribe((ride) => {
      if (!ride?.driver) {
        return;
      }
      this.currentRide = ride;
      this.driver = ride.driver;
      if (!this.routeDriverId) {
        this.loadDriverDetails(ride.driver);
        this.fetchDriverDetailsFromAPI(ride.driver._id);
      }
    });

    this.rideStatusSubscription = this.rideService.getRideStatus().subscribe((status) => {
      if (status === 'arrived') {
        this.isDriverArrived = true;
        return;
      }

      if (this.isProfileDrillDown) {
        return;
      }

      if (status === 'in_progress') {
        this.router.navigate(['/active-ordere'], { replaceUrl: true });
      } else if (status === 'cancelled') {
        this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
      }
    });

    this.driverLocationSubscription = this.rideService
      .getDriverLocation()
      .subscribe((location) => {
        if (location) {
          this.driverLocation = location;
        }
      });

    this.driverETASubscription = this.rideService.getDriverETA().subscribe((eta) => {
      if (eta) {
        this.driverETA = Math.ceil(eta);
      }
    });
  }

  ngOnDestroy() {
    this.rideSubscription?.unsubscribe();
    this.rideStatusSubscription?.unsubscribe();
    this.driverLocationSubscription?.unsubscribe();
    this.driverETASubscription?.unsubscribe();
  }

  get backHref(): string {
    return this.returnTo || '/tabs/tabs/tab1';
  }

  get showContactActions(): boolean {
    if (!this.currentRide) {
      return !!this.driver;
    }
    const status = this.currentRide.status;
    if (status === 'completed' || status === 'cancelled') {
      return false;
    }
    if (this.currentRide.rideFor === 'OTHER') {
      return false;
    }
    return true;
  }

  private async fetchDriverDetailsFromAPI(driverId: string) {
    this.isLoading = true;
    this.loadError = null;
    try {
      const response = await firstValueFrom(
        this.http.get<DriverApiRecord>(`${environment.apiUrl}/drivers/${driverId}`)
      );
      if (response) {
        this.driver = response;
        this.loadDriverDetails(response);
      }
    } catch (error) {
      console.error('Error fetching driver details:', error);
      this.loadError = 'Could not load full driver profile.';
      if (this.driver) {
        this.loadDriverDetails(this.driver);
      }
    } finally {
      this.isLoading = false;
    }
  }

  private resolveDriverPhotoUrl(profilePic?: string | null): string {
    if (!profilePic) {
      return 'assets/user.png';
    }
    const u = String(profilePic).trim();
    if (!u) {
      return 'assets/user.png';
    }
    if (/^https?:\/\//i.test(u)) {
      return u;
    }
    const base = environment.apiUrl.replace(/\/$/, '');
    return base + (u.startsWith('/') ? u : '/' + u);
  }

  private yearsSince(dateInput?: string | Date | null): number {
    if (!dateInput) {
      return 0;
    }
    const created = new Date(dateInput);
    if (Number.isNaN(created.getTime())) {
      return 0;
    }
    const now = new Date();
    let years = now.getFullYear() - created.getFullYear();
    const monthDiff = now.getMonth() - created.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < created.getDate())) {
      years -= 1;
    }
    return Math.max(0, years);
  }

  private resolveVehicleInfo(driver: DriverApiRecord): DriverInfo['vehicleInfo'] | null {
    if (driver.vehicleInfo?.licensePlate || driver.vehicleInfo?.make) {
      return driver.vehicleInfo;
    }
    const vehicles = driver.vehicles;
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return null;
    }
    const active = vehicles.find((v) => v.isActive) || vehicles[0];
    return active
      ? {
          make: active.make,
          model: active.model,
          color: active.color,
          licensePlate: active.licensePlate,
          vehicleType: active.vehicleType,
        }
      : null;
  }

  private loadDriverDetails(driver: DriverApiRecord) {
    const v = this.resolveVehicleInfo(driver);
    const carType = v
      ? v.color && v.make && v.model
        ? `${v.color} ${v.make} ${v.model}`
        : v.vehicleType || 'Vehicle'
      : '—';
    const carNumber = v?.licensePlate || '—';
    const createdAt = driver.createdAt;
    const memberSinceYear = createdAt
      ? new Date(createdAt).getFullYear()
      : null;

    this.driverDetails = {
      name: driver.name || 'Driver',
      photo: this.resolveDriverPhotoUrl(driver.profilePic),
      rating: driver.rating ?? 0,
      totalRatings: driver.totalRatings ?? 0,
      totalTrips: driver.completedRidesCount ?? driver.totalTrips ?? 0,
      experienceYears: this.yearsSince(createdAt),
      memberSinceYear,
      carType,
      carNumber,
    };
  }

  formatRating(value: number): string {
    return (value ?? 0).toFixed(1);
  }

  formatTrips(value: number): string {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return String(value ?? 0);
  }

  async callDriver() {
    const phoneNumber = phoneForDial(this.driver);
    if (phoneNumber) {
      window.location.href = `tel:${phoneNumber}`;
      return;
    }

    const alert = await this.alertController.create({
      header: 'Phone Number Not Available',
      message: 'Driver phone number is not available.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async chatWithDriver() {
    if (!this.currentRide) {
      return;
    }
    if (this.currentRide.rideFor === 'OTHER') {
      return;
    }

    await this.rideService.markMessagesAsRead(this.currentRide._id);

    const { DriverChatPage } = await import('../driver-chat/driver-chat.page');
    const modal = await this.modalController.create({
      component: DriverChatPage,
      componentProps: {
        ride: this.currentRide,
      },
      cssClass: 'chat-modal',
      showBackdrop: true,
      backdropDismiss: true,
    });

    await modal.present();
  }

  async cancelRide() {
    try {
      await this.rideService.cancelRide('Cancelled from driver details');
      this.router.navigate(['/cancel-order']);
    } catch (error) {
      console.error('Error cancelling ride:', error);
    }
  }

  goBack() {
    if (this.returnTo) {
      this.router.navigateByUrl(this.returnTo);
      return;
    }
    if (this.currentRide?._id) {
      this.router.navigate(['/active-ordere', this.currentRide._id]);
      return;
    }
    this.router.navigate(['/tabs/tabs/tab1'], { replaceUrl: true });
  }
}
