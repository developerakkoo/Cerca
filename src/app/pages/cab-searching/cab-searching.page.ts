import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { AnimationController } from '@ionic/angular';
import { Router } from '@angular/router';

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

  timeOut: any;
  constructor(
    private animationCtrl: AnimationController,
    private router: Router
  ) {}

  ngOnInit() {
    // We'll create animations in ngAfterViewInit instead
  }

  ngAfterViewInit() {
    // Wait for the next tick to ensure elements are rendered
    this.timeOut = setTimeout(() => {
      this.createAnimations();
      this.startTypewriterEffect();
      this.setupSlideToCancel();
    }, 100);

    this.timeOut = setTimeout(() => {
      this.router.navigate(['/active-ordere']);
    }, 5000);
  }

  ngOnDestroy() {
    // Clean up animations when component is destroyed
    this.animations.forEach(animation => animation.destroy());
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
    }
  }

  private setupSlideToCancel() {
    if (!this.slideButton?.nativeElement) {
      console.error('Slide button element not found');
      return;
    }

    const button = this.slideButton.nativeElement;

    // Touch events
    button.addEventListener('touchstart', (e: TouchEvent) => {
      this.startX = e.touches[0].clientX;
      this.isSliding = true;
    });

    button.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.isSliding) return;
      
      this.currentX = e.touches[0].clientX;
      const diff = this.currentX - this.startX;
      
      if (diff > 0) {
        button.style.transform = `translateX(${Math.min(diff, this.slideThreshold)}px)`;
      }
    });

    button.addEventListener('touchend', () => {
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
    button.addEventListener('mousedown', (e: MouseEvent) => {
      this.startX = e.clientX;
      this.isSliding = true;
    });

    button.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isSliding) return;
      
      this.currentX = e.clientX;
      const diff = this.currentX - this.startX;
      
      if (diff > 0) {
        button.style.transform = `translateX(${Math.min(diff, this.slideThreshold)}px)`;
      }
    });

    button.addEventListener('mouseup', () => {
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
    button.addEventListener('dragstart', (e: DragEvent) => {
      e.preventDefault();
    });
  }

  private cancelSearch() {
    clearTimeout(this.timeOut);
    // Add a smooth animation for the cancel action
    const animation = this.animationCtrl.create()
      .addElement(this.slideButton.nativeElement)
      .duration(300)
      .easing('ease-out')
      .fromTo('transform', 'translateX(0)', 'translateX(100%)')
      .fromTo('opacity', '1', '0');

    animation.play().then(() => {
      // Navigate back after animation completes
      this.router.navigate(['/cancel-order']);
    });
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
    const pulseCircles = [1, 2, 3].map((num, index) => {
      const element = this.animationContainer.nativeElement.querySelector(`.circle-${num}`);
      if (!element) {
        console.error(`Circle ${num} not found`);
        return null;
      }

      return this.animationCtrl.create()
        .addElement(element)
        .duration(2000)
        .iterations(Infinity)
        .keyframes([
          { offset: 0, transform: 'scale(0.2)', opacity: 0, boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)' },
          { offset: 0.2, transform: 'scale(0.4)', opacity: 0.4, boxShadow: '0 0 10px 5px rgba(76, 175, 80, 0.2)' },
          { offset: 0.4, transform: 'scale(0.6)', opacity: 0.6, boxShadow: '0 0 20px 10px rgba(76, 175, 80, 0.1)' },
          { offset: 0.6, transform: 'scale(0.8)', opacity: 0.4, boxShadow: '0 0 10px 5px rgba(76, 175, 80, 0.2)' },
          { offset: 0.8, transform: 'scale(1)', opacity: 0.2, boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)' },
          { offset: 1, transform: 'scale(1.2)', opacity: 0, boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
        ])
        .easing('cubic-bezier(0.4, 0, 0.6, 1)')
        .delay(index * 500);
    }).filter(Boolean);

    // Create rotating animations for dashed circles
    const rotatingCircles = [4, 5].map((num, index) => {
      const element = this.animationContainer.nativeElement.querySelector(`.circle-${num}`);
      if (!element) {
        console.error(`Circle ${num} not found`);
        return null;
      }

      return this.animationCtrl.create()
        .addElement(element)
        .duration(10000)
        .iterations(Infinity)
        .fromTo('transform', 'rotate(0deg)', 'rotate(360deg)')
        .easing('linear')
        .direction(index === 0 ? 'normal' : 'reverse');
    }).filter(Boolean);

    // Combine all animations
    this.animations = [...pulseCircles, ...rotatingCircles];

    // Play all animations
    this.animations.forEach(animation => {
      if (animation) {
        animation.play();
      }
    });
  }
}
