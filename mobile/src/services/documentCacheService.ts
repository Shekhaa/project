import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getFullMediaUrl } from '../config/api';
import { AttachmentItem } from './chatService';

let FileSystem: any = null;
try {
  FileSystem = require('expo-file-system');
} catch {}

const WEB_CACHE_NAME = 'campus-connect-docs-v1';
const CACHED_INDEX_KEY = '@campus_cached_docs_index_v1';
const memoryCachedIds = new Set<string>();

export interface ResolvedDocumentResult {
  localUri: string;
  mimeType: string;
  fileName: string;
  fromCache: boolean;
}

const getSafeFilename = (attachment: AttachmentItem): string => {
  const ext = (attachment.file_extension || 'pdf').toLowerCase();
  const base = attachment.file_name || `document.${ext}`;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const getNativeCachePath = (attachment: AttachmentItem): string | null => {
  if (!FileSystem?.documentDirectory) return null;
  const safeName = getSafeFilename(attachment);
  const idPart = String(attachment.id || safeName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${FileSystem.documentDirectory}campus_docs/${idPart}_${safeName}`;
};

const getWebCacheKey = (attachment: AttachmentItem): string => {
  const idPart = String(attachment.id || attachment.file_name || 'doc');
  return `https://campus-local-docs/${encodeURIComponent(idPart)}`;
};

const markIdCached = async (id: string) => {
  if (!id) return;
  memoryCachedIds.add(id);
  try {
    const raw = await AsyncStorage.getItem(CACHED_INDEX_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(id)) {
      const next = [id, ...list].slice(0, 120);
      await AsyncStorage.setItem(CACHED_INDEX_KEY, JSON.stringify(next));
    }
  } catch {}
};

export const isDocumentCachedLocally = async (attachmentId?: string): Promise<boolean> => {
  if (!attachmentId) return false;
  if (memoryCachedIds.has(attachmentId)) return true;
  try {
    const raw = await AsyncStorage.getItem(CACHED_INDEX_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (list.includes(attachmentId)) {
      memoryCachedIds.add(attachmentId);
      return true;
    }
  } catch {}
  return false;
};

/**
 * Fetches a document using WhatsApp-style local caching + direct Cloudinary signed CDN URL
 * so Render backend never streams file bytes and its URL is never exposed on Web.
 */
export const resolveAndCacheDocument = async (
  attachment: AttachmentItem,
  mode: 'preview' | 'download' = 'preview'
): Promise<ResolvedDocumentResult> => {
  const ext = (attachment.file_extension || 'pdf').toLowerCase();
  const mimeType =
    attachment.mime_type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');
  const fileName = attachment.file_name || `document.${ext}`;

  // 1. Web: Check CacheStorage first (handles large PDFs offline without 5MB localStorage limit)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const cacheKey = getWebCacheKey(attachment);
    if ('caches' in window) {
      try {
        const cache = await window.caches.open(WEB_CACHE_NAME);
        const cachedResp = await cache.match(cacheKey);
        if (cachedResp) {
          const blob = await cachedResp.blob();
          if (blob.size > 0) {
            if (attachment.id) memoryCachedIds.add(String(attachment.id));
            return {
              localUri: window.URL.createObjectURL(blob),
              mimeType: blob.type || mimeType,
              fileName,
              fromCache: true,
            };
          }
        }
      } catch {}
    }

    // Fetch lightweight signed CDN URL from backend (0 file bytes through Render)
    let targetUrl = '';
    let fallbackUrl = '';
    if (attachment.id) {
      try {
        const signedRes = await api.get(
          `/attachments/${attachment.id}/signed-url/${mode === 'preview' ? '?preview=true' : ''}`
        );
        targetUrl = signedRes.data?.url || '';
        fallbackUrl = signedRes.data?.fallback_url || '';
      } catch {}
    }

    const candidates = [
      targetUrl,
      fallbackUrl ? getFullMediaUrl(fallbackUrl) : '',
      !attachment.id ? getFullMediaUrl(attachment.download_url || attachment.file_url) : '',
    ].filter(Boolean);

    let fetchedBlob: Blob | null = null;
    for (const candidate of candidates) {
      try {
        const isSameOriginApi = candidate.startsWith('/api/');
        if (isSameOriginApi) {
          const res = await api.get(candidate.replace(/^\/api/, ''), { responseType: 'blob' });
          fetchedBlob = new Blob([res.data], { type: mimeType });
        } else {
          const resp = await fetch(candidate);
          if (!resp.ok) continue;
          const rawBlob = await resp.blob();
          fetchedBlob = new Blob([rawBlob], { type: mimeType });
        }
        if (fetchedBlob && fetchedBlob.size > 0) break;
      } catch {
        fetchedBlob = null;
      }
    }

    if (!fetchedBlob || fetchedBlob.size === 0) {
      throw new Error('Could not fetch document from storage CDN.');
    }

    if ('caches' in window) {
      try {
        const cache = await window.caches.open(WEB_CACHE_NAME);
        await cache.put(
          cacheKey,
          new Response(fetchedBlob, {
            headers: { 'Content-Type': mimeType },
          })
        );
      } catch {}
    }
    if (attachment.id) {
      await markIdCached(String(attachment.id));
    }

    return {
      localUri: window.URL.createObjectURL(fetchedBlob),
      mimeType,
      fileName,
      fromCache: false,
    };
  }

  // 2. Native (Android / iOS): Check persistent FileSystem.documentDirectory cache first
  const localPath = getNativeCachePath(attachment);
  if (localPath && FileSystem?.getInfoAsync) {
    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info?.exists && (info.size || 0) > 0) {
        if (attachment.id) memoryCachedIds.add(String(attachment.id));
        return {
          localUri: localPath,
          mimeType,
          fileName,
          fromCache: true,
        };
      }
    } catch {}
  }

  // Ensure campus_docs folder exists
  if (FileSystem?.documentDirectory && FileSystem?.makeDirectoryAsync) {
    try {
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}campus_docs`, {
        intermediates: true,
      });
    } catch {}
  }

  let directUrl = '';
  let fallbackUrl = '';
  if (attachment.id) {
    try {
      const signedRes = await api.get(
        `/attachments/${attachment.id}/signed-url/${mode === 'preview' ? '?preview=true' : ''}`
      );
      directUrl = signedRes.data?.url || '';
      fallbackUrl = signedRes.data?.fallback_url || '';
    } catch {}
  }

  const token = await AsyncStorage.getItem('access_token');
  const candidates = [
    directUrl,
    fallbackUrl ? getFullMediaUrl(fallbackUrl) : '',
    !attachment.id ? getFullMediaUrl(attachment.download_url || attachment.file_url) : '',
  ].filter(Boolean);

  if (localPath && FileSystem?.downloadAsync) {
    for (const candidate of candidates) {
      try {
        const isDirectCdn = candidate.startsWith('http') && !candidate.includes('/api/attachments/');
        const dlRes = await FileSystem.downloadAsync(
          candidate,
          localPath,
          !isDirectCdn && token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
        );
        if (dlRes && dlRes.status >= 200 && dlRes.status < 300) {
          if (attachment.id) {
            await markIdCached(String(attachment.id));
          }
          return {
            localUri: dlRes.uri || localPath,
            mimeType,
            fileName,
            fromCache: false,
          };
        }
      } catch {}
    }
  }

  throw new Error('Could not download document to device storage.');
};
