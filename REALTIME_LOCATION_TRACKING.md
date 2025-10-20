# Real-Time Location Tracking Implementation

## Overview
This document describes the real-time location tracking implementation for the active ride page, similar to Ola/Uber's tracking experience.

## Features Implemented

### 1. Dynamic Status Updates
The modal header now displays dynamic status based on ride status:

- **Searching**: "Searching for Driver..."
- **Accepted**: "Driver is Coming" + ETA in minutes
- **Arrived**: "Driver Arrived" + OTP display
- **In Progress**: "Ride in Progress" + "Enjoy your ride! 🚗"
- **Completed**: "Ride Completed" → Shows rating modal
- **Cancelled**: "Ride Cancelled" → Navigates back to home

### 2. Real-Time Driver Location Updates

#### Socket Events Listened:
1. **driverLocationUpdate**: Received when driver is approaching pickup
   - Provides: `{ location, estimatedTime }`
   - Updates driver marker position on map
   - Updates ETA display

2. **rideLocationUpdate**: Received during active ride (in_progress)
   - Provides: `{ location }`
   - Updates driver (vehicle) marker position in real-time
   - Updates route line

#### Map Features:
- **Rider Location Marker**: Shows pickup location with user icon
- **Driver Location Marker**: Shows driver's real-time location with car icon
- **Destination Marker**: Added when ride starts (in_progress status)
- **Route Line**: Dynamic polyline showing actual road route (using Google Directions API)
  - Before ride: Driver → Pickup Location (blue line following roads)
  - During ride: Driver → Destination (blue line following roads)
  - Fallback: Straight line if Directions API fails

### 3. Smart Camera Management
- Auto-adjusts camera to show both driver and target location
- Updates camera every 10 seconds (not too frequently to avoid jerkiness)
- Calculates appropriate zoom based on distance between markers
- Smooth animations using `animate: true`

### 4. Visual Feedback

#### Status-Based UI:
- **Modal Header**: Changes color scheme when ride is in progress
- **OTP Section**: Only shows when status is 'arrived'
- **Action Buttons**: Hidden when ride is completed/cancelled
- **Emergency Button**: Available during all active states

#### ETA Display:
- Shows estimated time in minutes
- Only displayed when driver is coming (not arrived, not in progress)
- Format: "ETA: X mins"

## Technical Implementation

### TypeScript (`active-ordere.page.ts`)

```typescript
// Key Properties
currentRideStatus: RideStatus = 'idle';
statusText = 'Preparing...';
driverLocation: Location;
arrivalTime: string;

// Socket Subscriptions
driverLocationSubscription // Listens to driver location updates
driverETASubscription      // Listens to ETA updates
rideStatusSubscription     // Listens to status changes

// Map Markers
driverMarkerId           // Driver/vehicle marker
userMarkerId            // Rider pickup marker  
destinationMarkerId     // Destination marker (shown during ride)
routeLineId            // Polyline connecting markers
```

### Key Methods

#### `handleRideStatusChange(status)`
- Updates `currentRideStatus` and `statusText`
- Triggers destination marker addition when ride starts
- Manages UI state based on status

#### `updateDriverMarker()`
- Removes old marker and route line
- Adds new marker at updated location
- Redraws route line to appropriate target
- Adjusts camera view (throttled to every 10 seconds)

#### `addDestinationMarker()`
- Adds destination marker when ride status becomes 'in_progress'
- Shows where the rider is heading

### HTML Template Updates

```html
<!-- Dynamic Status Header -->
<h2>{{statusText}}</h2>

<!-- Conditional ETA Display -->
<p *ngIf="!isDriverArrived && currentRideStatus !== 'in_progress' && arrivalTime !== '0'">
  ETA: {{arrivalTime}} mins
</p>

<!-- In Progress Message -->
<p *ngIf="currentRideStatus === 'in_progress'" class="ride-message">
  Enjoy your ride! 🚗
</p>

<!-- Status-Based OTP Section -->
<div *ngIf="isDriverArrived && currentRideStatus === 'arrived'">
  <!-- OTP display -->
</div>
```

## Real-Time Update Flow

### When Driver is Approaching (Accepted Status):
1. Socket receives `driverLocationUpdate` event
2. Updates `driverLocation` and `arrivalTime`
3. Calls `updateDriverMarker()` to refresh map
4. Shows blue line from driver to pickup location
5. Displays "Driver is Coming" with ETA

### When Driver Arrives:
1. Socket receives `driverArrived` event
2. Status changes to 'arrived'
3. Header updates to "Driver Arrived"
4. OTP section becomes visible
5. ETA display hidden

### When Ride Starts:
1. Socket receives `rideStarted` event
2. Status changes to 'in_progress'
3. Header updates to "Ride in Progress"
4. Destination marker added to map
5. Route line now connects driver to destination
6. OTP section hidden

### During Active Ride:
1. Socket receives `rideLocationUpdate` events continuously
2. Driver marker updates in real-time
3. Route line updates to show current path
4. Camera adjusts periodically to keep both markers visible

### When Ride Completes:
1. Socket receives `rideCompleted` event
2. Status changes to 'completed'
3. Rating modal appears after 2 seconds
4. Driver can rate the ride

## Socket Events Summary

| Event | When | Data | Action |
|-------|------|------|--------|
| `rideAccepted` | Driver accepts | Full ride object | Navigate to active-ordere |
| `driverLocationUpdate` | Driver approaching | location, estimatedTime | Update map, show ETA |
| `driverArrived` | At pickup | Ride object | Show OTP |
| `rideStarted` | Ride begins | Ride object | Add destination marker |
| `rideLocationUpdate` | During ride | location | Update driver position |
| `rideCompleted` | Ride ends | Ride object | Show rating |

## Map Markers

| Marker | Icon | When Visible | Purpose |
|--------|------|--------------|---------|
| User/Pickup | `user.png` | Always | Shows rider's pickup location |
| Driver | `cab-east.png` | After acceptance | Shows driver's real-time location |
| Destination | `current-location.png` | During ride | Shows ride destination |

## Visual States

### Route Line Colors:
- **Before Ride**: Dark blue (#0984E3)
- **Thickness**: 5px
- **Opacity**: 0.8

### Modal Header:
- **Normal**: Solid background
- **In Progress**: Gradient background (primary → secondary)

## Performance Optimizations

1. **Camera Updates**: Throttled to max once per 10 seconds
2. **Marker Updates**: Only when location actually changes
3. **Route Recalculation**: Only when needed (status change or location update)

## Testing Checklist

- [ ] Driver location updates smoothly in real-time
- [ ] ETA displays and updates correctly
- [ ] Status changes trigger appropriate UI updates
- [ ] OTP shows only when driver arrives
- [ ] Destination marker appears when ride starts
- [ ] Route line connects correct markers based on status
- [ ] Camera auto-adjusts to show all markers
- [ ] Emergency button available during ride
- [ ] Rating modal appears after completion

## Known Limitations

1. Marker animation: Currently removes and re-adds markers (Capacitor Google Maps doesn't support direct position updates)
2. Camera updates throttled to prevent jerky movements

## Route Drawing Implementation

### How It Works
The route between driver and rider/destination is drawn using **Google Maps JavaScript API Directions Service**:

1. **Get Route Path**: Calls `google.maps.DirectionsService` to get actual road route
2. **Extract Coordinates**: Extracts all step points from route legs
3. **Draw Polyline**: Draws blue polyline following the road path
4. **Update in Real-Time**: Recalculates route whenever driver location updates

### Methods
- `drawRouteToTarget()`: Main route drawing method
- `getDirectionsRoute()`: Fetches route from Google Directions API
- `clearRoute()`: Removes old route before drawing new one
- `drawStraightLine()`: Fallback when API fails

### Error Handling
- Automatically falls back to straight line if Directions API fails
- Graceful degradation without crashing
- Console logs for debugging

**See ROUTE_IMPLEMENTATION.md for detailed documentation**

## Future Enhancements

1. Add smooth marker animations (when supported by library)
2. Show multiple waypoints for rides with stops
3. Add traffic layer toggle
4. ~~Show estimated route path (not just straight line)~~ ✅ DONE
5. Add driver photo to marker popup
6. Add route caching to reduce API calls
7. Show ETA considering live traffic

