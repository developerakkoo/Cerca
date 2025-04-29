import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor(private platform: Platform) {
    this.initializeNotifications();
  }

  private async initializeNotifications() {
    if (this.platform.is('capacitor')) {
      await LocalNotifications.requestPermissions();
    }
  }

  async scheduleNotification(options: {
    title: string;
    body: string;
    id?: number;
    schedule?: { at: Date };
    extra?: any;
  }) {
    if (!this.platform.is('capacitor')) {
      console.log('Notifications are only available on native platforms');
      return;
    }

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: options.title,
            body: options.body,
            id: options.id || Math.floor(Math.random() * 1000000),
            schedule: options.schedule,
            extra: options.extra
          }
        ]
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  async cancelNotification(notificationId: number) {
    if (!this.platform.is('capacitor')) {
      return;
    }

    try {
      await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  async cancelAllNotifications() {
    if (!this.platform.is('capacitor')) {
      return;
    }

    try {
      await LocalNotifications.cancel({ notifications: [] });
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  async getPendingNotifications() {
    if (!this.platform.is('capacitor')) {
      return [];
    }

    try {
      const pending = await LocalNotifications.getPending();
      return pending.notifications;
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      return [];
    }
  }
}
 