import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject, Observable, tap, of } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface User {
  id?: string;
  email?: string;
  name?: string;
  photoURL?: string;
  phoneNumber?: string;
  isLoggedIn: boolean;
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

  constructor(private http: HttpClient, private storage: Storage) {
    this.storage.create();
    // Load user data from storage on service initialization
    this.loadUserFromStorage();
  }

  loadUserFromStorage() {
    this.storage
      .get('user')
      .then((storedUser) => {
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            this.userSubject.next(parsedUser);
          } catch (error) {
            console.error('Error parsing stored user data:', error);
            this.userSubject.next(initialUserState);
          }
        }
      })
      .catch((error) => {
        console.error('Error loading user from storage:', error);
        this.userSubject.next(initialUserState);
      });
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
  logout() {
    this.userSubject.next(initialUserState);
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

  deductFromWallet(amount: number): Observable<boolean> {
    const currentBalance = this.walletBalanceSubject.value;
    if (currentBalance >= amount) {
      this.walletBalanceSubject.next(currentBalance - amount);
      return of(true);
    }
    return of(false);
  }

  addToWallet(amount: number): Observable<boolean> {
    const currentBalance = this.walletBalanceSubject.value;
    this.walletBalanceSubject.next(currentBalance + amount);
    return of(true);
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
}
