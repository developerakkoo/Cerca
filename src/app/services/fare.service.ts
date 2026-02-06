import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;
  minimumFare: number;
  fareAfterMinimum: number;
  promoCode?: string | null;
  discount: number;
  finalFare: number;
  driverEarnings: number;
  platformFees: number;
  adminEarnings: number;
}

export interface AllFaresResponse {
  success: boolean;
  data: {
    distance: number;
    estimatedDuration: number;
    fares: {
      cercaSmall?: FareBreakdown;
      cercaMedium?: FareBreakdown;
      cercaLarge?: FareBreakdown;
    };
  };
}

export interface SingleFareResponse {
  success: boolean;
  data: {
    distance: number;
    estimatedDuration: number;
    fareBreakdown: FareBreakdown;
    vehicleType: string;
    vehicleServiceKey: string;
  };
}

interface Location {
  latitude: number;
  longitude: number;
}

@Injectable({
  providedIn: 'root'
})
export class FareService {
  private cacheKey = 'fare_calculation_cache';
  private cacheExpiryKey = 'fare_calculation_cache_expiry';
  private readonly CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache

  constructor(private http: HttpClient) {}

  /**
   * Calculate fare for all enabled vehicle types
   * @param pickupLocation Pickup location coordinates
   * @param dropoffLocation Dropoff location coordinates
   * @param promoCode Optional promo code
   * @param userId Optional user ID for promo code validation
   * @returns Observable with fares for all vehicle types
   */
  calculateAllFares(
    pickupLocation: Location,
    dropoffLocation: Location,
    promoCode?: string,
    userId?: string
  ): Observable<AllFaresResponse> {
    const cacheKey = this.getCacheKey(pickupLocation, dropoffLocation, promoCode);
    const cached = this.getCachedFares(cacheKey);
    
    if (cached) {
      return of(cached);
    }

    const body: any = {
      pickupLocation: {
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude
      },
      dropoffLocation: {
        latitude: dropoffLocation.latitude,
        longitude: dropoffLocation.longitude
      }
    };

    if (promoCode && userId) {
      body.promoCode = promoCode;
      body.userId = userId;
    }

    return this.http.post<AllFaresResponse>(`${environment.apiUrl}/rides/calculate-all-fares`, body).pipe(
      tap((response) => {
        if (response.success) {
          this.cacheFares(cacheKey, response);
        }
      }),
      catchError((error) => {
        console.error('Error calculating all fares:', error);
        return of({
          success: false,
          data: {
            distance: 0,
            estimatedDuration: 0,
            fares: {}
          }
        } as AllFaresResponse);
      })
    );
  }

  /**
   * Calculate fare for a single vehicle type
   * @param pickupLocation Pickup location coordinates
   * @param dropoffLocation Dropoff location coordinates
   * @param vehicleType Vehicle type ('small', 'medium', 'large')
   * @param promoCode Optional promo code
   * @param userId Optional user ID for promo code validation
   * @returns Observable with fare breakdown
   */
  calculateFare(
    pickupLocation: Location,
    dropoffLocation: Location,
    vehicleType: 'small' | 'medium' | 'large',
    promoCode?: string,
    userId?: string
  ): Observable<SingleFareResponse> {
    const body: any = {
      pickupLocation: {
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude
      },
      dropoffLocation: {
        latitude: dropoffLocation.latitude,
        longitude: dropoffLocation.longitude
      },
      vehicleType: vehicleType
    };

    if (promoCode && userId) {
      body.promoCode = promoCode;
      body.userId = userId;
    }

    return this.http.post<SingleFareResponse>(`${environment.apiUrl}/rides/calculate-fare`, body).pipe(
      catchError((error) => {
        console.error('Error calculating fare:', error);
        return of({
          success: false,
          data: {
            distance: 0,
            estimatedDuration: 0,
            fareBreakdown: {
              baseFare: 0,
              distanceFare: 0,
              timeFare: 0,
              subtotal: 0,
              minimumFare: 0,
              fareAfterMinimum: 0,
              discount: 0,
              finalFare: 0,
              driverEarnings: 0,
              platformFees: 0,
              adminEarnings: 0
            },
            vehicleType: vehicleType,
            vehicleServiceKey: ''
          }
        } as SingleFareResponse);
      })
    );
  }

  /**
   * Clear fare calculation cache
   */
  clearCache(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.cacheKey) || key.startsWith(this.cacheExpiryKey)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Error clearing fare cache:', error);
    }
  }

  /**
   * Generate cache key from locations and promo code
   */
  private getCacheKey(pickupLocation: Location, dropoffLocation: Location, promoCode?: string): string {
    const pickup = `${pickupLocation.latitude.toFixed(4)},${pickupLocation.longitude.toFixed(4)}`;
    const dropoff = `${dropoffLocation.latitude.toFixed(4)},${dropoffLocation.longitude.toFixed(4)}`;
    const promo = promoCode || '';
    return `${this.cacheKey}_${pickup}_${dropoff}_${promo}`;
  }

  /**
   * Get cached fares if still valid
   */
  private getCachedFares(cacheKey: string): AllFaresResponse | null {
    try {
      const expiryKey = `${this.cacheExpiryKey}_${cacheKey}`;
      const expiry = localStorage.getItem(expiryKey);
      
      if (!expiry || Date.now() > parseInt(expiry, 10)) {
        return null;
      }

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AllFaresResponse;
      }
    } catch (error) {
      console.error('Error reading cached fares:', error);
    }
    return null;
  }

  /**
   * Cache fare calculation result
   */
  private cacheFares(cacheKey: string, response: AllFaresResponse): void {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(response));
      const expiryKey = `${this.cacheExpiryKey}_${cacheKey}`;
      localStorage.setItem(expiryKey, (Date.now() + this.CACHE_DURATION).toString());
    } catch (error) {
      console.error('Error caching fares:', error);
    }
  }
}

