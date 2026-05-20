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

import { environment } from 'src/environments/environment';
import { NotificationService } from './notification.service';

/**
 * FcmService — owns the Firebase Cloud Messaging lifecycle for the rider app.
 *
 * Boundaries:
 * - Tied to the auth lifecycle: `initialize(userId)` is called when a user
 *   logs in, `dispose()` when they log out.
 * - Android-only for now (iOS APNs is deferred).
 * - When a push arrives in foreground we bridge to LocalNotifications so the
 *   user always sees something (FCM does not auto-display data-only payloads).
 * - On `registration` the token is persisted locally *and* PATCHed to the
 *   backend (`PATCH /users/:id/fcm-token`) so server-side push delivery works
 *   for users who logged in before the token was available.
 */
@Injectable({ providedIn: 'root' })
export class FcmService {
  private readonly token$ = new BehaviorSubject<string | null>(null);
  /** Latest FCM registration token (null when not registered or after logout). */
  readonly fcmToken$ = this.token$.asObservable();

  private listeners: PluginListenerHandle[] = [];
  private currentUserId: string | null = null;

  constructor(
    private platform: Platform,
    private storage: Storage,
    private router: Router,
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  /**
   * Idempotent: safe to call multiple times for the same user; no-ops on web
   * and on iOS (which is intentionally deferred).
   */
  async initialize(userId: string): Promise<void> {
    if (!this.platform.is('capacitor')) return;
    if (this.platform.is('ios')) return;
    if (this.currentUserId === userId && this.token$.value) {
      // Already registered; ensure backend has it (cheap, idempotent).
      await this.syncTokenToBackend(this.token$.value).catch(() => undefined);
      return;
    }

    this.currentUserId = userId;

    try {
      const perm = await PushNotifications.checkPermissions();
      let status = perm.receive;
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        status = (await PushNotifications.requestPermissions()).receive;
      }
      if (status !== 'granted') {
        console.warn('[FCM] Push permission not granted:', status);
        return;
      }

      await this.attachListeners();
      await PushNotifications.register();
    } catch (err) {
      console.error('[FCM] initialize failed:', err);
    }
  }

  /** Tear down listeners and forget the token. Call on logout. */
  async dispose(): Promise<void> {
    // Best-effort: tell backend to forget this device so we stop pushing to it.
    if (this.currentUserId && this.token$.value) {
      await this.clearTokenOnBackend(this.currentUserId).catch((err) =>
        console.warn('[FCM] failed to clear backend token:', err),
      );
    }
    for (const l of this.listeners) {
      try {
        await l.remove();
      } catch (err) {
        console.warn('[FCM] failed to remove listener:', err);
      }
    }
    this.listeners = [];
    this.currentUserId = null;
    this.token$.next(null);
    try {
      await this.storage.remove('fcmToken');
    } catch (err) {
      console.warn('[FCM] failed to clear stored token:', err);
    }
  }

  private async attachListeners(): Promise<void> {
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
        await this.syncTokenToBackend(token).catch((err) =>
          console.warn('[FCM] backend token sync failed:', err),
        );
      }),
    );

    this.listeners.push(
      await PushNotifications.addListener('registrationError', (e) => {
        console.error('[FCM] registration error:', e);
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
  }

  /**
   * Decide where to navigate after a notification tap.
   *
   * Contract with the backend (see `Test_Main_Cerca_cabs/utils/riderFcmPayload.js`):
   *   data.route   — explicit Angular route (always wins when present).
   *   data.appType — primary high-level category emitted by the new payload helper.
   *   data.type    — legacy field, still respected for tokens issued before rollout.
   *   data.rideId  — required for chat_message deep link.
   */
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
          this.router.navigate([
            '/driver-cancel-settlement',
            data['rideId'],
          ]);
        } else {
          this.router.navigate(['/pending-dues']);
        }
        break;
      default:
        this.router.navigate(['/tabs/tabs/tab1']);
    }
  }

  /** PATCH the rider's FCM token to the backend (auth via JWT). */
  private async syncTokenToBackend(token: string): Promise<void> {
    if (!this.currentUserId || !token) return;
    const jwt = await this.storage.get('token');
    if (!jwt) {
      console.warn('[FCM] no JWT in storage; skipping backend sync');
      return;
    }
    const url = `${environment.apiUrl}/users/${this.currentUserId}/fcm-token`;
    const headers = new HttpHeaders({ Authorization: `Bearer ${jwt}` });
    await firstValueFrom(
      this.http.patch(url, { fcmToken: token, platform: 'android' }, { headers }),
    );
    console.log('[FCM] token synced to backend');
  }

  /** Clear the rider's FCM token on logout so we stop targeting this device. */
  private async clearTokenOnBackend(userId: string): Promise<void> {
    const jwt = await this.storage.get('token');
    if (!jwt) return;
    const url = `${environment.apiUrl}/users/${userId}/fcm-token`;
    const headers = new HttpHeaders({ Authorization: `Bearer ${jwt}` });
    await firstValueFrom(
      this.http.patch(url, { fcmToken: null }, { headers }),
    );
  }
}
