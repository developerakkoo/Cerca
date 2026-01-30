import {
  Component,
  OnInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { PermissionService } from '../services/permission.service';
import { ToastController, ModalController, LoadingController } from '@ionic/angular';
import { UserService } from '../services/user.service';
import { GeocodingService } from '../services/geocoding.service';
import { SettingsService, VehicleServices } from '../services/settings.service';
import { RideService } from '../services/ride.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { SearchPage, SearchModalResult } from '../pages/search/search.page';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {
  private currentLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };
  isLocationFetched = false;
  isLoadingLocation = false;

  // Booking properties
  pickupAddress = '';
  destinationAddress = '';
  selectedVehicle: string = 'small';
  vehicleServices: VehicleServices | null = null;
  isLoadingServices = false;
  
  // Subscriptions
  private pickupSubscription: Subscription | null = null;
  private destinationSubscription: Subscription | null = null;
  private vehicleServicesSubscription: Subscription | null = null;

  constructor(
    private permissionService: PermissionService,
    private zone: NgZone,
    private toastController: ToastController,
    private userService: UserService,
    private geocodingService: GeocodingService,
    private settingsService: SettingsService,
    private modalController: ModalController,
    private loadingCtrl: LoadingController,
    private router: Router
  ) {}

  ngOnInit() {
    this.initializeSubscriptions();
    this.loadVehicleServices();
    this.getCurrentPosition();
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

  ionViewDidEnter() {
    // Refresh vehicle services when entering view
    this.loadVehicleServices();
  }

  private initializeSubscriptions() {
    // Subscribe to pickup changes
    this.pickupSubscription = this.userService.pickup$.subscribe((pickup) => {
      this.zone.run(() => {
        this.pickupAddress = pickup || '';
      });
    });

    // Subscribe to destination changes
    this.destinationSubscription = this.userService.destination$.subscribe((destination) => {
      this.zone.run(() => {
        this.destinationAddress = destination || '';
      });
    });
  }

  private loadVehicleServices() {
    this.isLoadingServices = true;
    // Get current services from subject (may be cached)
    this.vehicleServices = this.settingsService.getCurrentVehicleServices();
    
    // Subscribe to updates
    if (!this.vehicleServicesSubscription) {
      this.vehicleServicesSubscription = this.settingsService.vehicleServices$.subscribe(
        (services) => {
          this.zone.run(() => {
            this.vehicleServices = services;
            this.isLoadingServices = false;
          });
        }
      );
    }

    // Fetch from API (will update subject)
    this.settingsService.getVehicleServices().subscribe({
      next: (services) => {
        this.zone.run(() => {
          this.vehicleServices = services;
          this.isLoadingServices = false;
        });
      },
      error: (error) => {
        console.error('Error loading vehicle services:', error);
        this.zone.run(() => {
          this.isLoadingServices = false;
        });
      }
    });
  }

  async getCurrentPosition() {
    this.isLoadingLocation = true;
    try {
      console.log('Starting location fetch...');

      if (!navigator.onLine) {
        await this.presentToast('No internet connection.');
        this.isLoadingLocation = false;
        return;
      }

      const permissionResult = await this.permissionService.requestLocationPermission();
      
      if (!permissionResult.granted) {
        this.isLoadingLocation = false;
        if (!permissionResult.canAskAgain) {
          await this.presentToast('Location permission denied. Tap to open settings.');
          await this.permissionService.showOpenSettingsAlert();
        } else {
          await this.presentToast('Location permission is required.');
        }
        return;
      }

      // Get location
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });

      const { latitude, longitude, accuracy } = coordinates.coords;
      
      // Update state
      this.currentLocation = { lat: latitude, lng: longitude };
      this.userService.setCurrentLocation({ lat: latitude, lng: longitude });
      
      // Geocode
      try {
        const address = await this.geocodingService.getAddressFromLatLng(latitude, longitude);
        this.zone.run(() => {
          this.pickupAddress = address;
          this.userService.setPickup(address);
          this.isLocationFetched = true;
          this.isLoadingLocation = false;
        });
      } catch (geocodeError) {
        console.error('Error geocoding address:', geocodeError);
        this.isLoadingLocation = false;
      }

    } catch (error: any) {
      console.error('Error getting location:', error);
      this.isLoadingLocation = false;
      await this.presentToast('Could not fetch location.');
    }
  }

  async onInputFocus(type: 'pickup' | 'destination') {
    const modal = await this.modalController.create({
      component: SearchPage,
      componentProps: {
        pickup: type === 'pickup' ? this.pickupAddress : '',
        destination: type === 'destination' ? this.destinationAddress : '',
        isPickup: type === 'pickup' ? 'true' : 'false',
      },
      showBackdrop: true,
      backdropDismiss: true,
      cssClass: 'search-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    
    if (data) {
      const result: SearchModalResult = data;
      if (type === 'pickup') {
        this.zone.run(() => {
          this.pickupAddress = result.address;
          this.userService.setPickup(result.address);
        });
      } else {
        this.zone.run(() => {
          this.destinationAddress = result.address;
          this.userService.setDestination(result.address);
        });
      }
    }
  }

  onVehicleSelect(event: any) {
    this.selectedVehicle = event.detail.value;
  }

  async goToPayment() {
    if (!this.pickupAddress || !this.destinationAddress) {
      return;
    }

    const currentLocation = this.userService.getCurrentLocation();
    
    // Show loading
    const loading = await this.loadingCtrl.create({
      message: 'Preparing booking...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Get dropoff coordinates
      const dropoffLocation = await this.geocodingService.getLatLngFromAddress(
        this.destinationAddress
      );

      // Use current location as pickup if available, otherwise try to geocode pickup address
      let pickupLocation = currentLocation;
      if (!pickupLocation || !pickupLocation.lat) {
        const geocodedPickup = await this.geocodingService.getLatLngFromAddress(this.pickupAddress);
        if (geocodedPickup) {
          pickupLocation = { lat: geocodedPickup.lat, lng: geocodedPickup.lng };
        }
      }

      if (!pickupLocation || !pickupLocation.lat || !dropoffLocation) {
        throw new Error('Could not determine locations');
      }

      const distanceInKm = this.calculateDistance(
        pickupLocation.lat,
        pickupLocation.lng,
        dropoffLocation.lat,
        dropoffLocation.lng
      );

      this.userService.setPendingRideDetails({
        pickupAddress: this.pickupAddress,
        dropoffAddress: this.destinationAddress,
        selectedVehicle: this.selectedVehicle,
        pickupLocation: {
          latitude: pickupLocation.lat,
          longitude: pickupLocation.lng,
        },
        dropoffLocation: {
          latitude: dropoffLocation.lat,
          longitude: dropoffLocation.lng,
        },
        distanceInKm: distanceInKm,
      });

      await loading.dismiss();
      this.router.navigate(['/payment'], {
        queryParams: { vehicle: this.selectedVehicle },
      });

    } catch (error) {
      await loading.dismiss();
      console.error('Error preparing booking:', error);
      await this.presentToast('Could not calculate route. Please check addresses.');
    }
  }

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

  async presentToast(msg: string) {
    try {
      const toast = await this.toastController.create({
        message: msg,
        duration: 2000,
        position: 'bottom',
      });
      await toast.present();
    } catch (error) {
      console.error('Error presenting toast:', error);
    }
  }
}
