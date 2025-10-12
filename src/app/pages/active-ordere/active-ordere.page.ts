import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, LatLngBounds, MapType } from '@capacitor/google-maps';
import { interval, Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-active-ordere',
  templateUrl: './active-ordere.page.html',
  styleUrls: ['./active-ordere.page.scss'],
  standalone: false,
})
export class ActiveOrderePage implements OnInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  private map!: GoogleMap;
  private driverMarkerId!: string;
  private userMarkerId!: string;
  private routeLineId!: string;
  private locationUpdateSubscription!: Subscription;

  // Dummy data
  driver = {
    name: 'Rajesh Kumar',
    rating: 4.8,
    carNumber: 'MH 12 AB 1234',
    carType: 'Cerca Small',
    otp: '1234'
  };

  // Pune coordinates
  private userLocation = { lat: 18.5204, lng: 73.8567 }; // Pune city center
  private driverLocation = { lat: 18.5304, lng: 73.8667 }; // Slightly away from user
  private destinationCoords = { lat: 18.5404, lng: 73.8767 }; // Further away

  pickupLocation = 'Koregaon Park, Pune';
  destinationLocation = 'Viman Nagar, Pune';
  arrivalTime = '5';
  isDriverArrived = false;

  // Rating properties
  showRating = false;
  showThankYou = false;
  showRateUs = false;
  selectedEmoji: number | null = null;
  emojis = [
    { emoji: '😊', label: 'Great', value: 5 },
    { emoji: '🙂', label: 'Good', value: 4 },
    { emoji: '😐', label: 'Okay', value: 3 },
    { emoji: '🙁', label: 'Poor', value: 2 },
    { emoji: '😞', label: 'Bad', value: 1 }
  ];

  constructor(private route: ActivatedRoute,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.initializeMap();
    this.startLocationUpdates();
  }

  ngOnDestroy() {
    if (this.locationUpdateSubscription) {
      this.locationUpdateSubscription.unsubscribe();
    }
  }

  private async initializeMap() {
    const mapOptions = {
      center: this.userLocation,
      zoom: 18,
      mapId: environment.mapId,
      styles: [], // Add custom styles if needed
    };

    this.map = await GoogleMap.create({
      id: 'mymap',
      element: document.getElementById('mymap')!,
      apiKey: environment.apiKey,
      config: {
        ...mapOptions,
        mapId: environment.mapId,
      }
    }, (data) => {
      console.log("map created");
      console.log(data);
    });

    // Add user marker
    const userMarkerResult = await this.map.addMarker({
      coordinate: this.userLocation,
      title: 'Your Location',
      snippet: 'You are here',
      iconSize: {
        width: 40,
        height: 40
      },
      iconUrl: 'assets/user.png',
    });
    this.userMarkerId = userMarkerResult;

    // Add driver marker
    const driverMarkerResult = await this.map.addMarker({
      coordinate: this.driverLocation,
      title: 'Driver Location',
      snippet: this.driver.name,
      iconUrl: 'assets/cab-east.png',
      iconSize: {
        width: 40,
        height: 40
      },
    });
    this.driverMarkerId = driverMarkerResult;

    // Draw route line
    const polylineResult = await this.map.addPolylines([{
      path: [this.driverLocation, this.userLocation],
      strokeColor: '#333652',
      strokeOpacity: 0.8,
    }]);
    this.routeLineId = polylineResult[0];

    // Fit map to show both markers
    await this.map.setCamera({
      coordinate: {
        lat: (this.userLocation.lat + this.driverLocation.lat) / 2,
        lng: (this.userLocation.lng + this.driverLocation.lng) / 2,
      },
      zoom: 14,
    });
  }

  private startLocationUpdates() {
    // Simulate driver movement every 2 seconds
    this.locationUpdateSubscription = interval(2000).subscribe(async () => {
      // Move driver closer to user
      this.driverLocation = {
        lat: this.driverLocation.lat + (this.userLocation.lat - this.driverLocation.lat) * 0.1,
        lng: this.driverLocation.lng + (this.userLocation.lng - this.driverLocation.lng) * 0.1,
      };

      // Update driver marker
      // await this.map.moveMarker({
      //   id: this.driverMarkerId,
      //   coordinate: this.driverLocation,
      // });

      // // Update route line
      // await this.map.movePolylines([{
      //   id: this.routeLineId,
      //   path: [this.driverLocation, this.userLocation],
      // }]);

      // Calculate and update arrival time
      this.updateArrivalTime();

      // Check if driver has arrived
      this.checkDriverArrival();
    });
  }

  private updateArrivalTime() {
    // Calculate distance between driver and user
    const distance = this.calculateDistance(
      this.driverLocation,
      this.userLocation
    );
    
    // Assuming average speed of 30 km/h
    const timeInMinutes = Math.ceil((distance / 30) * 60);
    this.arrivalTime = timeInMinutes.toString();
  }

  private checkDriverArrival() {
    const distance = this.calculateDistance(
      this.driverLocation,
      this.userLocation
    );

    // If driver is within 100 meters, consider them arrived
    if (distance < 0.1) {
      this.isDriverArrived = true;
      this.locationUpdateSubscription.unsubscribe();
      
      // Show rating modal after 3 seconds
      setTimeout(() => {
        this.showRating = true;
      }, 3000);
    }
  }

  private calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLon = this.toRad(point2.lng - point1.lng);
    const lat1 = this.toRad(point1.lat);
    const lat2 = this.toRad(point2.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  selectEmoji(value: number) {
    this.selectedEmoji = value;
  }

  async submitRating() {
    if (this.selectedEmoji === null) return;

    // Here you would typically send the rating to your backend
    console.log('Rating submitted:', this.selectedEmoji);

    // Show thank you message
    this.showRating = false;
    this.showThankYou = true;

    // Show rate us modal after thank you message
    setTimeout(() => {
      this.showThankYou = false;
      this.showRateUs = true;
    }, 2000);
  }

  rateOnStore() {
    // Here you would typically open the app store
    const storeUrl = this.isIOS() 
      ? 'https://apps.apple.com/app/your-app-id'
      : 'https://play.google.com/store/apps/details?id=your.app.id';
    
    window.open(storeUrl, '_blank');
    this.showRateUs = false;
  }

  skipRating() {
    this.showRateUs = false;
    this.router.navigate(['tabs','tab1']);
  }

  private isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  navigateToDriverDetails() {
    this.router.navigate(['driver-details']);
  }

  chatWithDriver() {
    this.router.navigate(['driver-chat']);
  }
}
