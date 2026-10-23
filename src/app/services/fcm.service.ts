import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import type { PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type {
  PushNotificationSchema,
  ActionPerformed,
  Token,
} from '@capacitor/push-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

import { environment } from 'src/environments/environment';
import { NotificationService } from './notification.service';

const RETRY_DELAYS_MS = [500, 1000, 2000];

/**
 * FcmService — owns the Firebase Cloud Messaging lifecycle for the rider app.
 *
 * Boundaries:
 * - Tied to the auth lifecycle: `initialize(userId)` on login, `dispose()` on logout.
 * - Android registers with @capacitor/push-notifications (FCM token).
 * - iOS registers with @capacitor-firebase/messaging so the token is FCM, not raw APNs.
 * - Token is persisted locally and PATCHed to `PATCH /users/:id/fcm-token`.
 * - `ensureSynced()` re-attempts registration/sync on resume and network recovery.
 */
@Injectable({ providedIn: 'root' })
export class FcmService {
  private readonly token$ = new BehaviorSubject<string | null>(null);
  readonly fcmToken$ = this.token$.asObservable();

  private listeners: PluginListenerHandle[] = [];
  private listenersReady = false;
  private iosListenersReady = false;
  private currentUserId: string | null = null;
  private lastSyncError: string | null = null;
  private ensureSyncedInFlight: Promise<void> | null = null;

  constructor(
    private platform: Platform,
    private storage: Storage,
    private router: Router,
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  /** Last backend sync error (for debugging). */
  getLastSyncError(): string | null {
    return this.lastSyncError;
  }

  /** Cached device token from memory or Ionic Storage. */
  async getCachedToken(): Promise<string | null> {
    await this.storage.create();
    const inMemory = this.token$.value;
    if (inMemory) return inMemory;
    const stored = await this.storage.get('fcmToken');
    return typeof stored === 'string' && stored.trim().length > 0 ? stored : null;
  }

  /**
   * Idempotent: safe to call multiple times for the same user; no-ops on web.
   */
  async initialize(userId: string): Promise<void> {
    if (!this.isNativeCapacitor()) return;

    await this.storage.create();

    if (this.currentUserId === userId && this.token$.value) {
      await this.syncTokenWithRetry(this.token$.value).catch(() => undefined);
      return;
    }

    this.currentUserId = userId;

    const cached = await this.getCachedToken();
    if (cached) {
      this.token$.next(cached);
      await this.syncTokenWithRetry(cached).catch((err) =>
        console.warn('[FCM] cached token sync failed:', err),
      );
    }

    try {
      if (this.isIosCapacitor()) {
        await this.registerIos();
      } else {
        await this.registerAndroid();
      }
    } catch (err) {
      console.error('[FCM] initialize failed:', err);
    }
  }

  /**
   * Re-sync stored token and re-attempt registration when needed.
   * Safe to call on app resume and network reconnect.
   */
  async ensureSynced(): Promise<void> {
    if (!this.isNativeCapacitor() || !this.currentUserId) return;

    if (this.ensureSyncedInFlight) {
      return this.ensureSyncedInFlight;
    }

    this.ensureSyncedInFlight = this.runEnsureSynced().finally(() => {
      this.ensureSyncedInFlight = null;
    });
    return this.ensureSyncedInFlight;
  }

  private async runEnsureSynced(): Promise<void> {
    await this.storage.create();
    const userId = this.currentUserId;
    if (!userId) return;

    const cached = await this.getCachedToken();
    if (cached) {
      this.token$.next(cached);
      await this.syncTokenWithRetry(cached).catch((err) =>
        console.warn('[FCM] ensureSynced cached sync failed:', err),
      );
    }

    if (!this.token$.value) {
      await this.initialize(userId);
    } else {
      await this.syncTokenWithRetry(this.token$.value).catch((err) =>
        console.warn('[FCM] ensureSynced retry sync failed:', err),
      );
    }
  }

  /** Tear down listeners and forget the token. Call on explicit logout only. */
  async dispose(): Promise<void> {
    if (this.currentUserId && this.token$.value) {
      await this.clearTokenOnBackend(this.currentUserId).catch((err) =>
        console.warn('[FCM] failed to clear backend token:', err),
      );
    }

    if (this.isIosCapacitor()) {
      try {
        await FirebaseMessaging.deleteToken();
      } catch (err) {
        console.warn('[FCM] failed to delete iOS token:', err);
      }
    }

    for (const l of this.listeners) {
      try {
        await l.remove();
      } catch (err) {
        console.warn('[FCM] failed to remove listener:', err);
      }
    }
    this.listeners = [];
    this.listenersReady = false;
    this.iosListenersReady = false;
    this.currentUserId = null;
    this.token$.next(null);
    this.lastSyncError = null;

    try {
      await this.storage.remove('fcmToken');
    } catch (err) {
      console.warn('[FCM] failed to clear stored token:', err);
    }
  }

  private isNativeCapacitor(): boolean {
    return (
      this.platform.is('capacitor') &&
      (this.platform.is('ios') || this.platform.is('android'))
    );
  }

  private isIosCapacitor(): boolean {
    return this.platform.is('capacitor') && this.platform.is('ios');
  }

  private async registerAndroid(): Promise<void> {
    const granted = await this.ensurePushPermission();
    if (!granted) {
      console.warn('[FCM] Push permission not granted');
      return;
    }

    await this.attachListenersOnce();
    await PushNotifications.register();
  }

  private async registerIos(): Promise<void> {
    const granted = await this.ensureIosPushPermission();
    if (!granted) {
      console.warn('[FCM] Push permission not granted');
      return;
    }

    await this.attachIosListenersOnce();
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      await this.persistToken(token);
    }
  }

  private async ensureIosPushPermission(): Promise<boolean> {
    const perm = await FirebaseMessaging.checkPermissions();
    let status = perm.receive;
    if (status === 'prompt' || status === 'prompt-with-rationale') {
      status = (await FirebaseMessaging.requestPermissions()).receive;
    }
    return status === 'granted';
  }

  private async attachIosListenersOnce(): Promise<void> {
    if (this.iosListenersReady) return;

    this.listeners.push(
      await FirebaseMessaging.addListener('tokenReceived', async (event) => {
        await this.persistToken(event.token);
      }),
    );

    this.listeners.push(
      await FirebaseMessaging.addListener('notificationReceived', async (event) => {
        const data = this.notificationData(event.notification.data);
        console.log('[FCM] received (foreground):', event.notification);
        await this.notificationService.scheduleNotification({
          title: event.notification.title || data['title'] || 'Cerca',
          body: event.notification.body || data['body'] || '',
          extra: data,
        });
      }),
    );

    this.listeners.push(
      await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        if (event.actionId === 'dismiss') return;
        const data = this.notificationData(event.notification.data);
        console.log('[FCM] tapped:', data);
        this.routeFromPayload(data);
      }),
    );

    this.iosListenersReady = true;
  }

  private notificationData(data: unknown): Record<string, any> {
    if (data && typeof data === 'object') {
      return data as Record<string, any>;
    }
    return {};
  }

  private async persistToken(token: string): Promise<void> {
    if (!token) return;
    console.log('[FCM] token:', token);
    this.token$.next(token);
    try {
      await this.storage.set('fcmToken', token);
    } catch (err) {
      console.warn('[FCM] failed to persist token:', err);
    }
    await this.syncTokenWithRetry(token).catch((err) =>
      console.warn('[FCM] backend token sync failed:', err),
    );
  }

  private async ensurePushPermission(): Promise<boolean> {
    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;
    if (status === 'prompt' || status === 'prompt-with-rationale') {
      status = (await PushNotifications.requestPermissions()).receive;
    }
    return status === 'granted';
  }

  private async attachListenersOnce(): Promise<void> {
    if (this.listenersReady) return;

    this.listeners.push(
      await PushNotifications.addListener('registration', async (t: Token) => {
        const token = t.value;
        console.log('[FCM] token:', token);
        this.token$.next(token);
        try {
          await this.storage.set('fcmToken', token);
        } catch (err) {
          console.warn('[FCM] failed to persist token:', err);
        }
        await this.syncTokenWithRetry(token).catch((err) =>
          console.warn('[FCM] backend token sync failed:', err),
        );
      }),
    );

    this.listeners.push(
      await PushNotifications.addListener('registrationError', (e) => {
        console.error('[FCM] registration error:', e);
        this.lastSyncError = JSON.stringify(e);
      }),
    );

    this.listeners.push(
      await PushNotifications.addListener(
        'pushNotificationReceived',
        async (n: PushNotificationSchema) => {
          console.log('[FCM] received (foreground):', n);
          const data = (n.data || {}) as Record<string, any>;
          await this.notificationService.scheduleNotification({
            title: n.title || data['title'] || 'Cerca',
            body: n.body || data['body'] || '',
            extra: data,
          });
        },
      ),
    );

    this.listeners.push(
      await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          const data = (action.notification.data || {}) as Record<string, any>;
          console.log('[FCM] tapped:', data);
          this.routeFromPayload(data);
        },
      ),
    );

    this.listenersReady = true;
  }

  private routeFromPayload(data: Record<string, any>): void {
    if (typeof data['route'] === 'string' && data['route'].startsWith('/')) {
      this.router.navigateByUrl(data['route']);
      return;
    }

    const category = (data['appType'] || data['type'] || '').toString();
    switch (category) {
      case 'ride_status':
        this.router.navigate(['/tabs/tabs/tab1']);
        break;
      case 'chat_message':
        if (data['rideId']) {
          this.router.navigate(['/driver-chat', data['rideId']]);
        } else {
          this.router.navigate(['/tabs/tabs/tab1']);
        }
        break;
      case 'promo':
        this.router.navigate(['/tabs/tabs/tab2']);
        break;
      case 'driver_cancel_settlement':
      case 'driver_cancel_payment':
      case 'trip_charge_due':
        if (data['rideId']) {
          this.router.navigate(['/driver-cancel-settlement', data['rideId']]);
        } else {
          this.router.navigate(['/pending-dues']);
        }
        break;
      default:
        this.router.navigate(['/tabs/tabs/tab1']);
    }
  }

  private async syncTokenWithRetry(
    token: string,
    maxAttempts = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.syncTokenToBackend(token);
        this.lastSyncError = null;
        return;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? 'unknown error');
        this.lastSyncError = message;
        if (attempt < maxAttempts - 1) {
          await this.delay(RETRY_DELAYS_MS[attempt] ?? 2000);
        } else {
          console.warn('[FCM] backend token sync failed after retries:', err);
          throw err;
        }
      }
    }
  }

  private async syncTokenToBackend(token: string): Promise<void> {
    if (!this.currentUserId || !token) return;

    await this.storage.create();
    const jwt = await this.storage.get('token');
    if (!jwt) {
      const msg = 'no JWT in storage; skipping backend sync';
      console.warn(`[FCM] ${msg}`);
      throw new Error(msg);
    }

    const url = `${environment.apiUrl}/users/${this.currentUserId}/fcm-token`;
    const headers = new HttpHeaders({ Authorization: `Bearer ${jwt}` });
    await firstValueFrom(
      this.http.patch(
        url,
        { fcmToken: token, platform: this.isIosCapacitor() ? 'ios' : 'android' },
        { headers },
      ),
    );
    console.log('[FCM] token synced to backend');
  }

  private async clearTokenOnBackend(userId: string): Promise<void> {
    await this.storage.create();
    const jwt = await this.storage.get('token');
    if (!jwt) return;
    const url = `${environment.apiUrl}/users/${userId}/fcm-token`;
    const headers = new HttpHeaders({ Authorization: `Bearer ${jwt}` });
    await firstValueFrom(
      this.http.patch(url, { fcmToken: null }, { headers }),
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
