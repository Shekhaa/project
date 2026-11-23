import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { getFullMediaUrl } from '../../config/api';
import { backHandlerRegistry } from '../../services/backHandlerRegistry';

interface AvatarZoomModalProps {
  visible: boolean;
  imageUrl?: string | null;
  name?: string | null;
  username?: string | null;
  collegeName?: string | null;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const AvatarZoomModal: React.FC<AvatarZoomModalProps> = ({
  visible,
  imageUrl,
  name,
  username,
  collegeName,
  onClose,
}) => {
  const { colors, isDark } = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;

  // Register with Android / Browser back-stack
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      backHandlerRegistry.push('avatar-zoom-modal', () => {
        handleDismiss();
        return true;
      });
      return () => {
        backHandlerRegistry.pop('avatar-zoom-modal');
      };
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onClose();
    });
  };

  // Real-time Instagram-style pan gesture for dragging down to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90 || gestureState.vy > 0.5) {
          handleDismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  const resolvedUrl = imageUrl ? getFullMediaUrl(imageUrl) : null;
  const cardSize = Math.min(SCREEN_WIDTH - 48, 320);

  const initials = (() => {
    const cleaned = (name || username || 'S').trim();
    const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        {/* Backdrop Tap to Close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleDismiss}
        />

        {/* Animated Photo Card with Pan Gesture */}
        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Instagram-style Drag Pill Handle */}
          <View style={styles.dragPillHandle}>
            <View style={styles.pillBar} />
          </View>

          {/* Close Button at top-right */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleDismiss}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={18} color="#ffffff" />
          </TouchableOpacity>

          {/* Photo Frame */}
          <View
            style={[
              styles.imageWrapper,
              {
                width: cardSize,
                height: cardSize,
                backgroundColor: isDark ? '#121214' : '#f0f0f2',
                borderColor: isDark ? '#26262b' : '#e2e2e8',
              },
            ]}
          >
            {resolvedUrl ? (
              <Image
                source={{ uri: resolvedUrl }}
                style={styles.fullImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.fallbackContainer, { backgroundColor: colors.avatarBg }]}>
                <Text style={styles.fallbackInitials}>{initials}</Text>
              </View>
            )}
          </View>

          {/* Student Info */}
          <View style={styles.infoBox}>
            {name ? <Text style={styles.nameText}>{name}</Text> : null}
            {username ? <Text style={styles.usernameText}>@{username.replace('@', '')}</Text> : null}
            {collegeName ? (
              <View style={styles.collegeBadge}>
                <Text style={styles.collegeText}>{collegeName}</Text>
              </View>
            ) : null}
            <Text style={styles.hintText}>Swipe down or tap anywhere to close</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  dragPillHandle: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 6,
  },
  pillBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  closeBtn: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  imageWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackInitials: {
    fontSize: 54,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
  },
  infoBox: {
    marginTop: 18,
    alignItems: 'center',
    gap: 4,
  },
  nameText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  usernameText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  collegeBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 112, 243, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0, 112, 243, 0.35)',
  },
  collegeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2997ff',
  },
  hintText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 10,
  },
});
