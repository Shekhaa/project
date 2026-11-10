import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  AtSign,
  Building2,
  Crop,
  FileText,
  Globe,
  Image as ImageIcon,
  Lock,
  Search,
  Sparkles,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { postService } from '../../services/postService';
import { StagedAttachment } from '../media/AttachmentPickerModal';
import { ImageCropperModal } from '../media/ImageCropperModal';
import {
  MentionCandidate,
  MentionSuggestionsBar,
  applyMentionSelection,
  extractActiveMention,
} from '../common/MentionSuggestionsBar';
import {
  IMAGE_QUALITY_OPTIONS,
  IMAGE_QUALITY_PRESETS,
  ImageQualityPreset,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_MB,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MB,
  alertOversizedDocuments,
  clampAspectRatio,
  dataUrlToWebFile,
  formatFileSize,
  processWebImageForUpload,
  showCrossPlatformAlert,
  splitDocumentsBySizeLimit,
} from '../../utils/mediaUtils';

interface CommunityOption {
  id: number;
  name: string;
}

export type PostScope = 'GLOBAL' | 'COLLEGE' | 'FOLLOWERS' | 'COMMUNITY' | 'ONLY_ME';

interface PostComposerModalProps {
  visible: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  communities: CommunityOption[];
  defaultCommunityId?: number;
}

export const PostComposerModal: React.FC<PostComposerModalProps> = ({
  visible,
  onClose,
  onPostCreated,
  communities,
  defaultCommunityId,
}) => {
  const { colors } = useTheme();
  const [content, setContent] = useState('');
  const [cursorPos, setCursorPos] = useState<number>(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);

  const [postScope, setPostScope] = useState<PostScope>(
    defaultCommunityId ? 'COMMUNITY' : 'COLLEGE'
  );
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(
    defaultCommunityId ?? communities[0]?.id ?? null
  );
  const [communitySearchQuery, setCommunitySearchQuery] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Multi-attachment staging state
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [imageQuality, setImageQuality] = useState<ImageQualityPreset>('HIGH');
  const [processingImages, setProcessingImages] = useState(false);
  const [docSizeError, setDocSizeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [croppingImage, setCroppingImage] = useState<StagedAttachment | null>(null);

  // Hidden file input refs for Web
  const imageInputRef = useRef<any>(null);
  const videoInputRef = useRef<any>(null);
  const documentInputRef = useRef<any>(null);

  useEffect(() => {
    if (defaultCommunityId) {
      setSelectedCommunity(defaultCommunityId);
    } else if (selectedCommunity === null && communities.length > 0) {
      setSelectedCommunity(communities[0].id);
    }
  }, [defaultCommunityId, communities]);

  const activeMention = mentionDismissed ? null : extractActiveMention(content, cursorPos);

  const handleContentChange = (text: string) => {
    const delta = text.length - content.length;
    setContent(text);
    setCursorPos((prev) => Math.max(0, Math.min(text.length, prev + delta)));
    setMentionDismissed(false);
  };

  const handleSelectMention = (candidate: MentionCandidate & { username: string }) => {
    if (!activeMention) return;
    const { nextText, nextCursor } = applyMentionSelection(
      content,
      activeMention,
      candidate.username
    );
    setContent(nextText);
    setCursorPos(nextCursor);
    setMentionDismissed(false);
  };

  const handleInsertTagTrigger = () => {
    setMentionDismissed(false);
    const pos = Math.min(cursorPos, content.length);
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const prefix = before.length === 0 || /\s$/.test(before) ? '@' : ' @';
    const next = `${before}${prefix}${after}`;
    setContent(next);
    setCursorPos(before.length + prefix.length);
  };

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

  const resetForm = () => {
    setContent('');
    setCursorPos(0);
    setMentionDismissed(false);
    setStagedFiles([]);
    setImageQuality('HIGH');
    setDocSizeError(null);
    setIsAnonymous(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePickImage = async () => {
    if (Platform.OS === 'web') {
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
        imageInputRef.current.click();
      }
      return;
    }

    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showCrossPlatformAlert(
          'Permission Needed',
          'Please allow camera roll access to upload photos.'
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
      showCrossPlatformAlert('Upload Error', err.message || 'Could not pick images.');
    }
  };

  const handleImageFileChange = async (e: any) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setProcessingImages(true);
    try {
      const processedList = await Promise.all(
        files.map(async (file) => {
          const processed = await processWebImageForUpload(file, file.name, imageQuality);
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          return {
            id: Math.random().toString(36).substring(7),
            uri: processed.uri || URL.createObjectURL(file),
            name: file.name,
            size: processed.size || file.size,
            sizeFormatted: formatFileSize(processed.size || file.size),
            type: 'IMAGE' as const,
            extension: ext,
            file: processed.file || file,
            sourceFile: file,
            mimeType: processed.mimeType || file.type || 'image/jpeg',
            imageWidth: processed.width || undefined,
            imageHeight: processed.height || undefined,
          };
        })
      );
      setStagedFiles((prev) => [...prev, ...processedList]);
    } finally {
      setProcessingImages(false);
    }
  };

  const handlePickVideo = async () => {
    if (Platform.OS === 'web') {
      if (videoInputRef.current) {
        videoInputRef.current.value = '';
        videoInputRef.current.click();
      }
      return;
    }

    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showCrossPlatformAlert(
          'Permission Needed',
          'Please allow camera roll access to upload videos.'
        );
        return;
      }
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
              `"${fileName}" (${formatFileSize(size)}) exceeds the ${MAX_VIDEO_MB} MB limit.`
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
      showCrossPlatformAlert('Upload Error', err.message || 'Could not pick video.');
    }
  };

  const handleVideoFileChange = (e: any) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const accepted: StagedAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_VIDEO_BYTES) {
        showCrossPlatformAlert(
          `Video Exceeds ${MAX_VIDEO_MB} MB`,
          `"${file.name}" (${formatFileSize(file.size)}) exceeds the ${MAX_VIDEO_MB} MB limit.`
        );
        continue;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      accepted.push({
        id: Math.random().toString(36).substring(7),
        uri: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        sizeFormatted: formatFileSize(file.size),
        type: 'VIDEO',
        extension: ext,
        file,
        mimeType: file.type || 'video/mp4',
      });
    }
    if (accepted.length > 0) {
      setStagedFiles((prev) => [...prev, ...accepted]);
    }
  };

  const handlePickDocument = async () => {
    if (Platform.OS === 'web') {
      if (documentInputRef.current) {
        documentInputRef.current.value = '';
        documentInputRef.current.click();
      }
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
      showCrossPlatformAlert('Upload Error', err.message || 'Could not pick documents.');
    }
  };

  const handleDocumentFileChange = (e: any) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const candidates = files.map((file) => ({
      file,
      name: file.name,
      size: file.size,
    }));
    const { valid, oversized } = splitDocumentsBySizeLimit(candidates, MAX_DOCUMENT_BYTES);
    if (oversized.length > 0) {
      const msg = alertOversizedDocuments(oversized);
      setDocSizeError(msg);
    } else {
      setDocSizeError(null);
    }

    const newItems: StagedAttachment[] = valid.map(({ file }) => {
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
    if (newItems.length > 0) {
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async () => {
    if (!content.trim() && stagedFiles.length === 0) {
      showCrossPlatformAlert(
        'Empty Post',
        'Please write something or attach photos, videos, or documents.'
      );
      return;
    }

    // Strict 20 MB per-document validation before publishing
    const docItems = stagedFiles.filter((f) => f.type === 'DOCUMENT');
    const { oversized } = splitDocumentsBySizeLimit(docItems, MAX_DOCUMENT_BYTES);
    if (oversized.length > 0) {
      const msg = alertOversizedDocuments(oversized);
      setDocSizeError(msg);
      return;
    }

    try {
      setSubmitting(true);

      const hasImages = stagedFiles.some((f) => f.type === 'IMAGE');
      const hasVideos = stagedFiles.some((f) => f.type === 'VIDEO');
      const hasDocs = stagedFiles.some((f) => f.type === 'DOCUMENT');

      let determinedMediaType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' = 'TEXT';
      if (hasVideos && !hasImages) determinedMediaType = 'VIDEO';
      else if (hasImages) determinedMediaType = 'IMAGE';
      else if (hasDocs) determinedMediaType = 'DOCUMENT';

      const formData = new FormData();
      formData.append('visibility', postScope);
      if (!isAnonymous && postScope === 'COMMUNITY') {
        const targetCommunity = selectedCommunity || communities[0]?.id || 1;
        formData.append('community', String(targetCommunity));
      } else if (!isAnonymous && selectedCommunity) {
        formData.append('community', String(selectedCommunity));
      }
      formData.append('content', content.trim());
      formData.append('is_anonymous', String(isAnonymous));
      formData.append('media_type', determinedMediaType);

      let appendedFirstDoc = false;
      stagedFiles.forEach((item, index) => {
        let fileToAppend = item.file;
        if (
          !fileToAppend &&
          item.uri &&
          typeof window !== 'undefined' &&
          item.uri.startsWith('data:')
        ) {
          fileToAppend = dataUrlToWebFile(item.uri, item.name || `photo_${index}.jpg`);
        }

        if (fileToAppend) {
          formData.append('attachments', fileToAppend);
          if (item.type === 'DOCUMENT' && !appendedFirstDoc) {
            appendedFirstDoc = true;
            formData.append('document', fileToAppend);
            formData.append('document_name', item.name);
            formData.append('document_size', item.sizeFormatted);
          }
        } else if (item.uri) {
          const fallbackMime =
            item.mimeType ||
            (item.type === 'IMAGE'
              ? 'image/jpeg'
              : item.type === 'VIDEO'
              ? 'video/mp4'
              : 'application/octet-stream');
          formData.append('attachments', {
            uri: item.uri,
            name: item.name || `file_${index}`,
            type: fallbackMime,
          } as any);
        }
      });

      await postService.createPost(formData);
      handleClose();
      onPostCreated();
    } catch (err: any) {
      const serverMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        'Could not publish post. Please try again.';
      showCrossPlatformAlert('Post Failed', String(serverMsg));
    } finally {
      setSubmitting(false);
    }
  };

  const imageFiles = stagedFiles.filter((f) => f.type === 'IMAGE');
  const videoFiles = stagedFiles.filter((f) => f.type === 'VIDEO');
  const firstImage = imageFiles[0];
  const heroRatio = firstImage
    ? clampAspectRatio(firstImage.imageWidth, firstImage.imageHeight, 4 / 3)
    : 4 / 3;
  const cropPresetConfig = IMAGE_QUALITY_PRESETS[imageQuality];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Hidden inputs for Web */}
        {Platform.OS === 'web' && (
          <>
            <input
              type="file"
              ref={imageInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              multiple
              onChange={handleImageFileChange}
            />
            <input
              type="file"
              ref={videoInputRef}
              style={{ display: 'none' }}
              accept="video/*"
              multiple
              onChange={handleVideoFileChange}
            />
            <input
              type="file"
              ref={documentInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              multiple
              onChange={handleDocumentFileChange}
            />
          </>
        )}

        {/* Top Navigation Bar */}
        <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} disabled={submitting}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Create Post</Text>
          {(() => {
            const canPublish =
              (content.trim().length > 0 || stagedFiles.length > 0) &&
              !submitting &&
              !processingImages;
            return (
              <TouchableOpacity
                style={[
                  styles.postBtn,
                  {
                    backgroundColor: canPublish ? colors.primary : colors.surfaceLight,
                    borderColor: canPublish ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={handleSubmit}
                disabled={!canPublish}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.postBtnText}>Publishing...</Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.postBtnText,
                      { color: canPublish ? '#ffffff' : colors.textMuted },
                    ]}
                  >
                    Publish Post
                  </Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {/* Post Audience & Scope Selector */}
          <View
            style={[
              styles.scopeContainer,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.scopeHeaderLabel, { color: colors.textMuted }]}>
              Who can see this post?
            </Text>
            <View style={styles.scopePillRow}>
              <TouchableOpacity
                style={[
                  styles.scopePill,
                  {
                    backgroundColor:
                      postScope === 'GLOBAL' ? colors.primary + '1F' : colors.surfaceLight,
                    borderColor: postScope === 'GLOBAL' ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => setPostScope('GLOBAL')}
                activeOpacity={0.8}
              >
                <Globe
                  size={14}
                  color={postScope === 'GLOBAL' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.scopePillText,
                    { color: postScope === 'GLOBAL' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Global (All Campuses)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.scopePill,
                  {
                    backgroundColor:
                      postScope === 'COLLEGE' ? colors.primary + '1F' : colors.surfaceLight,
                    borderColor: postScope === 'COLLEGE' ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => setPostScope('COLLEGE')}
                activeOpacity={0.8}
              >
                <Building2
                  size={14}
                  color={postScope === 'COLLEGE' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.scopePillText,
                    { color: postScope === 'COLLEGE' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  My College Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.scopePill,
                  {
                    backgroundColor:
                      postScope === 'FOLLOWERS' ? colors.primary + '1F' : colors.surfaceLight,
                    borderColor: postScope === 'FOLLOWERS' ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => setPostScope('FOLLOWERS')}
                activeOpacity={0.8}
              >
                <UserCheck
                  size={14}
                  color={postScope === 'FOLLOWERS' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.scopePillText,
                    { color: postScope === 'FOLLOWERS' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Followers Only
                </Text>
              </TouchableOpacity>

              {!isAnonymous && (
                <TouchableOpacity
                  style={[
                    styles.scopePill,
                    {
                      backgroundColor:
                        postScope === 'COMMUNITY' ? colors.primary + '1F' : colors.surfaceLight,
                      borderColor:
                        postScope === 'COMMUNITY' ? colors.primary : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setPostScope('COMMUNITY')}
                  activeOpacity={0.8}
                >
                  <Users
                    size={14}
                    color={postScope === 'COMMUNITY' ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.scopePillText,
                      {
                        color:
                          postScope === 'COMMUNITY' ? colors.primary : colors.textSecondary,
                      },
                    ]}
                  >
                    Specific Community / Hub
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.scopePill,
                  {
                    backgroundColor:
                      postScope === 'ONLY_ME' ? colors.primary + '1F' : colors.surfaceLight,
                    borderColor: postScope === 'ONLY_ME' ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => setPostScope('ONLY_ME')}
                activeOpacity={0.8}
              >
                <Lock
                  size={14}
                  color={postScope === 'ONLY_ME' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.scopePillText,
                    { color: postScope === 'ONLY_ME' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Only Me
                </Text>
              </TouchableOpacity>
            </View>

            {/* Community Picker */}
            {!isAnonymous && postScope === 'COMMUNITY' && (
              <View style={[styles.commSearchContainer, { borderTopColor: colors.hairline }]}>
                <View
                  style={[
                    styles.commSearchBar,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                  ]}
                >
                  <Search size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.commSearchInput, { color: colors.textPrimary }]}
                    placeholder="Search community or club to post in..."
                    placeholderTextColor={colors.textMuted}
                    value={communitySearchQuery}
                    onChangeText={setCommunitySearchQuery}
                  />
                  {communitySearchQuery ? (
                    <TouchableOpacity onPress={() => setCommunitySearchQuery('')}>
                      <X size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.communityScroll}
                >
                  {communities
                    .filter(
                      (c) =>
                        !communitySearchQuery.trim() ||
                        c.name.toLowerCase().includes(communitySearchQuery.toLowerCase())
                    )
                    .map((c) => {
                      const isSelected = selectedCommunity === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.commPill,
                            {
                              backgroundColor: isSelected
                                ? colors.primary + '1F'
                                : colors.surface,
                              borderColor: isSelected ? colors.primary : colors.cardBorder,
                            },
                          ]}
                          onPress={() => setSelectedCommunity(c.id)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.commPillText,
                              { color: isSelected ? colors.primary : colors.textSecondary },
                            ]}
                          >
                            {isSelected ? '✓ ' : '🎓 '}
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Main Content Input with @ Mention Support */}
          <View style={styles.contentWrapper}>
            <TextInput
              style={[styles.contentInput, { color: colors.textPrimary }]}
              multiline
              placeholder="Share an update, notes, questions, or type @ to tag someone..."
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={handleContentChange}
              onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.end)}
              maxLength={3000}
            />
            <View style={styles.mentionHelperRow}>
              <TouchableOpacity
                style={[
                  styles.tagStudentBtn,
                  { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                ]}
                onPress={handleInsertTagTrigger}
                activeOpacity={0.75}
              >
                <AtSign size={14} color={colors.primary} />
                <Text style={[styles.tagStudentBtnText, { color: colors.textSecondary }]}>
                  Tag Student
                </Text>
              </TouchableOpacity>
              <Text style={[styles.charCounter, { color: colors.textTertiary }]}>
                {content.length}/3000
              </Text>
            </View>

            <MentionSuggestionsBar
              query={activeMention ? activeMention.query : null}
              onSelect={handleSelectMention}
              onClose={() => setMentionDismissed(true)}
            />
          </View>

          {/* 20 MB Document Alert Banner */}
          {docSizeError && (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: colors.danger + '18', borderColor: colors.danger },
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

          {/* Photo Preview + Crop & Image Quality (ONLY when images attached) */}
          {firstImage && (
            <View
              style={[
                styles.mediaStudio,
                { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.studioHeader}>
                <View
                  style={[
                    styles.hdBadge,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                  ]}
                >
                  <Sparkles size={13} color={colors.primary} />
                  <Text style={[styles.hdBadgeText, { color: colors.textSecondary }]}>
                    {imageFiles.length} Photo{imageFiles.length > 1 ? 's' : ''}
                    {firstImage.imageWidth && firstImage.imageHeight
                      ? ` • ${firstImage.imageWidth}×${firstImage.imageHeight}`
                      : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.openCropperBtn,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.primary },
                  ]}
                  onPress={() => setCroppingImage(firstImage)}
                  activeOpacity={0.8}
                >
                  <Crop size={13} color={colors.primary} />
                  <Text style={[styles.openCropperBtnText, { color: colors.primary }]}>
                    Crop & Adjust
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Image Quality Presets (Strictly for images — never shown for documents) */}
              <View
                style={[
                  styles.qualityBar,
                  { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.qualityTopRow}>
                  <Text style={[styles.qualityTitle, { color: colors.textSecondary }]}>
                    Image Quality
                  </Text>
                  <Text style={[styles.qualitySub, { color: colors.textMuted }]}>
                    {IMAGE_QUALITY_PRESETS[imageQuality].description}
                  </Text>
                </View>
                <View style={styles.qualityRow}>
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

              {/* Proportional Image Preview (up to 9:16 vertical or 16:9 horizontal) */}
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => setCroppingImage(firstImage)}
                style={[
                  styles.imagePreviewContainer,
                  {
                    aspectRatio: heroRatio,
                    maxHeight: 420,
                    backgroundColor: colors.surfaceLight,
                    borderColor: colors.hairline,
                  },
                ]}
              >
                <Image
                  source={{ uri: firstImage.uri }}
                  style={styles.imagePreview}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Video Preview (if video staged on Web) */}
          {videoFiles.length > 0 && Platform.OS === 'web' && (
            <View
              style={[
                styles.videoPreviewBox,
                { backgroundColor: '#000000', borderColor: colors.cardBorder },
              ]}
            >
              <video
                src={videoFiles[0].uri}
                controls
                playsInline
                style={{
                  width: '100%',
                  maxHeight: 340,
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: 10,
                }}
              />
            </View>
          )}

          {/* Staged Attachments Strip */}
          {stagedFiles.length > 0 && (
            <View style={styles.stagedSection}>
              <Text style={[styles.stagedTitle, { color: colors.textSecondary }]}>
                Attached Files ({stagedFiles.length}):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stagedScroll}
              >
                {stagedFiles.map((file) => (
                  <View
                    key={file.id}
                    style={[
                      styles.stagedCard,
                      { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                    ]}
                  >
                    {file.type === 'IMAGE' ? (
                      <View style={{ position: 'relative' }}>
                        <TouchableOpacity onPress={() => setCroppingImage(file)}>
                          <Image source={{ uri: file.uri }} style={styles.stagedThumb} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.stagedCropBadge,
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
                          styles.stagedDocThumb,
                          { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
                        ]}
                      >
                        <Video size={22} color={colors.danger} />
                        <Text style={[styles.stagedDocExt, { color: colors.danger }]}>VIDEO</Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.stagedDocThumb,
                          { backgroundColor: colors.primary + '14' },
                        ]}
                      >
                        <FileText size={22} color={colors.primary} />
                        <Text style={[styles.stagedDocExt, { color: colors.primary }]}>
                          {file.extension.toUpperCase() || 'DOC'}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.stagedRemoveBtn, { backgroundColor: colors.danger }]}
                      onPress={() => handleRemoveAttachment(file.id)}
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

          {/* Attachment Toolbar (Photos, Video, Documents) */}
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={[
                styles.toolBtn,
                { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              ]}
              onPress={handlePickImage}
              disabled={processingImages}
            >
              <View style={[styles.toolIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <ImageIcon size={17} color="#3b82f6" />
              </View>
              <Text style={[styles.toolBtnText, { color: colors.textPrimary }]}>Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toolBtn,
                { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              ]}
              onPress={handlePickVideo}
            >
              <View style={[styles.toolIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Video size={17} color={colors.danger} />
              </View>
              <Text style={[styles.toolBtnText, { color: colors.textPrimary }]}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toolBtn,
                { backgroundColor: colors.surface, borderColor: colors.cardBorder },
              ]}
              onPress={handlePickDocument}
            >
              <View style={[styles.toolIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <FileText size={17} color={colors.success} />
              </View>
              <Text style={[styles.toolBtnText, { color: colors.textPrimary }]}>Doc</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.docHintNote, { color: colors.textMuted }]}>
            Documents upload in original quality • Max {MAX_DOCUMENT_MB} MB per document
          </Text>

          {/* Zero-Leak Anonymity Toggle */}
          <View
            style={[
              styles.anonCard,
              { backgroundColor: colors.anonBadge, borderColor: colors.anonPurple + '44' },
            ]}
          >
            <View style={styles.anonInfo}>
              <Text style={[styles.anonTitle, { color: colors.anonPurple }]}>
                🎭 Post Anonymously
              </Text>
              <Text style={[styles.anonSubtitle, { color: colors.textSecondary }]}>
                Your real name and admission details will be completely hidden. A random mascot will
                be assigned.
              </Text>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={(val) => {
                setIsAnonymous(val);
                if (val) {
                  setSelectedCommunity(null);
                  if (postScope === 'COMMUNITY') {
                    setPostScope('COLLEGE');
                  }
                }
              }}
              trackColor={{ false: colors.cardBorder, true: colors.anonPurple }}
              thumbColor="#ffffff"
            />
          </View>
        </ScrollView>
      </View>

      {/* Instagram/X Style Crop & Rotate Modal */}
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
  modalContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  postBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    padding: 16,
  },
  scopeContainer: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  scopeHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  scopePillRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  scopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 6,
  },
  scopePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  commSearchContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  commSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  commSearchInput: {
    flex: 1,
    fontSize: 12.5,
  },
  communityScroll: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  commPill: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  commPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  contentWrapper: {
    marginBottom: 12,
  },
  contentInput: {
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 8,
    lineHeight: 22,
  },
  mentionHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tagStudentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  tagStudentBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  charCounter: {
    fontSize: 11,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  mediaStudio: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  studioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  hdBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  openCropperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  openCropperBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  qualityBar: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  qualityTopRow: {
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
  qualitySub: {
    fontSize: 11,
  },
  qualityRow: {
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
  imagePreviewContainer: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  videoPreviewBox: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  stagedSection: {
    marginBottom: 16,
  },
  stagedTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  stagedScroll: {
    flexDirection: 'row',
  },
  stagedCard: {
    width: 86,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    marginRight: 10,
    position: 'relative',
  },
  stagedThumb: {
    width: 74,
    height: 60,
    borderRadius: 6,
  },
  stagedDocThumb: {
    width: 74,
    height: 60,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedDocExt: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  stagedRemoveBtn: {
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
  stagedCropBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
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
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  toolIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  docHintNote: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 16,
  },
  anonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 28,
  },
  anonInfo: {
    flex: 1,
    marginRight: 10,
  },
  anonTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  anonSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
});
