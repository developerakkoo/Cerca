import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  NgZone,
  OnInit
} from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';
import { UserService } from '../services/user.service';
import { Subscription } from 'rxjs';
import { ToastController } from '@ionic/angular';

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

  constructor(
    private notification: NotificationService,
    private geocodingService: GeocodingService,
    private userService: UserService,
    private zone: NgZone,
    private toastController: ToastController
  ) {}

  ngAfterViewInit() {
   setTimeout(() => {
    this.getCurrentPosition();
    // this.createMap(18.5213738, 73.8545071);
   },2000)
  }

  ionViewWillLeave() {
    this.cleanupMap();
  }

  ngOnDestroy() {
    if (this.pickupSubscription) {
      this.pickupSubscription.unsubscribe();
    }
    // this.cleanupMap();
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
  async createMap(lat: number, lng: number) {
    try {
      const newMap = await GoogleMap.create({
        id: 'my-map',
        element: this.mapRef.nativeElement,
        apiKey: "AIzaSyADFvEEjDAljOg3u9nBd1154GIZwFWnono",
        config: {
          center: {
            lat: 18.5213738,
            lng: 73.8545071,
          },
          // mapId: environment.mapId,
          zoom: 18,
        },
      });

      this.zone.run(() => {
        this.newMap = newMap;
      });

      await this.newMap.setMapType(MapType.Normal);
      await this.newMap.enableClustering();
      await this.newMap.enableCurrentLocation(true);

      await this.setCurrentLocationMarker(lat, lng);
        this.isMapReady = true;
      this.presentToast("Map is ready");

    } catch (error) {
      console.error('Error creating map:', error);
      this.presentToast(error as string);
      this.zone.run(() => {
        this.isMapReady = true; // Set to true even on error to not block the UI
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
        this.createMap(latitude, longitude);
        this.pickupAddress = await this.geocodingService.getAddressFromLatLng(latitude, longitude);
        this.userService.setCurrentLocation({ lat: latitude, lng: longitude });
      });
    } catch (error) {
      console.error('Error getting location:', error);
      this.isLocationFetched = false;
      this.notification.scheduleNotification({
        title: 'Location Error',
        body: 'Unable to get your current location. Please check location settings.',
        extra: { type: 'error' }
      });
    }
  }

  async recenterToCurrentLocation() {
    try {
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      const { latitude, longitude } = coordinates.coords;
      await this.setCurrentLocationMarker(latitude, longitude);
      this.currentLocation = { lat: latitude, lng: longitude };
    } catch (error) {
      console.error('Error recentering map:', error);
      this.notification.scheduleNotification({
        title: 'Location Error',
        body: 'Unable to recenter. Please check your location settings.',
        extra: { type: 'error' }
      });
    }
  }
}
