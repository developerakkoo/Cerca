import {
  Component,
  OnInit,
  OnDestroy,
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
import { SettingsService, VehicleServices } from '../../services/settings.service';
import { FareService, FareBreakdown } from '../../services/fare.service';
import { Subscription } from 'rxjs';

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
export class ChooseTripModal implements OnInit, OnDestroy {
  @ViewChild(IonContent, { static: false }) content!: IonContent;
  @ViewChild('handle', { static: false }) handleRef!: ElementRef;
  @ViewChild('contentWrapper', { static: false }) contentWrapperRef!: ElementRef;
  
  // Reference to modal element for breakpoint control
  private modalElement: HTMLElement | null = null;

  @Input() pickupAddress: string = '';
  @Input() destinationAddress: string = '';
  @Input() vehicleServices: VehicleServices | null = null;
  @Input() calculatedFares: { cercaSmall?: FareBreakdown; cercaMedium?: FareBreakdown; cercaLarge?: FareBreakdown } = {};
  @Input() vehicleETAs: { small?: string; medium?: string; large?: string } = {};
  @Input() selectedVehicle: string = 'small';
  @Input() isLoadingServices: boolean = false;
  @Input() isCalculatingFares: boolean = false;

  @Output() vehicleSelected = new EventEmitter<string>();
  @Output() confirmRide = new EventEmitter<void>();

  // Modal state
  currentBreakpoint: number = 0.25; // Start collapsed
  isScrolling: boolean = false;
  lastScrollTop: number = 0;
  scrollDirection: 'up' | 'down' = 'down';
  
  // Gesture tracking
  private gesture?: any;
  private startY: number = 0;
  private currentY: number = 0;
  private isDragging: boolean = false;
  
  // Performance optimization
  private scrollThrottleTimer: any = null;
  private rafId: number | null = null;
  
  // Subscriptions
  private subscriptions: Subscription[] = [];

  constructor(
    private modalController: ModalController,
    private gestureController: GestureController,
    private zone: NgZone
  ) {}

  ngOnInit() {
    // Initialize modal at collapsed state
    this.currentBreakpoint = 0.25;
  }

  ngAfterViewInit() {
    // Find modal element
    this.modalElement = document.querySelector('ion-modal.choose-trip-modal');
    
    // Setup scroll listener after view init
    setTimeout(() => {
      this.setupScrollListener();
      this.setupDragGesture();
    }, 300);
  }

  ngOnDestroy() {
    // Cleanup
    this.cleanupGesture();
    this.cleanupScrollListener();
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }

  /**
   * Setup scroll listener for content
   * Throttles scroll events for performance
   */
  private setupScrollListener() {
    if (!this.content) return;

    const contentElement = this.content.getScrollElement();
    if (!contentElement) return;

    // Use passive listener for better performance
    contentElement.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
  }

  /**
   * Cleanup scroll listener
   */
  private cleanupScrollListener() {
    if (!this.content) return;
    
    const contentElement = this.content.getScrollElement();
    if (contentElement) {
      contentElement.removeEventListener('scroll', this.onScroll.bind(this));
    }
  }

  /**
   * Handle scroll events
   * Throttled for performance, syncs scroll with modal height
   */
  private onScroll(event: Event) {
    if (this.isDragging) return; // Don't interfere with drag gesture

    // Throttle scroll events
    if (this.scrollThrottleTimer) {
      return;
    }

    this.scrollThrottleTimer = setTimeout(() => {
      this.scrollThrottleTimer = null;
    }, 16); // ~60fps

    const target = event.target as HTMLElement;
    const scrollTop = target.scrollTop || 0;
    const scrollHeight = target.scrollHeight || 0;
    const clientHeight = target.clientHeight || 0;

    // Determine scroll direction
    this.scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
    this.lastScrollTop = scrollTop;

    // Only adjust breakpoint if user is actively scrolling
    if (scrollTop > 0 && scrollTop < scrollHeight - clientHeight - 10) {
      this.isScrolling = true;
      
      // Gradually adjust breakpoint based on scroll
      this.adjustBreakpointFromScroll(scrollTop, scrollHeight, clientHeight);
    } else if (scrollTop === 0 && this.scrollDirection === 'down') {
      // At top, allow collapse
      this.isScrolling = false;
    } else if (scrollTop >= scrollHeight - clientHeight - 10) {
      // At bottom, allow expansion
      this.isScrolling = false;
    }
  }

  /**
   * Adjust modal breakpoint based on scroll position
   * Smooth interpolation between breakpoints
   */
  private adjustBreakpointFromScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
    if (!this.modalElement) return;

    const scrollRatio = scrollTop / Math.max(scrollHeight - clientHeight, 1);
    
    // Map scroll ratio to breakpoint (0.25 to 0.9)
    const minBreakpoint = 0.25;
    const maxBreakpoint = 0.9;
    const targetBreakpoint = minBreakpoint + (scrollRatio * (maxBreakpoint - minBreakpoint));
    
    // Smooth interpolation
    const current = this.currentBreakpoint;
    const smoothFactor = 0.15; // Adjust for smoothness
    const newBreakpoint = current + (targetBreakpoint - current) * smoothFactor;
    
    // Clamp to valid range
    const clampedBreakpoint = Math.max(minBreakpoint, Math.min(maxBreakpoint, newBreakpoint));
    
    this.zone.run(() => {
      this.currentBreakpoint = clampedBreakpoint;
      // Update modal breakpoint via element
      if (this.modalElement) {
        (this.modalElement as any).setCurrentBreakpoint(clampedBreakpoint);
      }
    });
  }

  /**
   * Setup drag gesture on handle
   * Allows dragging the modal up/down
   */
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

  /**
   * Handle drag move
   * Calculate new breakpoint based on drag distance
   */
  private handleDragMove(ev: any) {
    if (!this.modalElement) return;

    const deltaY = this.startY - ev.currentY; // Positive = dragging up
    const windowHeight = window.innerHeight;
    const breakpointDelta = deltaY / windowHeight;

    // Calculate new breakpoint
    let newBreakpoint = this.currentBreakpoint + breakpointDelta;
    
    // Clamp to valid range
    newBreakpoint = Math.max(0.25, Math.min(0.9, newBreakpoint));
    
    this.zone.run(() => {
      this.currentBreakpoint = newBreakpoint;
      if (this.modalElement) {
        (this.modalElement as any).setCurrentBreakpoint(newBreakpoint);
      }
    });
  }

  /**
   * Handle drag end
   * Snap to nearest breakpoint
   */
  private handleDragEnd(ev: any) {
    if (!this.modalElement) return;

    const breakpoints = [0.25, 0.55, 0.9];
    const current = this.currentBreakpoint;
    
    // Find nearest breakpoint
    let nearest = breakpoints[0];
    let minDistance = Math.abs(current - breakpoints[0]);
    
    for (const bp of breakpoints) {
      const distance = Math.abs(current - bp);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = bp;
      }
    }

    // Snap to nearest breakpoint
    this.zone.run(() => {
      this.currentBreakpoint = nearest;
      if (this.modalElement) {
        (this.modalElement as any).setCurrentBreakpoint(nearest);
      }
    });
  }

  /**
   * Cleanup gesture
   */
  private cleanupGesture() {
    if (this.gesture) {
      this.gesture.destroy();
      this.gesture = undefined;
    }
  }

  /**
   * Handle breakpoint did change
   * Reset scroll if needed
   */
  onBreakpointDidChange(ev: any) {
    const newBreakpoint = ev.detail.breakpoint;
    
    // Only update if not actively scrolling/dragging
    if (!this.isScrolling && !this.isDragging) {
      this.zone.run(() => {
        this.currentBreakpoint = newBreakpoint;
      });
    }
    
    // If collapsed, scroll to top
    if (newBreakpoint <= 0.25 && this.content) {
      setTimeout(() => {
        this.content.scrollToTop(300);
      }, 100);
    }
  }

  /**
   * Handle vehicle selection
   */
  onVehicleSelect(vehicleType: string) {
    this.selectedVehicle = vehicleType;
    this.vehicleSelected.emit(vehicleType);
  }

  /**
   * Handle confirm ride
   */
  onConfirmRide() {
    this.confirmRide.emit();
    this.dismiss();
  }

  /**
   * Dismiss modal
   */
  dismiss() {
    this.modalController.dismiss({
      selectedVehicle: this.selectedVehicle,
    });
  }

  /**
   * Get price for vehicle type
   */
  getPrice(vehicleType: 'small' | 'medium' | 'large'): number {
    const fareKey = vehicleType === 'small' ? 'cercaSmall' : 
                    vehicleType === 'medium' ? 'cercaMedium' : 'cercaLarge';
    const fare = this.calculatedFares[fareKey];
    
    if (fare) {
      return fare.finalFare;
    }
    
    // Fallback to service price
    const service = vehicleType === 'small' ? this.vehicleServices?.cercaSmall :
                    vehicleType === 'medium' ? this.vehicleServices?.cercaMedium :
                    this.vehicleServices?.cercaLarge;
    
    return service?.price || 0;
  }

  /**
   * Get ETA for vehicle type
   */
  getETA(vehicleType: 'small' | 'medium' | 'large'): string {
    return this.vehicleETAs[vehicleType] || '2-4 min';
  }

  /**
   * Check if vehicle is enabled
   */
  isVehicleEnabled(vehicleType: 'small' | 'medium' | 'large'): boolean {
    const service = vehicleType === 'small' ? this.vehicleServices?.cercaSmall :
                    vehicleType === 'medium' ? this.vehicleServices?.cercaMedium :
                    this.vehicleServices?.cercaLarge;
    return service?.enabled || false;
  }

  /**
   * Get vehicle name
   */
  getVehicleName(vehicleType: 'small' | 'medium' | 'large'): string {
    const service = vehicleType === 'small' ? this.vehicleServices?.cercaSmall :
                    vehicleType === 'medium' ? this.vehicleServices?.cercaMedium :
                    this.vehicleServices?.cercaLarge;
    return service?.name || vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
  }

  /**
   * Get vehicle image path
   */
  getVehicleImage(vehicleType: 'small' | 'medium' | 'large'): string {
    const service = vehicleType === 'small' ? this.vehicleServices?.cercaSmall :
                    vehicleType === 'medium' ? this.vehicleServices?.cercaMedium :
                    this.vehicleServices?.cercaLarge;
    
    if (vehicleType === 'small') {
      return service?.imagePath || 'assets/cars/cerca-small.png';
    } else if (vehicleType === 'medium') {
      return service?.imagePath || 'assets/cars/Cerca-medium.png';
    } else {
      return service?.imagePath || 'assets/cars/cerca-large.png';
    }
  }
}

