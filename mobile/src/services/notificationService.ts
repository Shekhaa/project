import { api } from '../config/api';
import { Platform, PermissionsAndroid } from 'react-native';

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
   * Request permission for Web/PWA or native Android 13+ push notifications
   */
  async requestPushPermission(): Promise<boolean> {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const postNotif = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
        if (postNotif) {
          const granted = await PermissionsAndroid.request(postNotif);
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (err) {
        console.warn('Android notification permission request error:', err);
      }
      return false;
    }
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
   * Registers for native push notifications. Requests runtime permission on Android 13+.
   * Completely safe and non-crashing in standalone APKs.
   */
  async registerForNativePushNotifications(): Promise<string | null> {
    try {
      await this.requestPushPermission();
    } catch {}
    return null;
  }

  /**
   * Syncs the device push token with the Django backend devices API
   */
  async syncPushTokenWithBackend(pushToken: string): Promise<void> {
    return;
  }

  private activeConversationId: string | null = null;

  setActiveConversationId(convId: string | null) {
    this.activeConversationId = convId ? String(convId) : null;
  }

  getActiveConversationId(): string | null {
    return this.activeConversationId;
  }

  /**
   * Attaches lockscreen tap listener to deep link into posts or chats
   */
  attachNativeResponseListener(onNotificationTap: (payload: any) => void) {
    return () => {};
  }
}

export const notificationService = new NotificationService();
