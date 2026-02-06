import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject, Observable, tap, of, switchMap, map, catchError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { WalletService } from './wallet.service';
import { Router } from '@angular/router';
import { SocketService } from './socket.service';
import { StorageService } from './storage.service';

export interface User {
  id?: string;
  email?: string;
  name?: string;
  photoURL?: string;
  phoneNumber?: string;
  isLoggedIn: boolean;
  isActive?: boolean;
  preferences?: {
    notifications: boolean;
    darkMode: boolean;
    language: string;
  };
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const initialUserState: User = {
  isLoggedIn: false,
  preferences: {
    notifications: true,
    darkMode: false,
    language: 'en',
  },
};

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private userSubject = new BehaviorSubject<any>(initialUserState);
  public user$ = this.userSubject.asObservable();

  private currentLocationSubject = new BehaviorSubject<{
    lat: number;
    lng: number;
  }>({ lat: 0, lng: 0 });
  public currentLocation$ = this.currentLocationSubject.asObservable();

  // Pickup and Destination
  private isPickupSubject = new BehaviorSubject<boolean>(false);
  public isPickup$ = this.isPickupSubject.asObservable();

  private pickupSubject = new BehaviorSubject<string>('');
  public pickup$ = this.pickupSubject.asObservable();

  private destinationSubject = new BehaviorSubject<string>('');
  public destination$ = this.destinationSubject.asObservable();

  private walletBalanceSubject = new BehaviorSubject<number>(100); // Initial balance of ₹1000

  // Pending ride details
  private pendingRideDetailsSubject = new BehaviorSubject<any>(null);
  public pendingRideDetails$ = this.pendingRideDetailsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private storage: Storage,
    private walletService: WalletService,
    private router: Router,
    private socketService: SocketService,
    private storageService: StorageService
  ) {
    this.storage.create();
    // Load user data from storage on service initialization
    this.loadUserFromStorage();
    
    // Subscribe to wallet balance updates from WalletService
    this.walletService.walletBalance$.subscribe((balance) => {
      this.walletBalanceSubject.next(balance);
    });
  }

  async loadUserFromStorage() {
    try {
      const storedUser = await this.storage.get('user');
      if (storedUser) {
        try {
          const parsedUser = typeof storedUser === 'string' ? JSON.parse(storedUser) : storedUser;
          // If user data exists and has isLoggedIn flag, restore it
          if (parsedUser && parsedUser.isLoggedIn) {
            this.userSubject.next(parsedUser);
          } else {
            this.userSubject.next(initialUserState);
          }
        } catch (error) {
          console.error('Error parsing stored user data:', error);
          this.userSubject.next(initialUserState);
        }
      } else {
        this.userSubject.next(initialUserState);
      }
    } catch (error) {
      console.error('Error loading user from storage:', error);
      this.userSubject.next(initialUserState);
    }
  }

  async saveUserToStorage(user: any) {
    await this.storage.set('user', JSON.stringify(user));
  }

  // Get current user data
  getCurrentUser(): any {
    return this.userSubject.value;
  }

  // Get user as observable
  getUser(): Observable<any> {
    return this.user$;
  }

  // Set complete user data
  setUser(user: any) {
    return this.http.post(`${environment.apiUrl}/users`, user).pipe(
      tap((response: any) => {
        const updatedUser = {
          ...response,
          isLoggedIn: true,
          updatedAt: new Date(),
        };
        this.userSubject.next(updatedUser);
        this.saveUserToStorage(updatedUser);
      })
    );
  }

  // Update specific user fields
  updateUser(updates: Partial<any>) {
    const currentUser = this.userSubject.value;
    const updatedUser = {
      ...currentUser,
      ...updates,
      updatedAt: new Date(),
    };

    return this.http
      .put(`${environment.apiUrl}/users/${currentUser.id}`, updates)
      .pipe(
        tap((response: any) => {
          const finalUser = {
            ...currentUser,
            ...response,
            updatedAt: new Date(),
          };
          this.userSubject.next(finalUser);
          this.saveUserToStorage(finalUser);
        })
      );
  }

  // Update user preferences
  updatePreferences(preferences: Partial<any['preferences']>) {
    const currentUser = this.userSubject.value;
    const updatedPreferences = {
      ...currentUser.preferences,
      ...preferences,
    };
    this.updateUser({ preferences: updatedPreferences as any['preferences'] });
  }

  // Login user
  login(userData: any) {
    // const updatedUser = {
    //   ...this.userSubject.value,
    //   ...userData,
    //   isLoggedIn: true,
    //   lastLogin: new Date(),
    //   updatedAt: new Date()
    // };
    // this.userSubject.next(updatedUser);
    // this.saveUserToStorage(updatedUser);
    return this.http.post(`${environment.apiUrl}/users/login`, userData);
  }

  // Logout user
  async logout() {
    // Clear all storage keys
    await this.storage.remove('user');
    await this.storage.remove('userId');
    await this.storage.remove('token');
    await this.storage.remove('tokenExpiry');
    await this.storage.remove('lastLoginTime');
    
    // Also clear via StorageService for consistency
    await this.storageService.remove('user');
    await this.storageService.remove('userId');
    await this.storageService.remove('token');
    await this.storageService.remove('tokenExpiry');
    await this.storageService.remove('lastLoginTime');
    
    // Disconnect socket
    try {
      await this.socketService.disconnect();
    } catch (error) {
      console.error('Error disconnecting socket during logout:', error);
    }
    
    // Reset user state
    this.userSubject.next(initialUserState);
  }
  
  /**
   * Check if user has stored credentials (token and user data)
   * Simple check - no validation
   */
  async hasStoredCredentials(): Promise<boolean> {
    try {
      const userData = await this.storage.get('user');
      const token = await this.storage.get('token');
      const userId = await this.storage.get('userId');
      
      return !!(userData && token && userId);
    } catch (error) {
      console.error('Error checking stored credentials:', error);
      return false;
    }
  }
  
  /**
   * Restore user session from storage (simple - no validation)
   */
  async restoreSession(): Promise<boolean> {
    try {
      const userData = await this.storage.get('user');
      const token = await this.storage.get('token');
      const userId = await this.storage.get('userId');
      
      if (!userData || !token || !userId) {
        return false;
      }
      
      // Parse user data
      let user;
      try {
        user = typeof userData === 'string' ? JSON.parse(userData) : userData;
      } catch (e) {
        console.error('Error parsing user data:', e);
        return false;
      }
      
      // Restore user session
      user.isLoggedIn = true;
      this.userSubject.next(user);
      
      return true;
    } catch (error) {
      console.error('Error restoring session:', error);
      return false;
    }
  }

  // Check if user is logged in
  isUserLoggedIn(): boolean {
    return this.userSubject.value.isLoggedIn;
  }

  // Get user preferences
  getUserPreferences(): any['preferences'] {
    return this.userSubject.value.preferences;
  }

  // Update specific preference
  updatePreference<K extends keyof any['preferences']>(
    key: K,
    value: any['preferences'][K]
  ) {
    const currentPreferences = this.userSubject.value.preferences;
    this.updatePreferences({
      ...currentPreferences,
      [key]: value,
    });
  }

  // Clear user data
  clearUserData() {
    this.userSubject.next(initialUserState);
    this.storage.remove('user');
  }

  // Pickup and Destination
  setPickup(pickup: any) {
    this.pickupSubject.next(pickup);
  }

  setDestination(destination: any) {
    this.destinationSubject.next(destination);
  }

  setCurrentLocation(location: { lat: number; lng: number }) {
    this.currentLocationSubject.next(location);
  }

  setIsPickup(isPickup: boolean) {
    this.isPickupSubject.next(isPickup);
  }

  getPickup(): string {
    return this.pickupSubject.value;
  }

  getDestination(): string {
    return this.destinationSubject.value;
  }

  getCurrentLocation(): { lat: number; lng: number } {
    return this.currentLocationSubject.value;
  }

  getWalletBalance(): Observable<number> {
    return this.walletBalanceSubject.asObservable();
  }

  /**
   * Deduct from wallet using WalletService
   * Note: This method now requires userId and should be called with proper context
   */
  deductFromWallet(amount: number, userId?: string, rideId?: string): Observable<boolean> {
    return new Observable((observer) => {
      if (!userId) {
        // Fallback to local behavior if no userId provided (for backward compatibility)
        const currentBalance = this.walletBalanceSubject.value;
        if (currentBalance >= amount) {
          this.walletBalanceSubject.next(currentBalance - amount);
          observer.next(true);
        } else {
          observer.next(false);
        }
        observer.complete();
        return;
      }

      // Use WalletService for API call
      this.walletService
        .deductFromWallet(userId, { amount, rideId, description: `Ride payment of ₹${amount}` })
        .subscribe({
          next: (response) => {
            observer.next(response.success);
            observer.complete();
          },
          error: (error) => {
            console.error('Error deducting from wallet:', error);
            observer.next(false);
            observer.complete();
          },
        });
    });
  }

  /**
   * Add to wallet using WalletService
   * Note: This method now requires userId and payment details
   */
  addToWallet(
    amount: number,
    userId?: string,
    paymentGatewayTransactionId?: string
  ): Observable<boolean> {
    return new Observable((observer) => {
      if (!userId) {
        // Fallback to local behavior if no userId provided (for backward compatibility)
        const currentBalance = this.walletBalanceSubject.value;
        this.walletBalanceSubject.next(currentBalance + amount);
        observer.next(true);
        observer.complete();
        return;
      }

      // Use WalletService for API call
      this.walletService
        .topUpWallet(userId, {
          amount,
          paymentMethod: 'RAZORPAY',
          paymentGatewayTransactionId,
          description: `Wallet top-up of ₹${amount}`,
        })
        .subscribe({
          next: (response) => {
            observer.next(response.success);
            observer.complete();
          },
          error: (error) => {
            console.error('Error adding to wallet:', error);
            observer.next(false);
            observer.complete();
          },
        });
    });
  }

  // Pending ride details management
  setPendingRideDetails(details: any) {
    this.pendingRideDetailsSubject.next(details);
  }

  getPendingRideDetails(): any {
    return this.pendingRideDetailsSubject.value;
  }

  clearPendingRideDetails() {
    this.pendingRideDetailsSubject.next(null);
  }

  /**
   * Check if user is blocked by fetching user status from API
   */
  checkUserBlockedStatus(userId: string): Observable<boolean> {
    return this.http.get<any>(`${environment.apiUrl}/users/${userId}`).pipe(
      map((user) => {
        return user.isActive === false;
      }),
      catchError((error) => {
        console.error('Error checking user blocked status:', error);
        return of(false); // Return false on error to avoid blocking user
      })
    );
  }

  /**
   * Handle blocked user - logout and navigate to blocked screen
   */
  async handleBlockedUser() {
    console.log('🚫 ========================================');
    console.log('🚫 USER BLOCKED - LOGGING OUT');
    console.log('🚫 ========================================');
    
    // Logout user (clears storage and disconnects socket)
    await this.logout();
    
    // Navigate to blocked screen
    this.router.navigate(['/blocked'], { replaceUrl: true });
    
    console.log('✅ User logged out and redirected to blocked screen');
    console.log('========================================');
  }
}
