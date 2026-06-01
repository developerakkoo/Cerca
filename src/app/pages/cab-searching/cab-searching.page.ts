import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { AnimationController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { RideService, RideStatus } from 'src/app/services/ride.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cab-searching',
  templateUrl: './cab-searching.page.html',
  styleUrls: ['./cab-searching.page.scss'],
  standalone: false,
})
export class CabSearchingPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('slideTrack') slideTrack!: ElementRef<HTMLElement>;
  @ViewChild('slideHandle') slideHandle!: ElementRef<HTMLElement>;

  private isSliding = false;
  private startX = 0;
  private currentX = 0;
  private slideThreshold = 200;

  private rideStatusSubscription?: Subscription;
  private rideSubscription?: Subscription;
  private errorSubscription?: Subscription;

  private eventListeners: {
    element: HTMLElement;
    event: string;
    handler: EventListener;
  }[] = [];

  showNoDriverFound = false;
  noDriverMessage = 'No drivers found nearby. Please try again later.';
  private isNavigating = false;

  timeOut: ReturnType<typeof setTimeout> | null = null;
  searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private animationCtrl: AnimationController,
    private router: Router,
    private rideService: RideService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.errorSubscription = this.rideService
      .getRideErrors()
      .subscribe((error) => {
        console.error('❌ Ride error:', error);
        const errorLower = error.toLowerCase();
        const isNoDriverError =
          errorLower.includes('no driver') ||
          errorLower.includes('no drivers') ||
          (errorLower.includes('within') && errorLower.includes('radius')) ||
          errorLower.includes('try again later');

        if (isNoDriverError) {
          console.log('🚫 No driver found error detected, showing UI');
          this.noDriverMessage = error;
          this.showNoDriverFound = true;
          if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
          }
        } else {
          this.showToast(error, 'danger');
          setTimeout(() => {
            if (!this.showNoDriverFound) {
              this.router.navigate(['/tabs/tabs/tab1'], {
                replaceUrl: true,
              });
            }
          }, 2000);
        }
      });

    this.rideStatusSubscription = this.rideService
      .getRideStatus()
      .subscribe((status) => {
        console.log('🔄 Ride status changed:', status);
        this.handleRideStatusChange(status);
      });

    this.rideSubscription = this.rideService
      .getCurrentRide()
      .subscribe((ride) => {
        if (ride) {
          console.log('📦 Current ride updated:', ride);
        } else {
          console.log(
            '📦 Ride cleared - waiting for explicit noDriverFound event'
          );
        }
      });

    this.searchTimeout = setTimeout(() => {
      const currentStatus = this.rideService.getCurrentRideValue();
      if (currentStatus && this.router.url.includes('cab-searching')) {
        console.log('⏰ Search timeout reached - showing no driver found UI');
        this.noDriverMessage =
          'We could not find a driver for you at this time. Please try again later.';
        this.showNoDriverFound = true;
        this.rideService
          .cancelRide('Search timeout - no driver found')
          .catch((err) => {
            console.error('Error cancelling ride on timeout:', err);
          });
      }
    }, 150000);
  }

  ngAfterViewInit() {
    this.timeOut = setTimeout(() => {
      this.setupSlideToCancel();
    }, 100);
  }

  ngOnDestroy() {
    if (this.timeOut) {
      clearTimeout(this.timeOut);
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    this.rideStatusSubscription?.unsubscribe();
    this.rideSubscription?.unsubscribe();
    this.errorSubscription?.unsubscribe();
  }

  private handleRideStatusChange(status: RideStatus) {
    switch (status) {
      case 'accepted':
        console.log('✅ Driver accepted! Navigating to active-ordere...');
        this.navigateToActiveOrder();
        break;
      case 'cancelled':
        if (!this.showNoDriverFound) {
          this.router.navigate(['/tabs/tabs/tab1'], {
            replaceUrl: true,
          });
        }
        break;
      case 'idle':
        if (!this.showNoDriverFound) {
          this.router.navigate(['/tabs/tabs/tab1'], {
            replaceUrl: true,
          });
        }
        break;
      default:
        break;
    }
  }

  private navigateToActiveOrder(): void {
    if (this.isNavigating) {
      console.log(
        '⚠️ Navigation already in progress, skipping duplicate navigation'
      );
      return;
    }

    if (!this.router.url.includes('cab-searching')) {
      console.log('⚠️ Not on cab-searching page, skipping navigation');
      return;
    }

    this.isNavigating = true;
    console.log('🚀 Navigating to active-ordere page...');

    if (this.timeOut) {
      clearTimeout(this.timeOut);
      this.timeOut = null;
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    setTimeout(() => {
      try {
        this.router
          .navigate(['/active-ordere'], {
            replaceUrl: true,
          })
          .then(() => {
            console.log('✅ Successfully navigated to active-ordere');
          })
          .catch((error) => {
            console.error('❌ Navigation error:', error);
            this.isNavigating = false;
          });
      } catch (error) {
        console.error('❌ Navigation error:', error);
        this.isNavigating = false;
      }
    }, 100);
  }

  goBack() {
    this.router.navigate(['/tabs/tabs/tab1'], {
      replaceUrl: true,
    });
  }

  private async showToast(message: string, color: string = 'dark') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }

  private updateSlideThreshold(): void {
    const track = this.slideTrack?.nativeElement;
    const handle = this.slideHandle?.nativeElement;
    if (track && handle) {
      this.slideThreshold = Math.max(
        track.offsetWidth - handle.offsetWidth - 12,
        120
      );
    }
  }

  private setHandleTranslateX(px: number): void {
    const handle = this.slideHandle?.nativeElement;
    if (handle) {
      handle.style.transform = `translateX(${px}px)`;
    }
  }

  private resetHandlePosition(): void {
    this.setHandleTranslateX(0);
  }

  private setupSlideToCancel() {
    const track = this.slideTrack?.nativeElement;
    const handle = this.slideHandle?.nativeElement;
    if (!track || !handle) {
      console.error('Slide track or handle element not found');
      return;
    }

    this.updateSlideThreshold();

    const addTrackedListener = (
      element: HTMLElement,
      event: string,
      handler: EventListener
    ) => {
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    };

    const onSlideMove = (clientX: number) => {
      const diff = clientX - this.startX;
      if (diff > 0) {
        this.setHandleTranslateX(Math.min(diff, this.slideThreshold));
      }
    };

    const onSlideEnd = () => {
      if (!this.isSliding) return;

      const diff = this.currentX - this.startX;
      if (diff >= this.slideThreshold) {
        this.cancelSearch();
      } else {
        this.resetHandlePosition();
      }

      this.isSliding = false;
    };

    addTrackedListener(track, 'touchstart', (e: Event) => {
      const touchEvent = e as TouchEvent;
      this.startX = touchEvent.touches[0].clientX;
      this.isSliding = true;
    });

    addTrackedListener(track, 'touchmove', (e: Event) => {
      if (!this.isSliding) return;
      const touchEvent = e as TouchEvent;
      this.currentX = touchEvent.touches[0].clientX;
      onSlideMove(this.currentX);
    });

    addTrackedListener(track, 'touchend', () => onSlideEnd());

    addTrackedListener(track, 'mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      this.startX = mouseEvent.clientX;
      this.isSliding = true;
    });

    addTrackedListener(track, 'mousemove', (e: Event) => {
      if (!this.isSliding) return;
      const mouseEvent = e as MouseEvent;
      this.currentX = mouseEvent.clientX;
      onSlideMove(this.currentX);
    });

    addTrackedListener(track, 'mouseup', () => onSlideEnd());

    addTrackedListener(track, 'dragstart', (e: Event) => {
      (e as DragEvent).preventDefault();
    });
  }

  private async cancelSearch() {
    if (this.timeOut) {
      clearTimeout(this.timeOut);
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    const handle = this.slideHandle?.nativeElement;
    if (handle) {
      const animation = this.animationCtrl
        .create()
        .addElement(handle)
        .duration(300)
        .easing('ease-out')
        .fromTo(
          'transform',
          handle.style.transform || 'translateX(0)',
          `translateX(${this.slideThreshold}px)`
        )
        .fromTo('opacity', '1', '0.6');

      await animation.play();
    }

    try {
      await this.rideService.cancelRide('User cancelled during search');
      this.router.navigate(['/cancel-order'], {
        replaceUrl: true,
      });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      this.router.navigate(['/tabs/tabs/tab1'], {
        replaceUrl: true,
      });
    }
  }
}
