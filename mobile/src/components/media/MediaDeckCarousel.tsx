import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { AttachmentItem } from '../../services/chatService';
import { getFullMediaUrl } from '../../config/api';
import { clampAspectRatio, measureImageSize } from '../../utils/mediaUtils';
import { CustomVideoPlayer } from './CustomVideoPlayer';
import { ImageViewerModal } from './ImageViewerModal';

export interface UnifiedMediaItem {
  id?: string | number;
  uri?: string;
  file_url?: string;
  download_url?: string;
  file_type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | string;
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | string;
  file_extension?: string;
  mime_type?: string;
  file_name?: string;
  name?: string;
  caption?: string;
  image_width?: number;
  image_height?: number;
}

interface MediaDeckCarouselProps {
  media: UnifiedMediaItem[];
  containerWidth?: number;
}

const isItemVideo = (item: UnifiedMediaItem): boolean => {
  const type = (item.file_type || item.type || '').toUpperCase();
  if (type === 'VIDEO') return true;
  const ext = (item.file_extension || '').toLowerCase();
  const url = (item.file_url || item.uri || '').toLowerCase();
  return (
    Boolean(ext.match(/^(mp4|webm|mov|mkv|avi|m4v)$/)) ||
    Boolean(url.match(/\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/))
  );
};

export const MediaDeckCarousel: React.FC<MediaDeckCarouselProps> = ({
  media: rawMedia,
  containerWidth,
}) => {
  const { colors, isDark } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [layoutWidth, setLayoutWidth] = useState<number>(() => {
    return containerWidth || (Platform.OS === 'web' ? 580 : Dimensions.get('window').width - 32);
  });
  const [singleRatio, setSingleRatio] = useState<number | null>(null);

  const mediaItems: UnifiedMediaItem[] = (rawMedia || []).map((m, idx) => {
    const rawUrl = m.file_url || m.uri || '';
    const fullUrl = getFullMediaUrl(rawUrl);
    return {
      ...m,
      id: m.id || `media_${idx}`,
      file_url: fullUrl,
      uri: fullUrl,
    };
  });

  const total = mediaItems.length;

  // Adapt single image aspect ratio (clamped between 4:5 portrait and 16:9 landscape)
  useEffect(() => {
    if (total === 1 && !isItemVideo(mediaItems[0])) {
      const url = mediaItems[0].file_url || mediaItems[0].uri || '';
      if (!url) return;
      let cancelled = false;
      measureImageSize(url).then((dims) => {
        if (!cancelled && dims && dims.width > 0 && dims.height > 0) {
          const raw = dims.width / dims.height;
          const clamped = Math.max(4 / 5, Math.min(16 / 9, raw));
          setSingleRatio(clamped);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [total, rawMedia]);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const page = Math.round(contentOffsetX / (layoutWidth || 1));
    if (page >= 0 && page < total && page !== activeIndex) {
      setActiveIndex(page);
    }
  };

  const scrollToSlide = (index: number) => {
    const target = Math.max(0, Math.min(total - 1, index));
    setActiveIndex(target);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: target * layoutWidth, animated: true });
    }
  };

  const handleOpenImageViewer = (slideIdx: number) => {
    // Only open image viewer modal for images
    const currentItem = mediaItems[slideIdx];
    if (currentItem && !isItemVideo(currentItem)) {
      setViewerIndex(slideIdx);
      setViewerVisible(true);
    }
  };

  if (!rawMedia || rawMedia.length === 0) return null;

  // Single Item (Image or Video)
  if (total === 1) {
    const single = mediaItems[0];
    const isVideo = isItemVideo(single);

    return (
      <View style={styles.singleContainer}>
        {isVideo ? (
          <CustomVideoPlayer
            url={single.file_url || single.uri || ''}
            maxHeight={560}
            borderRadius={12}
          />
        ) : (
          <TouchableOpacity
            activeOpacity={0.93}
            onPress={() => handleOpenImageViewer(0)}
            style={[
              styles.singleImageWrapper,
              {
                aspectRatio: singleRatio || 4 / 3,
                maxHeight: 520,
                backgroundColor: isDark ? '#000000' : colors.surfaceLight,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Image
              source={{ uri: single.file_url || single.uri }}
              style={styles.singleImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}

        {single.caption ? (
          <Text style={[styles.captionText, { color: colors.textSecondary }]}>{single.caption}</Text>
        ) : null}

        <ImageViewerModal
          visible={viewerVisible}
          images={mediaItems.filter((m) => !isItemVideo(m))}
          initialIndex={viewerIndex}
          onClose={() => setViewerVisible(false)}
        />
      </View>
    );
  }

  // Multiple Media Items: Reddit / Twitter Deck Carousel
  return (
    <View
      style={styles.carouselContainer}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - layoutWidth) > 2) {
          setLayoutWidth(w);
        }
      }}
    >
      {/* Top Slide Counter Badge (e.g. 1/3) */}
      <View style={styles.badgeContainer}>
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>
            {activeIndex + 1} / {total}
          </Text>
        </View>
      </View>

      {/* Horizontal Deck Slider */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={{ width: layoutWidth }}
      >
        {mediaItems.map((item, idx) => {
          const isVideo = isItemVideo(item);
          const itemUrl = item.file_url || item.uri || '';

          return (
            <View
              key={item.id || idx}
              style={[
                styles.slide,
                {
                  width: layoutWidth,
                  backgroundColor: isDark ? '#000000' : '#f8fafc',
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              {isVideo ? (
                <View style={styles.videoSlideBox}>
                  <CustomVideoPlayer
                    url={itemUrl}
                    maxHeight={440}
                    borderRadius={10}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => handleOpenImageViewer(idx)}
                  style={styles.imageSlideBox}
                >
                  <Image
                    source={{ uri: itemUrl }}
                    style={styles.deckImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )}

              {item.caption ? (
                <Text style={[styles.deckCaption, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.caption}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* Navigation Arrows (Web / Desktop) */}
      {Platform.OS === 'web' && total > 1 && (
        <>
          {activeIndex > 0 && (
            <TouchableOpacity
              style={[styles.arrowButton, styles.arrowLeft]}
              onPress={() => scrollToSlide(activeIndex - 1)}
              activeOpacity={0.8}
              accessibilityLabel="Previous media"
            >
              <ChevronLeft size={20} color="#ffffff" />
            </TouchableOpacity>
          )}

          {activeIndex < total - 1 && (
            <TouchableOpacity
              style={[styles.arrowButton, styles.arrowRight]}
              onPress={() => scrollToSlide(activeIndex + 1)}
              activeOpacity={0.8}
              accessibilityLabel="Next media"
            >
              <ChevronRight size={20} color="#ffffff" />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Bottom Pagination Dots */}
      {total > 1 && (
        <View style={styles.dotsRow}>
          {mediaItems.map((_, dotIdx) => {
            const active = dotIdx === activeIndex;
            return (
              <TouchableOpacity
                key={dotIdx}
                onPress={() => scrollToSlide(dotIdx)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                style={[
                  styles.dot,
                  {
                    backgroundColor: active ? colors.primary : isDark ? '#3f3f46' : '#cbd5e1',
                    width: active ? 18 : 6,
                  },
                ]}
              />
            );
          })}
        </View>
      )}

      {/* Full-Screen Image Viewer Modal */}
      <ImageViewerModal
        visible={viewerVisible}
        images={mediaItems.filter((m) => !isItemVideo(m))}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  singleContainer: {
    marginVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  singleImageWrapper: {
    width: '100%',
    minHeight: 220,
    maxHeight: 540,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  singleImage: {
    width: '100%',
    height: '100%',
  },
  captionText: {
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  carouselContainer: {
    position: 'relative',
    marginVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  badgeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 25,
  },
  counterPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  slide: {
    height: 440,
    maxHeight: 520,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageSlideBox: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoSlideBox: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deckImage: {
    width: '100%',
    height: '100%',
  },
  deckCaption: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 11.5,
  },
  arrowButton: {
    position: 'absolute',
    top: '46%',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  arrowLeft: {
    left: 10,
  },
  arrowRight: {
    right: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    marginBottom: 4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
