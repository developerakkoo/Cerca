import { Component, OnInit, ViewChild, ElementRef, NgZone, Renderer2 } from '@angular/core';
import { GoogleMap } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NavController } from '@ionic/angular';
import { GeocodingService } from 'src/app/services/geocoding.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { MapService } from '../../services/map.service';

interface SearchResult {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

@Component({
  selector: 'app-searchbytext',
  templateUrl: './searchbytext.page.html',
  styleUrls: ['./searchbytext.page.scss'],
  standalone: false
})
export class SearchbytextPage implements OnInit {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  
  pickup: string = '';
  destination: string = ''; 
  isPickup!: string;
  searchQuery: string = '';
  searchResults: SearchResult[] = [];
  isLoading: boolean = false;
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
      
      // Set initial search query based on which input we're editing
      if (this.isPickup === 'true') {
        this.searchQuery = this.pickup;
      } else if (this.isPickup === 'false') {
        this.searchQuery = this.destination;
      }
    });
    
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
  }

  ionViewWillEnter() {
    // Hide any existing maps visually when entering this page
    this.renderer.removeClass(document.body, 'map-active');
  }

  ionViewDidEnter() {
    // Hide any existing maps visually when entering this page (but don't destroy them)
    this.renderer.removeClass(document.body, 'map-active');
    
    // Focus on search input when page loads
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    }, 300);
  }

  ionViewWillLeave() {
    // Clean up when leaving the page
    this.renderer.removeClass(document.body, 'map-active');
  }

  async searchLocations() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }

    this.isLoading = true;
    try {
      // Use Google Places Autocomplete API
      const results = await this.getPlacesAutocomplete(this.searchQuery);
      this.zone.run(() => {
        this.searchResults = results;
        this.isLoading = false;
      });
    } catch (error) {
      console.error('Error searching locations:', error);
      this.isLoading = false;
      this.searchResults = [];
    }
  }

  private async getPlacesAutocomplete(query: string): Promise<SearchResult[]> {
    const apiKey = environment.apiKey;
    // Updated URL to handle single character searches better
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&types=geocode&components=country:in&language=en`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK') {
        return data.predictions || [];
      } else {
        console.error('Places API error:', data.status);
        // Fallback to geocoding service
        return await this.getFallbackResults(query);
      }
    } catch (error) {
      console.error('Error fetching places:', error);
      // Fallback to geocoding service
      return await this.getFallbackResults(query);
    }
  }

  private async getFallbackResults(query: string): Promise<SearchResult[]> {
    try {
      // Use the existing geocoding service as fallback
      // For single characters, we'll try to get some basic results
      if (query.length === 1) {
        // For single characters, return some common suggestions
        return [
          {
            place_id: 'fallback_' + Date.now() + '_1',
            description: `${query} - Search for more specific location`,
            structured_formatting: {
              main_text: query,
              secondary_text: 'Type more to see specific locations'
            }
          }
        ];
      }
      
      const location = await this.geocodingService.getLatLngFromAddress(query);
      if (location) {
        const address = await this.geocodingService.getAddressFromLatLng(location.lat, location.lng);
        return [{
          place_id: 'fallback_' + Date.now(),
          description: address,
          structured_formatting: {
            main_text: query,
            secondary_text: address.replace(query, '').trim()
          }
        }];
      }
    } catch (error) {
      console.error('Fallback geocoding error:', error);
    }
    return [];
  }

  async selectLocation(result: SearchResult) {
    try {
      this.isLoading = true;
      
      let location;
      
      if (result.place_id.startsWith('fallback_')) {
        // Use fallback geocoding
        const coords = await this.geocodingService.getLatLngFromAddress(result.description);
        if (coords) {
          location = {
            lat: coords.lat,
            lng: coords.lng
          };
        }
      } else {
        // Get place details using place_id
        const placeDetails = await this.getPlaceDetails(result.place_id);
        if (placeDetails) {
          location = {
            lat: placeDetails.geometry.location.lat,
            lng: placeDetails.geometry.location.lng
          };
        }
      }
      
      if (location) {
        const address = result.description;

        this.zone.run(() => {
          this.selectedLocation = location;
          this.searchQuery = address;
          this.searchResults = [];
        });

        // Update the appropriate service based on isPickup
        if (this.isPickup === 'true') {
          this.userService.setPickup(address);
        } else if (this.isPickup === 'false') {
          this.userService.setDestination(address);
        }

        // Navigate back to tab1
        this.router.navigate(['/tabs/tabs/tab1']);
      }
    } catch (error) {
      console.error('Error selecting location:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async getPlaceDetails(placeId: string): Promise<any> {
    const apiKey = environment.apiKey;
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK') {
        return data.result;
      } else {
        console.error('Place Details API error:', data.status);
        return null;
      }
    } catch (error) {
      console.error('Error fetching place details:', error);
      return null;
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
  }

  onSearchInput(event: any) {
    const query = event.target.value;
    this.searchQuery = query;
    
    // Debounce the search - reduced delay for faster response
    clearTimeout((this as any).searchTimeout);
    (this as any).searchTimeout = setTimeout(() => {
      this.searchLocations();
    }, 200); // Reduced from 300ms to 200ms for faster response
  }

  goBack() {
    this.router.navigate(['/tabs/tabs/tab1']);
  }
}
