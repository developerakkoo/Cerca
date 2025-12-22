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
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
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

  constructor(
    private geocodingService: GeocodingService,
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private zone: NgZone,
    private toastCtrl: ToastController,
    private placesService: PlacesService
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.pickup = params['pickup'] || '';
      this.destination = params['destination'] || '';
      this.isPickup = params['isPickup'];

      // Set initial selected address based on which input we're editing
      if (this.isPickup === 'true') {
        this.selectedAddress = this.pickup;
      } else if (this.isPickup === 'false') {
        this.selectedAddress = this.destination;
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
