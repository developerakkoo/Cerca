import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { GoogleMap, MapType, Marker } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NavController } from '@ionic/angular';
import { GeocodingService } from 'src/app/services/geocoding.service';

@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false
})
export class SearchPage implements OnInit {
  @ViewChild('map') mapRef!: ElementRef<HTMLElement>;
  private map!: GoogleMap;
  
  searchQuery: string = '';
  selectedAddress: string = '';
  selectedAddressDetails: string = '';
  selectedLocation: { lat: number; lng: number } | null = null;

  constructor(
    private geocodingService: GeocodingService,
    private navCtrl: NavController
  ) {}

  async ngOnInit() {
    await this.initializeMap();
  }

  private async initializeMap() {
    this.map = await GoogleMap.create({
      id: 'map2',
      element: document.getElementById('map')!,
      apiKey: environment.apiKey,
      config: {
        mapId: environment.mapId,
        center: {
          lat: 18.5204, // Default to Pune
          lng: 73.8567
        },
        zoom: 18,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      }
    });

    // Listen for map movement
      const position = await this.map.setOnCameraMoveStartedListener((event) =>{
        console.log(event);
      });

      await this.map.setOnCameraIdleListener((event) =>{
        console.log(event);
        this.updateAddressFromLocation(event.latitude, event.longitude);
      });
     
  }

  private async updateAddressFromLocation(lat: number, lng: number) {
    try {
      const address = await this.geocodingService.getAddressFromLatLng(lat, lng);
      this.selectedAddress = address;
      this.selectedLocation = { lat, lng };
      
      console.log(this.selectedAddress);
      // Get detailed address components
      const details = await this.geocodingService.getAddressFromLatLng(lat, lng);
      this.selectedAddressDetails = details;
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
          zoom: 15
        });
        this.updateAddressFromLocation(location.lat, location.lng);
      }
    } catch (error) {
      console.error('Error searching location:', error);
    }
  }

  async confirmLocation() {
    if (this.selectedLocation) {
      // You can emit this location back to the previous page or store it
      this.navCtrl.back();
    }
  }
}
