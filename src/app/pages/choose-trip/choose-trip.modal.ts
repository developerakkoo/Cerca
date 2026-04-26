import {
  Component,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  NgZone,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import {
  ModalController,
  GestureController,
  IonContent,
} from '@ionic/angular';
import { VehicleServices } from '../../services/settings.service';
import { FareBreakdown } from '../../services/fare.service';

export type VehicleTier = 'cercaZip' | 'cercaGlide' | 'cercaTitan';

/**
 * Choose Trip Modal Component
 *
 * Uber-style bottom sheet with smooth scroll-driven expansion/collapse
 * Features:
 * - Starts collapsed (~25% height)
 * - Expands as user scrolls up
 * - Collapses as user scrolls down
 * - Smooth, elastic behavior
 * - Drag handle support
 */
@Component({
  selector: 'app-choose-trip-modal',
  templateUrl: './choose-trip.modal.html',
  styleUrls: ['./choose-trip.modal.scss'],
  standalone: false,
})
export class ChooseTripModal implements OnInit, OnDestroy, OnChanges {
  @ViewChild(IonContent, { static: false }) content!: IonContent;
  @ViewChild('handle', { static: false }) handleRef!: ElementRef;
  @ViewChild('contentWrapper', { static: false }) contentWrapperRef!: ElementRef;

  private modalElement: HTMLElement | null = null;

  /** Stable reference for add/removeEventListener */
  private readonly scrollHandler = (event: Event) => this.onScroll(event);

  @Input() pickupAddress: string = '';
  @Input() destinationAddress: string = '';
  @Input() vehicleServices: VehicleServices | null = null;
  @Input() calculatedFares: { cercaZip?: FareBreakdown; cercaGlide?: FareBreakdown; cercaTitan?: FareBreakdown } = {};
  @Input() vehicleETAs: { cercaZip?: string; cercaGlide?: string; cercaTitan?: string } = {};
  @Input() selectedVehicle: string = 'cercaZip';
  @Input() isLoadingServices: boolean = false;
  @Input() isCalculatingFares: boolean = false;

  /** Trip duration from fare API (`data.estimatedDuration`), minutes */
  @Input() estimatedTripMinutes: number | null = null;

  @Output() vehicleSelected = new EventEmitter<string>();
  @Output() confirmRide = new EventEmitter<void>();

  readonly vehicleTiers: VehicleTier[] = ['cercaZip', 'cercaGlide', 'cercaTitan'];

  currentBreakpoint: number = 0.25;
  isScrolling: boolean = false;
  lastScrollTop: number = 0;
  scrollDirection: 'up' | 'down' = 'down';

  private gesture?: any;
  private startY: number = 0;
  private currentY: number = 0;
  private isDragging: boolean = false;

  private scrollThrottleTimer: any = null;
  private rafId: number | null = null;

  /**
   * When parent leaves `selectedVehicle` at default Zip, auto-select Glide once
   * after services + fares are ready.
   */
  private defaultSelectionApplied = false;

  constructor(
    private modalController: ModalController,
    private gestureController: GestureController,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.currentBreakpoint = 0.25;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoadingServices']?.currentValue === true) {
      this.defaultSelectionApplied = false;
    }
    if (this.isLoadingServices || !this.vehicleServices || this.isCalculatingFares) {
      return;
    }
    if (!this.defaultSelectionApplied) {
      this.applyDefaultMidTierSelection();
    }
  }

  private applyDefaultMidTierSelection(): void {
    this.defaultSelectionApplied = true;
    if (this.selectedVehicle !== 'cercaZip') {
      return;
    }
    if (this.isVehicleEnabled('cercaGlide')) {
      this.zone.run(() => this.onVehicleSelect('cercaGlide'));
    }
  }

  ngAfterViewInit() {
    this.modalElement = document.querySelector('ion-modal.choose-trip-modal');

    setTimeout(() => {
      this.setupScrollListener();
      this.setupDragGesture();
    }, 300);
  }

  ngOnDestroy() {
    this.cleanupGesture();
    this.cleanupScrollListener();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }

  private setupScrollListener() {
    if (!this.content) return;

    const contentElement = this.content.getScrollElement();
    if (!contentElement) return;

    contentElement.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private cleanupScrollListener() {
    if (!this.content) return;

    const contentElement = this.content.getScrollElement();
    if (contentElement) {
      contentElement.removeEventListener('scroll', this.scrollHandler);
    }
  }

  private onScroll(event: Event) {
    if (this.isDragging) return;

    if (this.scrollThrottleTimer) {
      return;
    }

    this.scrollThrottleTimer = setTimeout(() => {
      this.scrollThrottleTimer = null;
    }, 16);

    const target = event.target as HTMLElement;
    const scrollTop = target.scrollTop || 0;
    const scrollHeight = target.scrollHeight || 0;
    const clientHeight = target.clientHeight || 0;

    this.scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
    this.lastScrollTop = scrollTop;

    if (scrollTop > 0 && scrollTop < scrollHeight - clientHeight - 10) {
      this.isScrolling = true;

      this.adjustBreakpointFromScroll(scrollTop, scrollHeight, clientHeight);
    } else if (scrollTop === 0 && this.scrollDirection === 'down') {
      this.isScrolling = false;
    } else if (scrollTop >= scrollHeight - clientHeight - 10) {
      this.isScrolling = false;
    }
  }

  private adjustBreakpointFromScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
    if (!this.modalElement) return;

    const scrollRatio = scrollTop / Math.max(scrollHeight - clientHeight, 1);

    const minBreakpoint = 0.25;
    const maxBreakpoint = 0.9;
    const targetBreakpoint = minBreakpoint + scrollRatio * (maxBreakpoint - minBreakpoint);

    const current = this.currentBreakpoint;
    const smoothFactor = 0.15;
    const newBreakpoint = current + (targetBreakpoint - current) * smoothFactor;

    const clampedBreakpoint = Math.max(minBreakpoint, Math.min(maxBreakpoint, newBreakpoint));

    this.zone.run(() => {
      this.currentBreakpoint = clampedBreakpoint;
      if (this.modalElement) {
        (this.modalElement as any).setCurrentBreakpoint(clampedBreakpoint);
      }
    });
  }

  private async setupDragGesture() {
    if (!this.handleRef?.nativeElement || !this.modalElement) return;

    const handle = this.handleRef.nativeElement;

    this.gesture = await this.gestureController.create({
      el: handle,
      gestureName: 'drag-handle',
      threshold: 10,
      onStart: (ev) => {
        this.isDragging = true;
        this.startY = ev.currentY;
        this.currentY = ev.currentY;
      },
      onMove: (ev) => {
        this.currentY = ev.currentY;
        this.handleDragMove(ev);
      },
      onEnd: (ev) => {
        this.handleDragEnd(ev);
        this.isDragging = false;
      },
    });

    this.gesture.enable();
  }

  private handleDragMove(ev: any) {
    if (!this.modalElement) return;

    const deltaY = this.startY - ev.currentY;
    const windowHeight = window.innerHeight;
    const breakpointDelta = deltaY / windowHeight;

    let newBreakpoint = this.currentBreakpoint + breakpointDelta;

    newBreakpoint = Math.max(0.25, Math.min(0.9, newBreakpoint));

    this.zone.run(() => {
      this.currentBreakpoint = newBreakpoint;
      if (this.modalElement) {
        (this.modalElement as any).setCurrentBreakpoint(newBreakpoint);
      }
    });
  }

  private handleDragEnd(ev: any) {
    if (!this.modalElement) return;

    const breakpoints = [0.25, 0.55, 0.9];
    const current = this.currentBreakpoint;

    let nearest = breakpoints[0];
    let minDistance = Math.abs(current - breakpoints[0]);

    for (const bp of breakpoints) {
      const distance = Math.abs(current - bp);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = bp;
      }
    }

    this.zone.run(() => {
      this.currentBreakpoint = nearest;
      if (this.modalElement) {
        (this.modalElement as any).setCurrentBreakpoint(nearest);
      }
    });
  }

  private cleanupGesture() {
    if (this.gesture) {
      this.gesture.destroy();
      this.gesture = undefined;
    }
  }

  onBreakpointDidChange(ev: any) {
    const newBreakpoint = ev.detail.breakpoint;

    if (!this.isScrolling && !this.isDragging) {
      this.zone.run(() => {
        this.currentBreakpoint = newBreakpoint;
      });
    }

    if (newBreakpoint <= 0.25 && this.content) {
      setTimeout(() => {
        this.content.scrollToTop(300);
      }, 100);
    }
  }

  onVehicleSelect(vehicleType: string) {
    this.selectedVehicle = vehicleType;
    this.vehicleSelected.emit(vehicleType);
  }

  onCardKeydown(event: KeyboardEvent, vehicleType: VehicleTier) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onVehicleSelect(vehicleType);
    }
  }

  onConfirmRide() {
    this.confirmRide.emit();
    this.dismiss();
  }

  dismiss() {
    this.modalController.dismiss({
      selectedVehicle: this.selectedVehicle,
    });
  }

  rideListVisible(): boolean {
    return !!(
      !this.isLoadingServices &&
      this.vehicleServices &&
      !this.isCalculatingFares
    );
  }

  getPrice(vehicleType: VehicleTier): number {
    const fare = this.calculatedFares[vehicleType];

    if (fare) {
      return fare.finalFare;
    }

    const service = this.serviceForTier(vehicleType);

    return service?.price || 0;
  }

  getETA(vehicleType: VehicleTier): string {
    return this.vehicleETAs[vehicleType] || '2-4 min';
  }

  private serviceForTier(t: VehicleTier) {
    switch (t) {
      case 'cercaZip':
        return this.vehicleServices?.cercaZip;
      case 'cercaGlide':
        return this.vehicleServices?.cercaGlide;
      case 'cercaTitan':
        return this.vehicleServices?.cercaTitan;
    }
  }

  isVehicleEnabled(vehicleType: VehicleTier): boolean {
    return this.serviceForTier(vehicleType)?.enabled || false;
  }

  getVehicleName(vehicleType: VehicleTier): string {
    const service = this.serviceForTier(vehicleType);
    const fallbacks: Record<VehicleTier, string> = {
      cercaZip: 'Cerca Zip',
      cercaGlide: 'Cerca Glide',
      cercaTitan: 'Cerca Titan',
    };
    return service?.name || fallbacks[vehicleType];
  }

  getVehicleImage(vehicleType: VehicleTier): string {
    const service = this.serviceForTier(vehicleType);

    if (vehicleType === 'cercaZip') {
      return service?.imagePath || 'assets/cars/cerca-small.png';
    } else if (vehicleType === 'cercaGlide') {
      return service?.imagePath || 'assets/cars/Cerca-medium.png';
    } else {
      return service?.imagePath || 'assets/cars/cerca-large.png';
    }
  }

  getTierSubtitle(vehicleType: VehicleTier): string {
    switch (vehicleType) {
      case 'cercaZip':
        return 'Affordable • 4 seats';
      case 'cercaGlide':
        return 'Comfort • Sedan • AC';
      case 'cercaTitan':
        return 'Premium SUV • Extra space';
      default:
        return '';
    }
  }

  /** First number in ETA string */
  parseEtaMinutes(vehicleType: VehicleTier): number {
    const raw = this.getETA(vehicleType);
    const m = raw.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 99;
  }

  getFastestVehicleType(): VehicleTier | null {
    let best: VehicleTier | null = null;
    let bestMin = Infinity;
    for (const t of this.vehicleTiers) {
      if (!this.isVehicleEnabled(t)) continue;
      const m = this.parseEtaMinutes(t);
      if (m < bestMin) {
        bestMin = m;
        best = t;
      }
    }
    return best;
  }

  showHighAvailability(vehicleType: VehicleTier): boolean {
    const fastest = this.getFastestVehicleType();
    return fastest === vehicleType && this.parseEtaMinutes(vehicleType) <= 5;
  }

  showLimitedAvailability(vehicleType: VehicleTier): boolean {
    const fastest = this.getFastestVehicleType();
    return fastest === vehicleType && this.parseEtaMinutes(vehicleType) > 5;
  }

  isMostPopular(vehicleType: VehicleTier): boolean {
    return vehicleType === 'cercaGlide' && this.isVehicleEnabled('cercaGlide');
  }

  getPickupAndRideSummary(vehicleType: VehicleTier): string {
    const pickupMin = this.parseEtaMinutes(vehicleType);
    const ride = this.estimatedTripMinutes;
    if (ride != null && ride > 0) {
      return `Pickup in ${pickupMin} min • ${ride} min ride`;
    }
    return `Pickup in ${pickupMin} min`;
  }

  getCtaLabel(): string {
    const v = this.selectedVehicle as VehicleTier;
    if (!v || !this.isVehicleEnabled(v)) {
      return 'Select a ride';
    }
    const name = this.getVehicleName(v);
    const price = this.getPrice(v);
    return `Book ${name} • ₹${price} →`;
  }

  onVehicleImgError(event: Event, tier: VehicleTier): void {
    const el = event.target as HTMLImageElement;
    if (tier === 'cercaZip') {
      el.src = 'assets/cars/cerca-small.png';
    } else if (tier === 'cercaGlide') {
      el.src = 'assets/cars/Cerca-medium.png';
    } else {
      el.src = 'assets/cars/cerca-large.png';
    }
  }
}
