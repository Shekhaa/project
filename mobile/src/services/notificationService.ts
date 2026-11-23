import { api } from '../config/api';
import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationType =
  | 'LIKE'
  | 'COMMENT'
  | 'REPLY'
  | 'TAG'
  | 'SHARE'
  | 'MESSAGE'
  | 'ANNOUNCEMENT';

export interface NotificationItem {
  id: number;
  notification_type: NotificationType;
  title: string;
  message: string;
  data: {
    post_id?: number;
    comment_id?: number;
    conversation_id?: string | number;
    [key: string]: any;
  };
  is_read: boolean;
  created_at: string;
  sender_name: string;
  sender_avatar?: string | null;
}

export interface NotificationResponse {
  unread_count: number;
  results: NotificationItem[];
}

class NotificationService {
  /**
   * Fetch current user's notifications + unread count
   */
  async getNotifications(): Promise<NotificationResponse> {
    const res = await api.get<NotificationResponse>('/notifications/');
    return res.data;
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id: number): Promise<void> {
    await api.post(`/notifications/${id}/read/`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await api.post('/notifications/read-all/');
  }

  /**
   * Request permission for Web/PWA push notifications (outside phone app window)
   */
  async requestPushPermission(): Promise<boolean> {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
    }
    return false;
  }

  /**
   * Show external system notification (appears outside phone screen, in notification tray / desktop / browser)
   */
  async showExternalNotification(
    title: string,
    body: string,
    data?: any,
    onClick?: (data: any) => void
  ) {
    try {
      const isBlocked = await AsyncStorage.getItem('@campus_connect_notifications_blocked');
      if (isBlocked === 'true') {
        return; // Notifications blocked by student
      }
    } catch {
      // ignore
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          const notif = new window.Notification(title, {
            body,
            icon: 'https://img.icons8.com/fluency/96/bell.png',
            tag: 'campus-connect-notif',
          });
          notif.onclick = (e) => {
            e.preventDefault();
            window.focus();
            if (onClick) onClick(data);
            notif.close();
          };
        } catch (e) {
          console.warn('External notification error', e);
        }
      }
    }
  }

  /**
   * Registers for native lockscreen push notifications via Expo.
   * Completely Web-Safe: silently handles web platforms where expo-notifications
   * native modules are unavailable.
   */
  async registerForNativePushNotifications(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const Notifications = require('expo-notifications');
      const Device = require('expo-device');

      if (!Device.isDevice) {
        return null;
      }

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('campus_connect_alerts', {
          name: 'Campus Connect Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
        });
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;

      if (token) {
        await this.syncPushTokenWithBackend(token);
      }

      return token;
    } catch (err) {
      return null;
    }
  }

  /**
   * Syncs the device push token with the Django backend devices API
   */
  async syncPushTokenWithBackend(pushToken: string): Promise<void> {
    try {
      await api.post('/devices/register/', {
        device_uuid: Platform.OS + '_' + (Platform.Version || 'unknown'),
        device_name: `${Platform.OS.toUpperCase()} Device`,
        os: Platform.OS,
        os_version: String(Platform.Version),
        push_token: pushToken,
      });
    } catch (e) {
      // Non-blocking sync
    }
  }

  /**
   * Attaches lockscreen tap listener to deep link into posts or chats
   */
  attachNativeResponseListener(onNotificationTap: (payload: any) => void) {
    if (Platform.OS === 'web') return () => {};

    try {
      const Notifications = require('expo-notifications');
      const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const data = response?.notification?.request?.content?.data || {};
        onNotificationTap(data);
      });
      return () => subscription.remove();
    } catch {
      return () => {};
    }
  }
}

export const notificationService = new NotificationService();
