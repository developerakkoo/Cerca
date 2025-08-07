import { Component, OnInit, ViewChild, ElementRef, NgZone, Renderer2 } from '@angular/core';
import { GoogleMap, MapType, Marker } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NavController } from '@ionic/angular';
import { GeocodingService } from 'src/app/services/geocoding.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { MapService } from '../../services/map.service';

@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false
})
export class SearchPage implements OnInit {
  @ViewChild('map') mapRef!: ElementRef<HTMLElement>;
  private map!: GoogleMap;
  pickup: string = '';
  destination: string = ''; 
  isPickup!: string;
  searchQuery: string = '';
  selectedAddress: string = '';
  selectedAddressDetails: any = '';
  selectedLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };
  currentLocation: { lat: number; lng: number } = { lat: 0, lng: 0 };

  constructor(
    private geocodingService: GeocodingService,
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private zone: NgZone,
    private renderer: Renderer2,
    private mapService: MapService
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
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
    
    console.log("Pickup From Route");
    console.log(this.pickup);
    console.log("Destination From Route");
    console.log(this.destination);
    console.log("Is Pickup From Route");
    console.log(this.isPickup);
    console.log(typeof(this.isPickup));
    
    // Subscribe to service updates
    this.userService.pickup$.subscribe(pickup => {
      if (this.isPickup !== 'true') { // Only update if we're not editing pickup
        this.pickup = pickup;
      }
    });

    this.userService.destination$.subscribe(destination => {
      if (this.isPickup !== 'false') { // Only update if we're not editing destination
        this.destination = destination;
      }
    });

    this.userService.currentLocation$.subscribe(location => {
      this.selectedLocation = location;
    });
    console.log("Current Location From User Service");
    console.log(this.selectedLocation);
    console.log("Is Pickuo Address Added");
    console.log(this.isPickup);
    
    
  }

  ionViewDidEnter() {
    // Set current map type to search
    this.mapService.setCurrentMapType('search');
    
    // Always destroy tab1 map and create fresh search map
    this.mapService.destroyTab1Map().then(() => {
      setTimeout(() => {
        this.initializeMap();
      }, 1000);
    });
  }

  ionViewWillEnter() {
    this.renderer.addClass(document.body, 'map-active');
  }

  ionViewWillLeave() {
    this.renderer.removeClass(document.body, 'map-active');
  }

  ionViewDidLeave() {
    // Don't destroy the search map, let the service handle it
    // The map will be preserved for when user returns to search page
  }

  private async initializeMap() {
    try {
      // Always create a fresh search map
      console.log('Creating new map for search page');
      this.map = await this.mapService.createSearchMap('map2', this.selectedLocation?.lat || 18.5204, this.selectedLocation?.lng || 73.8567);

      // Listen for map movement
      await this.map.setOnCameraMoveStartedListener((event) => {
        // console.log("Camera Move Started");
      });

      await this.map.setOnCameraIdleListener((event) => {
        this.updateAddressFromLocation(event.latitude, event.longitude);
      });
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  private async updateAddressFromLocation(lat: number, lng: number) {
    try {
      console.log("Update Address From Location");
      
      const address = await this.geocodingService.getAddressFromLatLng(lat, lng);
      
      this.zone.run(() => {
        this.selectedAddress = address;
        this.selectedLocation = { lat, lng };
      });

      console.log("Selected Address:", this.selectedAddress);
      console.log("Is Pickup:", this.isPickup);
      
      // Don't update the service here, only update the local selectedAddress
      // The actual update will happen in confirmLocation
    } catch (error) {
      console.error('Error getting address:', error);
    }
  }

  async searchLocation() {
    if (!this.searchQuery.trim()) return;

    try {
      const location = await this.geocodingService.getLatLngFromAddress(this.searchQuery);
      if (location) {
        await this.map.setCamera({
          coordinate: {
            lat: location.lat,
            lng: location.lng
          },
          zoom: 18,
        });
        this.updateAddressFromLocation(location.lat, location.lng);
      }
    } catch (error) {
      console.error('Error searching location:', error);
    }
  }

  async confirmLocation() {
    if (this.isPickup === 'true') {
      console.log("Confirming Pickup Address:", this.selectedAddress);
      // Only update pickup, preserve destination
      this.userService.setPickup(this.selectedAddress);
    } else if (this.isPickup === 'false') {
      console.log("Confirming Destination Address:", this.selectedAddress);
      // Only update destination, preserve pickup
      this.userService.setDestination(this.selectedAddress);
    }
    this.router.navigate(['/tabs/tabs/tab1']);
  }

  clearSearch() {
    console.log("Clear Search");
    
    this.searchQuery = '';
    this.initializeMap();
    
  }
}
