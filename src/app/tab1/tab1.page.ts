import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  NgZone,
  OnInit,
  Renderer2
} from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';
import { UserService } from '../services/user.service';
import { Subscription } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { MapService } from '../services/map.service';

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
export class Tab1Page implements OnInit, OnDestroy {
  @ViewChild('map') mapRef!: ElementRef<HTMLElement>;
  newMap!: GoogleMap;
  isKeyboardOpen = false;
  pickupAddress = 'Pune, Maharashtra, India';
  destinationAddress = 'Mumbai, Maharashtra, India';
  isLocationFetched = false;
  isDragging = false;
  isMapReady = false;
  currentLocation: LatLng = { lat: 0, lng: 0 };
  private cabMarkers: CabMarker[] = [];
  private updateInterval: any;
  private currentLocationMarker: string | undefined;
  private pickupSubscription: Subscription | null = null;
  private isCreatingMap = false; // Flag to prevent multiple map creations

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private renderer: Renderer2,
    private toastController: ToastController,
    private mapService: MapService
  ) {}

  ngAfterViewInit() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Only get current position if no map exists and we're not already creating one
        if (!this.mapService.isTab1MapReady() && !this.isMapReady && !this.isCreatingMap) {
          this.getCurrentPosition();
        }
      }, 500); // Give enough time for DOM to settle
    });
  }
  

  ionViewWillLeave() {
    // this.cleanupMap();
    this.renderer.removeClass(document.body, 'map-active');
  }

  ionViewDidEnter() {
    // Set current map type to tab1
    this.mapService.setCurrentMapType('tab1');
    
    // Check if tab1 map already exists
    if (this.mapService.isTab1MapReady()) {
      console.log('Tab1 map exists, restoring it...');
      this.newMap = this.mapService.getTab1Map()!;
      this.isMapReady = true;
      this.renderer.addClass(document.body, 'map-active');
      
      // Ensure map elements are visible
      this.ensureMapVisibility();
      
      console.log('Successfully restored existing tab1 map');
    } else {
      console.log('No tab1 map exists, creating new one...');
      // Only destroy search map and create fresh tab1 map if no tab1 map exists
      this.mapService.destroySearchMap().then(() => {
        // Only get current position if no map exists and not already creating
        if (!this.mapService.isTab1MapReady() && !this.isMapReady && !this.isCreatingMap) {
          console.log('Creating new tab1 map...');
          this.getCurrentPosition();
        }
      });
    }
  }

  private ensureMapVisibility() {
    // Ensure map elements are visible when returning to tab1
    const mapElement = document.getElementById('map');
    const mapContainer = document.querySelector('.map-container');
    
    if (mapElement) {
      mapElement.style.display = 'block';
      mapElement.style.visibility = 'visible';
      mapElement.style.opacity = '1';
      mapElement.style.pointerEvents = 'auto';
    }
    
    if (mapContainer) {
      (mapContainer as HTMLElement).style.display = 'block';
      (mapContainer as HTMLElement).style.visibility = 'visible';
      (mapContainer as HTMLElement).style.opacity = '1';
      (mapContainer as HTMLElement).style.pointerEvents = 'auto';
    }
  }


  ngOnDestroy() {
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    // Don't destroy the map here, let the service handle it
    this.renderer.removeClass(document.body, 'map-active');
  }

  ngOnInit() {
    this.initializePickupSubscription();
    this.getPickUpAddress();
    this.getDestinationAddress();
  }

  private initializePickupSubscription() {
    // Unsubscribe from any existing subscription
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }

    // Create new subscription
    this.pickupSubscription = this.userService.pickup$.subscribe(pickup => {
      if (pickup) {
        this.pickupAddress = pickup;
        console.log("Pickup Address Updated:", this.pickupAddress);
        // You can add any additional logic here that needs to run when pickup address changes
        // For example, update map markers, recalculate routes, etc.
      }
    });
  }


  async presentToast(msg:string) {
    const toast = await this.toastController.create({
      message: msg,
      duration: 2000
    });
    toast.present();
  }
  private async cleanupMap() {
    if (this.newMap) {
      await this.clearCabMarkers();
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
      await this.newMap.destroy();
      this.newMap = undefined as any;
    }
  }

  private async clearCabMarkers() {
    for (const cab of this.cabMarkers) {
      await this.newMap.removeMarker(cab.marker);
    }
    this.cabMarkers = [];
  }

  getPickUpAddress() {
    this.userService.pickup$.subscribe(pickup => {
      this.pickupAddress = pickup;
      console.log("Pickup Address On Tab1");
      console.log(this.pickupAddress);
    });
  }

  getDestinationAddress() {
    this.userService.destination$.subscribe(destination => {
      this.destinationAddress = destination;
    });
    console.log("Destination Address On Tab1");
    console.log(this.destinationAddress);
  }

  //Create the map with the current location
  async createMap(lat: number, lng: number) {
    try {
      // Check if map element exists
      const mapElement = document.getElementById('map');
      console.log('Map element found:', !!mapElement, 'Element:', mapElement);
      
      // Check if map already exists to prevent double creation
      if (this.mapService.isTab1MapReady()) {
        console.log('Tab1 map already exists, reusing it');
        this.newMap = this.mapService.getTab1Map()!;
        this.zone.run(() => {
          this.isMapReady = true;
        });
        this.ensureMapVisibility();
        return;
      }
      
      // Always destroy existing tab1 map first
      await this.mapService.destroyTab1Map();
      
      // Use the shared map service for tab1
      this.newMap = await this.mapService.createTab1Map('map', lat, lng);
      
      console.log('Map created in tab1:', !!this.newMap);
      
      this.zone.run(() => {
        this.isMapReady = true;
      });

      await this.newMap.enableClustering();
      await this.setCurrentLocationMarker(lat, lng);
      
      // Ensure map is visible
      this.ensureMapVisibility();
    
    } catch (error) {
      console.error('Error creating map:', error);
      // Only show toast if it's a real error, not just map already exists
      if (!this.mapService.isTab1MapReady()) {
        this.presentToast("Error creating map");
      }
      this.zone.run(() => {
        this.isMapReady = true;
      });
    }
  }

  private async setCurrentLocationMarker(lat: number, lng: number) {
    if (this.currentLocationMarker) {
      await this.newMap.removeMarker(this.currentLocationMarker);
    }
    const marker = await this.newMap.addMarker({
      coordinate: { lat, lng },
      title: 'Your Location',
      snippet: 'You are here',
      iconUrl: 'assets/current-location.png',
      iconSize: { width: 48, height: 48 },
      iconAnchor: { x: 24, y: 24 }
    });
    this.currentLocationMarker = marker;
  }

  private async startCabUpdates() {
    await this.updateCabMarkers();
    this.updateInterval = setInterval(() => {
      this.zone.run(() => this.updateCabMarkers());
    }, 5000);
  }

  private async updateCabMarkers() {
    await this.clearCabMarkers();
    const numCabs = 5;
    for (let i = 0; i < numCabs; i++) {
      const cabPosition = this.generateRandomCabPosition();
      const previousPosition = this.cabMarkers.find(cab => cab.id === `cab-${i}`)?.position || cabPosition;
      const direction = this.calculateDirection(previousPosition, cabPosition);
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
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
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
    return `assets/cab-${direction}.png`;
  }

  private generateRandomCabPosition(): LatLng {
    const radius = 0.01;
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radius;
    const movementFactor = 0.0001;
    const movementAngle = Math.random() * 2 * Math.PI;
    return {
      lat: this.currentLocation.lat + distance * Math.cos(angle) + movementFactor * Math.cos(movementAngle),
      lng: this.currentLocation.lng + distance * Math.sin(angle) + movementFactor * Math.sin(movementAngle)
    };
  }

  async getCurrentPosition() {
    try {
      // Prevent multiple simultaneous map creations
      if (this.isCreatingMap) {
        console.log('Map creation already in progress, skipping...');
        return;
      }

      if (!navigator.onLine) {
        this.notification.scheduleNotification({
          title: 'No Internet',
          body: 'Please check your internet connection.',
          extra: { type: 'error' }
        });
        return;
      }
  
      const permission = await Geolocation.checkPermissions();
      if (permission.location === 'denied') {
        await Geolocation.requestPermissions();
        this.notification.scheduleNotification({
          title: 'Permission Denied',
          body: 'Location access denied. Please enable it from settings.',
          extra: { type: 'error' }
        });
        return;
      }
  
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
  
      const { latitude, longitude } = coordinates.coords;
      this.zone.run(async () => {
        this.isLocationFetched = true;
        this.currentLocation = { lat: latitude, lng: longitude }; // Set current location
        this.isCreatingMap = true; // Set flag before creating map
        try {
          await this.createMap(latitude, longitude);
        } finally {
          this.isCreatingMap = false; // Clear flag after map creation
        }
        this.pickupAddress = await this.geocodingService.getAddressFromLatLng(latitude, longitude);
        this.userService.setCurrentLocation({ lat: latitude, lng: longitude });
      });
    } catch (error) {
      console.error('Error getting location:', error);
      this.isLocationFetched = false;
      this.isCreatingMap = false; // Clear flag on error
      this.notification.scheduleNotification({
        title: 'Location Error',
        body: 'Unable to get your current location. Please check location settings.',
        extra: { type: 'error' }
      });
    }
  }
}
