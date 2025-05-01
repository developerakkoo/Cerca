import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  icon: string;
  color: string;
  read: boolean;
  isSliding: boolean;
  startX?: number;
  currentX?: number;
  isClearing?: boolean;
}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: false
})
export class NotificationsPage implements OnInit {
  notifications: Notification[] = [
    {
      id: 1,
      title: 'Ride Completed',
      message: 'Your ride with Rajesh has been completed successfully.',
      time: '2 hours ago',
      icon: 'checkmark-circle-outline',
      color: '#4CAF50',
      read: false,
      isSliding: false
    },
    {
      id: 2,
      title: 'Payment Received',
      message: 'Payment of ₹299 has been received for your recent ride.',
      time: '5 hours ago',
      icon: 'wallet-outline',
      color: '#2196F3',
      read: true,
      isSliding: false
    },
    {
      id: 3,
      title: 'Promo Code',
      message: 'Use code WELCOME50 to get 50% off on your next ride!',
      time: '1 day ago',
      icon: 'gift-outline',
      color: '#FF9800',
      read: false,
      isSliding: false
    }
  ];

  private readonly SWIPE_THRESHOLD = 100;
  private readonly DELETE_THRESHOLD = 50;
  private isClearingAll = false;

  constructor(private router: Router) {}

  ngOnInit() {}

  onTouchStart(event: TouchEvent, index: number) {
    if (this.isClearingAll) return;
    const notification = this.notifications[index];
    notification.startX = event.touches[0].clientX;
    notification.currentX = 0;
    notification.isSliding = true;
  }

  onTouchMove(event: TouchEvent, index: number) {
    if (this.isClearingAll) return;
    const notification = this.notifications[index];
    if (!notification.startX) return;

    const currentX = event.touches[0].clientX;
    const diff = notification.startX - currentX;
    
    if (diff > 0) {
      notification.currentX = -diff;
      const element = event.currentTarget as HTMLElement;
      element.style.transform = `translateX(${notification.currentX}px)`;
    }
  }

  onTouchEnd(event: TouchEvent, index: number) {
    if (this.isClearingAll) return;
    const notification = this.notifications[index];
    if (!notification.startX || !notification.currentX) return;

    const element = event.currentTarget as HTMLElement;
    
    if (Math.abs(notification.currentX) > this.DELETE_THRESHOLD) {
      element.style.transform = `translateX(-100%)`;
      element.style.transition = 'transform 0.3s ease-out';
      
      setTimeout(() => {
        this.deleteNotification(index);
      }, 300);
    } else {
      element.style.transition = 'transform 0.3s ease-out';
      element.style.transform = 'translateX(0)';
    }

    notification.isSliding = false;
    notification.startX = undefined;
    notification.currentX = undefined;
  }

  deleteNotification(index: number) {
    this.notifications.splice(index, 1);
  }

  markAllAsRead() {
    if (this.isClearingAll) return;
    this.isClearingAll = true;

    // Add clearing animation to all notifications
    this.notifications.forEach((notification, index) => {
      notification.isClearing = true;
      const element = document.querySelector(`.notification-item:nth-child(${index + 1})`) as HTMLElement;
      if (element) {
        element.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
        element.style.transform = 'translateX(-100%)';
        element.style.opacity = '0';
      }
    });

    // Clear all notifications after animation
    setTimeout(() => {
      this.notifications = [];
      this.isClearingAll = false;
    }, 500);
  }

  goBack() {
    this.router.navigate(['/tabs/tab1']);
  }
}
