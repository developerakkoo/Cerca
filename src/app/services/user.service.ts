import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';

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
    language: 'en'
  }
};

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private userSubject = new BehaviorSubject<User>(initialUserState);
  public user$ = this.userSubject.asObservable();

  private currentLocationSubject = new BehaviorSubject<{ lat: number, lng: number }>({ lat: 0, lng: 0 });
  public currentLocation$ = this.currentLocationSubject.asObservable();

  // Pickup and Destination
  private isPickupSubject = new BehaviorSubject<boolean>(false);
  public isPickup$ = this.isPickupSubject.asObservable();

  private pickupSubject = new BehaviorSubject<string>('');
  public pickup$ = this.pickupSubject.asObservable();

  private destinationSubject = new BehaviorSubject<string>('');
  public destination$ = this.destinationSubject.asObservable(); 

  constructor() {
    // Load user data from storage on service initialization
    this.loadUserFromStorage();
  }

  private loadUserFromStorage(): void {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        this.userSubject.next(parsedUser);
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        this.userSubject.next(initialUserState);
      }
    }
  }

  private saveUserToStorage(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  }

  // Get current user data
  getCurrentUser(): User {
    return this.userSubject.value;
  }

  // Get user as observable
  getUser(): Observable<User> {
    return this.user$;
  }

  // Set complete user data
  setUser(user: User): void {
    const updatedUser = {
      ...user,
      updatedAt: new Date()
    };
    this.userSubject.next(updatedUser);
    this.saveUserToStorage(updatedUser);
  }

  // Update specific user fields
  updateUser(updates: Partial<User>): void {
    const currentUser = this.userSubject.value;
    const updatedUser = {
      ...currentUser,
      ...updates,
      updatedAt: new Date()
    };
    this.userSubject.next(updatedUser);
    this.saveUserToStorage(updatedUser);
  }

  // Update user preferences
  updatePreferences(preferences: Partial<User['preferences']>): void {
    const currentUser = this.userSubject.value;
    const updatedPreferences = {
      ...currentUser.preferences,
      ...preferences
    };
    this.updateUser({ preferences: updatedPreferences as User['preferences'] });
  }

  // Login user
  login(userData: Partial<User>): void {
    const updatedUser = {
      ...this.userSubject.value,
      ...userData,
      isLoggedIn: true,
      lastLogin: new Date(),
      updatedAt: new Date()
    };
    this.userSubject.next(updatedUser);
    this.saveUserToStorage(updatedUser);
  }

  // Logout user
  logout(): void {
    this.userSubject.next(initialUserState);
    localStorage.removeItem('user');
  }

  // Check if user is logged in
  isUserLoggedIn(): boolean {
    return this.userSubject.value.isLoggedIn;
  }

  // Get user preferences
  getUserPreferences(): User['preferences'] {
    return this.userSubject.value.preferences;
  }

  // Update specific preference
  updatePreference<K extends keyof User['preferences']>(
    key: K,
    value: User['preferences'][K]
  ): void {
    const currentPreferences = this.userSubject.value.preferences;
    this.updatePreferences({
      ...currentPreferences,
      [key]: value
    });
  }

  // Clear user data
  clearUserData(): void {
    this.userSubject.next(initialUserState);
    localStorage.removeItem('user');
  }

  // Pickup and Destination
  setPickup(pickup: any): void {
    this.pickupSubject.next(pickup);
  }

  setDestination(destination: any): void {
    this.destinationSubject.next(destination);
  }

  setCurrentLocation(location: { lat: number, lng: number }): void {
    this.currentLocationSubject.next(location);
  }

  setIsPickup(isPickup: boolean): void {
    this.isPickupSubject.next(isPickup);
  }

  getPickup(): string {
    return this.pickupSubject.value;
  }

  getDestination(): string {
    return this.destinationSubject.value;
  }

  getCurrentLocation(): { lat: number, lng: number } {
    return this.currentLocationSubject.value;
  }
}
