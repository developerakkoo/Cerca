import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { AnimationController } from '@ionic/angular';

@Component({
  selector: 'app-cab-searching',
  templateUrl: './cab-searching.page.html',
  styleUrls: ['./cab-searching.page.scss'],
  standalone: false,
})
export class CabSearchingPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('animationContainer') animationContainer!: ElementRef;
  @ViewChild('statusText') statusText!: ElementRef;
  private animations: any[] = [];
  private typewriterText = 'Searching for nearby cabs...';
  private currentText = '';
  private typewriterInterval: any;

  constructor(private animationCtrl: AnimationController) {}

  ngOnInit() {
    // We'll create animations in ngAfterViewInit instead
  }

  ngAfterViewInit() {
    // Wait for the next tick to ensure elements are rendered
    setTimeout(() => {
      this.createAnimations();
      this.startTypewriterEffect();
    }, 100);
  }

  ngOnDestroy() {
    // Clean up animations when component is destroyed
    this.animations.forEach(animation => animation.destroy());
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
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
