import { Alert, Image, Platform } from 'react-native';

export const MAX_DOCUMENT_MB = 20;
export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024;
export const MAX_VIDEO_MB = 100;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

// Vertical photos render down to 9:16 (0.5625) and wide landscape up to 16:9 (1.7778)
export const MIN_MEDIA_ASPECT_RATIO = 9 / 16;
export const MAX_MEDIA_ASPECT_RATIO = 16 / 9;

export type ImageQualityPreset = 'STANDARD' | 'HIGH' | 'ULTRA';

export interface ImageQualityConfig {
  key: ImageQualityPreset;
  label: string;
  shortLabel: string;
  description: string;
  maxDimension: number;
  jpegQuality: number;
}

export const IMAGE_QUALITY_PRESETS: Record<ImageQualityPreset, ImageQualityConfig> = {
  STANDARD: {
    key: 'STANDARD',
    label: 'Standard',
    shortLabel: 'Save Space',
    description: '1080px • Smaller size, fast upload',
    maxDimension: 1080,
    jpegQuality: 0.78,
  },
  HIGH: {
    key: 'HIGH',
    label: 'High',
    shortLabel: 'Balanced',
    description: '1440px • Crisp feed & saved storage',
    maxDimension: 1440,
    jpegQuality: 0.86,
  },
  ULTRA: {
    key: 'ULTRA',
    label: 'Ultra',
    shortLabel: 'Sharp',
    description: '1920px • High detail',
    maxDimension: 1920,
    jpegQuality: 0.92,
  },
};

export const IMAGE_QUALITY_OPTIONS: ImageQualityConfig[] = [
  IMAGE_QUALITY_PRESETS.STANDARD,
  IMAGE_QUALITY_PRESETS.HIGH,
  IMAGE_QUALITY_PRESETS.ULTRA,
];

export const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * React Native Web's Alert.alert is a no-op; use window.alert on Web so
 * validation warnings (such as the 20 MB document limit) are never silent.
 */
export const showCrossPlatformAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
};

export const clampAspectRatio = (
  width?: number | null,
  height?: number | null,
  fallback: number = 4 / 3
): number => {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return fallback;
  }
  const raw = width / height;
  return Math.max(MIN_MEDIA_ASPECT_RATIO, Math.min(MAX_MEDIA_ASPECT_RATIO, raw));
};

export const toJpegFilename = (name: string): string => {
  const cleaned = (name || `photo_${Date.now()}`).trim();
  const base = cleaned.replace(/\.[^/.]+$/, '');
  return `${base || `photo_${Date.now()}`}.jpg`;
};

export const dataUrlToWebFile = (dataUrl: string, filename: string): File | null => {
  if (typeof window === 'undefined' || typeof File === 'undefined' || !dataUrl.startsWith('data:')) {
    return null;
  }
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const safeName = mime === 'image/jpeg' ? toJpegFilename(filename) : filename;
    return new File([u8arr], safeName, { type: mime });
  } catch {
    return null;
  }
};

export const measureImageSize = (uri: string): Promise<{ width: number; height: number } | null> => {
  if (!uri) return Promise.resolve(null);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.Image !== 'undefined') {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = uri;
    });
  }
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve(width > 0 && height > 0 ? { width, height } : null),
      () => resolve(null)
    );
  });
};

export interface ProcessedImageResult {
  uri: string;
  file: File | null;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}

/**
 * Resizes & compresses an image on Web according to the selected quality preset so
 * photos stay crisp (up to 1080/1440/1920px) without storing bloated multi-MB raw files.
 */
export const processWebImageForUpload = (
  source: File | Blob | string,
  fileName: string,
  presetKey: ImageQualityPreset = 'HIGH'
): Promise<ProcessedImageResult> => {
  const preset = IMAGE_QUALITY_PRESETS[presetKey] || IMAGE_QUALITY_PRESETS.HIGH;

  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.Image === 'undefined') {
    const uri = typeof source === 'string' ? source : '';
    const file = typeof File !== 'undefined' && source instanceof File ? source : null;
    const size = typeof source === 'string' ? 0 : source.size || 0;
    return Promise.resolve({
      uri,
      file,
      width: 0,
      height: 0,
      size,
      mimeType: (source instanceof File && source.type) || 'image/jpeg',
    });
  }

  return new Promise((resolve) => {
    let objectUrlToRevoke: string | null = null;
    let srcUrl = '';
    if (typeof source === 'string') {
      srcUrl = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      srcUrl = objectUrlToRevoke;
    }

    const img = new window.Image();
    if (!srcUrl.startsWith('data:') && !srcUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    const cleanup = () => {
      if (objectUrlToRevoke) {
        try {
          URL.revokeObjectURL(objectUrlToRevoke);
        } catch {}
      }
    };

    img.onload = () => {
      const natW = img.naturalWidth || img.width || 0;
      const natH = img.naturalHeight || img.height || 0;
      if (natW <= 0 || natH <= 0) {
        cleanup();
        const fallbackFile = typeof File !== 'undefined' && source instanceof File ? source : null;
        resolve({
          uri: typeof source === 'string' ? source : '',
          file: fallbackFile,
          width: 0,
          height: 0,
          size: typeof source !== 'string' ? source.size || 0 : 0,
          mimeType: (fallbackFile && fallbackFile.type) || 'image/jpeg',
        });
        return;
      }

      let targetW = natW;
      let targetH = natH;
      const maxDim = preset.maxDimension;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW >= targetH) {
          targetH = Math.max(1, Math.round((targetH * maxDim) / targetW));
          targetW = maxDim;
        } else {
          targetW = Math.max(1, Math.round((targetW * maxDim) / targetH));
          targetH = maxDim;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Neutral background before JPEG encode so PNG alpha never turns black
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const dataUrl = canvas.toDataURL('image/jpeg', preset.jpegQuality);
          const jpgFile = dataUrlToWebFile(dataUrl, toJpegFilename(fileName));
          cleanup();
          resolve({
            uri: dataUrl,
            file: jpgFile,
            width: targetW,
            height: targetH,
            size: jpgFile ? jpgFile.size : Math.round((dataUrl.length * 3) / 4),
            mimeType: 'image/jpeg',
          });
          return;
        }
      } catch {
        // Fallback below if canvas export fails (e.g., CORS tainted image)
      }

      cleanup();
      const fallbackFile = typeof File !== 'undefined' && source instanceof File ? source : null;
      resolve({
        uri: typeof source === 'string' ? source : '',
        file: fallbackFile,
        width: natW,
        height: natH,
        size: typeof source !== 'string' ? source.size || 0 : 0,
        mimeType: (fallbackFile && fallbackFile.type) || 'image/jpeg',
      });
    };

    img.onerror = () => {
      cleanup();
      const fallbackFile = typeof File !== 'undefined' && source instanceof File ? source : null;
      resolve({
        uri: typeof source === 'string' ? source : '',
        file: fallbackFile,
        width: 0,
        height: 0,
        size: typeof source !== 'string' ? source.size || 0 : 0,
        mimeType: (fallbackFile && fallbackFile.type) || 'image/jpeg',
      });
    };

    img.src = srcUrl;
  });
};

export interface OversizedDocInfo {
  name: string;
  size: number;
}

export const splitDocumentsBySizeLimit = <
  T extends { name?: string; size?: number | null; file?: { size?: number } }
>(
  docs: T[],
  maxBytes: number = MAX_DOCUMENT_BYTES
): { valid: T[]; oversized: Array<{ item: T; name: string; size: number }> } => {
  const valid: T[] = [];
  const oversized: Array<{ item: T; name: string; size: number }> = [];

  for (const item of docs) {
    const rawSize = typeof item.size === 'number' ? item.size : item.file?.size || 0;
    const itemName = item.name || 'Document';
    if (rawSize > maxBytes) {
      oversized.push({ item, name: itemName, size: rawSize });
    } else {
      valid.push(item);
    }
  }

  return { valid, oversized };
};

export const formatOversizedDocumentMessage = (oversized: OversizedDocInfo[]): string => {
  if (!oversized || oversized.length === 0) return '';
  if (oversized.length === 1) {
    const doc = oversized[0];
    return `"${doc.name}" (${formatFileSize(doc.size)}) exceeds the ${MAX_DOCUMENT_MB} MB limit.\n\nTry uploading 2 different ones (split it into smaller files under ${MAX_DOCUMENT_MB} MB each).`;
  }
  const names = oversized.map((d) => `• ${d.name} (${formatFileSize(d.size)})`).join('\n');
  return `These documents exceed the ${MAX_DOCUMENT_MB} MB limit:\n${names}\n\nTry uploading 2 different ones (each under ${MAX_DOCUMENT_MB} MB).`;
};

export const alertOversizedDocuments = (oversized: OversizedDocInfo[]): string => {
  const msg = formatOversizedDocumentMessage(oversized);
  if (msg) {
    showCrossPlatformAlert(`Document Exceeds ${MAX_DOCUMENT_MB} MB Limit`, msg);
  }
  return msg;
};
