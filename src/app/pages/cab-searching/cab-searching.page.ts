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
  @ViewChild('animationContainer') animationContainer!: ElementRef;
  @ViewChild('statusText') statusText!: ElementRef;
  @ViewChild('slideButton') slideButton!: ElementRef;
  private animations: any[] = [];
  private typewriterText = 'Searching for nearby cabs...';
  private currentText = '';
  private typewriterInterval: any;
  private isSliding = false;
  private startX = 0;
  private currentX = 0;
  private slideThreshold = 200; // Distance needed to trigger cancel

  // Socket.IO subscriptions
  private rideStatusSubscription?: Subscription;
  private rideSubscription?: Subscription;
  private errorSubscription?: Subscription;

  // Event listener references for cleanup
  private eventListeners: {
    element: HTMLElement;
    event: string;
    handler: EventListener;
  }[] = [];

  // UI state
  showNoDriverFound = false;
  noDriverMessage = 'No drivers found nearby. Please try again later.';

  timeOut: any;
  searchTimeout: any;

  constructor(
    private animationCtrl: AnimationController,
    private router: Router,
    private rideService: RideService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    // Subscribe to ride errors - handle noDriverFound event
    this.errorSubscription = this.rideService
      .getRideErrors()
      .subscribe((error) => {
        console.error('❌ Ride error:', error);
        // Check if it's a "no driver found" error - match backend message pattern
        const errorLower = error.toLowerCase();
        const isNoDriverError = 
          errorLower.includes('no driver') || 
          errorLower.includes('no drivers') ||
          (errorLower.includes('within') && errorLower.includes('radius')) ||
          errorLower.includes('try again later');
        
        if (isNoDriverError) {
          console.log('🚫 No driver found error detected, showing UI');
          // Show no driver found UI
          this.noDriverMessage = error;
          this.showNoDriverFound = true;
          this.stopAnimations();
          // Clear search timeout
          if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
          }
        } else {
          // For other errors, show toast and navigate
          this.showToast(error, 'danger');
          setTimeout(() => {
            if (!this.showNoDriverFound) { // Only navigate if no driver found UI is not active
              this.router.navigate(['/tabs/tabs/tab1'], {
                replaceUrl: true,
              });
            }
          }, 2000);
        }
      });

    // Subscribe to ride status changes
    this.rideStatusSubscription = this.rideService
      .getRideStatus()
      .subscribe((status) => {
        console.log('🔄 Ride status changed:', status);
        this.handleRideStatusChange(status);
      });

    // Subscribe to ride updates
    this.rideSubscription = this.rideService
      .getCurrentRide()
      .subscribe((ride) => {
        if (ride) {
          console.log('📦 Current ride updated:', ride);
        }
      });

    // Set a timeout for maximum search time (2 minutes)
    // Note: This is a fallback. The noDriverFound event from backend should handle this first.
    this.searchTimeout = setTimeout(() => {
      const currentStatus = this.rideService.getCurrentRideValue();
      if (currentStatus && this.router.url.includes('cab-searching')) {
        this.showToast('No drivers found nearby. Please try again.', 'warning');
        this.router.navigate(['/tabs/tabs/tab1'], {
          replaceUrl: true,
        });
      }
    }, 120000); // 2 minutes
  }

  ngAfterViewInit() {
    // Wait for the next tick to ensure elements are rendered
    this.timeOut = setTimeout(() => {
      this.createAnimations();
      this.startTypewriterEffect();
      this.setupSlideToCancel();
    }, 100);
  }

  ngOnDestroy() {
    // Clean up animations when component is destroyed
    this.animations.forEach((animation) => animation.destroy());
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
    }
    if (this.timeOut) {
      clearTimeout(this.timeOut);
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Remove all event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    // Unsubscribe from all Socket.IO subscriptions
    this.rideStatusSubscription?.unsubscribe();
    this.rideSubscription?.unsubscribe();
    this.errorSubscription?.unsubscribe();
  }

  private handleRideStatusChange(status: RideStatus) {
    switch (status) {
      case 'accepted':
        // Driver accepted - RideService will navigate to active-ordere
        console.log('✅ Driver accepted!');
        break;
      case 'cancelled':
        // Ride cancelled - if no driver found UI is showing, don't navigate
        // (cancellation is handled on cancel-order page)
        if (!this.showNoDriverFound) {
          this.router.navigate(['/tabs/tabs/tab1'], {
            replaceUrl: true,
          });
        }
        break;
      case 'idle':
        // Ride is idle - shouldn't be on this page
        if (!this.showNoDriverFound) {
          this.router.navigate(['/tabs/tabs/tab1'], {
            replaceUrl: true,
          });
        }
        break;
      default:
        // Continue searching
        break;
    }
  }

  private stopAnimations() {
    // Stop all animations
    this.animations.forEach((animation) => {
      if (animation) {
        animation.stop();
      }
    });
    // Clear typewriter interval
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
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

  private setupSlideToCancel() {
    if (!this.slideButton?.nativeElement) {
      console.error('Slide button element not found');
      return;
    }

    const button = this.slideButton.nativeElement;

    // Helper function to add and track event listeners
    const addTrackedListener = (
      element: HTMLElement,
      event: string,
      handler: EventListener
    ) => {
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    };

    // Touch events
    addTrackedListener(button, 'touchstart', (e: Event) => {
      const touchEvent = e as TouchEvent;
      this.startX = touchEvent.touches[0].clientX;
      this.isSliding = true;
    });

    addTrackedListener(button, 'touchmove', (e: Event) => {
      if (!this.isSliding) return;
      const touchEvent = e as TouchEvent;

      this.currentX = touchEvent.touches[0].clientX;
      const diff = this.currentX - this.startX;

      if (diff > 0) {
        button.style.transform = `translateX(${Math.min(
          diff,
          this.slideThreshold
        )}px)`;
      }
    });

    addTrackedListener(button, 'touchend', () => {
      if (!this.isSliding) return;

      const diff = this.currentX - this.startX;
      if (diff >= this.slideThreshold) {
        // Trigger cancel action
        this.cancelSearch();
      } else {
        // Reset position
        button.style.transform = 'translateX(0)';
      }

      this.isSliding = false;
    });

    // Mouse events for desktop
    addTrackedListener(button, 'mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      this.startX = mouseEvent.clientX;
      this.isSliding = true;
    });

    addTrackedListener(button, 'mousemove', (e: Event) => {
      if (!this.isSliding) return;
      const mouseEvent = e as MouseEvent;

      this.currentX = mouseEvent.clientX;
      const diff = this.currentX - this.startX;

      if (diff > 0) {
        button.style.transform = `translateX(${Math.min(
          diff,
          this.slideThreshold
        )}px)`;
      }
    });

    addTrackedListener(button, 'mouseup', () => {
      if (!this.isSliding) return;

      const diff = this.currentX - this.startX;
      if (diff >= this.slideThreshold) {
        // Trigger cancel action
        this.cancelSearch();
      } else {
        // Reset position
        button.style.transform = 'translateX(0)';
      }

      this.isSliding = false;
    });

    // Prevent default drag behavior
    addTrackedListener(button, 'dragstart', (e: Event) => {
      const dragEvent = e as DragEvent;
      dragEvent.preventDefault();
    });
  }

  private async cancelSearch() {
    clearTimeout(this.timeOut);
    clearTimeout(this.searchTimeout);

    // Add a smooth animation for the cancel action
    const animation = this.animationCtrl
      .create()
      .addElement(this.slideButton.nativeElement)
      .duration(300)
      .easing('ease-out')
      .fromTo('transform', 'translateX(0)', 'translateX(100%)')
      .fromTo('opacity', '1', '0');

    await animation.play();

    // Cancel the ride via Socket.IO
    try {
      await this.rideService.cancelRide('User cancelled during search');
      // Navigate to cancel-order page
      this.router.navigate(['/cancel-order'], {
        replaceUrl: true,
      });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      // Navigate back anyway
      this.router.navigate(['/tabs/tabs/tab1'], {
        replaceUrl: true,
      });
    }
  }

  private startTypewriterEffect() {
    if (!this.statusText?.nativeElement) {
      console.error('Status text element not found');
      return;
    }

    let index = 0;
    this.currentText = '';
    this.statusText.nativeElement.textContent = '';

    this.typewriterInterval = setInterval(() => {
      if (index < this.typewriterText.length) {
        this.currentText += this.typewriterText.charAt(index);
        this.statusText.nativeElement.textContent = this.currentText;
        index++;
      } else {
        clearInterval(this.typewriterInterval);
        // Restart the effect after a delay
        setTimeout(() => {
          this.currentText = '';
          this.statusText.nativeElement.textContent = '';
          this.startTypewriterEffect();
        }, 2000);
      }
    }, 100);
  }

  private createAnimations() {
    if (!this.animationContainer?.nativeElement) {
      console.error('Animation container not found');
      return;
    }

    // Create pulse animations for each circle
    const pulseCircles = [1, 2, 3]
      .map((num, index) => {
        const element = this.animationContainer.nativeElement.querySelector(
          `.circle-${num}`
        );
        if (!element) {
          console.error(`Circle ${num} not found`);
          return null;
        }

        return this.animationCtrl
          .create()
          .addElement(element)
          .duration(2000)
          .iterations(Infinity)
          .keyframes([
            {
              offset: 0,
              transform: 'scale(0.2)',
              opacity: 0,
              boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)',
            },
            {
              offset: 0.2,
              transform: 'scale(0.4)',
              opacity: 0.4,
              boxShadow: '0 0 10px 5px rgba(76, 175, 80, 0.2)',
            },
            {
              offset: 0.4,
              transform: 'scale(0.6)',
              opacity: 0.6,
              boxShadow: '0 0 20px 10px rgba(76, 175, 80, 0.1)',
            },
            {
              offset: 0.6,
              transform: 'scale(0.8)',
              opacity: 0.4,
              boxShadow: '0 0 10px 5px rgba(76, 175, 80, 0.2)',
            },
            {
              offset: 0.8,
              transform: 'scale(1)',
              opacity: 0.2,
              boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)',
            },
            {
              offset: 1,
              transform: 'scale(1.2)',
              opacity: 0,
              boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)',
            },
          ])
          .easing('cubic-bezier(0.4, 0, 0.6, 1)')
          .delay(index * 500);
      })
      .filter(Boolean);

    // Create rotating animations for dashed circles
    const rotatingCircles = [4, 5]
      .map((num, index) => {
        const element = this.animationContainer.nativeElement.querySelector(
          `.circle-${num}`
        );
        if (!element) {
          console.error(`Circle ${num} not found`);
          return null;
        }

        return this.animationCtrl
          .create()
          .addElement(element)
          .duration(10000)
          .iterations(Infinity)
          .fromTo('transform', 'rotate(0deg)', 'rotate(360deg)')
          .easing('linear')
          .direction(index === 0 ? 'normal' : 'reverse');
      })
      .filter(Boolean);

    // Combine all animations
    this.animations = [...pulseCircles, ...rotatingCircles];

    // Play all animations
    this.animations.forEach((animation) => {
      if (animation) {
        animation.play();
      }
    });
  }
}
