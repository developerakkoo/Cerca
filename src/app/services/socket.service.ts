import { Injectable, NgZone } from '@angular/core';
import { Socket } from 'ngx-socket-io';
import { Observable, BehaviorSubject, fromEvent, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Storage } from '@ionic/storage-angular';

export interface SocketConfig {
  userId?: string;
  userType: 'rider' | 'driver';
}

export interface ConnectionStatus {
  connected: boolean;
  socketId?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private connectionStatus$ = new BehaviorSubject<ConnectionStatus>({
    connected: false,
  });

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isInitialized = false;

  constructor(
    private socket: Socket,
    private storage: Storage,
    private zone: NgZone
  ) {
    this.initStorage();
  }

  private async initStorage() {
    await this.storage.create();
  }

  /**
   * Initialize socket connection
   */
  async initialize(config: SocketConfig): Promise<void> {
    if (this.isInitialized) {
      console.log('Socket already initialized');
      return;
    }

    try {
      // Get user ID from storage if not provided
      const userId = config.userId || (await this.storage.get('userId'));

      if (!userId) {
        throw new Error('User ID is required for socket connection');
      }

      // Store config
      await this.storage.set('socketConfig', config);
      await this.storage.set('userId', userId);

      // Configure socket
      this.socket.ioSocket.io.opts.query = {
        userId,
        userType: config.userType,
      };

      // Setup event listeners
      this.setupEventListeners();

      // Connect
      this.socket.connect();
      this.isInitialized = true;

      console.log('Socket initialization started');
    } catch (error) {
      console.error('Socket initialization error:', error);
      this.connectionStatus$.next({
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Setup socket event listeners
   */
  private setupEventListeners(): void {
    // Connection events
    this.socket.on('connect', () => {
      this.zone.run(() => {
        console.log('Socket connected:', this.socket.ioSocket.id);
        this.reconnectAttempts = 0;
        this.connectionStatus$.next({
          connected: true,
          socketId: this.socket.ioSocket.id,
        });

        // Register as rider
        this.registerRider();
      });
    });

    this.socket.on('disconnect', (reason: string) => {
      this.zone.run(() => {
        console.log('Socket disconnected:', reason);
        this.connectionStatus$.next({
          connected: false,
          error: reason,
        });
      });
    });

    this.socket.on('connect_error', (error: Error) => {
      this.zone.run(() => {
        console.error('Socket connection error:', error);
        this.handleReconnect();
      });
    });

    this.socket.on('error', (error: any) => {
      this.zone.run(() => {
        console.error('Socket error:', error);
      });
    });
  }

  /**
   * Register as rider after connection
   */
  private async registerRider(): Promise<void> {
    try {
      const userId = await this.storage.get('userId');
      if (userId) {
        this.emit('riderConnect', { userId });
        console.log('Rider registered:', userId);
      }
    } catch (error) {
      console.error('Error registering rider:', error);
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

      console.log(
        `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      setTimeout(() => {
        this.socket.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.connectionStatus$.next({
        connected: false,
        error: 'Max reconnection attempts reached',
      });
    }
  }

  /**
   * Emit event to server
   */
  emit(event: string, data?: any): void {
    if (!this.isConnected()) {
      console.warn(`Cannot emit ${event}: Socket not connected`);
      return;
    }

    console.log(`Emitting ${event}:`, data);
    this.socket.emit(event, data);
  }

  /**
   * Listen for event from server
   */
  on<T = any>(event: string): Observable<T> {
    return new Observable((observer) => {
      const handler = (data: T) => {
        this.zone.run(() => {
          console.log(`Received ${event}:`, data);
          observer.next(data);
        });
      };

      this.socket.on(event, handler);

      // Cleanup
      return () => {
        this.socket.off(event, handler);
      };
    });
  }

  /**
   * Listen for event once
   */
  once<T = any>(event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Event ${event} timeout`));
      }, 30000); // 30 second timeout

      this.socket.once(event, (data: T) => {
        clearTimeout(timeout);
        this.zone.run(() => {
          console.log(`Received ${event} (once):`, data);
          resolve(data);
        });
      });
    });
  }

  /**
   * Remove event listener
   */
  off(event: string): void {
    this.socket.off(event);
  }

  /**
   * Disconnect socket
   */
  async disconnect(): Promise<void> {
    try {
      const userId = await this.storage.get('userId');
      if (userId && this.isConnected()) {
        this.emit('riderDisconnect', { userId });
      }

      this.socket.disconnect();
      this.isInitialized = false;
      this.connectionStatus$.next({ connected: false });

      console.log('Socket disconnected successfully');
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket.ioSocket?.connected || false;
  }

  /**
   * Get connection status observable
   */
  getConnectionStatus(): Observable<ConnectionStatus> {
    return this.connectionStatus$.asObservable();
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket.ioSocket?.id;
  }

  /**
   * Wait for connection
   */
  async waitForConnection(timeoutMs: number = 10000): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('Socket connection timeout'));
      }, timeoutMs);

      const subscription = this.connectionStatus$.subscribe((status) => {
        if (status.connected) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
    });
  }
}
