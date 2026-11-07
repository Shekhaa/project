import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { AttachmentItem } from '../../services/chatService';
import { ImageViewerModal } from './ImageViewerModal';
import { getFullMediaUrl } from '../../config/api';

interface MediaGridProps {
  images: AttachmentItem[];
  maxDisplay?: number;
  containerWidth?: number;
}

export const MediaGrid: React.FC<MediaGridProps> = ({
  images: rawImages,
  maxDisplay = 4,
  containerWidth,
}) => {
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

  // 1 Image: Large Preview
  if (total === 1) {
    const item = images[0];
    return (
      <View style={styles.container}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleOpenViewer(0)}
          style={styles.singleImageWrapper}
        >
          <Image
            source={{ uri: item.file_url }}
            style={styles.singleImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
        {item.caption ? (
          <Text style={styles.captionText}>{item.caption}</Text>
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
            <TouchableOpacity
              key={item.id || idx}
              activeOpacity={0.9}
              onPress={() => handleOpenViewer(idx)}
              style={styles.halfImageWrapper}
            >
              <Image
                source={{ uri: item.file_url }}
                style={styles.gridImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
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
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => handleOpenViewer(0)}
            style={styles.threeLargeWrapper}
          >
            <Image
              source={{ uri: images[0].file_url }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <View style={styles.threeColumn}>
            {images.slice(1, 3).map((item, idx) => (
              <TouchableOpacity
                key={item.id || idx + 1}
                activeOpacity={0.9}
                onPress={() => handleOpenViewer(idx + 1)}
                style={styles.threeSmallWrapper}
              >
                <Image
                  source={{ uri: item.file_url }}
                  style={styles.gridImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
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
            <TouchableOpacity
              key={item.id || idx}
              activeOpacity={0.9}
              onPress={() => handleOpenViewer(idx)}
              style={styles.quarterImageWrapper}
            >
              <Image
                source={{ uri: item.file_url }}
                style={styles.gridImage}
                resizeMode="cover"
              />
              {showOverlay && (
                <View style={styles.overlay}>
                  <Text style={styles.overlayText}>+{remainingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
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
    minWidth: 240,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  singleImage: {
    width: '100%',
    height: '100%',
  },
  twoGrid: {
    flexDirection: 'row',
    width: '100%',
    minWidth: 240,
    height: 180,
    gap: 4,
  },
  halfImageWrapper: {
    flex: 1,
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  threeGrid: {
    flexDirection: 'row',
    width: '100%',
    minWidth: 240,
    height: 200,
    gap: 4,
  },
  threeLargeWrapper: {
    flex: 1.2,
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
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
    backgroundColor: '#0f172a',
  },
  fourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    minWidth: 240,
    height: 220,
    gap: 4,
  },
  quarterImageWrapper: {
    width: '49%',
    height: '49%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
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
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
