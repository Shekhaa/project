import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Crop,
  FileText,
  Image as ImageIcon,
  Mic,
  Music,
  Send,
  Video,
  X,
} from 'lucide-react-native';
import { ImageCropperModal } from './ImageCropperModal';
import { useTheme } from '../../theme/ThemeContext';
import {
  IMAGE_QUALITY_OPTIONS,
  IMAGE_QUALITY_PRESETS,
  ImageQualityPreset,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_MB,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MB,
  alertOversizedDocuments,
  dataUrlToWebFile,
  formatFileSize,
  processWebImageForUpload,
  showCrossPlatformAlert,
  splitDocumentsBySizeLimit,
} from '../../utils/mediaUtils';

export { dataUrlToWebFile as dataURLtoFile } from '../../utils/mediaUtils';

export interface StagedAttachment {
  id: string;
  uri: string;
  name: string;
  size: number;
  sizeFormatted: string;
  type: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
  extension: string;
  file?: any; // Native File on Web
  caption?: string;
  mimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  sourceUri?: string;
  sourceFile?: any;
}

interface AttachmentPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (attachments: StagedAttachment[], messageText: string) => Promise<void>;
}

export const AttachmentPickerModal: React.FC<AttachmentPickerModalProps> = ({
  visible,
  onClose,
  onSend,
}) => {
  const { colors } = useTheme();
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [messageText, setMessageText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processingImages, setProcessingImages] = useState(false);
  const [imageQuality, setImageQuality] = useState<ImageQualityPreset>('HIGH');
  const [docSizeError, setDocSizeError] = useState<string | null>(null);
  const [croppingImage, setCroppingImage] = useState<StagedAttachment | null>(null);

  const hasStagedImages = stagedFiles.some((f) => f.type === 'IMAGE');

  const handleCropComplete = (croppedUri: string, cropW?: number, cropH?: number) => {
    if (!croppingImage) return;
    const newFile = croppedUri.startsWith('data:')
      ? dataUrlToWebFile(croppedUri, croppingImage.name || 'cropped.jpg') || croppingImage.file
      : croppingImage.file;
    const newSize = newFile?.size || croppingImage.size;

    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === croppingImage.id
          ? {
              ...item,
              uri: croppedUri,
              file: newFile,
              sourceUri: croppedUri,
              sourceFile: newFile,
              size: newSize,
              sizeFormatted: formatFileSize(newSize),
              imageWidth: cropW || item.imageWidth,
              imageHeight: cropH || item.imageHeight,
            }
          : item
      )
    );
    setCroppingImage(null);
  };

  const handleQualityPresetChange = async (preset: ImageQualityPreset) => {
    setImageQuality(preset);
    if (Platform.OS !== 'web') return;

    const currentImages = stagedFiles.filter((f) => f.type === 'IMAGE');
    if (currentImages.length === 0) return;

    setProcessingImages(true);
    try {
      const updatedMap = new Map<string, Partial<StagedAttachment>>();
      for (const item of currentImages) {
        const src = item.sourceFile || item.sourceUri || item.uri;
        if (!src) continue;
        const processed = await processWebImageForUpload(src, item.name, preset);
        updatedMap.set(item.id, {
          uri: processed.uri || item.uri,
          file: processed.file || item.file,
          size: processed.size || item.size,
          sizeFormatted: formatFileSize(processed.size || item.size),
          imageWidth: processed.width || item.imageWidth,
          imageHeight: processed.height || item.imageHeight,
          mimeType: processed.mimeType || item.mimeType,
        });
      }
      setStagedFiles((prev) =>
        prev.map((item) =>
          updatedMap.has(item.id) ? { ...item, ...updatedMap.get(item.id)! } : item
        )
      );
    } finally {
      setProcessingImages(false);
    }
  };

  const handlePickWeb = (accept: string, isDoc: boolean) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      if (files.length === 0) return;

      if (isDoc) {
        const candidates = files.map((file) => ({ file, name: file.name, size: file.size }));
        const { valid, oversized } = splitDocumentsBySizeLimit(candidates, MAX_DOCUMENT_BYTES);
        if (oversized.length > 0) {
          const msg = alertOversizedDocuments(oversized);
          setDocSizeError(msg);
        } else {
          setDocSizeError(null);
        }
        const newDocs: StagedAttachment[] = valid.map(({ file }) => {
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          return {
            id: Math.random().toString(36).substring(7),
            uri: URL.createObjectURL(file),
            name: file.name,
            size: file.size,
            sizeFormatted: formatFileSize(file.size),
            type: 'DOCUMENT',
            extension: ext,
            file,
            mimeType: file.type || 'application/octet-stream',
          };
        });
        if (newDocs.length > 0) {
          setStagedFiles((prev) => [...prev, ...newDocs]);
        }
        return;
      }

      setProcessingImages(true);
      const newItems: StagedAttachment[] = [];
      try {
        for (const file of files) {
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const isAud =
            file.type.startsWith('audio/') ||
            ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus'].includes(ext) ||
            (ext === 'webm' && !file.type.startsWith('video/'));
          const isVid =
            !isAud &&
            (file.type.startsWith('video/') ||
              ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext));
          const isImage =
            !isVid && !isAud && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);

          if (isVid) {
            if (file.size > MAX_VIDEO_BYTES) {
              showCrossPlatformAlert(
                `Video Exceeds ${MAX_VIDEO_MB} MB`,
                `"${file.name}" (${formatFileSize(file.size)}) is larger than ${MAX_VIDEO_MB} MB.`
              );
              continue;
            }
            newItems.push({
              id: Math.random().toString(36).substring(7),
              uri: URL.createObjectURL(file),
              name: file.name,
              size: file.size,
              sizeFormatted: formatFileSize(file.size),
              type: 'VIDEO',
              extension: ext || 'mp4',
              file,
              mimeType: file.type || 'video/mp4',
            });
          } else if (isImage) {
            const processed = await processWebImageForUpload(file, file.name, imageQuality);
            newItems.push({
              id: Math.random().toString(36).substring(7),
              uri: processed.uri || URL.createObjectURL(file),
              name: file.name,
              size: processed.size || file.size,
              sizeFormatted: formatFileSize(processed.size || file.size),
              type: 'IMAGE',
              extension: ext || 'jpg',
              file: processed.file || file,
              sourceFile: file,
              mimeType: processed.mimeType || file.type || 'image/jpeg',
              imageWidth: processed.width || undefined,
              imageHeight: processed.height || undefined,
            });
          } else {
            // Audio or misc file
            if (!isAud && file.size > MAX_DOCUMENT_BYTES) {
              const msg = alertOversizedDocuments([{ name: file.name, size: file.size }]);
              setDocSizeError(msg);
              continue;
            }
            newItems.push({
              id: Math.random().toString(36).substring(7),
              uri: URL.createObjectURL(file),
              name: file.name,
              size: file.size,
              sizeFormatted: formatFileSize(file.size),
              type: isAud ? 'AUDIO' : 'DOCUMENT',
              extension: ext,
              file,
              mimeType: file.type,
            });
          }
        }
        if (newItems.length > 0) {
          setStagedFiles((prev) => [...prev, ...newItems]);
        }
      } finally {
        setProcessingImages(false);
      }
    };
    input.click();
  };

  const handlePickVideos = async () => {
    if (Platform.OS === 'web') {
      handlePickWeb('video/*', false);
      return;
    }
    try {
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (!result.canceled && result.assets) {
        const newItems: StagedAttachment[] = [];
        for (const asset of result.assets) {
          const size = asset.fileSize || 0;
          const fileName = asset.fileName || `video_${Date.now()}.mp4`;
          if (size > MAX_VIDEO_BYTES) {
            showCrossPlatformAlert(
              `Video Exceeds ${MAX_VIDEO_MB} MB`,
              `"${fileName}" (${formatFileSize(size)}) is larger than ${MAX_VIDEO_MB} MB.`
            );
            continue;
          }
          const ext = fileName.split('.').pop()?.toLowerCase() || 'mp4';
          newItems.push({
            id: Math.random().toString(36).substring(7),
            uri: asset.uri,
            name: fileName,
            size,
            sizeFormatted: formatFileSize(size),
            type: 'VIDEO',
            extension: ext,
            mimeType: 'video/mp4',
          });
        }
        if (newItems.length > 0) {
          setStagedFiles((prev) => [...prev, ...newItems]);
        }
      }
    } catch (err: any) {
      showCrossPlatformAlert('Error', err.message || 'Could not pick video.');
    }
  };

  const handlePickPhotos = async () => {
    if (Platform.OS === 'web') {
      handlePickWeb('image/jpeg,image/png,image/webp,image/gif', false);
      return;
    }

    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showCrossPlatformAlert(
          'Permission Denied',
          'Camera roll permission is required to select photos.'
        );
        return;
      }
      const preset = IMAGE_QUALITY_PRESETS[imageQuality];
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: preset.jpegQuality,
      });

      if (!result.canceled && result.assets) {
        const newItems: StagedAttachment[] = result.assets.map((asset: any) => {
          const fileName = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
          const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
          return {
            id: Math.random().toString(36).substring(7),
            uri: asset.uri,
            sourceUri: asset.uri,
            name: fileName,
            size: asset.fileSize || 0,
            sizeFormatted: formatFileSize(asset.fileSize || 0),
            type: 'IMAGE',
            extension: ext,
            imageWidth: asset.width,
            imageHeight: asset.height,
          };
        });
        setStagedFiles((prev) => [...prev, ...newItems]);
      }
    } catch (err: any) {
      showCrossPlatformAlert('Error', err.message || 'Could not pick photos.');
    }
  };

  const handlePickDocuments = async () => {
    if (Platform.OS === 'web') {
      handlePickWeb('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip', true);
      return;
    }

    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        const mapped: Array<{ asset: any; name: string; size: number }> = result.assets.map((asset: any) => ({
          asset,
          name: asset.name || 'document',
          size: asset.size || 0,
        }));
        const { valid, oversized } = splitDocumentsBySizeLimit(mapped, MAX_DOCUMENT_BYTES);
        if (oversized.length > 0) {
          const msg = alertOversizedDocuments(oversized);
          setDocSizeError(msg);
        } else {
          setDocSizeError(null);
        }

        const newItems: StagedAttachment[] = valid.map(({ asset, name, size }) => {
          const ext = name.split('.').pop()?.toLowerCase() || '';
          return {
            id: Math.random().toString(36).substring(7),
            uri: asset.uri,
            name,
            size,
            sizeFormatted: formatFileSize(size),
            type: 'DOCUMENT',
            extension: ext,
            mimeType: asset.mimeType,
          };
        });
        if (newItems.length > 0) {
          setStagedFiles((prev) => [...prev, ...newItems]);
        }
      }
    } catch (err: any) {
      showCrossPlatformAlert('Error', err.message || 'Could not pick documents.');
    }
  };

  const handlePickAudio = async () => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.opus';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files: File[] = Array.from(e.target.files || []);
        const newItems: StagedAttachment[] = files.map((file) => {
          const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
          return {
            id: Math.random().toString(36).substring(7),
            uri: URL.createObjectURL(file),
            name: file.name,
            size: file.size,
            sizeFormatted: formatFileSize(file.size),
            type: 'AUDIO',
            extension: ext,
            file,
            mimeType: file.type || undefined,
          };
        });
        setStagedFiles((prev) => [...prev, ...newItems]);
      };
      input.click();
      return;
    }

    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        const newItems: StagedAttachment[] = result.assets.map((asset: any) => {
          const fileName = asset.name || 'voice_note.m4a';
          const ext = fileName.split('.').pop()?.toLowerCase() || 'm4a';
          return {
            id: Math.random().toString(36).substring(7),
            uri: asset.uri,
            name: fileName,
            size: asset.size || 0,
            sizeFormatted: formatFileSize(asset.size || 0),
            type: 'AUDIO',
            extension: ext,
          };
        });
        setStagedFiles((prev) => [...prev, ...newItems]);
      }
    } catch (err: any) {
      showCrossPlatformAlert('Error', err.message || 'Could not pick audio file.');
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSend = async () => {
    if (stagedFiles.length === 0 && !messageText.trim()) return;

    // Defense-in-depth 20 MB document validation before dispatching
    const docs = stagedFiles.filter((f) => f.type === 'DOCUMENT');
    const { oversized } = splitDocumentsBySizeLimit(docs, MAX_DOCUMENT_BYTES);
    if (oversized.length > 0) {
      const msg = alertOversizedDocuments(oversized);
      setDocSizeError(msg);
      return;
    }

    const filesToSend = [...stagedFiles];
    const textToSend = messageText.trim();
    setStagedFiles([]);
    setMessageText('');
    setDocSizeError(null);
    onClose();
    try {
      await onSend(filesToSend, textToSend);
    } catch (err: any) {
      console.warn('Background upload failed', err);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setStagedFiles([]);
    setMessageText('');
    setDocSizeError(null);
    onClose();
  };

  const cropPresetConfig = IMAGE_QUALITY_PRESETS[imageQuality];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.cardBorder },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Share Media & Documents
            </Text>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceLight }]}
              onPress={handleClose}
              disabled={uploading}
            >
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Picker Action Icons */}
          <View style={[styles.actionRow, { borderBottomColor: colors.hairline }]}>
            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePickPhotos}
              disabled={uploading || processingImages}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#3b82f6' }]}>
                <ImageIcon size={22} color="#ffffff" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePickVideos}
              disabled={uploading}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#ef4444' }]}>
                <Video size={22} color="#ffffff" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Videos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePickDocuments}
              disabled={uploading}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#10b981' }]}>
                <FileText size={22} color="#ffffff" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Document</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePickAudio}
              disabled={uploading}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#8b5cf6' }]}>
                <Mic size={22} color="#ffffff" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Audio Note</Text>
            </TouchableOpacity>
          </View>

          {/* Helper note on Document limit */}
          <Text style={[styles.docLimitHint, { color: colors.textMuted }]}>
            Documents: Original quality preserved • Max {MAX_DOCUMENT_MB} MB per file
          </Text>

          {/* 20 MB Oversized Document Warning Banner */}
          {docSizeError && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: colors.danger + '18',
                  borderColor: colors.danger,
                },
              ]}
            >
              <AlertCircle size={16} color={colors.danger} style={{ marginTop: 1 }} />
              <Text style={[styles.errorBannerText, { color: colors.danger }]}>
                {docSizeError}
              </Text>
              <TouchableOpacity onPress={() => setDocSizeError(null)}>
                <X size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}

          {/* Image Quality Control (shown ONLY when images are staged; NEVER for documents) */}
          {hasStagedImages && (
            <View
              style={[
                styles.qualityBar,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.qualityHeader}>
                <Text style={[styles.qualityTitle, { color: colors.textSecondary }]}>
                  Image Quality
                </Text>
                <Text style={[styles.qualityHint, { color: colors.textMuted }]}>
                  {IMAGE_QUALITY_PRESETS[imageQuality].description}
                </Text>
              </View>
              <View style={styles.qualityPillsRow}>
                {IMAGE_QUALITY_OPTIONS.map((opt) => {
                  const active = imageQuality === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.qualityPill,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.cardBorder,
                        },
                      ]}
                      onPress={() => handleQualityPresetChange(opt.key)}
                      disabled={processingImages}
                    >
                      <Text
                        style={[
                          styles.qualityPillText,
                          { color: active ? '#ffffff' : colors.textSecondary },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {processingImages && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
            </View>
          )}

          {/* Selected Files Preview List */}
          {stagedFiles.length > 0 && (
            <View style={styles.stagedSection}>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                Ready to send ({stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stagedList}
                contentContainerStyle={{ paddingHorizontal: 4, gap: 10 }}
              >
                {stagedFiles.map((file) => (
                  <View
                    key={file.id}
                    style={[
                      styles.stagedCard,
                      { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                    ]}
                  >
                    {file.type === 'IMAGE' ? (
                      <View style={{ position: 'relative' }}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setCroppingImage(file)}
                        >
                          <Image
                            source={{ uri: file.uri }}
                            style={[styles.stagedThumb, { backgroundColor: colors.card }]}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.cropBtnBadge,
                            { backgroundColor: colors.primary, borderColor: '#ffffff' },
                          ]}
                          onPress={() => setCroppingImage(file)}
                          activeOpacity={0.8}
                          accessibilityLabel="Crop photo"
                        >
                          <Crop size={11} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    ) : file.type === 'VIDEO' ? (
                      <View
                        style={[
                          styles.docPlaceholder,
                          {
                            backgroundColor: 'rgba(239, 68, 68, 0.14)',
                            borderColor: 'rgba(239, 68, 68, 0.35)',
                          },
                        ]}
                      >
                        <Video size={22} color={colors.danger} />
                        <Text style={[styles.docExtBadge, { color: colors.danger }]}>VIDEO</Text>
                      </View>
                    ) : file.type === 'AUDIO' ? (
                      <View
                        style={[
                          styles.docPlaceholder,
                          {
                            backgroundColor: 'rgba(139, 92, 246, 0.14)',
                            borderColor: 'rgba(139, 92, 246, 0.35)',
                          },
                        ]}
                      >
                        <Music size={22} color={colors.anonPurple} />
                        <Text style={[styles.docExtBadge, { color: colors.anonPurple }]}>
                          AUDIO
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.docPlaceholder,
                          {
                            backgroundColor: colors.primary + '1A',
                            borderColor: colors.primary + '44',
                          },
                        ]}
                      >
                        <FileText size={22} color={colors.primary} />
                        <Text style={[styles.docExtBadge, { color: colors.primary }]}>
                          {file.extension.toUpperCase() || 'FILE'}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.removeBtn, { backgroundColor: colors.danger }]}
                      onPress={() => handleRemoveAttachment(file.id)}
                      disabled={uploading}
                    >
                      <X size={12} color="#ffffff" />
                    </TouchableOpacity>
                    <Text
                      style={[styles.stagedName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {file.name}
                    </Text>
                    <Text style={[styles.stagedSize, { color: colors.textMuted }]}>
                      {file.sizeFormatted}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Caption / Message Input Box */}
          <View
            style={[
              styles.inputContainer,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Add a caption or message..."
              placeholderTextColor={colors.textMuted}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={1000}
              editable={!uploading}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    stagedFiles.length === 0 && !messageText.trim()
                      ? colors.textTertiary
                      : colors.primary,
                },
              ]}
              onPress={handleSend}
              disabled={uploading || (stagedFiles.length === 0 && !messageText.trim())}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Send size={18} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Interactive Crop & Rotate Modal */}
      {croppingImage && (
        <ImageCropperModal
          visible={!!croppingImage}
          imageUri={croppingImage.sourceUri || croppingImage.uri}
          onClose={() => setCroppingImage(null)}
          onCropComplete={handleCropComplete}
          maxDimension={cropPresetConfig.maxDimension}
          jpegQuality={cropPresetConfig.jpegQuality}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  actionPill: {
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  docLimitHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  qualityBar: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  qualityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  qualityTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  qualityHint: {
    fontSize: 11,
  },
  qualityPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualityPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  qualityPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stagedSection: {
    marginTop: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  stagedList: {
    maxHeight: 125,
  },
  stagedCard: {
    width: 88,
    alignItems: 'center',
    position: 'relative',
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
  },
  stagedThumb: {
    width: 74,
    height: 60,
    borderRadius: 6,
  },
  docPlaceholder: {
    width: 74,
    height: 60,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docExtBadge: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  cropBtnBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  stagedName: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
  },
  stagedSize: {
    fontSize: 9,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 14,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
