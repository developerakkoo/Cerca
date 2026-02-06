import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { SocketService } from './socket.service';
import { environment } from 'src/environments/environment';

export interface SharedRide {
  _id: string;
  status: string;
  pickupLocation: {
    type: string;
    coordinates: [number, number];
  };
  dropoffLocation: {
    type: string;
    coordinates: [number, number];
  };
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  distanceInKm: number;
  service: string;
  vehicleType?: string;
  estimatedDuration?: number;
  estimatedArrivalTime?: Date;
  driverArrivedAt?: Date;
  actualStartTime?: Date;
  createdAt: Date;
  updatedAt: Date;
  driver?: {
    name: string;
    rating: number;
    vehicleInfo?: {
      make: string;
      model: string;
      color: string;
      licensePlate: string;
    };
  };
  rider?: {
    fullName: string;
  };
}

export interface SharedRideResponse {
  success: boolean;
  data: SharedRide;
  message?: string;
  reason?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SharedRideService {
  private apiUrl = `${environment.apiUrl}/api/rides`;
  private currentRide$ = new BehaviorSubject<SharedRide | null>(null);
  private rideUpdates$ = new Subject<SharedRide>();
  private shareToken: string | null = null;
  private socketSubscribed = false;

  constructor(
    private http: HttpClient,
    private socketService: SocketService
  ) {}

  /**
   * Fetch shared ride data by token
   */
  async fetchSharedRide(shareToken: string): Promise<SharedRide> {
    try {
      const response = await this.http
        .get<SharedRideResponse>(`${this.apiUrl}/shared/${shareToken}`)
        .toPromise();

      if (response?.success && response.data) {
        this.shareToken = shareToken;
        this.currentRide$.next(response.data);
        return response.data;
      } else {
        throw new Error(response?.message || 'Failed to fetch shared ride');
      }
    } catch (error: any) {
      console.error('Error fetching shared ride:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time updates for shared ride
   */
  subscribeToSharedRide(shareToken: string): Observable<SharedRide> {
    if (!this.socketSubscribed && this.socketService.isConnected()) {
      const socket = (this.socketService as any).socket?.ioSocket;
      if (socket) {
        // Join shared ride room
        socket.emit('joinSharedRide', { shareToken });

        // Listen for shared ride updates
        socket.on('sharedRideStatusUpdate', (data: any) => {
          const currentRide = this.currentRide$.value;
          if (currentRide) {
            const updatedRide = {
              ...currentRide,
              status: data.status,
              ...data.ride
            };
            this.currentRide$.next(updatedRide);
            this.rideUpdates$.next(updatedRide);
          }
        });

        socket.on('sharedRideLocationUpdate', (data: any) => {
          // Location updates can be handled separately if needed
          console.log('Shared ride location update:', data);
        });

        socket.on('sharedRideError', (error: any) => {
          console.error('Shared ride error:', error);
        });

        this.socketSubscribed = true;
      }
    }

    return this.rideUpdates$.asObservable();
  }

  /**
   * Unsubscribe from shared ride updates
   */
  unsubscribeFromSharedRide(): void {
    if (this.shareToken && this.socketService.isConnected()) {
      const socket = (this.socketService as any).socket?.ioSocket;
      if (socket) {
        socket.emit('leaveSharedRide', { shareToken: this.shareToken });
        socket.off('sharedRideStatusUpdate');
        socket.off('sharedRideLocationUpdate');
        socket.off('sharedRideError');
        this.socketSubscribed = false;
        this.shareToken = null;
      }
    }
  }

  /**
   * Get current ride as observable
   */
  getCurrentRide(): Observable<SharedRide | null> {
    return this.currentRide$.asObservable();
  }

  /**
   * Clear current ride
   */
  clearRide(): void {
    this.unsubscribeFromSharedRide();
    this.currentRide$.next(null);
  }
}

