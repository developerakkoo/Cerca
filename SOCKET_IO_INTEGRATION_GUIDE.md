# 🚖 Cerca Rider App - Socket.IO Integration Guide

## 📋 Overview

This guide documents the complete production-grade Socket.IO integration for the Cerca rider app, built with Ionic Angular.

---

## ✅ What's Been Implemented

### 1. Services Created

#### **Socket Service** (`services/socket.service.ts`)
- ✅ Production-grade Socket.IO wrapper
- ✅ Auto-reconnection with exponential backoff
- ✅ Connection status monitoring
- ✅ TypeScript type safety
- ✅ NgZone integration for change detection
- ✅ Error handling and logging

#### **Ride Service** (`services/ride.service.ts`)
- ✅ Complete ride lifecycle management
- ✅ State management with RxJS
- ✅ Automatic ride restoration on app restart
- ✅ Toast notifications for all events
- ✅ Alert dialogs for important events
- ✅ Local storage persistence

### 2. App Module Configuration
- ✅ Socket.IO module configured with environment URL
- ✅ Auto-reconnection enabled
- ✅ WebSocket transport prioritized

### 3. App Component Integration
- ✅ Socket initialization on app start
- ✅ User authentication integration
- ✅ Ride restoration after app restart
- ✅ Cleanup on app destroy

---

## 🔧 How to Complete the Integration

### Step 1: Update Modal Component (Request Ride)

**File:** `src/app/components/modal/modal.component.ts`

Replace the `goToPayment()` method:

```typescript
import { RideService } from '../../services/ride.service';
import { LoadingController } from '@ionic/angular';

// Add to constructor
constructor(
  private router: Router,
  private userService: UserService,
  private rideService: RideService,
  private loadingCtrl: LoadingController
) {}

// Replace goToPayment() with:
async requestRide() {
  if (!this.areInputsFilled) {
    return;
  }

  const loading = await this.loadingCtrl.create({
    message: 'Requesting ride...'
  });
  await loading.present();

  try {
    // Get current location from user service
    const currentLocation = await this.userService.getCurrentLocationValue();
    
    // For now, using dummy destination coordinates
    // In production, you'd geocode the destination address
    const destinationCoords = {
      latitude: 18.5404,
      longitude: 73.8767
    };

    await this.rideService.requestRide({
      pickupLocation: {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng
      },
      dropoffLocation: destinationCoords,
      pickupAddress: this.pickupInput,
      dropoffAddress: this.destinationInput,
      fare: 150, // Calculate based on distance
      distanceInKm: 5.2, // Calculate using geocoding
      service: this.selectedVehicle,
      rideType: 'normal',
      paymentMethod: 'CASH'
    });

    await loading.dismiss();
    // Navigation handled by RideService
  } catch (error) {
    await loading.dismiss();
    console.error('Error requesting ride:', error);
  }
}
```

**Update HTML:** Change button to call `requestRide()` instead of `goToPayment()`

---

### Step 2: Update Cab Searching Page

**File:** `src/app/pages/cab-searching/cab-searching.page.ts`

```typescript
import { RideService } from 'src/app/services/ride.service';
import { Subscription } from 'rxjs';

export class CabSearchingPage implements OnInit, OnDestroy {
  private rideSubscription: Subscription | null = null;
  
  constructor(
    private animationCtrl: AnimationController,
    private router: Router,
    private rideService: RideService
  ) {}

  ngOnInit() {
    // Listen for ride status changes
    this.rideSubscription = this.rideService.getRideStatus().subscribe(status => {
      if (status === 'accepted') {
        // Driver accepted - navigate to driver details
        // Navigation is handled by RideService
        clearTimeout(this.timeOut);
      } else if (status === 'cancelled') {
        // Ride cancelled - go back
        this.router.navigate(['/tabs/tab1']);
      }
    });
  }

  ngOnDestroy() {
    if (this.rideSubscription) {
      this.rideSubscription.unsubscribe();
    }
    // Don't clear animations as before
  }

  private async cancelSearch() {
    try {
      await this.rideService.cancelRide('User cancelled during search');
    } catch (error) {
      console.error('Cancel error:', error);
      this.router.navigate(['/tabs/tab1']);
    }
  }
}
```

---

### Step 3: Update Driver Details Page

**File:** `src/app/pages/driver-details/driver-details.page.ts`

```typescript
import { RideService, Ride, DriverInfo } from 'src/app/services/ride.service';
import { Subscription } from 'rxjs';

export class DriverDetailsPage implements OnInit, OnDestroy {
  driverDetails: DriverInfo | null = null;
  currentRide: Ride | null = null;
  driverETA: number = 0;
  
  private rideSubscription: Subscription | null = null;
  private etaSubscription: Subscription | null = null;

  constructor(
    private router: Router,
    private rideService: RideService
  ) {
    // Get driver and ride from navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.driverDetails = navigation.extras.state['driver'];
      this.currentRide = navigation.extras.state['ride'];
    }
  }

  ngOnInit() {
    // Subscribe to ride updates
    this.rideSubscription = this.rideService.getCurrentRide().subscribe(ride => {
      if (ride) {
        this.currentRide = ride;
        this.driverDetails = ride.driver || null;
      }
    });

    // Subscribe to ETA updates
    this.etaSubscription = this.rideService.getDriverETA().subscribe(eta => {
      this.driverETA = eta;
    });

    // If no driver details, try to get from ride service
    if (!this.driverDetails) {
      const ride = this.rideService.getCurrentRideValue();
      if (ride?.driver) {
        this.driverDetails = ride.driver;
        this.currentRide = ride;
      }
    }
  }

  ngOnDestroy() {
    if (this.rideSubscription) {
      this.rideSubscription.unsubscribe();
    }
    if (this.etaSubscription) {
      this.etaSubscription.unsubscribe();
    }
  }

  callDriver() {
    if (this.driverDetails?.phone) {
      window.open(`tel:${this.driverDetails.phone}`, '_system');
    }
  }

  chatWithDriver() {
    this.router.navigate(['driver-chat'], {
      state: { driver: this.driverDetails, ride: this.currentRide }
    });
  }

  async cancelRide() {
    // Show cancel modal
    this.router.navigate(['/cancel-order'], {
      state: { ride: this.currentRide }
    });
  }

  goBack() {
    this.router.navigate(['/tabs/tab1']);
  }
}
```

---

### Step 4: Update Active Order Page

**File:** `src/app/pages/active-ordere/active-ordere.page.ts`

```typescript
import { RideService, Ride } from 'src/app/services/ride.service';
import { Subscription } from 'rxjs';

export class ActiveOrderePage implements OnInit, OnDestroy {
  // ... existing properties
  private rideSubscription: Subscription | null = null;
  private locationSubscription: Subscription | null = null;
  currentRide: Ride | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rideService: RideService
  ) {
    // Get ride from navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.currentRide = navigation.extras.state['ride'];
    }
  }

  async ngOnInit() {
    // Subscribe to ride updates
    this.rideSubscription = this.rideService.getCurrentRide().subscribe(ride => {
      if (ride) {
        this.currentRide = ride;
        
        // Update driver and OTP info
        if (ride.driver) {
          this.driver = {
            name: ride.driver.name,
            rating: ride.driver.rating,
            carNumber: ride.driver.vehicleInfo.licensePlate,
            carType: `${ride.driver.vehicleInfo.make} ${ride.driver.vehicleInfo.model}`,
            otp: ride.status === 'in_progress' ? ride.stopOtp : ride.startOtp
          };
        }

        // Handle ride completed
        if (ride.status === 'completed') {
          setTimeout(() => {
            this.showRating = true;
          }, 1000);
        }
      }
    });

    // Subscribe to live location updates
    this.locationSubscription = this.rideService.getDriverLocation().subscribe(location => {
      if (location) {
        this.driverLocation = {
          lat: location.latitude,
          lng: location.longitude
        };
        // Update map marker
        this.updateDriverMarker();
      }
    });

    // Initialize map
    await this.initializeMap();

    // If no ride from state, try to get from service
    if (!this.currentRide) {
      this.currentRide = this.rideService.getCurrentRideValue();
    }
  }

  ngOnDestroy() {
    if (this.rideSubscription) {
      this.rideSubscription.unsubscribe();
    }
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }
    if (this.locationUpdateSubscription) {
      this.locationUpdateSubscription.unsubscribe();
    }
  }

  private async updateDriverMarker() {
    if (this.map && this.driverLocation) {
      // Update driver marker position
      // Your existing marker update logic
    }
  }

  async submitRating() {
    if (this.selectedEmoji === null) return;

    try {
      await this.rideService.submitRating(this.selectedEmoji);
      // Show thank you and rate us modals as before
      this.showRating = false;
      this.showThankYou = true;

      setTimeout(() => {
        this.showThankYou = false;
        this.showRateUs = true;
      }, 2000);
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  }
}
```

---

### Step 5: Update Cancel Order Page

**File:** `src/app/pages/cancel-order/cancel-order.page.ts`

```typescript
import { RideService } from 'src/app/services/ride.service';

export class CancelOrderPage implements OnInit {
  selectedReason: string = '';
  reasons = [
    'Changed my mind',
    'Wrong pickup location',
    'Driver taking too long',
    'Found another ride',
    'Emergency',
    'Other'
  ];

  constructor(
    private router: Router,
    private rideService: RideService,
    private loadingCtrl: LoadingController
  ) {}

  selectReason(reason: string) {
    this.selectedReason = reason;
  }

  async confirmCancel() {
    if (!this.selectedReason) {
      // Show error toast
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Cancelling ride...'
    });
    await loading.present();

    try {
      await this.rideService.cancelRide(this.selectedReason);
      await loading.dismiss();
      // Navigation handled by RideService
    } catch (error) {
      await loading.dismiss();
      console.error('Cancel error:', error);
      this.router.navigate(['/tabs/tab1']);
    }
  }

  goBack() {
    this.router.back();
  }
}
```

---

## 📡 Socket Events Reference

### Events Emitted by Rider App

| Event | Data | When |
|-------|------|------|
| `riderConnect` | `{ userId }` | On socket connection |
| `newRideRequest` | `{ rider, pickupLocation, dropoffLocation, ... }` | When requesting ride |
| `rideCancelled` | `{ rideId, cancelledBy: 'rider', reason }` | When cancelling ride |
| `submitRating` | `{ rideId, rating, review, tags }` | After ride completion |
| `sendMessage` | `{ rideId, message, from: 'rider' }` | When chatting with driver |
| `emergencyAlert` | `{ rideId, userId, location }` | Emergency SOS |

### Events Received by Rider App

| Event | Data | Handler |
|-------|------|---------|
| `riderConnect` | Connection confirmation | Auto-handled |
| `rideRequested` | `Ride` object | Updates UI to "searching" |
| `rideAccepted` | `Ride` with driver info | Shows driver details, navigates |
| `driverLocationUpdate` | `{ location, estimatedTime }` | Updates map |
| `driverArrived` | `Ride` object | Shows START OTP |
| `rideStarted` | `Ride` object | Navigates to active ride |
| `rideLocationUpdate` | `{ location }` | Updates live tracking |
| `rideCompleted` | `Ride` with fare details | Shows rating UI |
| `rideCancelled` | `{ ride, reason }` | Navigates to home |
| `rideError` | `{ message }` | Shows error toast |
| `ratingSubmitted` | Confirmation | Navigates to home |

---

## 🧪 Testing Checklist

### Prerequisites
- [ ] Server running on `environment.apiUrl`
- [ ] User logged in with valid `userId`
- [ ] Location permissions granted

### Complete Flow Test

1. **Request Ride**
   - [ ] Enter pickup and destination
   - [ ] Select vehicle type
   - [ ] Tap "Request Ride"
   - [ ] See "Searching for drivers..." page
   - [ ] Socket emits `newRideRequest`
   - [ ] Receives `rideRequested` confirmation

2. **Driver Accepts**
   - [ ] Receives `rideAccepted` event
   - [ ] Shows driver info alert
   - [ ] Navigates to driver details page
   - [ ] Displays driver name, photo, rating
   - [ ] Displays vehicle info
   - [ ] "Call Driver" button works

3. **Track Driver Arrival**
   - [ ] Receives `driverLocationUpdate` events
   - [ ] Driver marker moves on map
   - [ ] ETA updates in real-time

4. **Driver Arrived**
   - [ ] Receives `driverArrived` event
   - [ ] Shows alert with START OTP
   - [ ] OTP copy button works
   - [ ] Driver shares OTP to start ride

5. **Ride In Progress**
   - [ ] Receives `rideStarted` event
   - [ ] Navigates to active ride page
   - [ ] Shows route on map
   - [ ] Receives `rideLocationUpdate` events
   - [ ] Shows STOP OTP
   - [ ] Live tracking works

6. **Ride Completed**
   - [ ] Receives `rideCompleted` event
   - [ ] Shows fare breakdown
   - [ ] Rating modal appears
   - [ ] Can select rating and add review
   - [ ] Submit rating works
   - [ ] Navigates to home

7. **Cancel Flow**
   - [ ] Cancel button available before ride starts
   - [ ] Shows cancel reasons
   - [ ] Emits `rideCancelled`
   - [ ] Returns to home

### Error Scenarios

- [ ] No internet - shows error message
- [ ] Socket disconnect - auto-reconnects
- [ ] Request timeout - shows timeout error
- [ ] No drivers available - shows appropriate message
- [ ] Driver cancels - handles gracefully

---

## 🔒 Security Best Practices

1. **Authentication**
   - ✅ User ID verified on server
   - ✅ Socket connection authenticated
   - ✅ Ride ownership validated

2. **Data Validation**
   - ⚠️ TODO: Validate all inputs before emitting
   - ⚠️ TODO: Sanitize location coordinates
   - ⚠️ TODO: Validate fare calculations

3. **Rate Limiting**
   - ⚠️ TODO: Implement client-side rate limiting
   - ⚠️ TODO: Prevent spam ride requests

4. **Encryption**
   - ✅ Use WSS (WebSocket Secure) in production
   - ✅ HTTPS for API calls

---

## 🐛 Common Issues & Solutions

### Issue: Socket not connecting
**Solution:** Check `environment.apiUrl` matches server

### Issue: Ride not restoring after app restart
**Solution:** Ensure storage is initialized in services

### Issue: Map not updating with driver location
**Solution:** Check that location updates trigger Angular change detection (using NgZone)

### Issue: Events not firing
**Solution:** Verify socket is connected: `socketService.isConnected()`

---

## 📝 Next Steps

1. **Add Fare Calculation API**
   - Integrate with geocoding service
   - Calculate distance and duration
   - Get fare estimate before requesting

2. **Add Payment Integration**
   - Razorpay SDK integration
   - Wallet payment support
   - Payment confirmation flow

3. **Add Chat Feature**
   - Real-time messaging with driver
   - Message history
   - Typing indicators

4. **Add Notifications**
   - Push notifications for ride events
   - Background location tracking
   - Ride reminders

5. **Add Analytics**
   - Track ride requests
   - Monitor success/cancel rates
   - User behavior analytics

---

## 📞 Support

For issues or questions, check:
- Socket.IO docs: https://socket.io/docs/v4/
- ngx-socket-io: https://www.npmjs.com/package/ngx-socket-io
- Ionic docs: https://ionicframework.com/docs

---

**Last Updated:** 2025-10-12  
**Version:** 1.0.0  
**Status:** ✅ Core services implemented, integration in progress

