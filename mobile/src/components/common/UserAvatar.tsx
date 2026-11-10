import React, { useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Ghost } from 'lucide-react-native';
import { getFullMediaUrl } from '../../config/api';
import { useTheme } from '../../theme/ThemeContext';

interface UserAvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  backgroundColor?: string;
  textColor?: string;
  isAnonymous?: boolean;
  mascot?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const getInitials = (name?: string | null): string => {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'S';
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  uri,
  name,
  size = 40,
  borderRadius,
  borderColor,
  borderWidth = 0,
  backgroundColor,
  textColor,
  isAnonymous = false,
  mascot,
  style,
  textStyle,
}) => {
  const { colors } = useTheme();
  const [imgError, setImgError] = useState(false);

  const resolvedUri = uri ? getFullMediaUrl(uri) : '';
  const radius = typeof borderRadius === 'number' ? borderRadius : Math.round(size / 2);

  useEffect(() => {
    setImgError(false);
  }, [resolvedUri]);

  if (isAnonymous) {
    return (
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: backgroundColor || colors.anonBadge,
            borderColor: borderColor || colors.anonPurple,
            borderWidth: borderWidth || 1,
          },
          style,
        ]}
      >
        {mascot ? (
          <Text style={[styles.mascotText, { fontSize: Math.round(size * 0.48) }]}>{mascot}</Text>
        ) : (
          <Ghost size={Math.round(size * 0.48)} color={colors.anonPurple} />
        )}
      </View>
    );
  }

  const showImage = Boolean(resolvedUri) && !imgError;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: backgroundColor || colors.primary,
          borderColor: borderColor || 'transparent',
          borderWidth,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: resolvedUri }}
          style={{
            width: size - borderWidth * 2,
            height: size - borderWidth * 2,
            borderRadius: Math.max(0, radius - borderWidth),
          }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            {
              color: textColor || '#ffffff',
              fontSize: Math.max(11, Math.round(size * 0.38)),
            },
            textStyle,
          ]}
          numberOfLines={1}
        >
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  mascotText: {
    textAlign: 'center',
  },
});
