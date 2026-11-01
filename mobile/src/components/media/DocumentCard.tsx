import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import {
  FileText,
  FileSpreadsheet,
  FileArchive,
  File,
  Download,
  ExternalLink,
} from 'lucide-react-native';
import { AttachmentItem } from '../../services/chatService';

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
  const targetUrl = attachment.download_url || attachment.file_url;

  const handleOpenOrDownload = async (action: 'open' | 'download') => {
    if (onPress) {
      onPress();
      return;
    }

    if (!targetUrl) return;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const urlWithParam = action === 'open' && ext === 'pdf'
          ? `${targetUrl}?preview=true`
          : targetUrl;
        window.open(urlWithParam, '_blank');
      }
    } else {
      try {
        const supported = await Linking.canOpenURL(targetUrl);
        if (supported) {
          await Linking.openURL(targetUrl);
        }
      } catch (err) {
        console.warn('Cannot open document url:', err);
      }
    }
  };

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* File Icon with colored background badge */}
      <View style={[styles.iconBox, { backgroundColor: config.bg }]}>
        <IconComponent size={compact ? 22 : 28} color={config.badgeColor} />
        <View style={[styles.badge, { backgroundColor: config.badgeColor }]}>
          <Text style={styles.badgeText}>{config.label}</Text>
        </View>
      </View>

      {/* File Meta Information */}
      <View style={styles.infoBox}>
        <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
          {attachment.file_name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.fileSize}>
            {attachment.file_size_formatted || 'Document'}
          </Text>
          <Text style={styles.dotSeparator}>•</Text>
          <Text style={styles.extensionText}>
            {ext ? `.${ext}` : 'Academic Doc'}
          </Text>
        </View>
      </View>

      {/* Action Buttons: Open & Download */}
      <View style={styles.actionsBox}>
        {ext === 'pdf' && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleOpenOrDownload('open')}
            activeOpacity={0.7}
            accessibilityLabel="Preview PDF"
          >
            <ExternalLink size={16} color="#38bdf8" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, styles.downloadBtn]}
          onPress={() => handleOpenOrDownload('download')}
          activeOpacity={0.7}
          accessibilityLabel="Download Document"
        >
          <Download size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    marginVertical: 4,
    maxWidth: '100%',
  },
  containerCompact: {
    padding: 6,
    marginVertical: 2,
  },
  iconBox: {
    width: 48,
    height: 48,
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
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileSize: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
  },
  dotSeparator: {
    color: '#64748b',
    fontSize: 11,
    marginHorizontal: 4,
  },
  extensionText: {
    color: '#64748b',
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
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  downloadBtn: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
});
