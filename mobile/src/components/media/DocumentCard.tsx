import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FileText,
  FileSpreadsheet,
  FileArchive,
  File,
  Download,
  ExternalLink,
  Check,
} from 'lucide-react-native';
import { AttachmentItem } from '../../services/chatService';
import { useTheme } from '../../theme/ThemeContext';
import { getFullMediaUrl, api } from '../../config/api';

interface DocumentCardProps {
  attachment: AttachmentItem;
  compact?: boolean;
  onPress?: () => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  attachment,
  compact = false,
  onPress,
}) => {
  const { colors } = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const ext = (attachment.file_extension || '').toLowerCase();

  // Determine doc type styling & icons
  const getDocTypeConfig = () => {
    switch (ext) {
      case 'pdf':
        return {
          icon: FileText,
          bg: 'rgba(239, 68, 68, 0.15)',
          badgeColor: '#ef4444',
          label: 'PDF',
        };
      case 'doc':
      case 'docx':
        return {
          icon: FileText,
          bg: 'rgba(59, 130, 246, 0.15)',
          badgeColor: '#3b82f6',
          label: 'WORD',
        };
      case 'xls':
      case 'xlsx':
      case 'csv':
        return {
          icon: FileSpreadsheet,
          bg: 'rgba(16, 185, 129, 0.15)',
          badgeColor: '#10b981',
          label: ext.toUpperCase(),
        };
      case 'ppt':
      case 'pptx':
        return {
          icon: FileText,
          bg: 'rgba(249, 115, 22, 0.15)',
          badgeColor: '#f97316',
          label: 'PPT',
        };
      case 'zip':
      case 'rar':
      case '7z':
        return {
          icon: FileArchive,
          bg: 'rgba(234, 179, 8, 0.15)',
          badgeColor: '#eab308',
          label: 'ZIP',
        };
      default:
        return {
          icon: File,
          bg: 'rgba(148, 163, 184, 0.15)',
          badgeColor: '#94a3b8',
          label: ext.toUpperCase() || 'DOC',
        };
    }
  };

  const config = getDocTypeConfig();
  const IconComponent = config.icon;
  const rawTargetUrl = attachment.download_url || attachment.file_url;

  const handleOpenOrDownload = async (action: 'open' | 'download') => {
    if (onPress) {
      onPress();
      return;
    }

    if (!rawTargetUrl) return;

    let targetUrl = getFullMediaUrl(rawTargetUrl);

    try {
      if (action === 'download') {
        setDownloading(true);
      }

      // Attach auth token if available so authenticated endpoints succeed
      const token = await AsyncStorage.getItem('access_token');
      if (token && !targetUrl.includes('token=')) {
        const separator = targetUrl.includes('?') ? '&' : '?';
        targetUrl = `${targetUrl}${separator}token=${encodeURIComponent(token)}`;
      }

      if (action === 'open') {
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            const separator = targetUrl.includes('?') ? '&' : '?';
            const urlWithParam = ext === 'pdf' ? `${targetUrl}${separator}preview=true` : targetUrl;
            window.open(urlWithParam, '_blank');
          }
        } else {
          // Native mobile: open in system browser or registered PDF viewer
          try {
            await Linking.openURL(targetUrl);
          } catch (err) {
            console.warn('Could not launch external URL directly:', err);
          }
        }
        return;
      }

      // Download Action
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          // Attempt authenticated blob download first for true cross-origin file saving
          const response = await api.get(targetUrl, { responseType: 'blob' });
          const blob = new Blob([response.data], {
            type: attachment.mime_type || 'application/octet-stream',
          });
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = attachment.file_name || `document.${ext || 'pdf'}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);

          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 2500);
        } catch {
          // Fallback to standard anchor download trigger
          const link = document.createElement('a');
          link.href = targetUrl;
          link.download = attachment.file_name || `document.${ext || 'pdf'}`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 2500);
        }
      } else {
        // Mobile Native: Direct launch browser download / intent handler
        try {
          await Linking.openURL(targetUrl);
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 2500);
        } catch (err) {
          console.warn('Could not open download URL on device:', err);
        }
      }
    } catch (err) {
      console.warn('Error handling document action:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => handleOpenOrDownload(ext === 'pdf' ? 'open' : 'download')}
      style={[
        styles.container,
        compact && styles.containerCompact,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      {/* File Icon with colored background badge */}
      <View style={[styles.iconBox, { backgroundColor: config.bg }]}>
        <IconComponent size={compact ? 22 : 28} color={config.badgeColor} />
        <View style={[styles.badge, { backgroundColor: config.badgeColor }]}>
          <Text style={styles.badgeText}>{config.label}</Text>
        </View>
      </View>

      {/* File Meta Information */}
      <View style={styles.infoBox}>
        <Text
          style={[styles.fileName, { color: colors.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {attachment.file_name || `Document.${ext || 'pdf'}`}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.fileSize, { color: colors.textMuted }]}>
            {attachment.file_size_formatted || 'Document'}
          </Text>
          <Text style={[styles.dotSeparator, { color: colors.textTertiary }]}>•</Text>
          <Text style={[styles.extensionText, { color: colors.textMuted }]}>
            {ext ? `.${ext.toUpperCase()}` : 'Academic Doc'}
          </Text>
        </View>
      </View>

      {/* Action Buttons: Open & Download */}
      <View style={styles.actionsBox}>
        {ext === 'pdf' && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              handleOpenOrDownload('open');
            }}
            activeOpacity={0.7}
            accessibilityLabel="Preview PDF"
          >
            <ExternalLink size={15} color={colors.primary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.actionBtn,
            {
              backgroundColor: downloadSuccess
                ? colors.success
                : colors.primary,
              borderColor: downloadSuccess
                ? colors.success
                : colors.primary,
            },
          ]}
          onPress={(e) => {
            e.stopPropagation?.();
            handleOpenOrDownload('download');
          }}
          disabled={downloading}
          activeOpacity={0.7}
          accessibilityLabel="Download Document"
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : downloadSuccess ? (
            <Check size={15} color="#ffffff" />
          ) : (
            <Download size={15} color={colors.onPrimary} />
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginVertical: 4,
    maxWidth: '100%',
  },
  containerCompact: {
    padding: 6,
    marginVertical: 2,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: 10,
  },
  badge: {
    position: 'absolute',
    bottom: -3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  infoBox: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileSize: {
    fontSize: 11,
    fontWeight: '500',
  },
  dotSeparator: {
    fontSize: 11,
    marginHorizontal: 4,
  },
  extensionText: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
