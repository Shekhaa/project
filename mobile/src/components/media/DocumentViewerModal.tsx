import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
} from 'react-native';
import { X, Download, ExternalLink, FileText, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

interface DocumentViewerModalProps {
  visible: boolean;
  localUri: string | null;
  fileName: string;
  fileSize?: string;
  mimeType?: string;
  fileExtension?: string;
  fromCache?: boolean;
  onClose: () => void;
  onSaveOrShare: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  visible,
  localUri,
  fileName,
  fileSize,
  mimeType,
  fileExtension,
  fromCache,
  onClose,
  onSaveOrShare,
}) => {
  const { colors } = useTheme();
  const ext = (fileExtension || '').toLowerCase();
  const isWebPreviewable =
    ext === 'pdf' ||
    ext === 'txt' ||
    ext === 'csv' ||
    (mimeType || '').includes('pdf') ||
    (mimeType || '').startsWith('text/') ||
    (mimeType || '').startsWith('image/');

  if (!visible || !localUri) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceLight }]}
            accessibilityLabel="Close viewer"
          >
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.titleCol}>
            <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
              {fileName}
            </Text>
            <View style={styles.subRow}>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {fileSize || (ext ? `.${ext.toUpperCase()}` : 'Document')}
              </Text>
              {fromCache && (
                <View style={styles.cachedPill}>
                  <CheckCircle2 size={11} color="#10b981" />
                  <Text style={styles.cachedText}>Saved Offline</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={onSaveOrShare}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            {Platform.OS === 'web' ? (
              <Download size={15} color={colors.onPrimary} />
            ) : (
              <ExternalLink size={15} color={colors.onPrimary} />
            )}
            <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
              {Platform.OS === 'web' ? 'Save' : 'Open With'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Viewer Body */}
        <View style={styles.body}>
          {Platform.OS === 'web' && isWebPreviewable ? (
            <View style={styles.webFrameWrap}>
              {React.createElement('iframe', {
                src: localUri,
                title: fileName,
                style: {
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  backgroundColor: '#ffffff',
                },
              })}
            </View>
          ) : (
            <View style={styles.fallbackCardWrap}>
              <View
                style={[
                  styles.fallbackCard,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={[styles.docIconCircle, { backgroundColor: colors.surfaceLight }]}>
                  <FileText size={38} color={colors.primary} />
                </View>
                <Text style={[styles.fallbackTitle, { color: colors.textPrimary }]}>
                  {fileName}
                </Text>
                <Text style={[styles.fallbackSub, { color: colors.textSecondary }]}>
                  {Platform.OS === 'web'
                    ? 'This file format is cached locally on your browser. Tap below to save it to your device.'
                    : 'Saved in app storage (WhatsApp-style). Tap below to open with Google Drive, Adobe PDF, or save to your phone.'}
                </Text>
                <TouchableOpacity
                  onPress={onSaveOrShare}
                  style={[styles.primaryCta, { backgroundColor: colors.primary }]}
                  activeOpacity={0.85}
                >
                  {Platform.OS === 'web' ? (
                    <Download size={17} color={colors.onPrimary} />
                  ) : (
                    <ExternalLink size={17} color={colors.onPrimary} />
                  )}
                  <Text style={[styles.primaryCtaText, { color: colors.onPrimary }]}>
                    {Platform.OS === 'web' ? 'Download File' : 'Open with PDF / Document App'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  metaText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  cachedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  cachedText: {
    color: '#10b981',
    fontSize: 10.5,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  webFrameWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  fallbackCardWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  docIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  fallbackSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  primaryCta: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryCtaText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});
