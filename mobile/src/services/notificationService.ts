import { api } from '../config/api';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAppForeground, subscribeAppForeground } from '../utils/appState';

export type NotificationType =
  | 'LIKE'
  | 'COMMENT'
  | 'REPLY'
  | 'TAG'
  | 'SHARE'
  | 'MESSAGE'
  | 'ANNOUNCEMENT'
  | 'CONNECTION_REQUEST'
  | 'CONNECTION_ACCEPTED'
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED'
  | 'MESSAGE_REQUEST'
  | 'MESSAGE_REQUEST_ACCEPTED'
  | 'ACCEPTED_ANSWER'
  | 'CREDIBILITY_ENDORSEMENT'
  | 'MENTION'
  | 'LOST_FOUND'
  | 'SYSTEM';

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

type NotificationListener = (notification: NotificationItem) => void;
type UnreadCountListener = (count: number) => void;

class NotificationService {
  private notificationListeners: Set<NotificationListener> = new Set();
  private tapListeners: Set<NotificationListener> = new Set();
  private unreadCountListeners: Set<UnreadCountListener> = new Set();
  private seenNotificationIds: Set<number> = new Set();
  private pollingTimer: any = null;
  private foregroundUnsub: (() => void) | null = null;
  private isInitialFetch: boolean = true;
  private lastUnreadCount: number = 0;
  private activeConversationId: string | null = null;

  /**
   * Subscribe to incoming notifications (triggers Instagram-style In-App Toast)
   */
  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /**
   * Subscribe to unread count updates (keeps bell badge synced everywhere)
   */
  onUnreadCountChange(listener: UnreadCountListener): () => void {
    this.unreadCountListeners.add(listener);
    // Immediately emit latest known unread count
    listener(this.lastUnreadCount);
    return () => {
      this.unreadCountListeners.delete(listener);
    };
  }

  onNotificationTap(listener: NotificationListener): () => void {
    this.tapListeners.add(listener);
    return () => {
      this.tapListeners.delete(listener);
    };
  }

  emitNotificationTap(notification: NotificationItem) {
    if (!notification) return;
    if (notification.id && !notification.is_read) {
      this.markAsRead(notification.id).catch(() => {});
    }
    this.tapListeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (err) {
        console.warn('Notification tap listener error:', err);
      }
    });
  }

  /**
   * Manually trigger an in-app toast notification
   */
  triggerInAppToast(notification: NotificationItem) {
    this.notificationListeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (err) {
        console.warn('Notification listener error:', err);
      }
    });
  }

  private emitUnreadCount(count: number) {
    this.lastUnreadCount = Math.max(0, count);
    this.unreadCountListeners.forEach((listener) => {
      try {
        listener(this.lastUnreadCount);
      } catch (err) {
        console.warn('Unread count listener error:', err);
      }
    });
  }

  /**
   * Fetch current user's notifications + unread count from Django API
   */
  async getNotifications(): Promise<NotificationResponse> {
    const res = await api.get<NotificationResponse>('/notifications/');
    return res.data;
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id: number): Promise<void> {
    try {
      await api.post(`/notifications/${id}/read/`);
      this.emitUnreadCount(Math.max(0, this.lastUnreadCount - 1));
    } catch (e) {
      console.warn('Error marking notification read:', e);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    try {
      await api.post('/notifications/read-all/');
      this.emitUnreadCount(0);
    } catch (e) {
      console.warn('Error marking all notifications read:', e);
    }
  }

  /**
   * Start polling for notifications across the entire app (pauses automatically when backgrounded)
   */
  startPolling(intervalMs: number = 15000) {
    this.stopPolling();
    this.checkNotifications();
    this.pollingTimer = setInterval(() => {
      if (isAppForeground()) {
        this.checkNotifications();
      }
    }, intervalMs);
    this.foregroundUnsub = subscribeAppForeground((active) => {
      if (active) {
        this.checkNotifications();
      }
    });
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.foregroundUnsub) {
      this.foregroundUnsub();
      this.foregroundUnsub = null;
    }
    this.isInitialFetch = true;
  }

  /**
   * Check for new notifications and dispatch in-app toasts
   */
  async checkNotifications(): Promise<void> {
    try {
      const res = await this.getNotifications();
      const items = res.results || [];
      const newUnreadCount = res.unread_count || 0;

      if (this.isInitialFetch) {
        // On initial fetch, record existing IDs so we do not spam toasts for historical notifications
        items.forEach((item) => this.seenNotificationIds.add(item.id));
        this.isInitialFetch = false;
        this.emitUnreadCount(newUnreadCount);
        return;
      }

      // Detect brand new notifications
      const newItems: NotificationItem[] = [];
      for (const item of items) {
        if (!this.seenNotificationIds.has(item.id)) {
          this.seenNotificationIds.add(item.id);
          if (!item.is_read) {
            newItems.push(item);
          }
        }
      }

      // Trigger In-App Toasts for fresh notifications (latest first)
      if (newItems.length > 0) {
        for (const item of newItems) {
          // Skip toast if user is actively reading this exact chat conversation
          const isCurrentChat =
            this.activeConversationId &&
            item.data?.conversation_id &&
            String(item.data.conversation_id) === String(this.activeConversationId);

          if (!isCurrentChat) {
            this.triggerInAppToast(item);
            this.showExternalNotification(item.title, item.message, item, (tappedItem) => {
              this.emitNotificationTap(tappedItem);
            });
          }
        }
      }

      if (newUnreadCount !== this.lastUnreadCount) {
        this.emitUnreadCount(newUnreadCount);
      }
    } catch (err) {
      // Background check failed silently
    }
  }

  /**
   * Set active chat conversation so in-app toasts don't interrupt active messaging
   */
  setActiveConversationId(convId: string | null) {
    this.activeConversationId = convId ? String(convId) : null;
  }

  getActiveConversationId(): string | null {
    return this.activeConversationId;
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
   * Show external system notification (Web/Desktop)
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
        return;
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
            tag: data?.id ? `campus-connect-notif-${data.id}` : 'campus-connect-notif',
          });
          notif.onclick = (e) => {
            e.preventDefault();
            window.focus();
            if (onClick) {
              onClick(data);
            } else if (data) {
              this.emitNotificationTap(data);
            }
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
   */
  async registerForNativePushNotifications(): Promise<string | null> {
    try {
      await this.requestPushPermission();
    } catch {}
    try {
      const Notifications = require('expo-notifications');
      if (Notifications?.getExpoPushTokenAsync) {
        const tokenObj = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenObj?.data;
        if (pushToken) {
          await this.syncPushTokenWithBackend(pushToken);
          return pushToken;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Syncs the device push token with the Django backend devices API
   */
  async syncPushTokenWithBackend(pushToken: string): Promise<void> {
    if (!pushToken) return;
    try {
      await api.post('/devices/register/', {
        device_uuid: `mobile_${Platform.OS}_${Date.now()}`,
        device_name: `${Platform.OS === 'android' ? 'Android Device' : 'iOS Device'}`,
        os: Platform.OS,
        push_token: pushToken,
        is_primary: true,
      });
    } catch (e) {
      console.warn('Failed to register device push token with backend:', e);
    }
  }

  /**
   * Attaches OS notification tap listener (Web Notification.onclick + Native lockscreen push)
   */
  attachNativeResponseListener(onNotificationTap: (payload: any) => void) {
    const unsubWeb = this.onNotificationTap((notif) => onNotificationTap(notif));
    let nativeSub: { remove?: () => void } | null = null;

    try {
      const Notifications = require('expo-notifications');
      if (Notifications?.addNotificationResponseReceivedListener) {
        nativeSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response?.notification?.request?.content?.data;
          if (data) onNotificationTap(data);
        });
      }
      if (Notifications?.getLastNotificationResponseAsync) {
        Notifications.getLastNotificationResponseAsync()
          .then((response: any) => {
            const data = response?.notification?.request?.content?.data;
            if (data) onNotificationTap(data);
          })
          .catch(() => {});
      }
    } catch {}

    return () => {
      unsubWeb();
      try {
        nativeSub?.remove?.();
      } catch {}
    };
  }
}

export const notificationService = new NotificationService();
