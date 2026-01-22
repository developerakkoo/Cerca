import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, tap, map, switchMap } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { environment } from 'src/environments/environment';

export interface VehicleService {
  name: string;
  price: number;
  seats: number;
  enabled: boolean;
  imagePath: string;
}

export interface VehicleServices {
  cercaSmall: VehicleService;
  cercaMedium: VehicleService;
  cercaLarge: VehicleService;
}

export interface PricingConfigurations {
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  cancellationFees: number;
  platformFees: number;
  driverCommissions: number;
}

const DEFAULT_VEHICLE_SERVICES: VehicleServices = {
  cercaSmall: {
    name: 'Cerca Small',
    price: 299,
    seats: 4,
    enabled: true,
    imagePath: 'assets/cars/cerca-small.png'
  },
  cercaMedium: {
    name: 'Cerca Medium',
    price: 499,
    seats: 6,
    enabled: true,
    imagePath: 'assets/cars/Cerca-medium.png'
  },
  cercaLarge: {
    name: 'Cerca Large',
    price: 699,
    seats: 8,
    enabled: true,
    imagePath: 'assets/cars/cerca-large.png'
  }
};

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private vehicleServicesSubject = new BehaviorSubject<VehicleServices>(DEFAULT_VEHICLE_SERVICES);
  public vehicleServices$ = this.vehicleServicesSubject.asObservable();
  
  private pricingConfigSubject = new BehaviorSubject<PricingConfigurations | null>(null);
  public pricingConfig$ = this.pricingConfigSubject.asObservable();
  
  private cacheKey = 'vehicle_services_cache';
  private cacheExpiryKey = 'vehicle_services_cache_expiry';
  private pricingCacheKey = 'pricing_config_cache';
  private pricingCacheExpiryKey = 'pricing_config_cache_expiry';
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) {
    this.storage.create();
    this.loadCachedServices();
    this.loadCachedPricingConfig();
  }

  /**
   * Fetch vehicle services from backend
   */
  getVehicleServices(): Observable<VehicleServices> {
    // Check cache first
    return this.getCachedServices().pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached);
        }
        
        // Fetch from API
        return this.http.get<VehicleServices>(`${environment.apiUrl}/admin/settings/vehicle-services`).pipe(
          tap((services) => {
            // Update cache
            this.cacheServices(services);
            // Update subject
            this.vehicleServicesSubject.next(services);
          }),
          catchError((error) => {
            console.error('Error fetching vehicle services:', error);
            // Return defaults on error
            this.vehicleServicesSubject.next(DEFAULT_VEHICLE_SERVICES);
            return of(DEFAULT_VEHICLE_SERVICES);
          })
        );
      })
    );
  }

  /**
   * Get vehicle service by type
   */
  getVehicleServiceByType(type: 'small' | 'medium' | 'large'): Observable<VehicleService | null> {
    return this.vehicleServices$.pipe(
      map((services) => {
        switch (type) {
          case 'small':
            return services.cercaSmall?.enabled ? services.cercaSmall : null;
          case 'medium':
            return services.cercaMedium?.enabled ? services.cercaMedium : null;
          case 'large':
            return services.cercaLarge?.enabled ? services.cercaLarge : null;
          default:
            return null;
        }
      })
    );
  }

  /**
   * Get current vehicle services (synchronous)
   */
  getCurrentVehicleServices(): VehicleServices {
    return this.vehicleServicesSubject.value;
  }

  /**
   * Cache vehicle services
   */
  private async cacheServices(services: VehicleServices): Promise<void> {
    try {
      await this.storage.set(this.cacheKey, services);
      await this.storage.set(this.cacheExpiryKey, Date.now() + this.CACHE_DURATION);
    } catch (error) {
      console.error('Error caching vehicle services:', error);
    }
  }

  /**
   * Get cached vehicle services if still valid
   */
  private getCachedServices(): Observable<VehicleServices | null> {
    return new Observable((observer) => {
      this.storage.get(this.cacheExpiryKey).then((expiry) => {
        if (!expiry || Date.now() > expiry) {
          observer.next(null);
          observer.complete();
          return;
        }
        
        this.storage.get(this.cacheKey).then((cached) => {
          observer.next(cached || null);
          observer.complete();
        }).catch(() => {
          observer.next(null);
          observer.complete();
        });
      }).catch(() => {
        observer.next(null);
        observer.complete();
      });
    });
  }

  /**
   * Load cached services on service initialization
   */
  private async loadCachedServices(): Promise<void> {
    try {
      const expiry = await this.storage.get(this.cacheExpiryKey);
      if (expiry && Date.now() < expiry) {
        const cached = await this.storage.get(this.cacheKey);
        if (cached) {
          this.vehicleServicesSubject.next(cached);
        }
      }
    } catch (error) {
      console.error('Error loading cached services:', error);
    }
  }

  /**
   * Fetch pricing configurations from backend
   */
  getPricingConfigurations(): Observable<PricingConfigurations> {
    // Check cache first
    return this.getCachedPricingConfig().pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached);
        }
        
        // Fetch from API (public endpoint)
        return this.http.get<any>(`${environment.apiUrl}/admin/settings/public`).pipe(
          map((settings) => {
            if (settings && settings.pricingConfigurations) {
              return settings.pricingConfigurations;
            }
            // Return defaults if not found
            return {
              baseFare: 0,
              perKmRate: 12,
              minimumFare: 100,
              cancellationFees: 50,
              platformFees: 10,
              driverCommissions: 90
            } as PricingConfigurations;
          }),
          tap((config) => {
            // Update cache
            this.cachePricingConfig(config);
            // Update subject
            this.pricingConfigSubject.next(config);
          }),
          catchError((error) => {
            console.error('Error fetching pricing configurations:', error);
            // Return defaults on error
            const defaults: PricingConfigurations = {
              baseFare: 0,
              perKmRate: 12,
              minimumFare: 100,
              cancellationFees: 50,
              platformFees: 10,
              driverCommissions: 90
            };
            this.pricingConfigSubject.next(defaults);
            return of(defaults);
          })
        );
      })
    );
  }

  /**
   * Get current pricing configurations (synchronous)
   */
  getCurrentPricingConfigurations(): PricingConfigurations | null {
    return this.pricingConfigSubject.value;
  }

  /**
   * Cache pricing configurations
   */
  private async cachePricingConfig(config: PricingConfigurations): Promise<void> {
    try {
      await this.storage.set(this.pricingCacheKey, config);
      await this.storage.set(this.pricingCacheExpiryKey, Date.now() + this.CACHE_DURATION);
    } catch (error) {
      console.error('Error caching pricing configurations:', error);
    }
  }

  /**
   * Get cached pricing configurations if still valid
   */
  private getCachedPricingConfig(): Observable<PricingConfigurations | null> {
    return new Observable((observer) => {
      this.storage.get(this.pricingCacheExpiryKey).then((expiry) => {
        if (!expiry || Date.now() > expiry) {
          observer.next(null);
          observer.complete();
          return;
        }
        
        this.storage.get(this.pricingCacheKey).then((cached) => {
          observer.next(cached || null);
          observer.complete();
        }).catch(() => {
          observer.next(null);
          observer.complete();
        });
      }).catch(() => {
        observer.next(null);
        observer.complete();
      });
    });
  }

  /**
   * Load cached pricing configurations on service initialization
   */
  private async loadCachedPricingConfig(): Promise<void> {
    try {
      const expiry = await this.storage.get(this.pricingCacheExpiryKey);
      if (expiry && Date.now() < expiry) {
        const cached = await this.storage.get(this.pricingCacheKey);
        if (cached) {
          this.pricingConfigSubject.next(cached);
        }
      }
    } catch (error) {
      console.error('Error loading cached pricing configurations:', error);
    }
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  async clearCache(): Promise<void> {
    try {
      await this.storage.remove(this.cacheKey);
      await this.storage.remove(this.cacheExpiryKey);
      await this.storage.remove(this.pricingCacheKey);
      await this.storage.remove(this.pricingCacheExpiryKey);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }
}

