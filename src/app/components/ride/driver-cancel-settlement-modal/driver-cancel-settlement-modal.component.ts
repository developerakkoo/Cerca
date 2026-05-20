import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { Ride } from 'src/app/services/ride.service';
import { formatInrWithSymbol } from 'src/app/utils/money-display.util';

export type DriverCancelSettlementAction =
  | 'acknowledge'
  | 'wallet'
  | 'online'
  | 'cash';

@Component({
  selector: 'app-driver-cancel-settlement-modal',
  templateUrl: './driver-cancel-settlement-modal.component.html',
  styleUrls: ['./driver-cancel-settlement-modal.component.scss'],
  standalone: false,
})
export class DriverCancelSettlementModalComponent {
  @Input() reason = '';

  @Input() settlement!: NonNullable<Ride['driverInProgressCancelSettlement']>;

  @Input() bookingPaymentMethod: Ride['paymentMethod'] = 'CASH';

  /** Post-ride Pay Online (not prepaid Razorpay at booking). */
  @Input() isPostRideOnlineBooking = false;

  /**
   * Emitted when the user dismisses the inline modal. `undefined` means a soft
   * cancel (close button); a concrete action triggers the corresponding
   * settlement endpoint via the host page → RideService.
   */
  @Output() modalDismiss = new EventEmitter<DriverCancelSettlementAction | undefined>();

  fmt(n: number | undefined): string {
    return n == null ? '—' : formatInrWithSymbol(n);
  }

  get additional(): number {
    return Number(this.settlement?.additionalDue) || 0;
  }

  get isZeroDue(): boolean {
    return this.additional <= 0;
  }

  get showPayWallet(): boolean {
    const allowed = this.settlement?.allowedSettlementMethods;
    if (allowed?.length) {
      return allowed.includes('wallet');
    }
    return !this.isPostRideOnlineBooking;
  }

  get showPayOnline(): boolean {
    if (this.isZeroDue) return false;
    const allowed = this.settlement?.allowedSettlementMethods;
    if (allowed?.length) {
      return allowed.includes('razorpay');
    }
    return this.additional >= 10 || this.isPostRideOnlineBooking;
  }

  get rateSrcLabel(): string {
    return this.settlement?.perKmRateSource === 'booking_implied'
      ? 'from your trip quote'
      : 'per current pricing';
  }

  get partialKmStr(): string | null {
    if (this.settlement?.partialDistanceKm == null) return null;
    return Number(this.settlement.partialDistanceKm).toFixed(2);
  }

  get hasDetailedPerKm(): boolean {
    return (
      this.partialKmStr != null &&
      this.settlement?.perKmRateUsed != null
    );
  }

  /**
   * Sanitized reason for display. Strips any stray `<...>` tokens (defense in
   * depth — Angular interpolation already escapes) and falls back to a polite
   * default. Avoids showing "<div class=...>" if a backend payload ever leaks
   * raw HTML into the cancellation reason field.
   */
  get displayReason(): string {
    return String(this.reason ?? '').replace(/<[^>]*>/g, '').trim() || 'Not specified';
  }

  dismissCancel(): void {
    this.modalDismiss.emit(undefined);
  }

  dismissAction(action: DriverCancelSettlementAction): void {
    this.modalDismiss.emit(action);
  }
}
