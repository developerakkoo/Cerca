# Tab1 Page Complete Specification

This document provides a complete specification for recreating the Tab1 page with all its functionality. Use this as a reference when rebuilding the page from scratch.

## Table of Contents
1. [Overview](#overview)
2. [Dependencies & Imports](#dependencies--imports)
3. [Component Structure](#component-structure)
4. [State Management](#state-management)
5. [Lifecycle Hooks](#lifecycle-hooks)
6. [Map Initialization](#map-initialization)
7. [Location Services](#location-services)
8. [User Service Subscriptions](#user-service-subscriptions)
9. [Router Navigation Handling](#router-navigation-handling)
10. [Methods Reference](#methods-reference)
11. [HTML Template](#html-template)
12. [SCSS Styling](#scss-styling)
13. [Key Features](#key-features)
14. [iOS Compatibility Notes](#ios-compatibility-notes)

---

## Overview

Tab1 is the main home page of the app that displays:
- A full-screen Google Map using Capacitor Google Maps
- Current user location marker
- Pickup and destination address inputs via `app-modal` component
- Loading overlay during map initialization
- Custom header with notification dot

**Key Characteristics:**
- Uses Capacitor Google Maps (native map, not web-based)
- Requires location permissions
- Manages map lifecycle based on navigation
- Subscribes to UserService for pickup/destination updates
- Handles router navigation events for proper map cleanup

---

## Dependencies & Imports

### TypeScript Imports

```typescript
import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  NgZone,
  OnInit,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../services/notification.service';
import { GeocodingService } from '../services/geocoding.service';
import { UserService } from '../services/user.service';
import { PermissionService } from '../services/permission.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
```

### Interfaces

```typescript
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
```

### Module Dependencies

The page requires these modules (from `tab1.module.ts`):
- `IonicModule`
- `CommonModule`
- `FormsModule`
- `TranslateModule`
- `ExploreContainerComponentModule`
- `Tab1PageRoutingModule`
- `SharedModule` (contains `app-header` and `app-modal`)

---

## Component Structure

### Component Decorator

```typescript
@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {
  // ...
}
```

### ViewChild Reference

```typescript
@ViewChild('map') mapRef!: ElementRef<HTMLElement>;
```

---

## State Management

### Public Properties

```typescript
newMap!: GoogleMap;                    // GoogleMap instance
isKeyboardOpen = false;                // Keyboard state (for modal)
pickupAddress = 'Pune, Maharashtra, India';      // Default pickup address
destinationAddress = 'Mumbai, Maharashtra, India'; // Default destination address
isLocationFetched = false;             // Location fetch status
isDragging = false;                    // Map dragging state (unused currently)
isMapReady = false;                    // Map initialization status
currentLocation: LatLng = { lat: 0, lng: 0 }; // Current GPS coordinates
```

### Private Properties

```typescript
private cabMarkers: CabMarker[] = [];           // Cab markers array (currently unused)
private updateInterval: any;                     // Interval for cab updates (disabled)
private currentLocationMarker: string | undefined; // Current location marker ID
private pickupSubscription: Subscription | null = null;      // Pickup address subscription
private destinationSubscription: Subscription | null = null; // Destination subscription
private routerSubscription: Subscription | null = null;      // Router events subscription
private isCleanupInProgress = false;            // Cleanup flag to prevent concurrent cleanups
private isMapCreationInProgress = false;         // Map creation flag to prevent concurrent creations
private previousRoute: string = '';               // Previous route for navigation tracking
private routerInitDebounceTimeout: any = null;   // Debounce timeout for router events
```

### Constructor Dependencies

```typescript
constructor(
  private notification: NotificationService,
  private geocodingService: GeocodingService,
  private userService: UserService,
  private zone: NgZone,
  private toastController: ToastController,
  private permissionService: PermissionService,
  private router: Router
) {}
```

---

## Lifecycle Hooks

### ngOnInit()

**Purpose:** Initialize subscriptions and router event listeners

**Key Actions:**
1. Initialize `previousRoute` from current router URL
2. Initialize pickup subscription
3. Get pickup address from UserService
4. Get destination address from UserService
5. Subscribe to router NavigationEnd events to handle map lifecycle

**Router Event Handling:**
- Detects navigation TO tab1 → initializes map (debounced 300ms)
- Detects navigation AWAY from tab1 → cleans up map
- Uses `isTab1Route()` helper to check if route is tab1

### ngAfterViewInit()

**Purpose:** Currently empty, but available for ViewChild initialization

### ionViewWillEnter()

**Purpose:** Backup lifecycle hook - fires before view enters

**Action:** Calls `initializeMap()`

### ionViewDidEnter()

**Purpose:** Primary lifecycle hook - fires after view is entered

**Action:** Calls `initializeMap()`

### ionViewDidLeave()

**Purpose:** Cleanup when leaving the page

**Action:** Calls `cleanupMap()`

### ngOnDestroy()

**Purpose:** Final cleanup on component destruction

**Actions:**
1. Unsubscribe from all subscriptions (pickup, destination, router)
2. Clear update interval if exists
3. Clear router debounce timeout if exists
4. Note: Map cleanup is handled by `ionViewDidLeave`, not here

---

## Map Initialization

### initializeMap()

**Purpose:** Main map initialization method (idempotent)

**Flow:**
1. **Guard Checks:**
   - Prevents multiple simultaneous initializations (`isMapCreationInProgress`)
   - Waits for cleanup to complete if in progress (max 2 seconds)

2. **State Reset:**
   - Sets `isMapReady = false` (shows loading overlay)
   - Sets `isLocationFetched = false`

3. **Cleanup Existing Map:**
   - If map exists, calls `cleanupMap()`
   - Otherwise resets map-related state

4. **Element Ready Check:**
   - Retries up to 5 times (200ms intervals) for `mapRef.nativeElement` to be ready
   - If element not ready after retries, sets `isMapReady = true` and returns

5. **Location Fetch:**
   - Once element is ready, calls `getCurrentPosition()`

**Key Features:**
- Idempotent - safe to call multiple times
- Handles element readiness with retries
- Prevents race conditions with flags

### createMap(lat: number, lng: number)

**Purpose:** Creates the GoogleMap instance

**Flow:**
1. **Validation:**
   - Verifies `mapRef` and `mapRef.nativeElement` exist
   - Throws error if not available

2. **Map Creation:**
   ```typescript
   const newMap = await GoogleMap.create({
     id: 'map', // Unique ID for tab1 page
     element: this.mapRef.nativeElement,
     apiKey: environment.apiKey,
     config: {
       fullscreenControl: false,
       mapTypeControl: false,
       streetViewControl: false,
       zoomControl: false,
       gestureHandling: 'greedy',
       keyboardShortcuts: false,
       scrollwheel: false,
       disableDoubleClickZoom: true,
       androidLiteMode: false,
       center: { lat, lng },
       mapId: environment.mapId,
       zoom: 18,
       colorScheme: 'dark',
     },
   });
   ```

3. **Post-Creation Operations:**
   - `setMapType(MapType.Normal)`
   - Wait 100ms for native view readiness
   - `enableCurrentLocation(false)` - disable native location, use GPS
   - `setCamera()` - center map on coordinates
   - `setCurrentLocationMarker()` - add location marker
   - Set `isMapReady = true` and `isMapCreationInProgress = false`

4. **Error Handling:**
   - Catches errors and sets appropriate flags
   - For element errors, keeps loading overlay visible
   - For other errors, hides loading overlay

**Important:** This method should be simplified to match search page pattern:
- Set `isMapReady = true` immediately after creation
- Defer other operations (setMapType, enableCurrentLocation, setCamera, setCurrentLocationMarker) in a setTimeout(500ms)

---

## Location Services

### getCurrentPosition()

**Purpose:** Fetches current GPS location

**Flow:**
1. **Internet Check:**
   - Checks `navigator.onLine`
   - Shows toast and notification if offline

2. **Permission Request:**
   - Calls `permissionService.requestLocationPermission()`
   - Handles denied permissions:
     - Permanently denied → shows settings alert
     - Can ask again → shows toast and notification

3. **Location Fetch:**
   - Uses `Geolocation.getCurrentPosition()` with:
     - `enableHighAccuracy: true` (GPS, not network)
     - `timeout: 20000` (20 seconds)
     - `maximumAge: 0` (no cache, fresh location)
   - Race with 25-second timeout promise

4. **Accuracy Validation:**
   - Warns if accuracy > 50 meters

5. **Success Actions:**
   - Updates `currentLocation`
   - Sets `isLocationFetched = true`
   - Calls `createMap(latitude, longitude)`
   - Fetches address via `geocodingService.getAddressFromLatLng()`
   - Updates `pickupAddress`
   - Calls `userService.setCurrentLocation()`

6. **Error Handling:**
   - Timeout → toast and notification
   - Denied → toast
   - Generic → toast and notification

### recenterToCurrentLocation()

**Purpose:** Recenters map to current location

**Flow:**
1. Check location permission
2. Request permission if not granted
3. Get current position (same config as `getCurrentPosition()`)
4. Update location marker via `setCurrentLocationMarker()`
5. Update `currentLocation`
6. Call `setCamera()` to recenter map
7. Show success toast

---

## User Service Subscriptions

### initializePickupSubscription()

**Purpose:** Subscribe to pickup address changes

**Flow:**
1. Unsubscribe from existing subscription if any
2. Subscribe to `userService.pickup$`
3. Update `pickupAddress` when pickup changes
4. Log changes

### getPickUpAddress()

**Purpose:** Get and subscribe to pickup address

**Flow:**
1. Unsubscribe from existing subscription
2. Subscribe to `userService.pickup$`
3. Update `pickupAddress`
4. Log address

### getDestinationAddress()

**Purpose:** Get and subscribe to destination address

**Flow:**
1. Unsubscribe from existing subscription
2. Subscribe to `userService.destination$`
3. Update `destinationAddress`
4. Log address

---

## Router Navigation Handling

### Router Subscription (in ngOnInit)

**Purpose:** Handle map lifecycle based on navigation

**Flow:**
1. Subscribe to `router.events` filtered for `NavigationEnd`
2. Track previous route and current route
3. **Navigating TO tab1:**
   - Clear pending debounce timeout
   - Debounce map initialization (300ms)
   - Call `initializeMap()`
4. **Navigating AWAY from tab1:**
   - Clear pending initialization timeout
   - Call `cleanupMap()`
5. Update `previousRoute` for next event

### isTab1Route(url: string)

**Purpose:** Check if URL is tab1 route

**Returns:** `true` if URL matches:
- `/tabs/tabs/tab1`
- Contains `/tabs/tabs/tab1`
- Contains `/tabs/tab1`

---

## Methods Reference

### Map Management

#### cleanupMap()
- **Purpose:** Clean up map instance and related state
- **Flow:**
  1. Guard against concurrent cleanups
  2. Clear cab markers
  3. Clear update interval
  4. Destroy map instance
  5. Reset all map-related state
  6. Clear marker references
- **Error Handling:** Resets flags even on error

#### clearCabMarkers()
- **Purpose:** Remove all cab markers from map
- **Flow:** Iterates through `cabMarkers` and removes each marker
- **Note:** Currently unused (cab updates disabled)

### Marker Management

#### setCurrentLocationMarker(lat: number, lng: number)
- **Purpose:** Add/update current location marker
- **Flow:**
  1. Remove existing marker if present
  2. Add new marker with:
     - Coordinate: `{ lat, lng }`
     - Title: "Your Location"
     - Snippet: "You are here"
     - Icon: `assets/current-location.png`
     - Icon size: `{ width: 48, height: 48 }`
     - Icon anchor: `{ x: 24, y: 24 }`
  3. Store marker ID in `currentLocationMarker`

### Utility Methods

#### presentToast(msg: string)
- **Purpose:** Show toast notification
- **Config:** Duration 2000ms

#### clearUpdateInterval()
- **Purpose:** Clear cab update interval
- **Note:** Currently unused

#### calculateDirection(previous: LatLng, current: LatLng)
- **Purpose:** Calculate direction between two points
- **Returns:** Direction string (east, northeast, north, etc.)
- **Note:** Currently unused (cab updates disabled)

#### getDirectionalCabIcon(direction: string)
- **Purpose:** Get cab icon path for direction
- **Returns:** `assets/cab-${direction}.png`
- **Note:** Currently unused (cab updates disabled)

---

## HTML Template

### Structure

```html
<app-header [showNotificationDot]="true"></app-header>

<ion-content [fullscreen]="true">
  <!-- Loading Overlay -->
  <div class="loading-overlay" *ngIf="!isMapReady">
    <div class="loading-container">
      <div class="loading-animation">
        <div class="circle circle-1"></div>
        <div class="circle circle-2"></div>
        <div class="circle circle-3"></div>
      </div>
      <div class="loading-text">
        <h2>{{ 'HOME.loadingMap' | translate }}</h2>
        <p class="typewriter-text">{{ 'HOME.initializingLocation' | translate }}</p>
      </div>
    </div>
  </div>

  <div class="map-container">
    <capacitor-google-map #map id="map"></capacitor-google-map>
  </div>
  
  <app-modal 
    [pickupInput]="pickupAddress" 
    (pickupInputChange)="pickupAddress = $event"
    [destinationInput]="destinationAddress" 
    (destinationInputChange)="destinationAddress = $event"
    [isKeyboardOpen]="isKeyboardOpen" 
    [isLocationFetched]="isLocationFetched">
  </app-modal>
</ion-content>
```

### Key Elements

1. **app-header:** Custom header component with notification dot
2. **ion-content:** Fullscreen content wrapper
3. **loading-overlay:** Shown when `!isMapReady`
4. **map-container:** Wrapper div for map element
5. **capacitor-google-map:** Native Google Map element with `#map` reference
6. **app-modal:** Modal component for pickup/destination inputs

---

## SCSS Styling

### Critical Styles for iOS Compatibility

```scss
:host {
  background: transparent !important;
}

ion-content {
  --background: transparent !important;
  background: transparent !important;
}

.map-container {
  position: relative;
  width: 100%;
  height: 100%;
  // Debug borders (remove in production)
  border: 2px solid red;
  background: rgba(0, 255, 0, 0.3);
}

capacitor-google-map {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  // Debug borders (remove in production)
  background: rgba(255, 0, 255, 0.3);
  border: 1px solid blue;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: var(--ion-color-primary);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### Loading Animation Styles

- Three pulsing circles with staggered delays
- Typewriter text effect with blinking cursor
- Responsive text sizing
- Dark mode support

### Key Styling Notes

- **Transparency:** Required for Capacitor Google Maps to render beneath webview
- **Position:** `relative` for container and map element (not `absolute` or `fixed`)
- **Height:** `100%` (not `100vh`) to work with `ion-content`
- **Z-index:** Loading overlay at 1000, map at default

---

## Key Features

### 1. Map Lifecycle Management
- Initializes on page enter (via lifecycle hooks and router events)
- Cleans up on page leave
- Prevents concurrent initializations/cleanups
- Handles element readiness with retries

### 2. Location Services
- High-accuracy GPS location
- Permission handling with fallbacks
- Accuracy validation
- Address geocoding
- Location marker management

### 3. User Service Integration
- Subscribes to pickup address changes
- Subscribes to destination address changes
- Updates current location in UserService

### 4. Router Navigation Handling
- Detects navigation TO tab1 → initializes map
- Detects navigation AWAY from tab1 → cleans up map
- Debounced initialization to prevent rapid calls

### 5. Loading States
- Loading overlay during map initialization
- Location fetch status tracking
- Map ready state management

### 6. Error Handling
- Internet connectivity checks
- Permission denial handling
- Location timeout handling
- Map creation error handling
- Graceful degradation

---

## iOS Compatibility Notes

### Critical Requirements

1. **Transparency Settings:**
   - `:host` and `ion-content` must have `background: transparent !important`
   - Required for Capacitor Google Maps to render correctly

2. **Map Element Styling:**
   - Use `position: relative` (not `absolute` or `fixed`)
   - Use `display: block`
   - Use `width: 100%; height: 100%` (not `100vh`)
   - Container should also be `position: relative` with `width: 100%; height: 100%`

3. **Map Initialization:**
   - Set `isMapReady = true` immediately after `GoogleMap.create()`
   - Defer other operations (setMapType, enableCurrentLocation, setCamera, setCurrentLocationMarker) in a setTimeout(500ms)
   - This prevents fatal errors from accessing map before it's fully ready

4. **Map Configuration:**
   - Use simplified config matching search page:
     ```typescript
     config: {
       mapId: environment.mapId,
       center: { lat, lng },
       zoom: 18,
       disableDefaultUI: true,
       zoomControl: false,
       mapTypeControl: false,
       streetViewControl: false,
       fullscreenControl: false,
     }
     ```
   - Remove: `gestureHandling`, `keyboardShortcuts`, `scrollwheel`, `disableDoubleClickZoom`, `androidLiteMode`, `colorScheme`

5. **Element Reference:**
   - Always use `this.mapRef.nativeElement` (not `document.getElementById()`)
   - Verify element exists before creating map
   - Retry element readiness check if needed

6. **Lifecycle Hooks:**
   - Use both `ionViewWillEnter` and `ionViewDidEnter` for initialization
   - Use `ionViewDidLeave` for cleanup
   - Router events as backup for lifecycle hooks

### Recommended Implementation Pattern (from search page)

```typescript
async createMap(lat: number, lng: number) {
  const newMap = await GoogleMap.create({
    id: 'map',
    element: this.mapRef.nativeElement,
    apiKey: environment.apiKey,
    config: {
      mapId: environment.mapId,
      center: { lat, lng },
      zoom: 18,
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    },
  });

  // Set ready immediately
  this.zone.run(() => {
    this.newMap = newMap;
    this.isMapReady = true;
    this.isMapCreationInProgress = false;
  });

  // Defer other operations
  setTimeout(async () => {
    try {
      await newMap.setMapType(MapType.Normal);
      await newMap.enableCurrentLocation(false);
      await newMap.setCamera({
        coordinate: { lat, lng },
        zoom: 18,
        animate: false,
      });
      await this.setCurrentLocationMarker(lat, lng);
    } catch (error) {
      console.warn('Map operations failed (non-critical):', error);
    }
  }, 500);
}
```

---

## Environment Variables Required

- `environment.apiKey` - Google Maps API key
- `environment.mapId` - Google Maps Map ID

---

## Translation Keys Required

- `HOME.loadingMap` - Loading map text
- `HOME.initializingLocation` - Initializing location text

---

## Assets Required

- `assets/current-location.png` - Current location marker icon (48x48px)

---

## Notes for Recreation

1. **Start Simple:** Begin with basic map creation matching search page pattern
2. **Add Features Incrementally:** Add location services, subscriptions, router handling one at a time
3. **Test on iOS:** Test map rendering on iOS device frequently
4. **Remove Debug Styles:** Remove debug borders and backgrounds before production
5. **Error Handling:** Ensure all async operations have try-catch blocks
6. **Subscription Cleanup:** Always unsubscribe in `ngOnDestroy`
7. **Lifecycle Management:** Use both Ionic lifecycle hooks and router events for reliability

---

## Testing Checklist

- [ ] Map renders correctly on iOS
- [ ] Map renders correctly on Android
- [ ] Location permission flow works
- [ ] Current location marker displays
- [ ] Pickup/destination addresses update from UserService
- [ ] Map initializes on page enter
- [ ] Map cleans up on page leave
- [ ] Router navigation triggers map lifecycle correctly
- [ ] Loading overlay shows/hides correctly
- [ ] Error handling works for all failure cases
- [ ] No memory leaks (check subscriptions cleanup)
- [ ] No console errors

---

**End of Specification**

