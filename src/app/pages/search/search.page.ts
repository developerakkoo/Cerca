import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone,
} from '@angular/core';
import { GoogleMap, MapType, Marker } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NavController, ToastController } from '@ionic/angular';
import { GeocodingService } from 'src/app/services/geocoding.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { PlacesService, PlacePrediction } from 'src/app/services/places.service';
import { AddressService, CreateAddressRequest } from 'src/app/services/address.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { LoadingController } from '@ionic/angular';
@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false,
})
export class SearchPage implements OnInit, OnDestroy {
  @ViewChild('map2') mapRef!: ElementRef<HTMLElement>;
  private map!: GoogleMap;
  private isMapReady = false;
  pickup: string = '';
  destination: string = '';
  isPickup!: string;
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

  // Address management properties
  addressMode: 'add' | 'edit' | null = null;
  addressId: string | null = null;
  returnTo: string | null = null;
  currentUserId: string = '';

  constructor(
    private geocodingService: GeocodingService,
    private navCtrl: NavController,
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
    // Subscribe to user to get userId
    this.userService.getUser().subscribe((user) => {
      if (user && user.id) {
        this.currentUserId = user.id;
      }
    });

    this.route.queryParams.subscribe((params) => {
      // Check if we're in address management mode
      this.addressMode = params['mode'] === 'add' ? 'add' : params['mode'] === 'edit' ? 'edit' : null;
      this.addressId = params['addressId'] || null;
      this.returnTo = params['returnTo'] || null;

      // If not in address mode, use normal pickup/destination flow
      if (!this.addressMode) {
        this.pickup = params['pickup'] || '';
        this.destination = params['destination'] || '';
        this.isPickup = params['isPickup'];

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

    console.log('Pickup From Route');
    console.log(this.pickup);
    console.log('Destination From Route');
    console.log(this.destination);
    console.log('Is Pickup From Route');
    console.log(this.isPickup);
    console.log(typeof this.isPickup);

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
      this.selectedLocation = location;
    });
    console.log('Current Location From User Service');
    console.log(this.selectedLocation);
    console.log('Is Pickuo Address Added');
    console.log(this.isPickup);

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
          const mapCenter = this.selectedLocation?.lat && this.selectedLocation?.lng 
            ? { lat: this.selectedLocation.lat, lng: this.selectedLocation.lng }
            : undefined;
          return this.placesService.getPlacePredictions(query, mapCenter);
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

  async ionViewDidEnter() {
    console.log('🗺️ Search page entered, initializing map...');
    await this.presentToast('🗺️ Search: Entering view');

    setTimeout(async () => {
      if (!this.map || !this.isMapReady) {
        await this.presentToast('🗺️ Search: Creating map...');
        this.initializeMap();
      } else {
        await this.presentToast('🗺️ Search: Map already exists');
      }
    }, 300);
  }

  async ionViewWillLeave() {
    console.log('🗺️ Search page leaving, cleaning up map...');
    await this.presentToast('🗺️ Search: Leaving, destroying map');
    await this.destroyMap();
  }

  ngOnDestroy() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
    this.destroyMap();
  }

  private async initializeMap() {
    if (this.isMapReady || this.map) {
      console.log('Map already exists, skipping creation');
      return;
    }

    try {
      console.log('Creating search map with ID: search-map');
      console.log('Selected location:', this.selectedLocation);

      const mapElement =
        this.mapRef?.nativeElement || document.getElementById('map2');
      if (!mapElement) {
        console.error('Map element not found');
        return;
      }

      this.map = await GoogleMap.create({
        id: 'search-map', // Unique ID for search page
        element: mapElement,
        apiKey: environment.apiKey,
        config: {
          mapId: environment.mapId,
          center: {
            lat: this.selectedLocation?.lat || 18.5204, // Default to Pune
            lng: this.selectedLocation?.lng || 73.8567,
          },
          zoom: 18,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        },
      });

      this.isMapReady = true;
      console.log('Search map created successfully');
      await this.presentToast('✅ Search: Map created & ready!');

      // Listen for map movement
      await this.map.setOnCameraMoveStartedListener((event) => {
        // Hide suggestions when user starts moving map
        this.clearSuggestions();
      });

      await this.map.setOnCameraIdleListener((event) => {
        // console.log("Camera Move Idle");
        this.updateAddressFromLocation(event.latitude, event.longitude);
      });
    } catch (error) {
      console.error('Error creating search map:', error);
      this.isMapReady = false;
    }
  }

  private async updateAddressFromLocation(lat: number, lng: number) {
    try {
      console.log('Update Address From Location');

      const address = await this.geocodingService.getAddressFromLatLng(
        lat,
        lng
      );

      this.zone.run(() => {
        this.selectedAddress = address;
        this.selectedLocation = { lat, lng };
      });

      console.log('Selected Address:', this.selectedAddress);
      console.log('Is Pickup:', this.isPickup);

      // Don't update the service here, only update the local selectedAddress
      // The actual update will happen in confirmLocation
    } catch (error) {
      console.error('Error getting address:', error);
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

  async selectPlace(place: PlacePrediction) {
    try {
      this.isLoadingSuggestions = true;
      const placeDetails = await this.placesService.getPlaceDetails(place.place_id).toPromise();
      
      if (placeDetails && this.map) {
        const location = placeDetails.geometry.location;
        
        // Update map camera to selected location
        await this.map.setCamera({
          coordinate: {
            lat: location.lat,
            lng: location.lng,
          },
          zoom: 18,
          animate: true,
        });

        // Update selected address and location
        this.zone.run(() => {
          this.selectedAddress = placeDetails.formatted_address;
          this.selectedLocation = { lat: location.lat, lng: location.lng };
          this.selectedAddressDetails = placeDetails;
        });

        // Hide suggestions
        this.clearSuggestions();
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      await this.presentToast('Error loading place details');
    } finally {
      this.zone.run(() => {
        this.isLoadingSuggestions = false;
      });
    }
  }

  clearSuggestions() {
    this.zone.run(() => {
      this.placeSuggestions = [];
      this.showSuggestions = false;
      this.isLoadingSuggestions = false;
    });
  }

  async confirmLocation() {
    // Hide suggestions before confirming
    this.clearSuggestions();

    // If in address management mode, save the address
    if (this.addressMode) {
      await this.saveAddress();
      return;
    }

    // Handle returnTo navigation (for tab4 and date-wise pages)
    if (this.returnTo) {
      const lat = this.selectedLocation.lat;
      const lng = this.selectedLocation.lng;
      const address = this.selectedAddress;

      // Destroy map before navigating back
      await this.destroyMap();

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

    // Normal flow for pickup/destination
    if (this.isPickup === 'true') {
      console.log('Confirming Pickup Address:', this.selectedAddress);
      // Only update pickup, preserve destination
      this.userService.setPickup(this.selectedAddress);
    } else if (this.isPickup === 'false') {
      console.log('Confirming Destination Address:', this.selectedAddress);
      // Only update destination, preserve pickup
      this.userService.setDestination(this.selectedAddress);
    }

    // Destroy map before navigating back
    console.log('🗺️ Destroying search map before navigation...');
    await this.presentToast('🗺️ Search: Confirming & destroying');
    await this.destroyMap();

    this.router.navigate(['/tabs/tabs/tab1']);
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

        // Update map if it exists
        if (this.map && this.isMapReady) {
          await this.map.setCamera({
            coordinate: {
              lat: this.selectedLocation.lat,
              lng: this.selectedLocation.lng,
            },
            zoom: 18,
            animate: true,
          });
        }
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

        // Destroy map before navigating back
        await this.destroyMap();

        // Navigate back to manage-address page or specified return route
        const returnRoute = this.returnTo || '/manage-address';
        this.router.navigate([returnRoute], {
          queryParams: { saved: 'true' },
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

  onMapClick(event: Event) {
    // Hide suggestions when clicking on map
    event.stopPropagation();
    this.clearSuggestions();
  }

  private async destroyMap() {
    if (this.map) {
      try {
        await this.map.destroy();
        this.map = undefined as any;
        this.isMapReady = false;
        console.log('🗺️ Search map destroyed successfully');
        await this.presentToast('✅ Search: Map destroyed');
      } catch (error) {
        console.error('Error destroying search map:', error);
        await this.presentToast('❌ Search: Cleanup error');
        this.map = undefined as any;
        this.isMapReady = false;
      }
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
