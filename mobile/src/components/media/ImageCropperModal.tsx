import React, { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  PanResponderGestureState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Check, RefreshCw, RotateCw, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

export type AspectRatioOption = 'FREE' | 'ORIGINAL' | '1:1' | '4:5' | '9:16' | '16:9';

interface ImageCropperModalProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onCropComplete: (croppedUri: string, width?: number, height?: number) => void;
  initialAspectRatio?: AspectRatioOption;
  maxDimension?: number;
  jpegQuality?: number;
}

type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ASPECT_OPTIONS: { key: AspectRatioOption; label: string }[] = [
  { key: 'FREE', label: 'Freeform' },
  { key: 'ORIGINAL', label: 'Original' },
  { key: '1:1', label: '1:1' },
  { key: '4:5', label: '4:5' },
  { key: '9:16', label: '9:16' },
  { key: '16:9', label: '16:9' },
];

const getTargetRatio = (mode: AspectRatioOption, imgW: number, imgH: number): number | null => {
  switch (mode) {
    case '1:1':
      return 1;
    case '4:5':
      return 4 / 5;
    case '9:16':
      return 9 / 16;
    case '16:9':
      return 16 / 9;
    case 'ORIGINAL':
      return imgH > 0 ? imgW / imgH : 1;
    default:
      return null;
  }
};

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  visible,
  imageUri,
  onClose,
  onCropComplete,
  initialAspectRatio = 'FREE',
  maxDimension = 1440,
  jpegQuality = 0.86,
}) => {
  const { colors } = useTheme();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const stageSize = Math.max(240, Math.min(winWidth - 32, winHeight - 280, 520));

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });
  const [rotation, setRotation] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(initialAspectRatio);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const [cropBox, setCropBox] = useState<Box>({
    x: 20,
    y: 20,
    w: stageSize - 40,
    h: stageSize - 40,
  });

  const cropBoxRef = useRef<Box>(cropBox);
  cropBoxRef.current = cropBox;

  const dragStartRef = useRef<{ box: Box; touchX: number; touchY: number } | null>(null);
  const isDraggingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRotatedSideways = rotation === 90 || rotation === 270;
  const currentImgW = isRotatedSideways ? naturalSize.height : naturalSize.width;
  const currentImgH = isRotatedSideways ? naturalSize.width : naturalSize.height;

  const scale = Math.min(stageSize / currentImgW, stageSize / currentImgH);
  const renderedW = currentImgW * scale;
  const renderedH = currentImgH * scale;
  const imgOffsetX = (stageSize - renderedW) / 2;
  const imgOffsetY = (stageSize - renderedH) / 2;

  const boundsRef = useRef({
    renderedW,
    renderedH,
    imgOffsetX,
    imgOffsetY,
    currentImgW,
    currentImgH,
    aspectRatio,
  });

  boundsRef.current = {
    renderedW,
    renderedH,
    imgOffsetX,
    imgOffsetY,
    currentImgW,
    currentImgH,
    aspectRatio,
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Load natural dimensions of image whenever modal opens with a new image
  useEffect(() => {
    if (!visible || !imageUri) return;

    let cancelled = false;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const img = new window.Image();
      if (!imageUri.startsWith('data:') && !imageUri.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (!cancelled) {
          setNaturalSize({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
        }
      };
      img.src = imageUri;
    } else {
      Image.getSize(
        imageUri,
        (w, h) => {
          if (!cancelled) setNaturalSize({ width: w, height: h });
        },
        () => {
          if (!cancelled) setNaturalSize({ width: 800, height: 600 });
        }
      );
    }

    setRotation(0);
    setAspectRatio(initialAspectRatio);

    return () => {
      cancelled = true;
    };
  }, [visible, imageUri, initialAspectRatio]);

  // Compute centered crop box matching a given aspect ratio
  const computeBoxForRatio = (
    mode: AspectRatioOption,
    rW: number,
    rH: number,
    offX: number,
    offY: number,
    cW: number,
    cH: number
  ): Box => {
    const ratio = getTargetRatio(mode, cW, cH);
    if (!ratio) {
      return { x: offX, y: offY, w: rW, h: rH };
    }
    let newW = rW;
    let newH = newW / ratio;
    if (newH > rH) {
      newH = rH;
      newW = newH * ratio;
    }
    return {
      x: offX + (rW - newW) / 2,
      y: offY + (rH - newH) / 2,
      w: newW,
      h: newH,
    };
  };

  // Re-fit crop box when image dimensions, stage size, rotation, or preset changes
  useEffect(() => {
    const nextBox = computeBoxForRatio(
      aspectRatio,
      renderedW,
      renderedH,
      imgOffsetX,
      imgOffsetY,
      currentImgW,
      currentImgH
    );
    setCropBox(nextBox);
    cropBoxRef.current = nextBox;
  }, [renderedW, renderedH, imgOffsetX, imgOffsetY, rotation, naturalSize.width, naturalSize.height]);

  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setFeedbackNotice(null), 2000);
  };

  const applyDeltaToCropBox = (handle: HandleType, initialBox: Box, dx: number, dy: number) => {
    const {
      renderedW: rW,
      renderedH: rH,
      imgOffsetX: offX,
      imgOffsetY: offY,
      currentImgW: cW,
      currentImgH: cH,
      aspectRatio: aMode,
    } = boundsRef.current;

    const minDim = 40;
    const maxRight = offX + rW;
    const maxBottom = offY + rH;
    const targetRatio = getTargetRatio(aMode, cW, cH);

    let next: Box = { ...initialBox };

    if (handle === 'move') {
      const newX = Math.max(offX, Math.min(initialBox.x + dx, maxRight - initialBox.w));
      const newY = Math.max(offY, Math.min(initialBox.y + dy, maxBottom - initialBox.h));
      next = { ...initialBox, x: newX, y: newY };
    } else if (!targetRatio) {
      // Freeform handles
      if (handle === 'tl') {
        const newX = Math.max(offX, Math.min(initialBox.x + dx, initialBox.x + initialBox.w - minDim));
        const newY = Math.max(offY, Math.min(initialBox.y + dy, initialBox.y + initialBox.h - minDim));
        next = {
          x: newX,
          y: newY,
          w: initialBox.x + initialBox.w - newX,
          h: initialBox.y + initialBox.h - newY,
        };
      } else if (handle === 'tr') {
        const newW = Math.max(minDim, Math.min(initialBox.w + dx, maxRight - initialBox.x));
        const newY = Math.max(offY, Math.min(initialBox.y + dy, initialBox.y + initialBox.h - minDim));
        next = {
          x: initialBox.x,
          y: newY,
          w: newW,
          h: initialBox.y + initialBox.h - newY,
        };
      } else if (handle === 'bl') {
        const newX = Math.max(offX, Math.min(initialBox.x + dx, initialBox.x + initialBox.w - minDim));
        const newH = Math.max(minDim, Math.min(initialBox.h + dy, maxBottom - initialBox.y));
        next = {
          x: newX,
          y: initialBox.y,
          w: initialBox.x + initialBox.w - newX,
          h: newH,
        };
      } else if (handle === 'br') {
        const newW = Math.max(minDim, Math.min(initialBox.w + dx, maxRight - initialBox.x));
        const newH = Math.max(minDim, Math.min(initialBox.h + dy, maxBottom - initialBox.y));
        next = { x: initialBox.x, y: initialBox.y, w: newW, h: newH };
      } else if (handle === 't') {
        const newY = Math.max(offY, Math.min(initialBox.y + dy, initialBox.y + initialBox.h - minDim));
        next = { ...initialBox, y: newY, h: initialBox.y + initialBox.h - newY };
      } else if (handle === 'b') {
        const newH = Math.max(minDim, Math.min(initialBox.h + dy, maxBottom - initialBox.y));
        next = { ...initialBox, h: newH };
      } else if (handle === 'l') {
        const newX = Math.max(offX, Math.min(initialBox.x + dx, initialBox.x + initialBox.w - minDim));
        next = { ...initialBox, x: newX, w: initialBox.x + initialBox.w - newX };
      } else if (handle === 'r') {
        const newW = Math.max(minDim, Math.min(initialBox.w + dx, maxRight - initialBox.x));
        next = { ...initialBox, w: newW };
      }
    } else {
      // Strictly aspect-locked resize across BOTH corners AND edges
      const minW = Math.max(minDim, minDim * targetRatio);
      const minH = Math.max(minDim, minDim / targetRatio);

      if (handle === 'tl') {
        const anchorRight = initialBox.x + initialBox.w;
        const anchorBottom = initialBox.y + initialBox.h;
        const maxW = Math.min(anchorRight - offX, (anchorBottom - offY) * targetRatio);
        const desiredW = Math.abs(dx) >= Math.abs(dy * targetRatio)
          ? initialBox.w - dx
          : (initialBox.h - dy) * targetRatio;
        const newW = Math.max(minW, Math.min(maxW, desiredW));
        const newH = newW / targetRatio;
        next = { x: anchorRight - newW, y: anchorBottom - newH, w: newW, h: newH };
      } else if (handle === 'tr') {
        const anchorLeft = initialBox.x;
        const anchorBottom = initialBox.y + initialBox.h;
        const maxW = Math.min(maxRight - anchorLeft, (anchorBottom - offY) * targetRatio);
        const desiredW = Math.abs(dx) >= Math.abs(dy * targetRatio)
          ? initialBox.w + dx
          : (initialBox.h - dy) * targetRatio;
        const newW = Math.max(minW, Math.min(maxW, desiredW));
        const newH = newW / targetRatio;
        next = { x: anchorLeft, y: anchorBottom - newH, w: newW, h: newH };
      } else if (handle === 'bl') {
        const anchorRight = initialBox.x + initialBox.w;
        const anchorTop = initialBox.y;
        const maxW = Math.min(anchorRight - offX, (maxBottom - anchorTop) * targetRatio);
        const desiredW = Math.abs(dx) >= Math.abs(dy * targetRatio)
          ? initialBox.w - dx
          : (initialBox.h + dy) * targetRatio;
        const newW = Math.max(minW, Math.min(maxW, desiredW));
        const newH = newW / targetRatio;
        next = { x: anchorRight - newW, y: anchorTop, w: newW, h: newH };
      } else if (handle === 'br') {
        const anchorLeft = initialBox.x;
        const anchorTop = initialBox.y;
        const maxW = Math.min(maxRight - anchorLeft, (maxBottom - anchorTop) * targetRatio);
        const desiredW = Math.abs(dx) >= Math.abs(dy * targetRatio)
          ? initialBox.w + dx
          : (initialBox.h + dy) * targetRatio;
        const newW = Math.max(minW, Math.min(maxW, desiredW));
        const newH = newW / targetRatio;
        next = { x: anchorLeft, y: anchorTop, w: newW, h: newH };
      } else if (handle === 't') {
        const anchorBottom = initialBox.y + initialBox.h;
        const centerX = initialBox.x + initialBox.w / 2;
        const maxH = Math.min(anchorBottom - offY, rW / targetRatio);
        const newH = Math.max(minH, Math.min(maxH, initialBox.h - dy));
        const newW = newH * targetRatio;
        const newX = Math.max(offX, Math.min(centerX - newW / 2, maxRight - newW));
        next = { x: newX, y: anchorBottom - newH, w: newW, h: newH };
      } else if (handle === 'b') {
        const anchorTop = initialBox.y;
        const centerX = initialBox.x + initialBox.w / 2;
        const maxH = Math.min(maxBottom - anchorTop, rW / targetRatio);
        const newH = Math.max(minH, Math.min(maxH, initialBox.h + dy));
        const newW = newH * targetRatio;
        const newX = Math.max(offX, Math.min(centerX - newW / 2, maxRight - newW));
        next = { x: newX, y: anchorTop, w: newW, h: newH };
      } else if (handle === 'l') {
        const anchorRight = initialBox.x + initialBox.w;
        const centerY = initialBox.y + initialBox.h / 2;
        const maxW = Math.min(anchorRight - offX, rH * targetRatio);
        const newW = Math.max(minW, Math.min(maxW, initialBox.w - dx));
        const newH = newW / targetRatio;
        const newY = Math.max(offY, Math.min(centerY - newH / 2, maxBottom - newH));
        next = { x: anchorRight - newW, y: newY, w: newW, h: newH };
      } else if (handle === 'r') {
        const anchorLeft = initialBox.x;
        const centerY = initialBox.y + initialBox.h / 2;
        const maxW = Math.min(maxRight - anchorLeft, rH * targetRatio);
        const newW = Math.max(minW, Math.min(maxW, initialBox.w + dx));
        const newH = newW / targetRatio;
        const newY = Math.max(offY, Math.min(centerY - newH / 2, maxBottom - newH));
        next = { x: anchorLeft, y: newY, w: newW, h: newH };
      }
    }

    cropBoxRef.current = next;
    setCropBox(next);
  };

  // Direct Web Pointer/Mouse Drag Handlers
  const handleWebPointerDown = (e: any, handle: HandleType) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isDraggingRef.current) return;
    isDraggingRef.current = true;

    e.preventDefault?.();
    e.stopPropagation?.();
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation?.();
      e.nativeEvent.stopPropagation?.();
    }
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const initialBox = { ...cropBoxRef.current };

    const onPointerMove = (moveEvt: any) => {
      moveEvt.preventDefault?.();
      const curX = moveEvt.clientX ?? moveEvt.touches?.[0]?.clientX ?? startX;
      const curY = moveEvt.clientY ?? moveEvt.touches?.[0]?.clientY ?? startY;
      applyDeltaToCropBox(handle, initialBox, curX - startX, curY - startY);
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  };

  const createPanResponder = (handle: HandleType) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { pageX, pageY } = evt.nativeEvent;
        dragStartRef.current = {
          box: { ...cropBoxRef.current },
          touchX: pageX,
          touchY: pageY,
        };
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (!dragStartRef.current) return;
        applyDeltaToCropBox(handle, dragStartRef.current.box, gestureState.dx, gestureState.dy);
      },
      onPanResponderRelease: () => {
        dragStartRef.current = null;
      },
    });

  const moveResponder = useRef(createPanResponder('move')).current;
  const tlResponder = useRef(createPanResponder('tl')).current;
  const trResponder = useRef(createPanResponder('tr')).current;
  const blResponder = useRef(createPanResponder('bl')).current;
  const brResponder = useRef(createPanResponder('br')).current;
  const tResponder = useRef(createPanResponder('t')).current;
  const bResponder = useRef(createPanResponder('b')).current;
  const lResponder = useRef(createPanResponder('l')).current;
  const rResponder = useRef(createPanResponder('r')).current;

  const getHandleProps = (handle: HandleType) => {
    if (Platform.OS === 'web') {
      return {
        onMouseDown: (e: any) => handleWebPointerDown(e, handle),
        onTouchStart: (e: any) => handleWebPointerDown(e, handle),
      };
    }
    const map = {
      move: moveResponder,
      tl: tlResponder,
      tr: trResponder,
      bl: blResponder,
      br: brResponder,
      t: tResponder,
      b: bResponder,
      l: lResponder,
      r: rResponder,
    };
    return map[handle].panHandlers;
  };

  const handleSetAspectRatio = (mode: AspectRatioOption) => {
    setAspectRatio(mode);
    const nextBox = computeBoxForRatio(
      mode,
      renderedW,
      renderedH,
      imgOffsetX,
      imgOffsetY,
      currentImgW,
      currentImgH
    );
    setCropBox(nextBox);
    cropBoxRef.current = nextBox;
    showNotice(mode === 'FREE' ? 'Freeform crop unlocked' : `${mode} aspect locked`);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setRotation(0);
    setAspectRatio('FREE');
    const resetBox: Box = {
      x: imgOffsetX,
      y: imgOffsetY,
      w: renderedW,
      h: renderedH,
    };
    setCropBox(resetBox);
    cropBoxRef.current = resetBox;
    showNotice('Original frame restored');
  };

  // Compute live pixel preview dimensions
  const estOutW = Math.max(1, Math.round(cropBox.w / scale));
  const estOutH = Math.max(1, Math.round(cropBox.h / scale));

  // Execute Final Pixel-Perfect Crop + Compression
  const handleApplyCrop = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const img = new window.Image();
        if (!imageUri.startsWith('data:') && !imageUri.startsWith('blob:')) {
          img.crossOrigin = 'anonymous';
        }

        const executeCrop = () => {
          try {
            const currentBox = cropBoxRef.current;
            const relX = Math.max(0, (currentBox.x - imgOffsetX) / scale);
            const relY = Math.max(0, (currentBox.y - imgOffsetY) / scale);
            const relW = Math.max(1, Math.min(currentBox.w / scale, currentImgW - relX));
            const relH = Math.max(1, Math.min(currentBox.h / scale, currentImgH - relY));

            let outW = Math.max(1, Math.round(relW));
            let outH = Math.max(1, Math.round(relH));
            if (maxDimension > 0 && (outW > maxDimension || outH > maxDimension)) {
              if (outW >= outH) {
                outH = Math.max(1, Math.round((outH * maxDimension) / outW));
                outW = maxDimension;
              } else {
                outW = Math.max(1, Math.round((outW * maxDimension) / outH));
                outH = maxDimension;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              onCropComplete(imageUri, estOutW, estOutH);
              return;
            }

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, outW, outH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            if (rotation === 0) {
              ctx.drawImage(img, relX, relY, relW, relH, 0, 0, outW, outH);
            } else {
              const rotCanvas = document.createElement('canvas');
              rotCanvas.width = currentImgW;
              rotCanvas.height = currentImgH;
              const rotCtx = rotCanvas.getContext('2d');
              if (rotCtx) {
                rotCtx.translate(currentImgW / 2, currentImgH / 2);
                rotCtx.rotate((rotation * Math.PI) / 180);
                rotCtx.drawImage(
                  img,
                  -(img.naturalWidth || naturalSize.width) / 2,
                  -(img.naturalHeight || naturalSize.height) / 2
                );
                ctx.drawImage(rotCanvas, relX, relY, relW, relH, 0, 0, outW, outH);
              } else {
                ctx.drawImage(img, relX, relY, relW, relH, 0, 0, outW, outH);
              }
            }

            const croppedDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
            onCropComplete(croppedDataUrl, outW, outH);
          } catch (canvasErr) {
            console.warn('Canvas export error during crop', canvasErr);
            onCropComplete(imageUri, estOutW, estOutH);
          }
        };

        if (img.complete && img.naturalWidth) {
          executeCrop();
        } else {
          img.onload = executeCrop;
          img.onerror = () => onCropComplete(imageUri, estOutW, estOutH);
          img.src = imageUri;
        }
      } catch (err) {
        console.warn('handleApplyCrop error', err);
        onCropComplete(imageUri, estOutW, estOutH);
      }
    } else {
      onCropComplete(imageUri, estOutW, estOutH);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.background }]}>
        {/* Header Bar */}
        <View
          style={[
            styles.header,
            { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            style={[styles.headerBtn, { backgroundColor: colors.surfaceLight }]}
            accessibilityLabel="Cancel crop"
          >
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Crop & Rotate</Text>
            <Text style={[styles.dimLabel, { color: colors.textMuted }]}>
              {estOutW} × {estOutH} px
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleRotate}
              style={[styles.headerBtn, { backgroundColor: colors.surfaceLight }]}
              accessibilityLabel="Rotate 90"
            >
              <RotateCw size={18} color={colors.primaryHover} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.headerBtn, { backgroundColor: colors.surfaceLight }]}
              accessibilityLabel="Reset"
            >
              <RefreshCw size={17} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApplyCrop}
              style={[styles.headerBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel="Apply crop"
            >
              <Check size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {feedbackNotice && (
          <View style={[styles.noticeToast, { backgroundColor: colors.primary }]}>
            <Text style={styles.noticeText}>{feedbackNotice}</Text>
          </View>
        )}

        {/* Instagram/X Style Aspect Ratio Presets */}
        <View
          style={[
            styles.aspectBar,
            { backgroundColor: colors.surface, borderBottomColor: colors.hairline },
          ]}
        >
          {ASPECT_OPTIONS.map((opt) => {
            const active = aspectRatio === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.aspectPill,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceLight,
                    borderColor: active ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => handleSetAspectRatio(opt.key)}
              >
                <Text
                  style={[
                    styles.aspectPillText,
                    { color: active ? '#ffffff' : colors.textSecondary },
                    active && styles.aspectPillTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Main Crop Stage */}
        <View style={styles.stageWrapper}>
          <View
            style={[
              styles.stage,
              { width: stageSize, height: stageSize, backgroundColor: '#08090a' },
            ]}
          >
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

            {/* Masks outside Crop Box */}
            <View style={[styles.mask, { top: 0, left: 0, right: 0, height: cropBox.y }]} />
            <View
              style={[styles.mask, { top: cropBox.y + cropBox.h, left: 0, right: 0, bottom: 0 }]}
            />
            <View
              style={[
                styles.mask,
                { top: cropBox.y, left: 0, width: cropBox.x, height: cropBox.h },
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

            {/* Interactive Crop Window */}
            <View
              {...getHandleProps('move')}
              style={[
                styles.cropWindow,
                {
                  left: cropBox.x,
                  top: cropBox.y,
                  width: cropBox.w,
                  height: cropBox.h,
                  cursor: 'move' as any,
                },
              ]}
            >
              {/* Rule of Thirds Grid Lines */}
              <View style={styles.gridRow1} />
              <View style={styles.gridRow2} />
              <View style={styles.gridCol1} />
              <View style={styles.gridCol2} />

              {/* 4 Edge Drag Bars */}
              <View {...getHandleProps('t')} style={[styles.edgeTouchH, styles.edgeT]}>
                <View style={styles.edgeBarH} />
              </View>
              <View {...getHandleProps('b')} style={[styles.edgeTouchH, styles.edgeB]}>
                <View style={styles.edgeBarH} />
              </View>
              <View {...getHandleProps('l')} style={[styles.edgeTouchV, styles.edgeL]}>
                <View style={styles.edgeBarV} />
              </View>
              <View {...getHandleProps('r')} style={[styles.edgeTouchV, styles.edgeR]}>
                <View style={styles.edgeBarV} />
              </View>

              {/* 4 Corner Handles */}
              <View {...getHandleProps('tl')} style={[styles.handleTouch, styles.handleTL]}>
                <View style={[styles.handleCorner, { borderColor: colors.primary }]} />
              </View>
              <View {...getHandleProps('tr')} style={[styles.handleTouch, styles.handleTR]}>
                <View style={[styles.handleCorner, { borderColor: colors.primary }]} />
              </View>
              <View {...getHandleProps('bl')} style={[styles.handleTouch, styles.handleBL]}>
                <View style={[styles.handleCorner, { borderColor: colors.primary }]} />
              </View>
              <View {...getHandleProps('br')} style={[styles.handleTouch, styles.handleBR]}>
                <View style={[styles.handleCorner, { borderColor: colors.primary }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            { backgroundColor: colors.surface, borderTopColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            {aspectRatio === 'FREE'
              ? 'Drag corners or edges to crop freely • Drag inside to move'
              : `${aspectRatio} ratio locked • Drag corners, edges, or pan to frame`}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  titleBlock: {
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  dimLabel: {
    fontSize: 11,
    marginTop: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeToast: {
    paddingVertical: 5,
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
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  aspectPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  aspectPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  aspectPillTextActive: {
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
    overflow: 'hidden',
    borderRadius: 10,
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
  handleTouch: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleTL: {
    top: -10,
    left: -10,
    cursor: 'nwse-resize' as any,
  },
  handleTR: {
    top: -10,
    right: -10,
    cursor: 'nesw-resize' as any,
  },
  handleBL: {
    bottom: -10,
    left: -10,
    cursor: 'nesw-resize' as any,
  },
  handleBR: {
    bottom: -10,
    right: -10,
    cursor: 'nwse-resize' as any,
  },
  handleCorner: {
    width: 14,
    height: 14,
    backgroundColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 2,
  },
  edgeTouchH: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
    cursor: 'ns-resize' as any,
  },
  edgeT: {
    top: -14,
  },
  edgeB: {
    bottom: -14,
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
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
    cursor: 'ew-resize' as any,
  },
  edgeL: {
    left: -14,
  },
  edgeR: {
    right: -14,
  },
  edgeBarV: {
    width: 4,
    height: 36,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  hintText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
