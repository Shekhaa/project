import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
} from 'lucide-react-native';
import { AttachmentItem } from '../../services/chatService';

interface ImageViewerModalProps {
  visible: boolean;
  images: (AttachmentItem | { uri: string; caption?: string; name?: string })[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  visible,
  images,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
      setScale(1);
    }
  }, [visible, initialIndex, images.length]);

  if (!visible || images.length === 0) return null;

  const currentItem = images[currentIndex] || images[0];
  const imageUrl = (currentItem as any).file_url || (currentItem as any).uri || '';
  const caption = (currentItem as any).caption || '';
  const fileName = (currentItem as any).file_name || (currentItem as any).name || 'Image';
  const fileSize = (currentItem as any).file_size_formatted || '';
  const dimensions = (currentItem as any).image_width && (currentItem as any).image_height
    ? `${(currentItem as any).image_width} × ${(currentItem as any).image_height}`
    : '';

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setScale(1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setScale(1);
    }
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.5, 1));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  const handleDownload = async () => {
    const downloadUrl = (currentItem as any).download_url || imageUrl;
    if (!downloadUrl) return;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } else {
      try {
        await Linking.openURL(downloadUrl);
      } catch (err) {
        console.warn('Could not trigger download:', err);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <X size={22} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.counterText}>
              {images.length > 1 ? `${currentIndex + 1} / ${images.length}` : fileName}
            </Text>
            {(fileSize || dimensions) && (
              <Text style={styles.dimensionsText}>
                {[fileSize, dimensions].filter(Boolean).join(' • ')}
              </Text>
            )}
          </View>

          <View style={styles.headerRightActions}>
            {/* Zoom Controls */}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleZoomIn}
              activeOpacity={0.7}
              accessibilityLabel="Zoom In"
            >
              <ZoomIn size={18} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleZoomOut}
              activeOpacity={0.7}
              accessibilityLabel="Zoom Out"
            >
              <ZoomOut size={18} color="#ffffff" />
            </TouchableOpacity>

            {scale > 1 && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={handleResetZoom}
                activeOpacity={0.7}
                accessibilityLabel="Reset Zoom"
              >
                <RotateCcw size={18} color="#38bdf8" />
              </TouchableOpacity>
            )}

            {/* Download Button */}
            <TouchableOpacity
              style={[styles.headerBtn, styles.downloadBtn]}
              onPress={handleDownload}
              activeOpacity={0.7}
              accessibilityLabel="Download Image"
            >
              <Download size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Image Stage */}
        <View style={styles.imageStage}>
          {loading && (
            <ActivityIndicator
              size="large"
              color="#38bdf8"
              style={styles.loader}
            />
          )}

          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={[
                styles.mainImage,
                {
                  transform: [{ scale }],
                },
              ]}
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
            />
          ) : (
            <Text style={styles.errorText}>Image unavailable</Text>
          )}

          {/* Previous Arrow Button */}
          {images.length > 1 && currentIndex > 0 && (
            <TouchableOpacity
              style={[styles.navArrow, styles.navArrowLeft]}
              onPress={handlePrev}
              activeOpacity={0.8}
            >
              <ChevronLeft size={28} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* Next Arrow Button */}
          {images.length > 1 && currentIndex < images.length - 1 && (
            <TouchableOpacity
              style={[styles.navArrow, styles.navArrowRight]}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <ChevronRight size={28} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Caption & Bottom Bar */}
        {caption ? (
          <View style={styles.captionBar}>
            <Text style={styles.captionText}>{caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    zIndex: 10,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 10,
  },
  counterText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  dimensionsText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtn: {
    backgroundColor: '#0284c7',
  },
  imageStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 120,
    overflow: 'hidden',
  },
  mainImage: {
    width: '100%',
    height: '100%',
    maxWidth: SCREEN_WIDTH,
    maxHeight: SCREEN_HEIGHT - 120,
  },
  loader: {
    position: 'absolute',
    zIndex: 5,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  navArrowLeft: {
    left: 16,
  },
  navArrowRight: {
    right: 16,
  },
  captionBar: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    alignItems: 'center',
  },
  captionText: {
    color: '#f8fafc',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
