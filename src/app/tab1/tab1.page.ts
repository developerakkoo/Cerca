import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType, Marker } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';

interface LatLng {
  lat: number;
  lng: number;
}

interface CabMarker {
  id: string;
  marker: any;
  position: LatLng;
  previousPosition: LatLng;
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnDestroy {
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

  // Cab markers array
  private cabMarkers: CabMarker[] = [];
  private updateInterval: any;

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService
  ) {}

  ionViewDidEnter() {
    this.getCurrentPosition();
  }

  ionViewWillLeave() {
    this.cleanupMap();
  }

  ngOnDestroy() {
    this.cleanupMap();
  }

  private async cleanupMap() {
    if (this.newMap) {
      // Clear cab markers
      await this.clearCabMarkers();
      // Clear update interval
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
      await this.newMap.destroy();
    }
  }

  private async clearCabMarkers() {
    for (const cab of this.cabMarkers) {
      await this.newMap.removeMarker(cab.marker);
    }
    this.cabMarkers = [];
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
    await this.newMap.enableCurrentLocation(false);

    // Create a custom current location marker
    const currentLocationMarker = await this.newMap.addMarker({
      coordinate: {
        lat: lat,
        lng: lng,
      },
      title: 'Your Location',
      snippet: 'You are here',
      iconUrl: 'assets/current-location.svg',
      iconSize: { width: 48, height: 48 },
      iconAnchor: { x: 24, y: 24 }
    });

    
    // Start updating cab positions
    // this.startCabUpdates();
  }

  private async startCabUpdates() {
    // Initial cab markers
    await this.updateCabMarkers();

    // Update cab positions every 5 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateCabMarkers();
    }, 5000);
  }

  private async updateCabMarkers() {
    // Clear existing markers
    await this.clearCabMarkers();

    // Generate random cab positions around current location
    const numCabs = 5; // Number of cabs to show
    for (let i = 0; i < numCabs; i++) {
      const cabPosition = this.generateRandomCabPosition();
      const previousPosition = this.cabMarkers.find(cab => cab.id === `cab-${i}`)?.position || cabPosition;
      
      // Calculate direction for the cab icon
      const direction = this.calculateDirection(previousPosition, cabPosition);
      
      // Use different icons based on direction
      const iconUrl = this.getDirectionalCabIcon(direction);

      const cabMarker = await this.newMap.addMarker({
        coordinate: cabPosition,
        title: `Cab ${i + 1}`,
        snippet: 'Available',
        iconUrl: iconUrl
      });

      this.cabMarkers.push({
        id: `cab-${i}`,
        marker: cabMarker,
        position: cabPosition,
        previousPosition: previousPosition
      });
    }
  }

  private calculateDirection(previous: LatLng, current: LatLng): string {
    const dx = current.lng - previous.lng;
    const dy = current.lat - previous.lat;
    
    // Calculate the angle
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Convert angle to cardinal direction
    if (angle >= -22.5 && angle < 22.5) return 'east';
    if (angle >= 22.5 && angle < 67.5) return 'northeast';
    if (angle >= 67.5 && angle < 112.5) return 'north';
    if (angle >= 112.5 && angle < 157.5) return 'northwest';
    if (angle >= 157.5 || angle < -157.5) return 'west';
    if (angle >= -157.5 && angle < -112.5) return 'southwest';
    if (angle >= -112.5 && angle < -67.5) return 'south';
    return 'southeast';
  }

  private getDirectionalCabIcon(direction: string): string {
    // Return different icon URLs based on direction
    // You'll need to create these icons in your assets folder
    return `assets/cab-${direction}.png`;
  }

  private generateRandomCabPosition(): LatLng {
    // Generate random position within 1km radius
    const radius = 0.01; // Approximately 1km
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radius;
    
    // Add some movement to make it more realistic
    const movementFactor = 0.0001; // Small movement factor
    const movementAngle = Math.random() * 2 * Math.PI;
    
    return {
      lat: this.currentLocation.lat + distance * Math.cos(angle) + movementFactor * Math.cos(movementAngle),
      lng: this.currentLocation.lng + distance * Math.sin(angle) + movementFactor * Math.sin(movementAngle)
    };
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

      // Update current location marker
      await this.newMap.addMarker({
        coordinate: newCenter,
        title: 'Your Location',
        snippet: 'You are here',
        iconUrl: 'assets/current-location.svg',
        iconSize: { width: 48, height: 48 },
        iconAnchor: { x: 24, y: 24 }
      });

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
