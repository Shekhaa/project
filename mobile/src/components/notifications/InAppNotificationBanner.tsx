import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Heart,
  MessageCircle,
  CornerDownRight,
  Tag,
  Share2,
  MessageSquare,
  Megaphone,
  CheckCheck,
  X,
  UserPlus,
} from 'lucide-react-native';
import { UserAvatar } from '../common/UserAvatar';
import { useTheme } from '../../theme/ThemeContext';
import { NotificationItem, notificationService } from '../../services/notificationService';

interface InAppNotificationBannerProps {
  onPressNotification?: (notification: NotificationItem) => void;
}

export const InAppNotificationBanner: React.FC<InAppNotificationBannerProps> = ({
  onPressNotification,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [currentNotif, setCurrentNotif] = useState<NotificationItem | null>(null);

  // Animated values
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<any>(null);

  const dismissBanner = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -160,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentNotif(null);
    });
  };

  const showBanner = (notif: NotificationItem) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    setCurrentNotif(notif);

    // Reset position above screen
    translateY.setValue(-160);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 75,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 4.5 seconds like Instagram
    hideTimerRef.current = setTimeout(() => {
      dismissBanner();
    }, 4500);
  };

  useEffect(() => {
    const unsubscribe = notificationService.onNotification((notif) => {
      showBanner(notif);
    });

    return () => {
      unsubscribe();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // PanResponder to allow user to swipe up to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy < -5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20 || gestureState.vy < -0.5) {
          dismissBanner();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!currentNotif) return null;

  const getActionBadge = () => {
    const type = currentNotif.notification_type;
    switch (type) {
      case 'LIKE':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#ec4899' }]}>
            <Heart size={10} color="#ffffff" fill="#ffffff" />
          </View>
        );
      case 'COMMENT':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#0284c7' }]}>
            <MessageCircle size={10} color="#ffffff" fill="#ffffff" />
          </View>
        );
      case 'REPLY':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#8b5cf6' }]}>
            <CornerDownRight size={10} color="#ffffff" />
          </View>
        );
      case 'TAG':
      case 'MENTION':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#10b981' }]}>
            <Tag size={10} color="#ffffff" />
          </View>
        );
      case 'MESSAGE':
      case 'MESSAGE_REQUEST':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#6366f1' }]}>
            <MessageSquare size={10} color="#ffffff" />
          </View>
        );
      case 'FOLLOW':
      case 'FOLLOW_REQUEST':
      case 'CONNECTION_REQUEST':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#3b82f6' }]}>
            <UserPlus size={10} color="#ffffff" />
          </View>
        );
      case 'ACCEPTED_ANSWER':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#10b981' }]}>
            <CheckCheck size={10} color="#ffffff" />
          </View>
        );
      case 'SHARE':
        return (
          <View style={[styles.badgePill, { backgroundColor: '#f97316' }]}>
            <Share2 size={10} color="#ffffff" />
          </View>
        );
      default:
        return (
          <View style={[styles.badgePill, { backgroundColor: colors.primary }]}>
            <Megaphone size={10} color="#ffffff" />
          </View>
        );
    }
  };

  const handlePress = () => {
    const item = currentNotif;
    dismissBanner();
    if (onPressNotification && item) {
      onPressNotification(item);
    }
  };

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 12 : 24);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          top: topInset + 6,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handlePress}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#181e2e' : '#ffffff',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            shadowColor: '#000000',
          },
        ]}
      >
        {/* Left: Avatar with badge overlay */}
        <View style={styles.avatarContainer}>
          <UserAvatar
            uri={currentNotif.sender_avatar}
            name={currentNotif.sender_name || currentNotif.title || 'User'}
            size={42}
          />
          <View style={[styles.badgeWrapper, { borderColor: isDark ? '#181e2e' : '#ffffff' }]}>
            {getActionBadge()}
          </View>
        </View>

        {/* Middle: Title & Message text */}
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text
              style={[styles.senderName, { color: isDark ? '#f8fafc' : '#0f172a' }]}
              numberOfLines={1}
            >
              {currentNotif.sender_name || currentNotif.title || 'Campus Connect'}
            </Text>
            <Text style={[styles.timeText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              · Just now
            </Text>
          </View>
          <Text
            style={[styles.messageText, { color: isDark ? '#cbd5e1' : '#334155' }]}
            numberOfLines={2}
          >
            {currentNotif.message || currentNotif.title}
          </Text>
        </View>

        {/* Right: Quick close button */}
        <TouchableOpacity
          onPress={dismissBanner}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color={isDark ? '#94a3b8' : '#64748b'} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999999,
    elevation: 999999,
    alignItems: 'center',
    maxWidth: Platform.OS === 'web' ? 520 : undefined,
    alignSelf: 'center',
    width: Platform.OS === 'web' ? '92%' : undefined,
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 11,
  },
  badgeWrapper: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 10,
    borderWidth: 2,
  },
  badgePill: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  senderName: {
    fontSize: 13.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  timeText: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 12.5,
    lineHeight: 16.5,
    fontWeight: '400',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
