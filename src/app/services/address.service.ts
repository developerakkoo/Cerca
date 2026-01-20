import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { StorageService } from './storage.service';

export interface Address {
  _id?: string;
  addressLine: string;
  landmark?: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  placeId?: string;
  formattedAddress?: string;
  user: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateAddressRequest {
  id: string; // userId
  addressLine: string;
  landmark?: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  placeId?: string;
  formattedAddress?: string;
}

export interface AddressResponse {
  success: boolean;
  data: Address | Address[];
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AddressService {
  private pinnedAddressesSubject = new BehaviorSubject<string[]>([]);
  public pinnedAddresses$ = this.pinnedAddressesSubject.asObservable();
  private readonly PINNED_ADDRESSES_KEY = 'pinned_addresses';

  constructor(
    private http: HttpClient,
    private storageService: StorageService
  ) {
    this.loadPinnedAddresses();
  }

  /**
   * Load pinned addresses from local storage
   */
  private async loadPinnedAddresses(): Promise<void> {
    try {
      const pinned = await this.storageService.get(this.PINNED_ADDRESSES_KEY);
      if (pinned && Array.isArray(pinned)) {
        this.pinnedAddressesSubject.next(pinned);
      } else {
        this.pinnedAddressesSubject.next([]);
      }
    } catch (error) {
      console.error('Error loading pinned addresses:', error);
      this.pinnedAddressesSubject.next([]);
    }
  }

  /**
   * Save pinned addresses to local storage
   */
  private async savePinnedAddresses(addressIds: string[]): Promise<void> {
    try {
      await this.storageService.set(this.PINNED_ADDRESSES_KEY, addressIds);
      this.pinnedAddressesSubject.next(addressIds);
    } catch (error) {
      console.error('Error saving pinned addresses:', error);
    }
  }

  /**
   * Get all addresses for a user
   */
  getUserAddresses(userId: string): Observable<Address[]> {
    return this.http
      .get<AddressResponse>(`${environment.apiUrl}/address/user/${userId}`)
      .pipe(
        map((response) => {
          if (response.success && Array.isArray(response.data)) {
            return response.data;
          }
          return [];
        }),
        catchError((error) => {
          console.error('Error fetching addresses:', error);
          return of([]);
        })
      );
  }

  /**
   * Get a single address by ID
   */
  getAddressById(addressId: string, userId: string): Observable<Address | null> {
    return this.http
      .get<AddressResponse>(`${environment.apiUrl}/address/${addressId}/user/${userId}`)
      .pipe(
        map((response) => {
          if (response.success && response.data && !Array.isArray(response.data)) {
            return response.data as Address;
          }
          return null;
        }),
        catchError((error) => {
          console.error('Error fetching address:', error);
          return of(null);
        })
      );
  }

  /**
   * Create a new address
   */
  createAddress(addressData: CreateAddressRequest): Observable<Address | null> {
    return this.http
      .post<AddressResponse>(`${environment.apiUrl}/address`, addressData)
      .pipe(
        map((response) => {
          if (response.success && response.data && !Array.isArray(response.data)) {
            return response.data as Address;
          }
          return null;
        }),
        catchError((error) => {
          console.error('Error creating address:', error);
          return of(null);
        })
      );
  }

  /**
   * Update an existing address
   */
  updateAddress(
    addressId: string,
    userId: string,
    addressData: Partial<CreateAddressRequest>
  ): Observable<Address | null> {
    return this.http
      .put<AddressResponse>(
        `${environment.apiUrl}/address/${addressId}/user/${userId}`,
        addressData
      )
      .pipe(
        map((response) => {
          if (response.success && response.data && !Array.isArray(response.data)) {
            return response.data as Address;
          }
          return null;
        }),
        catchError((error) => {
          console.error('Error updating address:', error);
          return of(null);
        })
      );
  }

  /**
   * Delete an address
   */
  deleteAddress(addressId: string): Observable<boolean> {
    return this.http
      .delete<AddressResponse>(`${environment.apiUrl}/address/${addressId}`)
      .pipe(
        map((response) => {
          if (response.success) {
            // Remove from pinned addresses if it was pinned
            this.unpinAddress(addressId);
            return true;
          }
          return false;
        }),
        catchError((error) => {
          console.error('Error deleting address:', error);
          return of(false);
        })
      );
  }

  /**
   * Get all pinned address IDs
   */
  getPinnedAddresses(): string[] {
    return this.pinnedAddressesSubject.value;
  }

  /**
   * Check if an address is pinned
   */
  isPinned(addressId: string): boolean {
    return this.pinnedAddressesSubject.value.includes(addressId);
  }

  /**
   * Pin an address
   */
  async pinAddress(addressId: string): Promise<void> {
    const currentPinned = this.pinnedAddressesSubject.value;
    if (!currentPinned.includes(addressId)) {
      const updated = [...currentPinned, addressId];
      await this.savePinnedAddresses(updated);
    }
  }

  /**
   * Unpin an address
   */
  async unpinAddress(addressId: string): Promise<void> {
    const currentPinned = this.pinnedAddressesSubject.value;
    const updated = currentPinned.filter((id) => id !== addressId);
    await this.savePinnedAddresses(updated);
  }

  /**
   * Toggle pin status of an address
   */
  async togglePin(addressId: string): Promise<boolean> {
    if (this.isPinned(addressId)) {
      await this.unpinAddress(addressId);
      return false;
    } else {
      await this.pinAddress(addressId);
      return true;
    }
  }
}

