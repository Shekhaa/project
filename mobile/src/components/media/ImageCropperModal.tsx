import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import {
  X,
  Check,
  RotateCw,
  RefreshCw,
  Zap,
} from 'lucide-react-native';

export type AspectRatioOption = 'AUTO' | 'FREE' | '1:1' | '4:5' | '16:9' | 'DOC';

interface ImageCropperModalProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onCropComplete: (croppedUri: string) => void;
  autoDetectOnOpen?: boolean;
}

/**
 * Intelligent standalone auto-crop algorithm.
 * Uses canvas edge & contrast scanning to detect document edges / paper boundaries or central focal region.
 */
export const smartAutoCropImage = (imageUri: string): Promise<string> => {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      resolve(imageUri);
      return;
    }

    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        if (!origW || !origH) {
          resolve(imageUri);
          return;
        }

        // Sample down to max 320px for high-speed edge calculation (~15ms)
        const sampleW = 320;
        const sampleH = Math.max(10, Math.round((origH / origW) * sampleW));
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = sampleW;
        sampleCanvas.height = sampleH;
        const sCtx = sampleCanvas.getContext('2d');
        if (!sCtx) {
          resolve(imageUri);
          return;
        }

        sCtx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = sCtx.getImageData(0, 0, sampleW, sampleH);
        const data = imgData.data;

        // Sample 4 corners to estimate background color
        const cornerIdxs = [
          0,
          (sampleW - 1) * 4,
          (sampleH - 1) * sampleW * 4,
          ((sampleH - 1) * sampleW + (sampleW - 1)) * 4,
        ];
        let bgR = 0, bgG = 0, bgB = 0;
        for (const idx of cornerIdxs) {
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        }
        bgR /= 4; bgG /= 4; bgB /= 4;

        let minX = sampleW, maxX = 0, minY = sampleH, maxY = 0;
        let contentCount = 0;

        for (let y = 0; y < sampleH; y += 2) {
          for (let x = 0; x < sampleW; x += 2) {
            const idx = (y * sampleW + x) * 4;
            const diff = Math.abs(data[idx] - bgR) + Math.abs(data[idx + 1] - bgG) + Math.abs(data[idx + 2] - bgB);
            if (diff > 42 && data[idx + 3] > 20) {
              contentCount++;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        let cropX = 0, cropY = 0, cropW = origW, cropH = origH;
        const totalSampled = (sampleW * sampleH) / 4;

        // If a clear document / object boundary is detected (5% to 92% of frame)
        if (contentCount > totalSampled * 0.05 && contentCount < totalSampled * 0.92 && maxX > minX + 20 && maxY > minY + 20) {
          const padX = sampleW * 0.02;
          const padY = sampleH * 0.02;
          const normLeft = Math.max(0, (minX - padX) / sampleW);
          const normTop = Math.max(0, (minY - padY) / sampleH);
          const normRight = Math.min(1, (maxX + padX) / sampleW);
          const normBottom = Math.min(1, (maxY + padY) / sampleH);

          cropX = Math.round(normLeft * origW);
          cropY = Math.round(normTop * origH);
          cropW = Math.round((normRight - normLeft) * origW);
          cropH = Math.round((normBottom - normTop) * origH);
        } else {
          // Standard smart focal crop (focal 4:5 or 16:9, trimming outer 8% margin)
          const targetRatio = origW > origH ? 16 / 9 : 4 / 5;
          cropW = Math.round(origW * 0.88);
          cropH = Math.round(cropW / targetRatio);
          if (cropH > origH * 0.88) {
            cropH = Math.round(origH * 0.88);
            cropW = Math.round(cropH * targetRatio);
          }
          cropX = Math.round((origW - cropW) / 2);
          cropY = Math.round((origH - cropH) / 2);
        }

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          resolve(imageUri);
          return;
        }

        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(outCanvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.warn('Smart auto crop failed', err);
        resolve(imageUri);
      }
    };
    img.onerror = () => resolve(imageUri);
    img.src = imageUri;
  });
};

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');
const STAGE_SIZE = Math.min(WINDOW_WIDTH - 32, WINDOW_HEIGHT - 280, 500);

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  visible,
  imageUri,
  onClose,
  onCropComplete,
  autoDetectOnOpen = false,
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('FREE');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Crop Box state inside the STAGE (in pixels)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 20,
    y: 20,
    w: STAGE_SIZE - 40,
    h: STAGE_SIZE - 40,
  });

  const dragStartRef = useRef<{ box: { x: number; y: number; w: number; h: number }; touchX: number; touchY: number } | null>(null);

  // Load natural dimensions of image
  useEffect(() => {
    if (!visible || !imageUri) return;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const img = new (window as any).Image();
      img.onload = () => {
        setNaturalSize({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
      };
      img.src = imageUri;
    } else {
      Image.getSize(
        imageUri,
        (w, h) => setNaturalSize({ width: w, height: h }),
        () => setNaturalSize({ width: 800, height: 600 })
      );
    }
    setRotation(0);
    setAspectRatio('FREE');
  }, [visible, imageUri]);

  // Compute fitted image bounds in the stage
  const isRotatedSideways = rotation === 90 || rotation === 270;
  const currentImgW = isRotatedSideways ? naturalSize.height : naturalSize.width;
  const currentImgH = isRotatedSideways ? naturalSize.width : naturalSize.height;

  const scale = Math.min(STAGE_SIZE / currentImgW, STAGE_SIZE / currentImgH);
  const renderedW = currentImgW * scale;
  const renderedH = currentImgH * scale;
  const imgOffsetX = (STAGE_SIZE - renderedW) / 2;
  const imgOffsetY = (STAGE_SIZE - renderedH) / 2;

  // Initialize crop box to image bounds whenever dimensions or rotation change
  useEffect(() => {
    const initialW = renderedW;
    const initialH = renderedH;
    setCropBox({
      x: imgOffsetX,
      y: imgOffsetY,
      w: initialW,
      h: initialH,
    });

    if (autoDetectOnOpen) {
      setTimeout(() => handleTriggerAutoCrop(), 120);
    }
  }, [renderedW, renderedH, imgOffsetX, imgOffsetY, rotation]);

  // Trigger Intelligent Auto Crop
  const handleTriggerAutoCrop = () => {
    setAspectRatio('AUTO');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const sampleW = 200;
          const sampleH = Math.max(10, Math.round((currentImgH / currentImgW) * sampleW));
          const canvas = document.createElement('canvas');
          canvas.width = sampleW;
          canvas.height = sampleH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            applyCenterFocalCrop();
            return;
          }

          if (rotation !== 0) {
            ctx.translate(sampleW / 2, sampleH / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(img, -sampleW / 2, -sampleH / 2, sampleW, sampleH);
          } else {
            ctx.drawImage(img, 0, 0, sampleW, sampleH);
          }

          const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
          const data = imgData.data;

          // Corner background estimation
          const cIdxs = [
            0,
            (sampleW - 1) * 4,
            (sampleH - 1) * sampleW * 4,
            ((sampleH - 1) * sampleW + (sampleW - 1)) * 4,
          ];
          let bgR = 0, bgG = 0, bgB = 0;
          for (const idx of cIdxs) {
            bgR += data[idx];
            bgG += data[idx + 1];
            bgB += data[idx + 2];
          }
          bgR /= 4; bgG /= 4; bgB /= 4;

          let minX = sampleW, maxX = 0, minY = sampleH, maxY = 0;
          let contentCount = 0;

          for (let y = 0; y < sampleH; y += 2) {
            for (let x = 0; x < sampleW; x += 2) {
              const idx = (y * sampleW + x) * 4;
              const diff = Math.abs(data[idx] - bgR) + Math.abs(data[idx + 1] - bgG) + Math.abs(data[idx + 2] - bgB);
              if (diff > 40 && data[idx + 3] > 20) {
                contentCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          const totalSampled = (sampleW * sampleH) / 4;
          if (contentCount > totalSampled * 0.05 && contentCount < totalSampled * 0.94 && maxX > minX + 15 && maxY > minY + 15) {
            const padX = sampleW * 0.02;
            const padY = sampleH * 0.02;
            const normL = Math.max(0, (minX - padX) / sampleW);
            const normT = Math.max(0, (minY - padY) / sampleH);
            const normR = Math.min(1, (maxX + padX) / sampleW);
            const normB = Math.min(1, (maxY + padY) / sampleH);

            const newX = imgOffsetX + normL * renderedW;
            const newY = imgOffsetY + normT * renderedH;
            const newW = (normR - normL) * renderedW;
            const newH = (normB - normT) * renderedH;

            setCropBox({
              x: Math.max(imgOffsetX, newX),
              y: Math.max(imgOffsetY, newY),
              w: Math.min(newW, renderedW),
              h: Math.min(newH, renderedH),
            });
            showNotice('⚡ Auto-detected document & edges');
            return;
          }
        } catch (e) {
          console.warn('Auto crop detection fallback', e);
        }
        applyCenterFocalCrop();
      };
      img.src = imageUri;
    } else {
      applyCenterFocalCrop();
    }
  };

  const applyCenterFocalCrop = () => {
    const targetRatio = renderedW > renderedH ? 16 / 9 : 4 / 5;
    let newW = renderedW * 0.88;
    let newH = newW / targetRatio;
    if (newH > renderedH * 0.88) {
      newH = renderedH * 0.88;
      newW = newH * targetRatio;
    }
    setCropBox({
      x: imgOffsetX + (renderedW - newW) / 2,
      y: imgOffsetY + (renderedH - newH) / 2,
      w: newW,
      h: newH,
    });
    showNotice('⚡ Auto focal crop applied');
  };

  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  // Handle Aspect Ratio switch
  const handleSetAspectRatio = (mode: AspectRatioOption) => {
    setAspectRatio(mode);
    if (mode === 'AUTO') {
      handleTriggerAutoCrop();
      return;
    }
    if (mode === 'FREE') return; // Freeform: keep current box, unlock aspect

    let targetRatio: number | null = null;
    if (mode === '1:1') targetRatio = 1;
    if (mode === '4:5') targetRatio = 4 / 5;
    if (mode === '16:9') targetRatio = 16 / 9;
    if (mode === 'DOC') targetRatio = 1 / 1.414; // A4 standard

    if (!targetRatio) return;

    let newW = renderedW;
    let newH = newW / targetRatio;
    if (newH > renderedH) {
      newH = renderedH;
      newW = newH * targetRatio;
    }
    setCropBox({
      x: imgOffsetX + (renderedW - newW) / 2,
      y: imgOffsetY + (renderedH - newH) / 2,
      w: newW,
      h: newH,
    });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setRotation(0);
    setAspectRatio('FREE');
    setCropBox({
      x: imgOffsetX,
      y: imgOffsetY,
      w: renderedW,
      h: renderedH,
    });
    showNotice('Full image restored');
  };

  // Generalized PanResponder for moving, 4 corners, and 4 edges
  const createHandleResponder = (
    handle: 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move'
  ) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { pageX, pageY } = evt.nativeEvent;
        dragStartRef.current = {
          box: { ...cropBox },
          touchX: pageX,
          touchY: pageY,
        };
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (!dragStartRef.current) return;
        const { box } = dragStartRef.current;
        const dx = gestureState.dx;
        const dy = gestureState.dy;

        const minW = 45;
        const minH = 45;
        const maxRight = imgOffsetX + renderedW;
        const maxBottom = imgOffsetY + renderedH;

        if (handle === 'move') {
          // Move whole box smoothly within bounds
          const newX = Math.max(imgOffsetX, Math.min(box.x + dx, maxRight - box.w));
          const newY = Math.max(imgOffsetY, Math.min(box.y + dy, maxBottom - box.h));
          setCropBox({ ...box, x: newX, y: newY });
          return;
        }

        // Top edge drag
        if (handle === 't') {
          const newY = Math.max(imgOffsetY, Math.min(box.y + dy, box.y + box.h - minH));
          const newH = box.h - (newY - box.y);
          setCropBox({ ...box, y: newY, h: newH });
          return;
        }

        // Bottom edge drag
        if (handle === 'b') {
          const newH = Math.max(minH, Math.min(box.h + dy, maxBottom - box.y));
          setCropBox({ ...box, h: newH });
          return;
        }

        // Left edge drag
        if (handle === 'l') {
          const newX = Math.max(imgOffsetX, Math.min(box.x + dx, box.x + box.w - minW));
          const newW = box.w - (newX - box.x);
          setCropBox({ ...box, x: newX, w: newW });
          return;
        }

        // Right edge drag
        if (handle === 'r') {
          const newW = Math.max(minW, Math.min(box.w + dx, maxRight - box.x));
          setCropBox({ ...box, w: newW });
          return;
        }

        // 4 Corners Drag
        if (handle === 'tl') {
          let newX = Math.max(imgOffsetX, Math.min(box.x + dx, box.x + box.w - minW));
          let newY = Math.max(imgOffsetY, Math.min(box.y + dy, box.y + box.h - minH));
          let newW = box.w - (newX - box.x);
          let newH = box.h - (newY - box.y);
          if (aspectRatio === '1:1') {
            const side = Math.min(newW, newH);
            newW = side; newH = side;
            newX = box.x + box.w - side;
            newY = box.y + box.h - side;
          }
          setCropBox({ x: newX, y: newY, w: newW, h: newH });
        } else if (handle === 'tr') {
          let newY = Math.max(imgOffsetY, Math.min(box.y + dy, box.y + box.h - minH));
          let newW = Math.max(minW, Math.min(box.w + dx, maxRight - box.x));
          let newH = box.h - (newY - box.y);
          if (aspectRatio === '1:1') {
            const side = Math.min(newW, newH);
            newW = side; newH = side;
            newY = box.y + box.h - side;
          }
          setCropBox({ x: box.x, y: newY, w: newW, h: newH });
        } else if (handle === 'bl') {
          let newX = Math.max(imgOffsetX, Math.min(box.x + dx, box.x + box.w - minW));
          let newW = box.w - (newX - box.x);
          let newH = Math.max(minH, Math.min(box.h + dy, maxBottom - box.y));
          if (aspectRatio === '1:1') {
            const side = Math.min(newW, newH);
            newW = side; newH = side;
            newX = box.x + box.w - side;
          }
          setCropBox({ x: newX, y: box.y, w: newW, h: newH });
        } else if (handle === 'br') {
          let newW = Math.max(minW, Math.min(box.w + dx, maxRight - box.x));
          let newH = Math.max(minH, Math.min(box.h + dy, maxBottom - box.y));
          if (aspectRatio === '1:1') {
            const side = Math.min(newW, newH);
            newW = side; newH = side;
          }
          setCropBox({ x: box.x, y: box.y, w: newW, h: newH });
        }
      },
      onPanResponderRelease: () => {
        dragStartRef.current = null;
      },
    });

  const moveResponder = useRef(createHandleResponder('move')).current;
  const tlResponder = useRef(createHandleResponder('tl')).current;
  const trResponder = useRef(createHandleResponder('tr')).current;
  const blResponder = useRef(createHandleResponder('bl')).current;
  const brResponder = useRef(createHandleResponder('br')).current;
  const tResponder = useRef(createHandleResponder('t')).current;
  const bResponder = useRef(createHandleResponder('b')).current;
  const lResponder = useRef(createHandleResponder('l')).current;
  const rResponder = useRef(createHandleResponder('r')).current;

  // Execute Final Pixel-Perfect Crop
  const handleApplyCrop = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const img = new (window as any).Image();
      img.onload = () => {
        // Calculate relative coordinates in rendered image
        const relX = Math.max(0, (cropBox.x - imgOffsetX) / scale);
        const relY = Math.max(0, (cropBox.y - imgOffsetY) / scale);
        const relW = Math.min(cropBox.w / scale, currentImgW);
        const relH = Math.min(cropBox.h / scale, currentImgH);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(relW);
        canvas.height = Math.round(relH);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onCropComplete(imageUri);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw rotated & cropped area
        if (rotation === 0) {
          ctx.drawImage(img, relX, relY, relW, relH, 0, 0, canvas.width, canvas.height);
        } else {
          const rotCanvas = document.createElement('canvas');
          rotCanvas.width = currentImgW;
          rotCanvas.height = currentImgH;
          const rotCtx = rotCanvas.getContext('2d');
          if (rotCtx) {
            rotCtx.translate(currentImgW / 2, currentImgH / 2);
            rotCtx.rotate((rotation * Math.PI) / 180);
            rotCtx.drawImage(img, -naturalSize.width / 2, -naturalSize.height / 2);
            ctx.drawImage(rotCanvas, relX, relY, relW, relH, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.drawImage(img, relX, relY, relW, relH, 0, 0, canvas.width, canvas.height);
          }
        }

        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        onCropComplete(croppedDataUrl);
      };
      img.src = imageUri;
    } else {
      onCropComplete(imageUri);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <X size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.title}>Crop & Rotate</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleTriggerAutoCrop}
              style={[styles.headerBtn, styles.autoCropHeaderBtn]}
              accessibilityLabel="Auto Crop"
            >
              <Zap size={16} color="#fbbf24" />
              <Text style={styles.autoCropHeaderText}>Auto</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRotate} style={styles.headerBtn} accessibilityLabel="Rotate 90">
              <RotateCw size={18} color="#38bdf8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReset} style={styles.headerBtn} accessibilityLabel="Reset">
              <RefreshCw size={17} color="#94a3b8" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleApplyCrop} style={[styles.headerBtn, styles.doneBtn]} accessibilityLabel="Done">
              <Check size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Feedback Notice Toast */}
        {feedbackNotice && (
          <View style={styles.noticeToast}>
            <Text style={styles.noticeText}>{feedbackNotice}</Text>
          </View>
        )}

        {/* Aspect Ratio Toolbar */}
        <View style={styles.aspectBar}>
          {(['AUTO', 'FREE', '1:1', '4:5', '16:9', 'DOC'] as AspectRatioOption[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.aspectPill, aspectRatio === mode && styles.aspectPillActive]}
              onPress={() => handleSetAspectRatio(mode)}
            >
              {mode === 'AUTO' && <Zap size={12} color={aspectRatio === 'AUTO' ? '#ffffff' : '#fbbf24'} style={{ marginRight: 3 }} />}
              <Text style={[styles.aspectPillText, aspectRatio === mode && styles.aspectPillTextActive]}>
                {mode === 'AUTO' ? 'Auto' : mode === 'FREE' ? 'Freeform' : mode === 'DOC' ? 'A4 Doc' : mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Main Crop Stage */}
        <View style={styles.stageWrapper}>
          <View style={[styles.stage, { width: STAGE_SIZE, height: STAGE_SIZE }]}>
            {/* The Image */}
            <Image
              source={{ uri: imageUri }}
              style={[
                styles.image,
                {
                  width: renderedW,
                  height: renderedH,
                  left: imgOffsetX,
                  top: imgOffsetY,
                  transform: [{ rotate: `${rotation}deg` }],
                },
              ]}
              resizeMode="contain"
            />

            {/* Dark Masks around Crop Box */}
            <View
              style={[
                styles.mask,
                {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: cropBox.y,
                },
              ]}
            />
            <View
              style={[
                styles.mask,
                {
                  top: cropBox.y + cropBox.h,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            <View
              style={[
                styles.mask,
                {
                  top: cropBox.y,
                  left: 0,
                  width: cropBox.x,
                  height: cropBox.h,
                },
              ]}
            />
            <View
              style={[
                styles.mask,
                {
                  top: cropBox.y,
                  left: cropBox.x + cropBox.w,
                  right: 0,
                  height: cropBox.h,
                },
              ]}
            />

            {/* Interactive Crop Box Window */}
            <View
              {...moveResponder.panHandlers}
              style={[
                styles.cropWindow,
                {
                  left: cropBox.x,
                  top: cropBox.y,
                  width: cropBox.w,
                  height: cropBox.h,
                },
              ]}
            >
              {/* WhatsApp Rule of Thirds Grid Lines */}
              <View style={styles.gridRow1} />
              <View style={styles.gridRow2} />
              <View style={styles.gridCol1} />
              <View style={styles.gridCol2} />

              {/* 4 Edge Resize Drag Bars */}
              <View {...tResponder.panHandlers} style={[styles.edgeTouchH, styles.edgeT]}>
                <View style={styles.edgeBarH} />
              </View>
              <View {...bResponder.panHandlers} style={[styles.edgeTouchH, styles.edgeB]}>
                <View style={styles.edgeBarH} />
              </View>
              <View {...lResponder.panHandlers} style={[styles.edgeTouchV, styles.edgeL]}>
                <View style={styles.edgeBarV} />
              </View>
              <View {...rResponder.panHandlers} style={[styles.edgeTouchV, styles.edgeR]}>
                <View style={styles.edgeBarV} />
              </View>

              {/* 4 Corner Resize Handles */}
              <View {...tlResponder.panHandlers} style={[styles.handleTouch, styles.handleTL]}>
                <View style={styles.handleCorner} />
              </View>
              <View {...trResponder.panHandlers} style={[styles.handleTouch, styles.handleTR]}>
                <View style={styles.handleCorner} />
              </View>
              <View {...blResponder.panHandlers} style={[styles.handleTouch, styles.handleBL]}>
                <View style={styles.handleCorner} />
              </View>
              <View {...brResponder.panHandlers} style={[styles.handleTouch, styles.handleBR]}>
                <View style={styles.handleCorner} />
              </View>
            </View>
          </View>
        </View>

        {/* Footer Hint */}
        <View style={styles.footer}>
          <Text style={styles.hintText}>
            ⚡ Tap Auto for 1-click crop • Drag corners or edges to resize freely
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoCropHeaderBtn: {
    width: 'auto',
    flexDirection: 'row',
    paddingHorizontal: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#fbbf24',
    gap: 4,
  },
  autoCropHeaderText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#0284c7',
  },
  noticeToast: {
    backgroundColor: '#0284c7',
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'center',
    borderRadius: 14,
    marginTop: 8,
  },
  noticeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  aspectBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0b0f19',
    flexWrap: 'wrap',
  },
  aspectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  aspectPillActive: {
    backgroundColor: '#0284c7',
  },
  aspectPillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  aspectPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  stageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  stage: {
    position: 'relative',
    backgroundColor: '#0b0f19',
    overflow: 'hidden',
    borderRadius: 8,
  },
  image: {
    position: 'absolute',
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  cropWindow: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  // WhatsApp 3x3 Grid
  gridRow1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  gridRow2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  gridCol1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  gridCol2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  // Corner touch zones
  handleTouch: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleTL: {
    top: -8,
    left: -8,
  },
  handleTR: {
    top: -8,
    right: -8,
  },
  handleBL: {
    bottom: -8,
    left: -8,
  },
  handleBR: {
    bottom: -8,
    right: -8,
  },
  handleCorner: {
    width: 14,
    height: 14,
    backgroundColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#0284c7',
  },
  // Edge touch zones & bars
  edgeTouchH: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  edgeT: {
    top: -12,
  },
  edgeB: {
    bottom: -12,
  },
  edgeBarH: {
    width: 36,
    height: 4,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  edgeTouchV: {
    position: 'absolute',
    top: 20,
    bottom: 20,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  edgeL: {
    left: -12,
  },
  edgeR: {
    right: -12,
  },
  edgeBarV: {
    width: 4,
    height: 36,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  footer: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  hintText: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
