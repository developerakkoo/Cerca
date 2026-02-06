import { Injectable } from '@angular/core';
import { GoogleMap } from '@capacitor/google-maps';
import { environment } from '../../environments/environment';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteAnimationOptions {
  basePolylineColor?: string;
  basePolylineWeight?: number;
  basePolylineOpacity?: number;
  animatedPolylineColor?: string;
  animatedPolylineWeight?: number;
  animatedPolylineOpacity?: number;
  duration?: number;
  maxPoints?: number;
  addMarkers?: boolean;
  pickupAddress?: string;
  destinationAddress?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private readonly DEFAULT_BASE_COLOR = '#CCCCCC';
  private readonly DEFAULT_BASE_WEIGHT = 3;
  private readonly DEFAULT_BASE_OPACITY = 0.6;
  private readonly DEFAULT_ANIMATED_COLOR = '#333652'; // Brand primary color
  private readonly DEFAULT_ANIMATED_WEIGHT = 6;
  private readonly DEFAULT_ANIMATED_OPACITY = 1.0;
  private readonly DEFAULT_DURATION = 800;
  private readonly MAX_DURATION = 1200;
  private readonly DEFAULT_MAX_POINTS = 250;

  private activeAnimations: Map<string, number> = new Map();
  private routeCache: Map<string, LatLng[]> = new Map();

  /**
   * Load Google Maps JavaScript API if not already loaded
   */
  private async ensureGoogleMapsAPI(): Promise<void> {
    if (typeof google !== 'undefined' && google.maps) {
      return; // Already loaded
    }

    return new Promise((resolve, reject) => {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // Wait for it to load
        existingScript.addEventListener('load', () => {
          if (typeof google !== 'undefined' && google.maps) {
            resolve();
          } else {
            reject(new Error('Google Maps API failed to load'));
          }
        });
        existingScript.addEventListener('error', () => {
          reject(new Error('Google Maps API script failed to load'));
        });
        return;
      }

      // Load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.getApiKey()}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (typeof google !== 'undefined' && google.maps) {
          resolve();
        } else {
          reject(new Error('Google Maps API failed to initialize'));
        }
      };
      script.onerror = () => {
        reject(new Error('Failed to load Google Maps API script'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Get Google Maps API key from environment
   */
  private getApiKey(): string {
    return environment.apiKey;
  }

  /**
   * Fetch route from Google Directions API and animate it
   */
  async fetchAndAnimateRoute(
    map: GoogleMap,
    origin: LatLng,
    destination: LatLng,
    options?: RouteAnimationOptions
  ): Promise<{ basePolylineId: string; animatedPolylineId: string; pickupMarkerId?: string; destinationMarkerId?: string }> {
    // Cancel any existing animation for this map
    await this.cancelAnimation(map);

    // Validate inputs
    if (!this.isValidCoordinate(origin) || !this.isValidCoordinate(destination)) {
      throw new Error('Invalid coordinates provided');
    }

    // Ensure Google Maps JavaScript API is loaded
    try {
      await this.ensureGoogleMapsAPI();
    } catch (error) {
      console.error('Failed to load Google Maps JavaScript API:', error);
      throw new Error('Google Maps JavaScript API not available');
    }

    try {
      // Fetch route
      const route = await this.fetchRoute(origin, destination);

      if (!route || route.length === 0) {
        throw new Error('No route found');
      }

      // Animate the route
      return await this.animateRoute(map, route, origin, destination, options);
    } catch (error) {
      console.error('Error fetching and animating route:', error);
      throw error;
    }
  }

  /**
   * Fetch route from Google Directions API
   */
  private async fetchRoute(origin: LatLng, destination: LatLng): Promise<LatLng[]> {
    // Create cache key
    const cacheKey = `${origin.lat},${origin.lng}_${destination.lat},${destination.lng}`;

    // Check cache
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    return new Promise((resolve, reject) => {
      const directionsService = new google.maps.DirectionsService();

      const request: google.maps.DirectionsRequest = {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      };

      directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          try {
            const route = result.routes[0];
            
            // Try to get encoded polyline first (more efficient)
            let path: LatLng[] = [];
            
            // Handle overview_polyline - can be string or object with points property
            const overviewPolyline = route.overview_polyline as any;
            let encodedPolyline: string | null = null;
            
            if (overviewPolyline) {
              if (typeof overviewPolyline === 'string') {
                encodedPolyline = overviewPolyline;
              } else if (overviewPolyline.points && typeof overviewPolyline.points === 'string') {
                encodedPolyline = overviewPolyline.points;
              }
            }
            
            if (encodedPolyline) {
              // Decode encoded polyline
              path = this.decodePolyline(encodedPolyline);
            } else {
              // Fallback: extract from route legs
              route.legs.forEach((leg) => {
                leg.steps.forEach((step) => {
                  step.path.forEach((point) => {
                    path.push({
                      lat: point.lat(),
                      lng: point.lng(),
                    });
                  });
                });
              });
            }

            // Cache the route
            if (path.length > 0) {
              this.routeCache.set(cacheKey, path);
              resolve(path);
            } else {
              reject(new Error('Empty route path'));
            }
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
  }

  /**
   * Decode Google's encoded polyline string to array of LatLng
   */
  private decodePolyline(encoded: string): LatLng[] {
    const poly: LatLng[] = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      poly.push({
        lat: lat * 1e-5,
        lng: lng * 1e-5,
      });
    }

    return poly;
  }

  /**
   * Simplify route using Douglas-Peucker algorithm
   */
  simplifyRoute(points: LatLng[], maxPoints: number = this.DEFAULT_MAX_POINTS): LatLng[] {
    if (points.length <= maxPoints) {
      return points;
    }

    // Calculate adaptive tolerance based on route length
    const routeLength = this.calculateRouteLength(points);
    const tolerance = routeLength / 10000; // Adaptive tolerance

    // Apply Douglas-Peucker simplification
    const simplified = this.douglasPeucker(points, tolerance);

    // If still too many points, use uniform sampling
    if (simplified.length > maxPoints) {
      return this.uniformSample(simplified, maxPoints);
    }

    return simplified;
  }

  /**
   * Douglas-Peucker line simplification algorithm
   */
  private douglasPeucker(points: LatLng[], tolerance: number): LatLng[] {
    if (points.length <= 2) {
      return points;
    }

    // Find the point with maximum distance from line between first and last point
    let maxDistance = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(points[i], first, last);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      // Recursively simplify both segments
      const leftSegment = this.douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const rightSegment = this.douglasPeucker(points.slice(maxIndex), tolerance);

      // Combine results (remove duplicate point at maxIndex)
      return [...leftSegment.slice(0, -1), ...rightSegment];
    } else {
      // Return only endpoints
      return [first, last];
    }
  }

  /**
   * Calculate perpendicular distance from point to line segment
   */
  private perpendicularDistance(point: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
    const dx = lineEnd.lng - lineStart.lng;
    const dy = lineEnd.lat - lineStart.lat;
    const mag = Math.sqrt(dx * dx + dy * dy);

    if (mag < 1e-10) {
      return this.haversineDistance(point, lineStart);
    }

    const u = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (mag * mag);
    const clampedU = Math.max(0, Math.min(1, u));
    const closestPoint: LatLng = {
      lng: lineStart.lng + clampedU * dx,
      lat: lineStart.lat + clampedU * dy,
    };

    return this.haversineDistance(point, closestPoint);
  }

  /**
   * Uniform sampling to reduce points
   */
  private uniformSample(points: LatLng[], maxPoints: number): LatLng[] {
    if (points.length <= maxPoints) {
      return points;
    }

    const sampled: LatLng[] = [];
    const step = points.length / maxPoints;

    for (let i = 0; i < maxPoints; i++) {
      const index = Math.floor(i * step);
      sampled.push(points[index]);
    }

    // Always include the last point
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }

    return sampled;
  }

  /**
   * Normalize point spacing for smooth animation
   */
  normalizePointSpacing(points: LatLng[], targetSpacing: number = 50): LatLng[] {
    if (points.length <= 1) {
      return points;
    }

    const normalized: LatLng[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const distance = this.haversineDistance(prev, curr);

      if (distance > targetSpacing) {
        // Interpolate intermediate points
        const numSegments = Math.ceil(distance / targetSpacing);
        for (let j = 1; j < numSegments; j++) {
          const t = j / numSegments;
          normalized.push({
            lat: prev.lat + (curr.lat - prev.lat) * t,
            lng: prev.lng + (curr.lng - prev.lng) * t,
          });
        }
      }

      normalized.push(curr);
    }

    return normalized;
  }

  /**
   * Animate route drawing on map
   */
  private async animateRoute(
    map: GoogleMap,
    route: LatLng[],
    origin: LatLng,
    destination: LatLng,
    options?: RouteAnimationOptions
  ): Promise<{ basePolylineId: string; animatedPolylineId: string }> {
    // Merge options with defaults
    const opts = {
      basePolylineColor: options?.basePolylineColor || this.DEFAULT_BASE_COLOR,
      basePolylineWeight: options?.basePolylineWeight || this.DEFAULT_BASE_WEIGHT,
      basePolylineOpacity: options?.basePolylineOpacity || this.DEFAULT_BASE_OPACITY,
      animatedPolylineColor: options?.animatedPolylineColor || this.DEFAULT_ANIMATED_COLOR,
      animatedPolylineWeight: options?.animatedPolylineWeight || this.DEFAULT_ANIMATED_WEIGHT,
      animatedPolylineOpacity: options?.animatedPolylineOpacity || this.DEFAULT_ANIMATED_OPACITY,
      duration: options?.duration || this.DEFAULT_DURATION,
      maxPoints: options?.maxPoints || this.DEFAULT_MAX_POINTS,
      addMarkers: options?.addMarkers !== undefined ? options.addMarkers : true,
      pickupAddress: options?.pickupAddress,
      destinationAddress: options?.destinationAddress,
    };

    // Simplify and normalize route
    let simplifiedRoute = this.simplifyRoute(route, opts.maxPoints);
    simplifiedRoute = this.normalizePointSpacing(simplifiedRoute);

    // Calculate dynamic duration based on route length
    const routeLength = this.calculateRouteLength(simplifiedRoute);
    const dynamicDuration = Math.min(
      opts.duration + (routeLength / 1000) * 400,
      this.MAX_DURATION
    );

    // Add markers if requested
    let pickupMarkerId: string | undefined;
    let destinationMarkerId: string | undefined;
    
    if (options?.addMarkers !== false) {
      pickupMarkerId = await this.addPickupMarker(map, origin, options?.pickupAddress);
      destinationMarkerId = await this.addDestinationMarker(map, destination, options?.destinationAddress);
    }

    // Phase 1: Fit bounds to show both locations
    await this.animateCameraPhase1(map, origin, destination);

    // Draw base polyline (full path, immediately)
    const basePolylineResult = await map.addPolylines([
      {
        path: simplifiedRoute,
        strokeColor: opts.basePolylineColor,
        strokeOpacity: opts.basePolylineOpacity,
        strokeWeight: opts.basePolylineWeight,
      },
    ]);

    const basePolylineId = basePolylineResult[0];

    // Create animated polyline (start with first point to ensure it's visible)
    const animatedPolylineResult = await map.addPolylines([
      {
        path: simplifiedRoute.length > 0 ? [simplifiedRoute[0]] : [],
        strokeColor: opts.animatedPolylineColor,
        strokeOpacity: opts.animatedPolylineOpacity,
        strokeWeight: opts.animatedPolylineWeight,
      },
    ]);

    const animatedPolylineId = animatedPolylineResult[0];

    // Phase 2: Keep camera stable during animation
    await this.animateCameraPhase2(map, origin, destination);

    // Animate the route
    await this.progressiveReveal(
      map,
      animatedPolylineId,
      simplifiedRoute,
      dynamicDuration
    );

    // Phase 3: Slight zoom-in after animation completes
    await this.animateCameraPhase3(map, origin, destination);

    const result: { basePolylineId: string; animatedPolylineId: string; pickupMarkerId?: string; destinationMarkerId?: string } = {
      basePolylineId,
      animatedPolylineId,
    };

    if (pickupMarkerId) {
      result.pickupMarkerId = pickupMarkerId;
    }
    if (destinationMarkerId) {
      result.destinationMarkerId = destinationMarkerId;
    }

    return result;
  }

  /**
   * Progressive reveal animation using requestAnimationFrame
   */
  private async progressiveReveal(
    map: GoogleMap,
    polylineId: string,
    route: LatLng[],
    duration: number
  ): Promise<void> {
    if (route.length === 0) {
      console.warn('Route is empty, skipping animation');
      return;
    }

    return new Promise((resolve) => {
      const startTime = performance.now();
      const totalPoints = route.length;
      let lastUpdateTime = startTime;
      const updateInterval = 50; // Update every ~50ms (20fps for polyline updates, smoother visual)
      let currentPolylineId = polylineId;
      let lastPointsShown = 1; // Start from 1 since we already have the first point
      let pendingUpdate = false;
      let animationFrameId: number | null = null;

      const animate = async (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Apply cubic ease-out easing
        const easedProgress = this.cubicEaseOut(progress);

        // Calculate how many points to show
        const pointsToShow = Math.max(1, Math.floor(easedProgress * totalPoints));

        // Only update if we have more points to show and enough time has passed
        const pointsDiff = pointsToShow - lastPointsShown;
        const timeSinceLastUpdate = currentTime - lastUpdateTime;

        if (pointsDiff >= 1 && timeSinceLastUpdate >= updateInterval && !pendingUpdate) {
          pendingUpdate = true;
          const currentPath = route.slice(0, pointsToShow + 1);

          try {
            // Remove old polyline
            await map.removePolylines([currentPolylineId]).catch(() => {
              // Ignore errors if polyline doesn't exist
            });

            // Add updated polyline
            const result = await map.addPolylines([
              {
                path: currentPath,
                strokeColor: this.DEFAULT_ANIMATED_COLOR,
                strokeOpacity: this.DEFAULT_ANIMATED_OPACITY,
                strokeWeight: this.DEFAULT_ANIMATED_WEIGHT,
              },
            ]);

            if (result && result.length > 0) {
              currentPolylineId = result[0];
              lastPointsShown = pointsToShow;
              lastUpdateTime = currentTime;
            }
          } catch (error) {
            console.error('Error updating polyline:', error);
          } finally {
            pendingUpdate = false;
          }
        }

        if (progress < 1) {
          // Continue animation
          animationFrameId = requestAnimationFrame(animate);
          this.activeAnimations.set(polylineId, animationFrameId);
        } else {
          // Animation complete - ensure final path is shown
          if (!pendingUpdate) {
            try {
              await map.removePolylines([currentPolylineId]).catch(() => {});
              await map.addPolylines([
                {
                  path: route,
                  strokeColor: this.DEFAULT_ANIMATED_COLOR,
                  strokeOpacity: this.DEFAULT_ANIMATED_OPACITY,
                  strokeWeight: this.DEFAULT_ANIMATED_WEIGHT,
                },
              ]);
            } catch (error) {
              console.error('Error finalizing polyline:', error);
            }
          }

          this.activeAnimations.delete(polylineId);
          resolve();
        }
      };

      // Start animation immediately
      animationFrameId = requestAnimationFrame(animate);
      this.activeAnimations.set(polylineId, animationFrameId);
    });
  }

  /**
   * Cubic ease-out easing function
   */
  private cubicEaseOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Camera animation - Phase 1: Fit bounds
   */
  private async animateCameraPhase1(
    map: GoogleMap,
    origin: LatLng,
    destination: LatLng
  ): Promise<void> {
    try {
      // Calculate bounds
      const minLat = Math.min(origin.lat, destination.lat);
      const maxLat = Math.max(origin.lat, destination.lat);
      const minLng = Math.min(origin.lng, destination.lng);
      const maxLng = Math.max(origin.lng, destination.lng);

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;

      // Calculate zoom level to fit bounds
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const maxDiff = Math.max(latDiff, lngDiff);

      let zoom = 15;
      if (maxDiff > 0.1) zoom = 11;
      else if (maxDiff > 0.05) zoom = 12;
      else if (maxDiff > 0.02) zoom = 13;
      else if (maxDiff > 0.01) zoom = 14;
      else zoom = 15;

      await map.setCamera({
        coordinate: {
          lat: centerLat,
          lng: centerLng,
        },
        zoom: zoom,
        animate: true,
      });

      // Wait for camera animation to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error in camera phase 1:', error);
    }
  }

  /**
   * Camera animation - Phase 2: Keep stable
   */
  private async animateCameraPhase2(
    map: GoogleMap,
    origin: LatLng,
    destination: LatLng
  ): Promise<void> {
    // Camera stays stable during route animation
    // No action needed
  }

  /**
   * Camera animation - Phase 3: Slight zoom-in
   */
  private async animateCameraPhase3(
    map: GoogleMap,
    origin: LatLng,
    destination: LatLng
  ): Promise<void> {
    try {
      // Calculate center point
      const centerLat = (origin.lat + destination.lat) / 2;
      const centerLng = (origin.lng + destination.lng) / 2;

      // Calculate current zoom level based on bounds
      const minLat = Math.min(origin.lat, destination.lat);
      const maxLat = Math.max(origin.lat, destination.lat);
      const minLng = Math.min(origin.lng, destination.lng);
      const maxLng = Math.max(origin.lng, destination.lng);

      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const maxDiff = Math.max(latDiff, lngDiff);

      let currentZoom = 15;
      if (maxDiff > 0.1) currentZoom = 11;
      else if (maxDiff > 0.05) currentZoom = 12;
      else if (maxDiff > 0.02) currentZoom = 13;
      else if (maxDiff > 0.01) currentZoom = 14;
      else currentZoom = 15;

      // Slight zoom-in (increase zoom by 1)
      const newZoom = Math.min(currentZoom + 1, 18);

      await map.setCamera({
        coordinate: {
          lat: centerLat,
          lng: centerLng,
        },
        zoom: newZoom,
        animate: true,
      });
    } catch (error) {
      console.error('Error in camera phase 3:', error);
    }
  }

  /**
   * Cancel ongoing animation
   */
  async cancelAnimation(map: GoogleMap): Promise<void> {
    // Cancel all active animation frames
    this.activeAnimations.forEach((frameId) => {
      cancelAnimationFrame(frameId);
    });
    this.activeAnimations.clear();
  }

  /**
   * Remove route polylines from map
   */
  async removeRoute(map: GoogleMap, polylineIds: string[]): Promise<void> {
    try {
      if (polylineIds.length > 0) {
        await map.removePolylines(polylineIds);
      }
    } catch (error) {
      console.error('Error removing polylines:', error);
    }
  }

  /**
   * Calculate route length in meters
   */
  private calculateRouteLength(points: LatLng[]): number {
    if (points.length < 2) {
      return 0;
    }

    let totalLength = 0;
    for (let i = 1; i < points.length; i++) {
      totalLength += this.haversineDistance(points[i - 1], points[i]);
    }

    return totalLength;
  }

  /**
   * Calculate distance between two points using Haversine formula (in meters)
   */
  private haversineDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Validate coordinate
   */
  private isValidCoordinate(coord: LatLng): boolean {
    return (
      coord &&
      typeof coord.lat === 'number' &&
      typeof coord.lng === 'number' &&
      coord.lat >= -90 &&
      coord.lat <= 90 &&
      coord.lng >= -180 &&
      coord.lng <= 180
    );
  }

  /**
   * Add pickup marker (Uber-style: pin icon)
   */
  private async addPickupMarker(
    map: GoogleMap,
    location: LatLng,
    address?: string
  ): Promise<string> {
    try {
      // Use pin icon for pickup location
      const markerId = await map.addMarker({
        coordinate: location,
        title: 'Pickup',
        snippet: address || 'Pickup location',
        iconUrl: 'assets/icon/home.png',
        iconSize: {
          width: 32,
          height: 32,
        },
      });
      return markerId;
    } catch (error) {
      // Fallback: use default marker (will be styled by platform)
      console.log('Using default marker for pickup (custom icon not found)');
      try {
        return await map.addMarker({
          coordinate: location,
          title: 'Pickup',
          snippet: address || 'Pickup location',
          iconSize: {
            width: 32,
            height: 32,
          },
        });
      } catch (fallbackError) {
        console.error('Error adding pickup marker:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Add destination marker (Uber-style: home icon)
   */
  private async addDestinationMarker(
    map: GoogleMap,
    location: LatLng,
    address?: string
  ): Promise<string> {
    try {
      // Use home icon for destination location
      const markerId = await map.addMarker({
        coordinate: location,
        title: 'Destination',
        snippet: address || 'Destination',
        iconUrl: 'assets/icon/pin.png',
        iconSize: {
          width: 32,
          height: 32,
        },
      });
      return markerId;
    } catch (error) {
      // Fallback: use default marker (will be styled by platform)
      console.log('Using default marker for destination (custom icon not found)');
      try {
        return await map.addMarker({
          coordinate: location,
          title: 'Destination',
          snippet: address || 'Destination',
          iconSize: {
            width: 32,
            height: 32,
          },
        });
      } catch (fallbackError) {
        console.error('Error adding destination marker:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Remove markers
   */
  async removeMarkers(map: GoogleMap, markerIds: string[]): Promise<void> {
    try {
      if (markerIds.length > 0) {
        for (const markerId of markerIds) {
          await map.removeMarker(markerId).catch(() => {
            // Ignore errors if marker doesn't exist
          });
        }
      }
    } catch (error) {
      console.error('Error removing markers:', error);
    }
  }

  /**
   * Clear route cache
   */
  clearCache(): void {
    this.routeCache.clear();
  }
}

