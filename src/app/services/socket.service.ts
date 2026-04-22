import { Injectable, NgZone, Injector } from '@angular/core';
import { Socket } from 'ngx-socket-io';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Storage } from '@ionic/storage-angular';
import { RideService } from './ride.service';

export interface SocketConfig {
  userId?: string;
  userType: 'rider' | 'driver';
}

export interface ConnectionStatus {
  connected: boolean;
  socketId?: string;
  error?: string;
}

type ConnectionLifecycleState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stopped';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private connectionStatus$ = new BehaviorSubject<ConnectionStatus>({
    connected: false,
  });

  private lifecycleState: ConnectionLifecycleState = 'idle';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private maxReconnectDelay = 30000;
  private reconnectTimeout: any = null;
  private listenersRegistered = false;
  private shouldMaintainConnection = false;
  private managedConfig?: SocketConfig;

  private eventHandlers: {
    event: string;
    handler: (...args: any[]) => void;
  }[] = [];

  private rideService?: RideService;

  constructor(
    private socket: Socket,
    private storage: Storage,
    private zone: NgZone,
    private injector: Injector
  ) {
    this.initStorage();
    // Lazy inject RideService to avoid circular dependency
    // We'll get it when needed
  }

  /**
   * Get RideService instance (lazy injection to avoid circular dependency)
   */
  private getRideService(): RideService | null {
    if (!this.rideService) {
      try {
        this.rideService = this.injector.get(RideService);
      } catch (error) {
        console.error('Failed to get RideService:', error);
        return null;
      }
    }
    return this.rideService;
  }

  private async initStorage() {
    await this.storage.create();
  }

  /**
   * Initialize socket connection
   */
  async initialize(config: SocketConfig): Promise<void> {
    await this.ensureConnected(config);
  }

  async ensureConnected(config?: SocketConfig): Promise<void> {
    if (config) {
      this.managedConfig = config;
    }

    try {
      const effectiveConfig = this.managedConfig || (await this.storage.get('socketConfig'));
      if (!effectiveConfig) {
        throw new Error('Socket config is required for connection');
      }

      const userId = effectiveConfig.userId || (await this.storage.get('userId'));

      if (!userId || !effectiveConfig.userType) {
        throw new Error('User ID is required for socket connection');
      }

      await this.storage.set('socketConfig', effectiveConfig);
      await this.storage.set('userId', userId);
      this.managedConfig = { ...effectiveConfig, userId };
      this.shouldMaintainConnection = true;

      this.socket.ioSocket.io.opts.query = {
        userId,
        userType: effectiveConfig.userType,
      };

      this.setupEventListeners();
      this.connectNow(this.isConnected() ? 'connected' : 'connecting');
    } catch (error) {
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
    if (this.listenersRegistered) {
      return;
    }
    this.listenersRegistered = true;

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
        this.lifecycleState = 'connected';
        this.reconnectAttempts = 0;
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        this.connectionStatus$.next({
          connected: true,
          socketId: this.socket.ioSocket.id,
        });

        void this.registerCurrentUser();
        const rideService = this.getRideService();
        if (rideService) {
          rideService.syncRideStateFromBackend().catch((err) => {
            console.error('Failed to sync ride state after reconnection:', err);
          });
        }
      });
    });

    addTrackedListener('disconnect', (reason: string) => {
      this.zone.run(() => {
        this.connectionStatus$.next({
          connected: false,
          error: reason,
        });

        if (this.shouldMaintainConnection) {
          this.scheduleReconnect(`disconnect:${reason}`);
        } else {
          this.lifecycleState = 'stopped';
        }
      });
    });

    addTrackedListener('connect_error', (error: Error) => {
      this.zone.run(() => {
        this.connectionStatus$.next({
          connected: false,
          error: error.message,
        });
        this.scheduleReconnect(`connect_error:${error.message}`);
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
   * Register current rider after connection
   */
  private async registerCurrentUser(): Promise<void> {
    try {
      if (!this.managedConfig || this.managedConfig.userType !== 'rider') {
        return;
      }
      const userId = await this.storage.get('userId');
      if (userId) {
        this.socket.emit('riderConnect', { userId });
      }
    } catch (error) {
      console.error('Error registering rider:', error);
    }
  }

  private connectNow(nextState: ConnectionLifecycleState): void {
    if (this.isConnected()) {
      return;
    }
    this.lifecycleState = nextState;
    this.socket.connect();
  }

  private scheduleReconnect(reason: string): void {
    if (!this.shouldMaintainConnection || this.lifecycleState === 'stopped') {
      return;
    }

    if (this.reconnectTimeout) {
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.lifecycleState = 'reconnecting';
      const jitter = Math.floor(Math.random() * 500);
      const delay = Math.min(
        this.maxReconnectDelay,
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + jitter
      );

      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        console.log(
          `[Socket] reconnect attempt=${this.reconnectAttempts} reason=${reason} delayMs=${delay}`
        );
        this.connectNow('reconnecting');
      }, delay);
    } else {
      this.lifecycleState = 'idle';
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
      console.error(`Cannot emit ${event}; socket is disconnected`);
      return;
    }
    this.socket.emit(event, data);
  }

  /**
   * Listen for event from server
   */
  on<T = any>(event: string): Observable<T> {
    return new Observable((observer) => {
      const handler = (data: T) => {
        this.zone.run(() => {
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
  async disconnect(notifyServer: boolean = true): Promise<void> {
    try {
      this.shouldMaintainConnection = false;
      this.lifecycleState = 'stopped';
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      const userId = await this.storage.get('userId');
      if (notifyServer && userId && this.isConnected()) {
        this.socket.emit('riderDisconnect', { userId });
      }

      this.socket.disconnect();
      this.reconnectAttempts = 0;
      this.connectionStatus$.next({ connected: false });
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
   * Wait for connection with default 30-second timeout to prevent infinite hanging
   */
  async waitForConnection(timeoutMs: number = 30000): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    if (this.shouldMaintainConnection && this.lifecycleState !== 'reconnecting') {
      this.connectNow('connecting');
    }

    return new Promise((resolve, reject) => {
      let waitTimeout: any = null;
      let subscription: any = null;

      // Set up timeout
      waitTimeout = setTimeout(() => {
        if (subscription) {
          subscription.unsubscribe();
        }
        if (waitTimeout) {
          clearTimeout(waitTimeout);
          waitTimeout = null;
        }
        reject(new Error(`Socket connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Subscribe to connection status updates
      subscription = this.connectionStatus$.subscribe((status) => {
        if (status.connected) {
          if (subscription) {
            subscription.unsubscribe();
          }
          if (waitTimeout) {
            clearTimeout(waitTimeout);
            waitTimeout = null;
          }
          resolve();
        }

        if (status.error === 'Max reconnection attempts reached') {
          if (subscription) {
            subscription.unsubscribe();
          }
          if (waitTimeout) {
            clearTimeout(waitTimeout);
            waitTimeout = null;
          }
          reject(new Error(status.error));
        }
      });
    });
  }

  async onNetworkReachable(): Promise<void> {
    if (!this.shouldMaintainConnection) {
      return;
    }
    this.reconnectAttempts = 0;
    this.connectNow('reconnecting');
  }
}
