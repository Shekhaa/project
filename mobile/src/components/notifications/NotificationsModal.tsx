import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import {
  notificationService,
  NotificationItem,
} from '../../services/notificationService';
import {
  X,
  Bell,
  Heart,
  MessageCircle,
  CornerDownRight,
  Tag,
  Share2,
  MessageSquare,
  CheckCheck,
  Megaphone,
} from 'lucide-react-native';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectNotification: (notification: NotificationItem) => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  onClose,
  onSelectNotification,
  onUnreadCountChange,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  useEffect(() => {
    if (visible) {
      loadNotifications();
      notificationService.requestPushPermission();
    }
  }, [visible]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationService.getNotifications();
      setNotifications(res.results || []);
      setUnreadCount(res.unread_count || 0);
      if (onUnreadCountChange) {
        onUnreadCountChange(res.unread_count || 0);
      }
    } catch (e) {
      console.warn('Failed to load notifications', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      if (onUnreadCountChange) {
        onUnreadCountChange(0);
      }
    } catch (e) {
      console.warn('Failed to mark all read', e);
    }
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    if (!item.is_read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      if (onUnreadCountChange) {
        onUnreadCountChange(Math.max(0, unreadCount - 1));
      }
      try {
        await notificationService.markAsRead(item.id);
      } catch (e) {
        console.warn('Failed to mark notification read', e);
      }
    }

    onClose();
    onSelectNotification(item);
  };

  const formatRelativeTime = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      const now = new Date();
      const date = new Date(timestamp);
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'LIKE':
        return (
          <View style={[styles.iconBadge, { backgroundColor: '#be185d' }]}>
            <Heart size={14} color="#fff" fill="#fff" />
          </View>
        );
      case 'COMMENT':
        return (
          <View style={[styles.iconBadge, { backgroundColor: '#0284c7' }]}>
            <MessageCircle size={14} color="#fff" />
          </View>
        );
      case 'REPLY':
        return (
          <View style={[styles.iconBadge, { backgroundColor: '#7c3aed' }]}>
            <CornerDownRight size={14} color="#fff" />
          </View>
        );
      case 'TAG':
        return (
          <View style={[styles.iconBadge, { backgroundColor: '#059669' }]}>
            <Tag size={14} color="#fff" />
          </View>
        );
      case 'SHARE':
        return (
          <View style={[styles.iconBadge, { backgroundColor: '#ea580c' }]}>
            <Share2 size={14} color="#fff" />
          </View>
        );
      case 'MESSAGE':
        return (
          <View style={[styles.iconBadge, { backgroundColor: '#4f46e5' }]}>
            <MessageSquare size={14} color="#fff" />
          </View>
        );
      default:
        return (
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <Megaphone size={14} color="#fff" />
          </View>
        );
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.is_read;
    return true;
  });

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const initial = (item.sender_name || 'C').charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        style={[
          styles.notifCard,
          !item.is_read && styles.notifCardUnread,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        {/* Avatar + Type badge */}
        <View style={styles.avatarWrapper}>
          {item.sender_avatar ? (
            <Image source={{ uri: item.sender_avatar }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.badgePosition}>
            {getNotificationIcon(item.notification_type)}
          </View>
        </View>

        {/* Content */}
        <View style={styles.contentWrapper}>
          <View style={styles.titleRow}>
            <Text style={styles.notifTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.timeText}>
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
          <Text
            style={[
              styles.notifMessage,
              !item.is_read && styles.notifMessageUnread,
            ]}
            numberOfLines={2}
          >
            {item.message}
          </Text>
        </View>

        {/* Unread indicator dot */}
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissOverlay} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheetContainer}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Bell size={20} color={colors.primary} />
              <Text style={styles.headerTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  style={styles.markAllBtn}
                  onPress={handleMarkAllRead}
                  activeOpacity={0.8}
                >
                  <CheckCheck size={14} color="#38bdf8" />
                  <Text style={styles.markAllText}>Read All</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab Filter */}
          <View style={styles.tabFilterRow}>
            <TouchableOpacity
              style={[styles.filterTab, filter === 'ALL' && styles.filterTabActive]}
              onPress={() => setFilter('ALL')}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === 'ALL' && styles.filterTabTextActive,
                ]}
              >
                All ({notifications.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterTab, filter === 'UNREAD' && styles.filterTabActive]}
              onPress={() => setFilter('UNREAD')}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === 'UNREAD' && styles.filterTabTextActive,
                ]}
              >
                Unread ({unreadCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Notifications List */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
          ) : filteredNotifications.length === 0 ? (
            <View style={styles.centerContainer}>
              <Bell size={42} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>
                {filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {filter === 'UNREAD'
                  ? "You're all caught up with campus updates!"
                  : 'Likes, comments, tags, and replies will show up here.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredNotifications}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              contentContainerStyle={styles.listContainer}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '55%',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  markAllText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  tabFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.4)',
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
  },
  filterTabActive: {
    backgroundColor: '#1e3a8a',
  },
  filterTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#93c5fd',
    fontWeight: '700',
  },
  centerContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  notifCardUnread: {
    backgroundColor: 'rgba(30, 58, 138, 0.18)',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  badgePosition: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  iconBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notifTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  notifMessage: {
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  notifMessageUnread: {
    color: '#e2e8f0',
    fontWeight: '500',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
    marginLeft: 8,
  },
});
