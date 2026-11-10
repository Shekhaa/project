import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { AttachmentItem } from '../../services/chatService';
import { ImageViewerModal } from './ImageViewerModal';
import { getFullMediaUrl } from '../../config/api';
import { useTheme } from '../../theme/ThemeContext';
import { clampAspectRatio, measureImageSize } from '../../utils/mediaUtils';

interface MediaGridProps {
  images: AttachmentItem[];
  maxDisplay?: number;
  containerWidth?: number;
}

const GridThumb: React.FC<{ uri: string; onPress: () => void; style?: any; overlay?: React.ReactNode }> = ({
  uri,
  onPress,
  style,
  overlay,
}) => {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[style, { backgroundColor: colors.surfaceLight }]}
    >
      {failed || !uri ? (
        <View style={styles.errorFallback}>
          <ImageOff size={20} color={colors.textMuted} />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={styles.gridImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
      {overlay}
    </TouchableOpacity>
  );
};

const AdaptiveSingleImage: React.FC<{
  item: AttachmentItem;
  onPress: () => void;
  maxWidth?: number;
}> = ({ item, onPress, maxWidth }) => {
  const { colors } = useTheme();
  const [ratio, setRatio] = useState<number>(() =>
    clampAspectRatio(item.image_width, item.image_height, 4 / 3)
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (item.image_width && item.image_height) {
      setRatio(clampAspectRatio(item.image_width, item.image_height, 4 / 3));
      return;
    }
    let cancelled = false;
    measureImageSize(item.file_url).then((dims) => {
      if (!cancelled && dims) {
        setRatio(clampAspectRatio(dims.width, dims.height, 4 / 3));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.file_url, item.image_width, item.image_height]);

  const handleLoad = (e: any) => {
    const src = e?.nativeEvent?.source;
    const w = src?.width || e?.target?.naturalWidth;
    const h = src?.height || e?.target?.naturalHeight;
    if (w && h) {
      setRatio(clampAspectRatio(w, h, ratio));
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[
        styles.singleImageWrapper,
        {
          aspectRatio: ratio,
          maxHeight: 520,
          maxWidth: maxWidth || '100%',
          backgroundColor: colors.surfaceLight,
          borderColor: colors.hairline,
        },
      ]}
    >
      {failed || !item.file_url ? (
        <View style={styles.errorFallback}>
          <ImageOff size={24} color={colors.textMuted} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>Image unavailable</Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.file_url }}
          style={styles.singleImage}
          resizeMode="contain"
          onLoad={handleLoad}
          onError={() => setFailed(true)}
        />
      )}
    </TouchableOpacity>
  );
};

export const MediaGrid: React.FC<MediaGridProps> = ({
  images: rawImages,
  maxDisplay = 4,
  containerWidth,
}) => {
  const { colors } = useTheme();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!rawImages || rawImages.length === 0) return null;

  const images = rawImages.map((img) => ({
    ...img,
    file_url: getFullMediaUrl(img.file_url),
    download_url: getFullMediaUrl(img.download_url || img.file_url),
  }));

  const total = images.length;
  const displayItems = images.slice(0, maxDisplay);
  const remainingCount = total - maxDisplay;

  const handleOpenViewer = (index: number) => {
    setSelectedIndex(index);
    setViewerVisible(true);
  };

  // 1 Image: True proportional preview clamped between 9:16 and 16:9
  if (total === 1) {
    const item = images[0];
    return (
      <View style={styles.container}>
        <AdaptiveSingleImage
          item={item}
          onPress={() => handleOpenViewer(0)}
          maxWidth={containerWidth}
        />
        {item.caption ? (
          <Text style={[styles.captionText, { color: colors.textSecondary }]}>{item.caption}</Text>
        ) : null}

        <ImageViewerModal
          visible={viewerVisible}
          images={images}
          initialIndex={selectedIndex}
          onClose={() => setViewerVisible(false)}
        />
      </View>
    );
  }

  // 2 Images: Side-by-side
  if (total === 2) {
    return (
      <View style={styles.container}>
        <View style={styles.twoGrid}>
          {images.map((item, idx) => (
            <GridThumb
              key={item.id || idx}
              uri={item.file_url}
              onPress={() => handleOpenViewer(idx)}
              style={styles.halfImageWrapper}
            />
          ))}
        </View>

        <ImageViewerModal
          visible={viewerVisible}
          images={images}
          initialIndex={selectedIndex}
          onClose={() => setViewerVisible(false)}
        />
      </View>
    );
  }

  // 3 Images: 1 Large Left / 2 Stacked Right
  if (total === 3) {
    return (
      <View style={styles.container}>
        <View style={styles.threeGrid}>
          <GridThumb
            uri={images[0].file_url}
            onPress={() => handleOpenViewer(0)}
            style={styles.threeLargeWrapper}
          />
          <View style={styles.threeColumn}>
            {images.slice(1, 3).map((item, idx) => (
              <GridThumb
                key={item.id || idx + 1}
                uri={item.file_url}
                onPress={() => handleOpenViewer(idx + 1)}
                style={styles.threeSmallWrapper}
              />
            ))}
          </View>
        </View>

        <ImageViewerModal
          visible={viewerVisible}
          images={images}
          initialIndex={selectedIndex}
          onClose={() => setViewerVisible(false)}
        />
      </View>
    );
  }

  // 4+ Images: 2x2 Grid with +N Overlay on the 4th item
  return (
    <View style={styles.container}>
      <View style={styles.fourGrid}>
        {displayItems.map((item, idx) => {
          const isLast = idx === maxDisplay - 1;
          const showOverlay = isLast && remainingCount > 0;

          return (
            <GridThumb
              key={item.id || idx}
              uri={item.file_url}
              onPress={() => handleOpenViewer(idx)}
              style={styles.quarterImageWrapper}
              overlay={
                showOverlay ? (
                  <View style={styles.overlay}>
                    <Text style={styles.overlayText}>+{remainingCount}</Text>
                  </View>
                ) : null
              }
            />
          );
        })}
      </View>

      <ImageViewerModal
        visible={viewerVisible}
        images={images}
        initialIndex={selectedIndex}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  singleImageWrapper: {
    width: '100%',
    minWidth: 180,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  singleImage: {
    width: '100%',
    height: '100%',
  },
  twoGrid: {
    flexDirection: 'row',
    width: '100%',
    minWidth: 220,
    height: 200,
    gap: 4,
  },
  halfImageWrapper: {
    flex: 1,
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  threeGrid: {
    flexDirection: 'row',
    width: '100%',
    minWidth: 220,
    height: 220,
    gap: 4,
  },
  threeLargeWrapper: {
    flex: 1.2,
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  threeColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  threeSmallWrapper: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  fourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    minWidth: 220,
    height: 240,
    gap: 4,
  },
  quarterImageWrapper: {
    width: '49%',
    height: '49%',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  errorFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 6,
  },
  errorText: {
    fontSize: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  captionText: {
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
