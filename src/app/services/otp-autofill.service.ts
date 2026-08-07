import { Injectable, OnDestroy } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Observable, Subject } from 'rxjs';

interface SmsUserConsentPlugin {
  startListening(): Promise<{ message: string }>;
  stopListening(): Promise<void>;
}

const SmsUserConsent = registerPlugin<SmsUserConsentPlugin>('SmsUserConsent');

/**
 * Arms Android SMS User Consent listening and emits extracted 4-digit OTP codes.
 * No-ops on iOS/web — those platforms rely on autocomplete="one-time-code".
 */
@Injectable({
  providedIn: 'root',
})
export class OtpAutofillService implements OnDestroy {
  private readonly codeSubject = new Subject<string>();
  readonly code$: Observable<string> = this.codeSubject.asObservable();

  private readonly declinedSubject = new Subject<void>();
  /** Emits when the user dismisses the Android SMS consent dialog. */
  readonly declined$: Observable<void> = this.declinedSubject.asObservable();

  private listening = false;
  private listenGeneration = 0;
  private pendingCode: string | null = null;

  /** Whether native SMS consent is available on this device. */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  /**
   * Start listening for an incoming verification SMS.
   * Safe to call repeatedly — previous listeners are cancelled first.
   * If a code arrives before the OTP page subscribes, it is retained via
   * {@link consumePendingCode}.
   */
  async arm(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    await this.disarm();
    this.pendingCode = null;
    this.listening = true;
    const generation = ++this.listenGeneration;

    try {
      const { message } = await SmsUserConsent.startListening();
      if (!this.listening || generation !== this.listenGeneration) {
        return;
      }

      const code = this.extractOtp(message);
      if (code) {
        this.pendingCode = code;
        this.codeSubject.next(code);
      }
    } catch (err: any) {
      // TIMEOUT / USER_DECLINED / CANCELLED are expected; manual entry remains available.
      const message = String(err?.message || err || '');
      if (message.includes('USER_DECLINED')) {
        this.declinedSubject.next();
      } else if (
        !message.includes('TIMEOUT') &&
        !message.includes('CANCELLED')
      ) {
        console.warn('SMS User Consent failed:', message);
      }
    } finally {
      if (generation === this.listenGeneration) {
        this.listening = false;
      }
    }
  }

  /** Return and clear any OTP that arrived before the OTP page subscribed. */
  consumePendingCode(): string | null {
    const code = this.pendingCode;
    this.pendingCode = null;
    return code;
  }

  /** Stop any active SMS consent listener. */
  async disarm(): Promise<void> {
    if (!this.isSupported()) {
      this.listening = false;
      return;
    }

    this.listening = false;
    this.listenGeneration++;
    try {
      await SmsUserConsent.stopListening();
    } catch {
      // Ignore if nothing was listening
    }
  }

  extractOtp(message: string): string | null {
    if (!message) {
      return null;
    }
    const match = message.match(/\b(\d{4})\b/);
    return match ? match[1] : null;
  }

  ngOnDestroy(): void {
    void this.disarm();
    this.codeSubject.complete();
    this.declinedSubject.complete();
  }
}
