import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  RideService,
  Ride,
  DriverInfo,
  Location,
} from 'src/app/services/ride.service';
import { Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

interface DriverDetails {
  name: string;
  photo: string;
  rating: number;
  totalTrips: number;
  experience: number;
  membershipDuration: string;
  carType: string;
  carNumber: string;
}

@Component({
  selector: 'app-driver-details',
  templateUrl: './driver-details.page.html',
  styleUrls: ['./driver-details.page.scss'],
  standalone: false,
})
export class DriverDetailsPage implements OnInit, OnDestroy {
  driverDetails: DriverDetails = {
    name: 'Loading...',
    photo: 'assets/user.png',
    rating: 0,
    totalTrips: 0,
    experience: 0,
    membershipDuration: 'N/A',
    carType: 'Loading...',
    carNumber: 'Loading...',
  };

  // Real-time data
  currentRide: Ride | null = null;
  driver: DriverInfo | null = null;
  driverLocation: Location | null = null;
  driverETA: number = 0;
  isDriverArrived: boolean = false;

  private rideSubscription?: Subscription;
  private rideStatusSubscription?: Subscription;
  private driverLocationSubscription?: Subscription;
  private driverETASubscription?: Subscription;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private rideService: RideService,
    private http: HttpClient
  ) {}

  async ngOnInit() {
    // Get driver ID from route params or current ride
    const driverId = this.route.snapshot.paramMap.get('driverId');
    
    if (driverId) {
      // Fetch driver details via API
      await this.fetchDriverDetailsFromAPI(driverId);
    }

    // Subscribe to ride updates
    this.rideSubscription = this.rideService
      .getCurrentRide()
      .subscribe((ride) => {
        if (ride && ride.driver) {
          console.log('📦 Driver details ride update:', ride);
          this.currentRide = ride;
          this.driver = ride.driver;
          this.loadDriverDetails(ride.driver);
          
          // If we don't have API details, fetch them
          if (!driverId) {
            this.fetchDriverDetailsFromAPI(ride.driver._id);
          }
        }
      });

    // Subscribe to ride status
    this.rideStatusSubscription = this.rideService
      .getRideStatus()
      .subscribe((status) => {
        console.log('🔄 Ride status:', status);
        if (status === 'arrived') {
          this.isDriverArrived = true;
        } else if (status === 'in_progress') {
          // Navigate to active order page
          this.router.navigate(['/active-ordere'], {
            replaceUrl: true,
          });
        } else if (status === 'cancelled') {
          // Navigate back to home
          this.router.navigate(['/tabs/tab1'], {
            replaceUrl: true,
          });
        }
      });

    // Subscribe to driver location
    this.driverLocationSubscription = this.rideService
      .getDriverLocation()
      .subscribe((location) => {
        if (location) {
          this.driverLocation = location;
        }
      });

    // Subscribe to driver ETA
    this.driverETASubscription = this.rideService
      .getDriverETA()
      .subscribe((eta) => {
        if (eta) {
          this.driverETA = Math.ceil(eta);
        }
      });

    // Load initial data
    const ride = this.rideService.getCurrentRideValue();
    if (ride && ride.driver) {
      this.currentRide = ride;
      this.driver = ride.driver;
      this.loadDriverDetails(ride.driver);
    }
  }

  /**
   * Fetch driver details from API
   */
  private async fetchDriverDetailsFromAPI(driverId: string) {
    try {
      console.log('🔍 Fetching driver details via API for driver:', driverId);
      
      const response = await this.http.get(`${environment.apiUrl}/drivers/${driverId}`).toPromise();
      
      console.log('📦 ========================================');
      console.log('📦 DRIVER API RESPONSE');
      console.log('📦 ========================================');
      console.log('📦 Response:', response);
      console.log('========================================');
      
      // Map API response to driver info
      if (response) {
        this.driver = response as any;
        this.loadDriverDetails(response as any);
      }
    } catch (error) {
      console.error('❌ Error fetching driver details:', error);
      console.error('📝 Error details:', error);
    }
  }

  ngOnDestroy() {
    this.rideSubscription?.unsubscribe();
    this.rideStatusSubscription?.unsubscribe();
    this.driverLocationSubscription?.unsubscribe();
    this.driverETASubscription?.unsubscribe();
  }

  private loadDriverDetails(driver: DriverInfo) {
    this.driverDetails = {
      name: driver.name,
      photo: driver.profilePic || 'assets/user.png',
      rating: driver.rating || 0,
      totalTrips: driver.totalTrips || 0,
      experience: 0, // Calculate from join date if available
      membershipDuration: 'N/A', // Calculate from join date if available
      carType: `${driver.vehicleInfo.color} ${driver.vehicleInfo.make} ${driver.vehicleInfo.model}`,
      carNumber: driver.vehicleInfo.licensePlate,
    };
  }

  callDriver() {
    if (this.driver && this.driver.phone) {
      // Open phone dialer
      window.location.href = `tel:${this.driver.phone}`;
    } else {
      console.warn('Driver phone number not available');
    }
  }

  chatWithDriver() {
    // Navigate to driver chat page
    this.router.navigate(['/driver-chat'], {
      state: { driver: this.driver, ride: this.currentRide },
    });
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
    // Go back to active-ordere if there's an active ride, otherwise tab1
    if (this.currentRide) {
      this.router.navigate(['/active-ordere']);
    } else {
      this.router.navigate(['/tabs/tab1'], {
        replaceUrl: true,
      });
    }
  }
}
