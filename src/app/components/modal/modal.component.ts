import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  Input,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { UserService } from '../../services/user.service';
import { RideService } from '../../services/ride.service';
import { GeocodingService } from '../../services/geocoding.service';
import { SettingsService, VehicleServices } from '../../services/settings.service';
import { Subscription } from 'rxjs';

interface Address {
  type: string;
  address: string;
  isSelected: boolean;
}

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class ModalComponent implements OnInit, OnDestroy {
  @Input() isLocationFetched = false;
  @Input() pickupInput: string = '';
  @Input() destinationInput: string = '';
  @Input() isKeyboardOpen: boolean = false;
  @Output() pickupInputChange = new EventEmitter<string>();
  @Output() destinationInputChange = new EventEmitter<string>();

  activeInput: 'pickup' | 'destination' | null = null;
  selectedVehicle: string = 'small';
  vehicleServices: VehicleServices | null = null;
  isLoadingServices = false;
  private pickupSubscription: Subscription | null = null;
  private destinationSubscription: Subscription | null = null;
  private vehicleServicesSubscription: Subscription | null = null;

  addresses: Address[] = [
    { type: 'Home', address: '123 Main St', isSelected: false },
    { type: 'Work', address: '456 Business Ave', isSelected: false },
    { type: 'Gym', address: '789 Fitness Rd', isSelected: false },
  ];

  get areInputsFilled(): boolean {
    return !!this.pickupInput && !!this.destinationInput;
  }

  constructor(
    private router: Router,
    private userService: UserService,
    private rideService: RideService,
    private geocodingService: GeocodingService,
    private loadingCtrl: LoadingController,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.initializeSubscriptions();
    this.loadVehicleServices();
  }

  ngOnDestroy() {
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    if (this.destinationSubscription) {
      this.destinationSubscription.unsubscribe();
    }
    if (this.vehicleServicesSubscription) {
      this.vehicleServicesSubscription.unsubscribe();
    }
  }

  private loadVehicleServices() {
    this.isLoadingServices = true;
    // Get current services from subject (may be cached)
    this.vehicleServices = this.settingsService.getCurrentVehicleServices();
    
    // Subscribe to updates
    this.vehicleServicesSubscription = this.settingsService.vehicleServices$.subscribe(
      (services) => {
        this.vehicleServices = services;
        this.isLoadingServices = false;
      }
    );

    // Fetch from API (will update subject)
    this.settingsService.getVehicleServices().subscribe({
      next: (services) => {
        this.vehicleServices = services;
        this.isLoadingServices = false;
      },
      error: (error) => {
        console.error('Error loading vehicle services:', error);
        // Use defaults from service
        this.vehicleServices = this.settingsService.getCurrentVehicleServices();
        this.isLoadingServices = false;
      }
    });
  }

  private initializeSubscriptions() {
    // Subscribe to pickup changes
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    this.pickupSubscription = this.userService.pickup$.subscribe((pickup) => {
      if (pickup !== this.pickupInput) {
        this.pickupInput = pickup;
        this.pickupInputChange.emit(pickup);
      }
    });

    // Subscribe to destination changes
    if (this.destinationSubscription) {
      this.destinationSubscription.unsubscribe();
    }
    this.destinationSubscription = this.userService.destination$.subscribe(
      (destination) => {
        if (destination !== this.destinationInput) {
          this.destinationInput = destination;
          this.destinationInputChange.emit(destination);
        }
      }
    );
  }

  @HostListener('window:keyboardWillShow')
  onKeyboardShow() {
    this.isKeyboardOpen = true;
  }

  @HostListener('window:keyboardWillHide')
  onKeyboardHide() {
    this.isKeyboardOpen = false;
  }

  onFocus(_event: any, type: 'pickup' | 'destination') {
    this.activeInput = type;
    if (type === 'pickup') {
      this.router.navigate(['/search'], {
        queryParams: {
          pickup: this.pickupInput,
          isPickup: 'true',
        },
      });
    } else {
      this.router.navigate(['/search'], {
        queryParams: {
          destination: this.destinationInput,
          isPickup: 'false',
        },
      });
    }
  }

  onBlur(_event: any) {
    // Add a small delay to allow for click events to fire
    setTimeout(() => {
      this.activeInput = null;
    }, 200);
  }

  clearInput(type: 'pickup' | 'destination') {
    if (type === 'pickup') {
      this.pickupInput = '';
      this.pickupInputChange.emit('');
      this.userService.setPickup('');
    } else {
      this.destinationInput = '';
      this.destinationInputChange.emit('');
      this.userService.setDestination('');
    }

    // Reset selection state for all addresses
    this.addresses.forEach((addr) => {
      addr.isSelected = false;
    });
  }

  toggleAddress(address: Address) {
    // If no input is active, use the last active input or default to pickup
    const targetInput = this.activeInput || 'pickup';

    // Reset all addresses first
    this.addresses.forEach((addr) => {
      addr.isSelected = false;
    });

    // Toggle the selected address
    address.isSelected = !address.isSelected;

    // Update only the appropriate input
    if (targetInput === 'pickup') {
      this.pickupInput = address.isSelected ? address.address : '';
      this.pickupInputChange.emit(this.pickupInput);
      this.userService.setPickup(this.pickupInput);
    } else {
      this.destinationInput = address.isSelected ? address.address : '';
      this.destinationInputChange.emit(this.destinationInput);
      this.userService.setDestination(this.destinationInput);
    }
  }

  onVehicleSelect(event: any) {
    const selectedValue = event.detail.value;
    console.log('Selected vehicle:', selectedValue);
    // You can add additional logic here, such as:
    // - Updating the UI
    // - Sending the selection to a parent component
    // - Calculating pricing based on vehicle size
    // - etc.
  }

  async goToPayment() {
    if (!this.areInputsFilled) {
      console.warn('Please fill in both pickup and destination');
      return;
    }

    // Get current location
    const currentLocation = this.userService.getCurrentLocation();
    if (!currentLocation || !currentLocation.lat || !currentLocation.lng) {
      console.error('Current location not available');
      return;
    }

    // Show loading while geocoding destination
    const loading = await this.loadingCtrl.create({
      message: 'Getting destination location...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Geocode destination address
      const dropoffLocation = await this.geocodingService.getLatLngFromAddress(
        this.destinationInput
      );

      if (!dropoffLocation) {
        await loading.dismiss();
        console.error('Failed to geocode destination address');
        // Fallback to current location with offset (for backward compatibility)
        this.userService.setPendingRideDetails({
          pickupAddress: this.pickupInput,
          dropoffAddress: this.destinationInput,
          selectedVehicle: this.selectedVehicle,
          pickupLocation: {
            latitude: currentLocation.lat,
            longitude: currentLocation.lng,
          },
          dropoffLocation: {
            latitude: currentLocation.lat + 0.02,
            longitude: currentLocation.lng + 0.02,
          },
        });
      } else {
        // Calculate distance between pickup and destination
        const distanceInKm = this.calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          dropoffLocation.lat,
          dropoffLocation.lng
        );

        // Store ride details with actual geocoded destination and distance
        this.userService.setPendingRideDetails({
          pickupAddress: this.pickupInput,
          dropoffAddress: this.destinationInput,
          selectedVehicle: this.selectedVehicle,
          pickupLocation: {
            latitude: currentLocation.lat,
            longitude: currentLocation.lng,
          },
          dropoffLocation: {
            latitude: dropoffLocation.lat,
            longitude: dropoffLocation.lng,
          },
          distanceInKm: distanceInKm,
        });
      }

      await loading.dismiss();

      // Navigate to payment page with vehicle type
      this.router.navigate(['/payment'], {
        queryParams: {
          vehicle: this.selectedVehicle,
        },
      });
    } catch (error) {
      await loading.dismiss();
      console.error('Error geocoding destination:', error);
      // Fallback to current location with offset
      this.userService.setPendingRideDetails({
        pickupAddress: this.pickupInput,
        dropoffAddress: this.destinationInput,
        selectedVehicle: this.selectedVehicle,
        pickupLocation: {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
        },
        dropoffLocation: {
          latitude: currentLocation.lat + 0.02,
          longitude: currentLocation.lng + 0.02,
        },
      });

      // Navigate to payment page even if geocoding fails
      this.router.navigate(['/payment'], {
        queryParams: {
          vehicle: this.selectedVehicle,
        },
      });
    }
  }

  onPickupInputChange(value: string) {
    // Only update pickup input and emit pickup changes
    this.pickupInput = value;
    this.pickupInputChange.emit(value);
    // Only update pickup in service
    this.userService.setPickup(value);
  }

  onDestinationInputChange(value: string) {
    // Only update destination input and emit destination changes
    this.destinationInput = value;
    this.destinationInputChange.emit(value);
    // Only update destination in service
    this.userService.setDestination(value);
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param lat1 Latitude of first point
   * @param lng1 Longitude of first point
   * @param lat2 Latitude of second point
   * @param lng2 Longitude of second point
   * @returns Distance in kilometers
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const R = 6371; // Earth's radius in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
