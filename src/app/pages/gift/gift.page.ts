import { Component, OnInit } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { AnimationController, ToastController, Platform, LoadingController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import confetti from 'canvas-confetti';
import { CouponService } from '../../services/coupon.service';

interface Coupon {
  id?: string;
  couponId?: string;
  title: string;
  description: string;
  discount: string;
  expiryDate: string | Date;
  isUnlocked: boolean;
  isUsed?: boolean;
  code: string;
  image: string;
}

@Component({
  selector: 'app-gift',
  templateUrl: './gift.page.html',
  styleUrls: ['./gift.page.scss'],
  standalone: false
})
export class GiftPage implements OnInit {
  coupons: Coupon[] = [];
  isLoading = false;
  userId: string | null = null;

  constructor(
    private animationCtrl: AnimationController,
    private toastController: ToastController,
    private platform: Platform,
    private couponService: CouponService,
    private storage: Storage,
    private loadingCtrl: LoadingController
  ) {}

  async ngOnInit() {
    await this.loadUserId();
    await this.loadUserGifts();
  }

  private async loadUserId() {
    this.userId = await this.storage.get('userId');
    if (!this.userId) {
      console.warn('User ID not found');
      await this.presentToast('User not authenticated');
    }
  }

  private async loadUserGifts() {
    if (!this.userId) {
      return;
    }

    this.isLoading = true;
    const loading = await this.loadingCtrl.create({
      message: 'Loading gifts...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const response = await this.couponService.getUserGifts(this.userId).toPromise();
      
      if (response && response.success && response.data) {
        // Map backend response to component format
        this.coupons = response.data.map((gift: any, index: number) => ({
          id: gift.couponId || gift.id || `gift-${index}`,
          couponId: gift.couponId,
          title: gift.title || 'Gift',
          description: gift.description || '',
          discount: gift.discount || '',
          expiryDate: gift.expiryDate || new Date(),
          isUnlocked: gift.isUnlocked !== false, // Default to true if not specified
          isUsed: gift.isUsed || false,
          code: gift.code || gift.couponCode || '',
          image: gift.image || 'assets/gift-box.png',
        }));
        
        // Initialize already-unlocked gifts to ensure they display properly
        setTimeout(() => {
          this.initializeUnlockedGifts();
        }, 100);
      } else {
        console.warn('No gifts found or error:', response?.message);
        this.coupons = [];
      }
    } catch (error) {
      console.error('Error loading gifts:', error);
      await this.presentToast('Failed to load gifts');
      this.coupons = [];
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  private initializeUnlockedGifts() {
    // Ensure all already-unlocked gifts have their details visible
    this.coupons.forEach((coupon) => {
      if (coupon.isUnlocked || coupon.isUsed) {
        const element = document.querySelector(`#coupon-${coupon.id || coupon.couponId}`);
        if (element) {
          const detailsElement = element.querySelector('.coupon-details');
          if (detailsElement) {
            detailsElement.classList.add('unlocked');
          }
        }
      }
    });
  }

  async unlockCoupon(coupon: Coupon) {
    const element = document.querySelector(`#coupon-${coupon.id || coupon.couponId}`);
    if (!element) return;

    // If already unlocked or used, show reveal animation
    if (coupon.isUnlocked || coupon.isUsed) {
      // Create reveal/bounce animation for already-unlocked gifts
      const revealAnimation = this.animationCtrl.create()
        .addElement(element)
        .duration(600)
        .easing('cubic-bezier(0.4, 0, 0.2, 1)')
        .keyframes([
          { offset: 0, transform: 'scale(1)' },
          { offset: 0.5, transform: 'scale(1.05)' },
          { offset: 1, transform: 'scale(1)' }
        ]);

      await revealAnimation.play();
      
      // Trigger confetti for visual feedback
      this.triggerConfetti();
      return;
    }

    // Create gift box opening animation for locked gifts
    const giftBoxAnimation = this.animationCtrl.create()
      .addElement(element)
      .duration(1000)
      .easing('cubic-bezier(0.4, 0, 0.2, 1)')
      .keyframes([
        { offset: 0, transform: 'scale(1) rotate(0deg)' },
        { offset: 0.3, transform: 'scale(1.2) rotate(10deg)' },
        { offset: 0.6, transform: 'scale(0.8) rotate(-10deg)' },
        { offset: 1, transform: 'scale(1) rotate(0deg)' }
      ]);

    // Play gift box animation
    await giftBoxAnimation.play();

    // Trigger confetti animation
    this.triggerConfetti();

    // Update coupon status
    coupon.isUnlocked = true;
    
    // Force change detection
    setTimeout(() => {
      const detailsElement = element.querySelector('.coupon-details');
      if (detailsElement) {
        detailsElement.classList.add('unlocked');
      }
    }, 100);
  }

  private triggerConfetti() {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      Haptics.impact({ style: ImpactStyle.Light });
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      // since particles fall down, start a bit higher than random
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  }

  async copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      await this.presentToast('Code copied to clipboard');
    } catch (error) {
      console.error('Failed to copy code:', error);
      await this.presentToast('Failed to copy code');
    }
  }

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color: 'tertiary',
      cssClass: 'custom-toast',
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ]
    });

    // Ensure toast is shown on iOS
    if (this.platform.is('ios')) {
      toast.style.setProperty('--min-width', '100%');
      toast.style.setProperty('--min-height', '44px');
      toast.style.setProperty('--border-radius', '0');
      toast.style.setProperty('--box-shadow', 'none');
    }

    await toast.present();
  }

  launchConfetti() {
    const duration = 2 * 1000; // 2 seconds
    const end = Date.now() + duration;

    const colors = ['#C7356F', '#D735F4', '#35F485', '#359EF4'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 90,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }
}
