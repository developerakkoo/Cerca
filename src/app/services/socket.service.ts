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
  private reconnectTimeout: any = null;
  
  // Store event listener handlers for cleanup
  private eventHandlers: {
    event: string;
    handler: (...args: any[]) => void;
  }[] = [];

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
    console.log('🚀 ========================================');
    console.log('🚀 INITIALIZING SOCKET CONNECTION');
    console.log('🚀 ========================================');
    console.log('📋 Config:', config);

    if (this.isInitialized) {
      console.log('⚠️ Socket already initialized - skipping');
      return;
    }

    try {
      // Get user ID from storage if not provided
      const userId = config.userId || (await this.storage.get('userId'));

      console.log('👤 User ID:', userId);

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

      console.log(
        '🔧 Socket query params:',
        this.socket.ioSocket.io.opts.query
      );
      console.log('🌐 Target URL:', environment.apiUrl);
      console.log('🔌 Transports:', this.socket.ioSocket.io.opts.transports);

      // Setup event listeners
      this.setupEventListeners();

      // Connect
      console.log('📞 Calling socket.connect()...');
      this.socket.connect();
      this.isInitialized = true;

      console.log('✅ Socket initialization started successfully');
      console.log('========================================');
    } catch (error) {
      console.error('❌ ========================================');
      console.error('❌ SOCKET INITIALIZATION ERROR');
      console.error('❌ ========================================');
      console.error('📝 Error:', error);
      console.error('========================================');

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
    console.log('🔧 ========================================');
    console.log('🔧 SETTING UP SOCKET EVENT LISTENERS');
    console.log('🔧 ========================================');

    // Helper to add and track event listeners
    const addTrackedListener = (
      event: string,
      handler: (...args: any[]) => void
    ) => {
      this.socket.on(event, handler);
      this.eventHandlers.push({ event, handler });
    };

    // Connection events
    addTrackedListener('connect', () => {
      this.zone.run(() => {
        console.log('✅ ========================================');
        console.log('✅ SOCKET CONNECTED SUCCESSFULLY!');
        console.log('✅ ========================================');
        console.log('📡 Socket ID:', this.socket.ioSocket.id);
        console.log('🌐 Server URL:', environment.apiUrl);
        console.log(
          '🔌 Transport:',
          this.socket.ioSocket.io.engine.transport.name
        );
        console.log('⏰ Connected at:', new Date().toLocaleTimeString());
        console.log('========================================');

        this.reconnectAttempts = 0;
        // Clear any pending reconnect timeout
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        this.connectionStatus$.next({
          connected: true,
          socketId: this.socket.ioSocket.id,
        });

        // Register as rider
        this.registerRider();
      });
    });

    addTrackedListener('disconnect', (reason: string) => {
      this.zone.run(() => {
        console.log('❌ ========================================');
        console.log('❌ SOCKET DISCONNECTED');
        console.log('❌ ========================================');
        console.log('📝 Reason:', reason);
        console.log('⏰ Disconnected at:', new Date().toLocaleTimeString());
        console.log('========================================');

        this.connectionStatus$.next({
          connected: false,
          error: reason,
        });
      });
    });

    addTrackedListener('connect_error', (error: Error) => {
      this.zone.run(() => {
        console.error('⚠️ ========================================');
        console.error('⚠️ SOCKET CONNECTION ERROR');
        console.error('⚠️ ========================================');
        console.error('📝 Error:', error.message);
        console.error('🔍 Full Error:', error);
        console.error('⏰ Error at:', new Date().toLocaleTimeString());
        console.error('========================================');

        this.handleReconnect();
      });
    });

    addTrackedListener('error', (error: any) => {
      this.zone.run(() => {
        console.error('❌ ========================================');
        console.error('❌ SOCKET ERROR');
        console.error('❌ ========================================');
        console.error('📝 Error:', error);
        console.error('⏰ Error at:', new Date().toLocaleTimeString());
        console.error('========================================');
      });
    });
  }

  /**
   * Register as rider after connection
   */
  private async registerRider(): Promise<void> {
    console.log('🎫 ========================================');
    console.log('🎫 REGISTERING AS RIDER');
    console.log('🎫 ========================================');

    try {
      const userId = await this.storage.get('userId');
      console.log('👤 User ID from storage:', userId);

      if (userId) {
        this.emit('riderConnect', { userId });
        console.log('✅ Rider registration message sent');
        console.log('========================================');
      } else {
        console.warn('⚠️ No user ID found - cannot register');
        console.log('========================================');
      }
    } catch (error) {
      console.error('❌ Error registering rider:', error);
      console.log('========================================');
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

      console.log(
        `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
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
    console.log('📤 ========================================');
    console.log('📤 EMITTING EVENT');
    console.log('📤 ========================================');
    console.log('📝 Event Name:', event);
    console.log('📦 Data:', data);
    console.log(
      '📡 Connection Status:',
      this.isConnected() ? 'CONNECTED' : 'DISCONNECTED'
    );

    if (!this.isConnected()) {
      console.error('⚠️ Cannot emit - Socket not connected!');
      console.error('========================================');
      return;
    }

    console.log('✅ Emitting to server...');
    console.log('========================================');
    this.socket.emit(event, data);
  }

  /**
   * Listen for event from server
   */
  on<T = any>(event: string): Observable<T> {
    console.log('👂 Setting up listener for event:', event);

    return new Observable((observer) => {
      const handler = (data: T) => {
        this.zone.run(() => {
          console.log('📥 ========================================');
          console.log('📥 RECEIVED EVENT FROM SERVER');
          console.log('📥 ========================================');
          console.log('📝 Event Name:', event);
          console.log('📦 Data:', data);
          console.log('⏰ Received at:', new Date().toLocaleTimeString());
          console.log('========================================');

          observer.next(data);
        });
      };

      this.socket.on(event, handler);

      // Cleanup
      return () => {
        console.log('🧹 Cleaning up listener for event:', event);
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
      // Clear reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      // Remove all event listeners
      this.eventHandlers.forEach(({ event, handler }) => {
        this.socket.off(event, handler);
      });
      this.eventHandlers = [];

      const userId = await this.storage.get('userId');
      if (userId && this.isConnected()) {
        this.emit('riderDisconnect', { userId });
      }

      this.socket.disconnect();
      this.isInitialized = false;
      this.reconnectAttempts = 0;
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
   * Wait for connection (NO TIMEOUT - will wait indefinitely)
   */
  async waitForConnection(timeoutMs: number = 0): Promise<void> {
    console.log('⏳ ========================================');
    console.log('⏳ WAITING FOR SOCKET CONNECTION...');
    console.log('⏳ ========================================');
    console.log(
      '📡 Current Status:',
      this.isConnected() ? 'CONNECTED' : 'DISCONNECTED'
    );
    console.log('🌐 Target URL:', environment.apiUrl);
    console.log('⏰ Started waiting at:', new Date().toLocaleTimeString());
    console.log('========================================');

    if (this.isConnected()) {
      console.log('✅ Already connected! Socket ID:', this.socket.ioSocket.id);
      return;
    }

    return new Promise((resolve, reject) => {
      // NO TIMEOUT - will wait forever until connected
      const subscription = this.connectionStatus$.subscribe((status) => {
        console.log('📊 Connection status update:', status);

        if (status.connected) {
          console.log('✅ Connection established! Resolving...');
          subscription.unsubscribe();
          resolve();
        }

        if (status.error) {
          console.error('❌ Connection error detected:', status.error);
          // Don't reject - keep waiting
        }
      });

      // Optional: Add a very long timeout (5 minutes) just to prevent infinite hanging
      let waitTimeout: any = null;
      if (timeoutMs > 0) {
        waitTimeout = setTimeout(() => {
          console.error('⏰ Connection timeout after', timeoutMs, 'ms');
          subscription.unsubscribe();
          if (waitTimeout) {
            clearTimeout(waitTimeout);
            waitTimeout = null;
          }
          reject(new Error(`Socket connection timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }
}
