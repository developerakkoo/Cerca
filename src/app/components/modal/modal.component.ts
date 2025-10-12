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
import { UserService } from '../../services/user.service';
import { RideService } from '../../services/ride.service';
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
  imports: [IonicModule, CommonModule, FormsModule],
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
  private pickupSubscription: Subscription | null = null;
  private destinationSubscription: Subscription | null = null;

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
    private loadingCtrl: LoadingController
  ) {}

  ngOnInit() {
    this.initializeSubscriptions();
  }

  ngOnDestroy() {
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    if (this.destinationSubscription) {
      this.destinationSubscription.unsubscribe();
    }
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
    // Legacy method - now redirects to requestRide
    await this.requestRide();
  }

  /**
   * Request a ride via Socket.IO
   */
  async requestRide() {
    if (!this.areInputsFilled) {
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Requesting ride...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Get current location from user service
      const currentLocation = this.userService.getCurrentLocation();

      if (!currentLocation || !currentLocation.lat || !currentLocation.lng) {
        throw new Error('Current location not available');
      }

      // TODO: Implement geocoding for destination address
      // For now using relative coordinates from pickup
      const destinationCoords = {
        latitude: currentLocation.lat + 0.02, // ~2km away
        longitude: currentLocation.lng + 0.02,
      };

      // TODO: Calculate actual fare based on distance
      const estimatedFare = 150;
      const estimatedDistance = 5.2;

      await this.rideService.requestRide({
        pickupLocation: {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
        },
        dropoffLocation: destinationCoords,
        pickupAddress: this.pickupInput,
        dropoffAddress: this.destinationInput,
        fare: estimatedFare,
        distanceInKm: estimatedDistance,
        service:
          this.selectedVehicle === 'small' ? 'sedan' : this.selectedVehicle,
        rideType: 'normal',
        paymentMethod: 'CASH',
      });

      await loading.dismiss();
      // Navigation is handled by RideService
    } catch (error) {
      await loading.dismiss();
      console.error('Error requesting ride:', error);
      // Error toast is shown by RideService
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
}
