import { api } from '../config/api';
import { Platform } from 'react-native';

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
  showExternalNotification(
    title: string,
    body: string,
    data?: any,
    onClick?: (data: any) => void
  ) {
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
}

export const notificationService = new NotificationService();
