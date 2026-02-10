import {
  Component,
  OnInit,
  OnDestroy,
  NgZone,
  Input,
  Optional,
} from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { GeocodingService } from 'src/app/services/geocoding.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { PlacesService, PlacePrediction } from 'src/app/services/places.service';
import { AddressService, CreateAddressRequest } from 'src/app/services/address.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { LoadingController } from '@ionic/angular';

export interface SearchModalData {
  pickup?: string;
  destination?: string;
  isPickup?: 'true' | 'false';
  addressMode?: 'add' | 'edit' | null;
  addressId?: string | null;
  returnTo?: string | null;
}

export interface SearchModalResult {
  address: string;
  location: { lat: number; lng: number };
  isPickup?: 'true' | 'false';
  addressId?: string; // For address management mode
}

@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false,
})
export class SearchPage implements OnInit, OnDestroy {
  // Input properties for modal mode (when opened as modal)
  @Input() @Optional() pickup: string = '';
  @Input() @Optional() destination: string = '';
  @Input() @Optional() isPickup: 'true' | 'false' | undefined;
  @Input() @Optional() addressMode: 'add' | 'edit' | null = null;
  @Input() @Optional() addressId: string | null = null;
  @Input() @Optional() returnTo: string | null = null;

  searchQuery: string = '';
  selectedAddress: string = '';
  selectedAddressDetails: any = '';
  selectedLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };
  currentLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };
  
  // Places autocomplete properties
  placeSuggestions: PlacePrediction[] = [];
  showSuggestions: boolean = false;
  isLoadingSuggestions: boolean = false;
  private searchQuerySubject = new Subject<string>();
  private searchSubscription?: Subscription;

  currentUserId: string = '';

  // Modal mode flag
  isModalMode = false;

  constructor(
    private geocodingService: GeocodingService,
    private modalController: ModalController,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private zone: NgZone,
    private toastCtrl: ToastController,
    private placesService: PlacesService,
    private addressService: AddressService,
    private loadingController: LoadingController
  ) {}

  async ngOnInit() {
    // Check if opened as modal (has @Input values) or via router
    // When opened as modal, @Input properties are set by Ionic
    // When opened via router, ActivatedRoute will have queryParams
    
    // Check if we have input values (modal mode)
    if (this.pickup !== undefined || this.destination !== undefined || this.isPickup !== undefined) {
      // Opened as modal - @Input properties are already set
      this.isModalMode = true;
      
      // Set initial selected address based on which input we're editing
      if (this.isPickup === 'true') {
        this.selectedAddress = this.pickup || '';
      } else if (this.isPickup === 'false') {
        this.selectedAddress = this.destination || '';
      }
    } else {
      // Opened via router (address management mode or normal flow)
      this.isModalMode = false;
      this.route.queryParams.subscribe((params) => {
        // Check if we're in address management mode
        this.addressMode = params['mode'] === 'add' ? 'add' : params['mode'] === 'edit' ? 'edit' : null;
        this.addressId = params['addressId'] || null;
        this.returnTo = params['returnTo'] || null;

        // If not in address mode, use normal pickup/destination flow
        if (!this.addressMode) {
          this.pickup = params['pickup'] || '';
          this.destination = params['destination'] || '';
          this.isPickup = (params['isPickup'] === 'true' || params['isPickup'] === 'false') ? params['isPickup'] : undefined;

          // Set initial selected address based on which input we're editing
          if (this.isPickup === 'true') {
            this.selectedAddress = this.pickup;
          } else if (this.isPickup === 'false') {
            this.selectedAddress = this.destination;
          }
        } else {
          // In address mode, load existing address if editing
          if (this.addressMode === 'edit' && this.addressId && this.currentUserId) {
            this.loadAddressForEdit();
          }
        }
      });
    }

    // Subscribe to user to get userId
    this.userService.getUser().subscribe((user) => {
      if (user && user.id) {
        this.currentUserId = user.id;
      }
    });

    // Subscribe to service updates
    this.userService.pickup$.subscribe((pickup) => {
      if (this.isPickup !== 'true') {
        // Only update if we're not editing pickup
        this.pickup = pickup;
      }
    });

    this.userService.destination$.subscribe((destination) => {
      if (this.isPickup !== 'false') {
        // Only update if we're not editing destination
        this.destination = destination;
      }
    });

    this.userService.currentLocation$.subscribe((location) => {
      if (!this.selectedLocation?.lat || !this.selectedLocation?.lng) {
        this.selectedLocation = location;
        this.currentLocation = location;
      }
    });

    // Setup debounced search for places autocomplete
    this.searchSubscription = this.searchQuerySubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query: string) => {
          if (!query || query.trim().length === 0) {
            this.zone.run(() => {
              this.placeSuggestions = [];
              this.showSuggestions = false;
              this.isLoadingSuggestions = false;
            });
            return [];
          }
          this.zone.run(() => {
            this.isLoadingSuggestions = true;
            this.showSuggestions = true;
          });
          
          // Use selectedLocation or currentLocation for location-aware results
          const mapCenter = this.selectedLocation?.lat && this.selectedLocation?.lng 
            ? { lat: this.selectedLocation.lat, lng: this.selectedLocation.lng }
            : this.currentLocation?.lat && this.currentLocation?.lng
            ? { lat: this.currentLocation.lat, lng: this.currentLocation.lng }
            : undefined;
          
          // Use reduced radius of 10km (10000 meters) for accurate, location-aware results
          return this.placesService.getPlacePredictions(query, mapCenter, 10000);
        })
      )
      .subscribe({
        next: (predictions) => {
          this.zone.run(() => {
            this.placeSuggestions = predictions;
            this.isLoadingSuggestions = false;
            this.showSuggestions = predictions.length > 0;
          });
        },
        error: (error) => {
          console.error('Error fetching place predictions:', error);
          this.zone.run(() => {
            this.isLoadingSuggestions = false;
            this.showSuggestions = false;
            this.placeSuggestions = [];
          });
        }
      });
  }

  ngOnDestroy() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  async selectPlace(place: PlacePrediction) {
    try {
      this.isLoadingSuggestions = true;
      const placeDetails = await this.placesService.getPlaceDetails(place.place_id).toPromise();
      
      if (placeDetails) {
        const location = placeDetails.geometry.location;
        
        // Update selected address and location
        this.zone.run(() => {
          this.selectedAddress = placeDetails.formatted_address;
          this.selectedLocation = { lat: location.lat, lng: location.lng };
          this.selectedAddressDetails = placeDetails;
        });

        // Hide suggestions
        this.clearSuggestions();

        // For tab1 modal flow: dismiss with result instead of navigating to pin-location
        // Only navigate to pin-location for tab4, date-wise, or address management flows
        if (this.isModalMode && !this.addressMode && !this.returnTo) {
          // Tab1 flow: dismiss modal with result
          const result: SearchModalResult = {
            address: this.selectedAddress,
            location: this.selectedLocation,
            isPickup: this.isPickup,
          };
          await this.modalController.dismiss(result);
        } else {
          // Other flows: navigate to pin-location page
          await this.navigateToPinLocation();
        }
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      await this.presentToast('Error loading place details');
      this.zone.run(() => {
        this.isLoadingSuggestions = false;
      });
    }
  }

  /**
   * Navigate to pin-location page with selected location data
   * Note: This is only called for non-tab1 flows (tab4, date-wise, address management)
   */
  private async navigateToPinLocation() {
    if (!this.selectedLocation?.lat || !this.selectedLocation?.lng) {
      return;
    }

    // If opened as modal, dismiss first then navigate
    if (this.isModalMode) {
      await this.modalController.dismiss();
    }

    // Navigate to pin-location page with query params
    this.router.navigate(['/pin-location'], {
      queryParams: {
        address: this.selectedAddress,
        lat: this.selectedLocation.lat,
        lng: this.selectedLocation.lng,
        isPickup: this.isPickup,
        addressMode: this.addressMode || '',
        addressId: this.addressId || '',
        returnTo: this.returnTo || '',
        modalMode: this.isModalMode ? 'true' : 'false',
      },
    });
  }

  /**
   * Execute confirmation logic (extracted from confirmLocation for reuse)
   */
  private async executeConfirmation() {
    if (!this.selectedAddress) {
      await this.presentToast('Please select a location');
      this.zone.run(() => {
        this.isLoadingSuggestions = false;
      });
      return;
    }

    // Address management mode - use router
    if (this.addressMode) {
      await this.saveAddress();
      return;
    }

    // Handle returnTo navigation (for tab4 and date-wise pages)
    if (this.returnTo) {
      const lat = this.selectedLocation.lat;
      const lng = this.selectedLocation.lng;
      const address = this.selectedAddress;

      // Navigate back to the calling page with location data
      if (this.returnTo === 'tab4') {
        this.router.navigate(['/tabs/tabs/tab4'], {
          queryParams: {
            returnTo: 'tab4',
            isPickup: this.isPickup,
            address: address,
            lat: lat,
            lng: lng
          }
        });
      } else if (this.returnTo === 'date-wise') {
        this.router.navigate(['/tabs/tabs/tab4/date-wise'], {
          queryParams: {
            returnTo: 'date-wise',
            isPickup: this.isPickup,
            address: address,
            lat: lat,
            lng: lng
          }
        });
      }
      return;
    }

    // Geocode address if location not set (shouldn't happen with place details, but safety check)
    if (!this.selectedLocation?.lat || !this.selectedLocation?.lng) {
      try {
        const location = await this.geocodingService.getLatLngFromAddress(
          this.selectedAddress
        );
        if (location) {
          this.selectedLocation = { lat: location.lat, lng: location.lng };
        } else {
          await this.presentToast('Error getting location coordinates');
          this.zone.run(() => {
            this.isLoadingSuggestions = false;
          });
          return;
        }
      } catch (error) {
        console.error('Error geocoding address:', error);
        await this.presentToast('Error getting location coordinates');
        this.zone.run(() => {
          this.isLoadingSuggestions = false;
        });
        return;
      }
    }

    // If opened as modal, dismiss with result
    if (this.isModalMode) {
      const result: SearchModalResult = {
        address: this.selectedAddress,
        location: this.selectedLocation,
        isPickup: this.isPickup,
      };
      await this.modalController.dismiss(result);
      return;
    }

    // Normal flow for pickup/destination (router mode - fallback)
    if (this.isPickup === 'true') {
      console.log('Confirming Pickup Address:', this.selectedAddress);
      this.userService.setPickup(this.selectedAddress);
    } else if (this.isPickup === 'false') {
      console.log('Confirming Destination Address:', this.selectedAddress);
      this.userService.setDestination(this.selectedAddress);
    }

    this.router.navigate(['/tabs/tabs/tab1']);
  }

  clearSuggestions() {
    this.zone.run(() => {
      this.placeSuggestions = [];
      this.showSuggestions = false;
      this.isLoadingSuggestions = false;
    });
  }

  async confirmLocation() {
    // This method is kept for backward compatibility but now delegates to executeConfirmation
    // It may still be called from address management mode or other edge cases
    await this.executeConfirmation();
  }

  async dismissModal() {
    // Dismiss modal without data if user cancels
    await this.modalController.dismiss();
  }

  /**
   * Load address for editing
   */
  private async loadAddressForEdit() {
    if (!this.addressId || !this.currentUserId) {
      return;
    }

    try {
      const address = await this.addressService
        .getAddressById(this.addressId, this.currentUserId)
        .toPromise();

      if (address) {
        this.zone.run(() => {
          this.selectedAddress = address.formattedAddress || address.addressLine;
          this.selectedLocation = {
            lat: address.location.coordinates[1], // latitude is second
            lng: address.location.coordinates[0], // longitude is first
          };
        });
      }
    } catch (error) {
      console.error('Error loading address for edit:', error);
      await this.presentToast('Failed to load address');
    }
  }

  /**
   * Save address (create or update)
   */
  private async saveAddress() {
    if (!this.currentUserId || !this.selectedAddress || !this.selectedLocation.lat || !this.selectedLocation.lng) {
      await this.presentToast('Please select a valid location');
      return;
    }

    const loading = await this.loadingController.create({
      message: this.addressMode === 'add' ? 'Saving address...' : 'Updating address...',
    });
    await loading.present();

    try {
      const addressData: CreateAddressRequest = {
        id: this.currentUserId,
        addressLine: this.selectedAddress,
        formattedAddress: this.selectedAddress,
        location: {
          type: 'Point',
          coordinates: [this.selectedLocation.lng, this.selectedLocation.lat], // [longitude, latitude]
        },
        placeId: this.selectedAddressDetails?.place_id || undefined,
      };

      let success = false;
      if (this.addressMode === 'add') {
        const address = await this.addressService.createAddress(addressData).toPromise();
        success = !!address;
      } else if (this.addressMode === 'edit' && this.addressId) {
        const address = await this.addressService
          .updateAddress(this.addressId, this.currentUserId, addressData)
          .toPromise();
        success = !!address;
      }

      await loading.dismiss();

      if (success) {
        await this.presentToast(
          this.addressMode === 'add' ? 'Address saved successfully' : 'Address updated successfully'
        );

        // Navigate back to manage-address page or specified return route
        const returnRoute = this.returnTo || '/manage-address';
        this.router.navigate([returnRoute], {
          queryParams: { saved: 'true' },
          replaceUrl: true, // Avoid back-stack issues
        });
      } else {
        await this.presentToast('Failed to save address');
      }
    } catch (error) {
      console.error('Error saving address:', error);
      await loading.dismiss();
      await this.presentToast('Failed to save address');
    }
  }

  async searchLocation() {
    // Trigger autocomplete search via subject
    if (this.searchQuery && this.searchQuery.trim().length > 0) {
      this.searchQuerySubject.next(this.searchQuery);
    } else {
      this.clearSuggestions();
    }
  }

  clearSearch() {
    console.log('Clear Search');
    this.searchQuery = '';
    this.clearSuggestions();
  }

  onContentClick(event: Event) {
    // Hide suggestions when clicking outside the suggestions modal
    const target = event.target as HTMLElement;
    if (!target.closest('.suggestions-modal') && !target.closest('.search-bar')) {
      this.clearSuggestions();
    }
  }

  async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 2000,
      position: 'top',
      color: 'dark',
    });
    await toast.present();
  }
}
