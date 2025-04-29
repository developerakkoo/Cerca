import { Component, ElementRef, ViewChild } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType, Marker } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';

interface LatLng {
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page {
  @ViewChild('map')
  mapRef!: ElementRef<HTMLElement>;
  newMap!: GoogleMap;
  isKeyboardOpen = false;
  pickupAddress = 'Pune, Maharashtra, India';
  destinationAddress = 'Mumbai, Maharashtra, India';
  isLocationFetched = false;
  marker!: any;
  isDragging = false;
  centerMarker!: string;
  currentLocation: LatLng = {
    lat: 0,
    lng: 0
  };

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService
  ) {}

  ionViewDidEnter() {
    this.getCurrentPosition();
  }

  ionViewWillLeave() {
    if (this.newMap) {
      this.newMap.destroy();
    }
  }

  async createMap(lat: number, lng: number) {
    this.currentLocation = { lat, lng };
    
    this.newMap = await GoogleMap.create({
      id: 'map',
      element: document.getElementById('map')!,
      apiKey: environment.apiKey,
      forceCreate: true,
      config: {
        mapId: environment.mapId,
        center: {
          lat: lat,
          lng: lng,
        },
        zoom: 18,
        androidLiteMode: false,
      },
    });

    await this.newMap.setMapType(MapType.Normal);
    await this.newMap.enableClustering();
    await this.newMap.enableCurrentLocation(true);

    // Create a fixed center marker
    const marker = await this.newMap.addMarker({
      coordinate: {
        lat: lat,
        lng: lng,
      },
      title: 'Selected Location',
      snippet: 'This is your selected location',
      // iconUrl: 'assets/marker-2.gif', // Make sure to add a custom marker image
    });
    // this.centerMarker = marker;

    // Add map click listener
    this.newMap.setOnMapClickListener(async (event) => {
      if (!this.isDragging) {
        const newCenter: LatLng = {
          lat: event.latitude,
          lng: event.longitude
        };
        
        // Update center marker position
        // await this.newMap.removeMarker(this.centerMarker);
        // const newMarker = await this.newMap.addMarker({
        //   coordinate: newCenter,
        //   title: 'Selected Location',
        //   snippet: 'This is your selected location',
        //   iconUrl: 'assets/marker.png',
        // });
        // this.centerMarker = newMarker;

        // Get address for the new location
        // try {
        //   const address = await this.geocodingService.getAddressFromLatLng(
        //     event.latitude,
        //     event.longitude
        //   );
        //   this.pickupAddress = address;
        //   this.notification.scheduleNotification({
        //     title: 'Location Selected',
        //     body: address,
        //     extra: { type: 'location' }
        //   });
        // } catch (error) {
        //   console.error('Error getting address:', error);
        // }
      }
    });

    this.newMap.initScrolling();
  }

  async getCurrentPosition() {
    try {
      console.log('Getting current position...');
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      const { latitude, longitude } = coordinates.coords;
      console.log('Current position:', latitude, longitude);
      this.isLocationFetched = true;
      this.createMap(latitude, longitude);
      this.pickupAddress = await this.geocodingService.getAddressFromLatLng(latitude, longitude);
    } catch (error) {
      console.error('Error getting location:', error);
      this.isLocationFetched = false;
      this.notification.scheduleNotification({
        title: 'Location Error',
        body: 'Unable to get your current location. Please check your location settings.',
        extra: { type: 'error' }
      });
    }
  }

  // Method to recenter map to current location
  async recenterToCurrentLocation() {
    try {
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      const { latitude, longitude } = coordinates.coords;
      const newCenter: LatLng = {
        lat: latitude,
        lng: longitude
      };

      // Update center marker position
      //  await this.newMap.removeMarker(this.centerMarker);
      const newMarker = await this.newMap.addMarker({
        coordinate: newCenter,
        title: 'Selected Location',
        snippet: 'This is your selected location',
        iconUrl: 'assets/marker.png',
      });
      // this.centerMarker = newMarker;
      this.currentLocation = { lat: latitude, lng: longitude };
    } catch (error) {
      console.error('Error recentering map:', error);
      this.notification.scheduleNotification({
        title: 'Location Error',
        body: 'Unable to get your current location. Please check your location settings.',
        extra: { type: 'error' }
      });
    }
  }
}
