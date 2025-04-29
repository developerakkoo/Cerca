import { Component, OnInit } from '@angular/core';
import { AnimationController, ToastController, Platform } from '@ionic/angular';

interface Coupon {
  id: number;
  title: string;
  description: string;
  discount: string;
  expiryDate: string;
  isUnlocked: boolean;
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
  coupons: Coupon[] = [
    {
      id: 1,
      title: 'Welcome Bonus',
      description: 'Get 20% off on your first ride',
      discount: '20% OFF',
      expiryDate: '2024-12-31',
      isUnlocked: false,
      code: 'WELCOME20',
      image: 'assets/gift-box.png'
    },
    {
      id: 2,
      title: 'Weekend Special',
      description: 'Enjoy 15% off on weekend rides',
      discount: '15% OFF',
      expiryDate: '2024-12-31',
      isUnlocked: false,
      code: 'WEEKEND15',
      image: 'assets/gift-box.png'
    },
    {
      id: 3,
      title: 'Loyalty Reward',
      description: 'Special 25% off for loyal customers',
      discount: '25% OFF',
      expiryDate: '2024-12-31',
      isUnlocked: false,
      code: 'LOYAL25',
      image: 'assets/gift-box.png'
    }
  ];

  constructor(
    private animationCtrl: AnimationController,
    private toastController: ToastController,
    private platform: Platform
  ) {}

  ngOnInit() {}

  async unlockCoupon(coupon: Coupon) {
    if (coupon.isUnlocked) return;

    const element = document.querySelector(`#coupon-${coupon.id}`);
    if (!element) return;

    // Create gift box opening animation
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

    // Create confetti animation
    const confettiElement = element.querySelector('.confetti');
    if (confettiElement) {
      const confettiAnimation = this.animationCtrl.create()
        .addElement(confettiElement)
        .duration(1500)
        .easing('cubic-bezier(0.4, 0, 0.2, 1)')
        .keyframes([
          { offset: 0, opacity: '0', transform: 'translateY(0)' },
          { offset: 0.5, opacity: '1', transform: 'translateY(-20px)' },
          { offset: 1, opacity: '0', transform: 'translateY(-40px)' }
        ]);

      // Play animations
      await giftBoxAnimation.play();
      await confettiAnimation.play();
    } else {
      await giftBoxAnimation.play();
    }

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
}
