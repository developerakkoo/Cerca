import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { RideService } from 'src/app/services/ride.service';
import { SocketService } from 'src/app/services/socket.service';
import { Subscription } from 'rxjs';

interface Notification {
  _id?: string;
  id?: number;
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
  type?: string;
  relatedRide?: string;
}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: false,
})
export class NotificationsPage implements OnInit, OnDestroy {
  notifications: Notification[] = [];

  private readonly SWIPE_THRESHOLD = 100;
  private readonly DELETE_THRESHOLD = 50;
  private isClearingAll = false;

  private notificationsSubscription?: Subscription;
  private notificationReadSubscription?: Subscription;

  constructor(
    private router: Router,
    private rideService: RideService,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    // Load notifications from backend
    this.rideService.getNotifications();

    // Listen for notifications
    this.notificationsSubscription = this.socketService
      .on<any[]>('notifications')
      .subscribe((notifications) => {
        console.log('🔔 Received notifications:', notifications);
        this.notifications = notifications.map((notif) =>
          this.mapNotification(notif)
        );
      });

    // Listen for notification read confirmation
    this.notificationReadSubscription = this.socketService
      .on<any>('notificationMarkedRead')
      .subscribe((data) => {
        console.log('✅ Notification marked as read:', data);
      });
  }

  ngOnDestroy() {
    this.notificationsSubscription?.unsubscribe();
    this.notificationReadSubscription?.unsubscribe();
  }

  private mapNotification(notif: any): Notification {
    // Map notification type to icon and color
    const typeConfig = this.getNotificationConfig(notif.type);

    return {
      _id: notif._id,
      id: notif._id,
      title: notif.title,
      message: notif.message,
      time: this.formatTime(notif.createdAt),
      icon: typeConfig.icon,
      color: typeConfig.color,
      read: notif.isRead || false,
      isSliding: false,
      type: notif.type,
      relatedRide: notif.relatedRide,
    };
  }

  private getNotificationConfig(type: string): { icon: string; color: string } {
    const configs: Record<string, { icon: string; color: string }> = {
      ride_accepted: { icon: 'car-outline', color: '#00B894' },
      driver_arrived: { icon: 'location-outline', color: '#0984E3' },
      ride_started: { icon: 'play-circle-outline', color: '#6C5CE7' },
      ride_completed: { icon: 'checkmark-circle-outline', color: '#4CAF50' },
      ride_cancelled: { icon: 'close-circle-outline', color: '#FF6B6B' },
      payment_received: { icon: 'wallet-outline', color: '#2196F3' },
      promo_code: { icon: 'gift-outline', color: '#FF9800' },
      emergency_alert: { icon: 'warning-outline', color: '#E74C3C' },
    };

    return configs[type] || { icon: 'notifications-outline', color: '#636E72' };
  }

  private formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }

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
    const notification = this.notifications[index];

    // Mark as read on backend if it has an ID
    if (notification._id) {
      this.rideService.markNotificationRead(notification._id);
    }

    this.notifications.splice(index, 1);
  }

  async markAllAsRead() {
    if (this.isClearingAll) return;
    this.isClearingAll = true;

    try {
      // Delete all notifications from backend
      await this.rideService.deleteAllNotifications();

      // Add clearing animation to all notifications
      this.notifications.forEach((notification, index) => {
        notification.isClearing = true;
        notification.read = true;
        const element = document.querySelector(
          `.notification-item:nth-child(${index + 1})`
        ) as HTMLElement;
        if (element) {
          element.style.transition =
            'transform 0.5s ease-out, opacity 0.5s ease-out';
          element.style.transform = 'translateX(-100%)';
          element.style.opacity = '0';
        }
      });

      // Clear all notifications after animation
      setTimeout(() => {
        this.notifications = [];
        this.isClearingAll = false;
      }, 500);
    } catch (error) {
      console.error('Error deleting all notifications:', error);
      this.isClearingAll = false;
      // Optionally show error toast to user
    }
  }

  goBack() {
    this.router.navigate(['/tabs/tab1']);
  }
}
