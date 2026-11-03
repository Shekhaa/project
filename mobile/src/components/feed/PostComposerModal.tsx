import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Switch,
} from 'react-native';
import { colors } from '../../theme/colors';
import { postService } from '../../services/postService';
import { StagedAttachment } from '../media/AttachmentPickerModal';
import { ImageCropperModal, smartAutoCropImage } from '../media/ImageCropperModal';
import {
  X,
  Image as ImageIcon,
  FileText,
  Crop,
  Sparkles,
  Check,
  Trash2,
  Plus,
  Zap,
  Globe,
  Building2,
  Users,
  Search,
  UserCheck,
  Lock,
} from 'lucide-react-native';

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

type AspectRatioMode = 'ORIGINAL' | '1:1' | '4:5' | '16:9';

export const PostComposerModal: React.FC<PostComposerModalProps> = ({
  visible,
  onClose,
  onPostCreated,
  communities,
  defaultCommunityId,
}) => {
  const [content, setContent] = useState('');
  const [postScope, setPostScope] = useState<PostScope>(defaultCommunityId ? 'COMMUNITY' : 'COLLEGE');
  const [selectedCommunity, setSelectedCommunity] = useState<number>(
    defaultCommunityId || (communities[0]?.id || 1)
  );
  const [communitySearchQuery, setCommunitySearchQuery] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  
  // Multi-attachment staging state
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('ORIGINAL');
  const [submitting, setSubmitting] = useState(false);
  const [croppingImage, setCroppingImage] = useState<StagedAttachment | null>(null);
  const [autoCropping, setAutoCropping] = useState(false);

  const handleCropComplete = (croppedUri: string) => {
    if (!croppingImage) return;
    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === croppingImage.id ? { ...item, uri: croppedUri } : item
      )
    );
    setCroppingImage(null);
  };

  const handleDirectAutoCrop = async (targetFile: StagedAttachment) => {
    try {
      setAutoCropping(true);
      const cropped = await smartAutoCropImage(targetFile.uri);
      setStagedFiles((prev) =>
        prev.map((item) => (item.id === targetFile.id ? { ...item, uri: cropped } : item))
      );
    } catch (e) {
      console.warn('Direct auto crop error', e);
    } finally {
      setAutoCropping(false);
    }
  };

  // Hidden file input refs for Web
  const imageInputRef = useRef<any>(null);
  const documentInputRef = useRef<any>(null);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const resetForm = () => {
    setContent('');
    setStagedFiles([]);
    setAspectRatio('ORIGINAL');
    setIsAnonymous(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // High-Resolution Image Processing (Sharp Canvas Resize, Quality 0.92)
  const processHighQualityImage = (file: File): Promise<StagedAttachment> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new (window as any).Image();
        img.onload = () => {
          const MAX_DIM = 1920; // 1080p-1440p high quality
          let width = img.width;
          let height = img.height;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let finalUri = e.target?.result as string;

          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            finalUri = canvas.toDataURL('image/jpeg', 0.92);
          }

          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          resolve({
            id: Math.random().toString(36).substring(7),
            uri: finalUri,
            name: file.name,
            size: file.size,
            sizeFormatted: formatBytes(file.size),
            type: 'IMAGE',
            extension: ext,
            file,
          });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePickImage = async () => {
    if (Platform.OS === 'web') {
      if (imageInputRef.current) {
        imageInputRef.current.click();
      }
    } else {
      try {
        const ImagePicker = require('expo-image-picker');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow camera roll access to upload photos.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          quality: 0.9,
        });
        if (!result.canceled && result.assets) {
          const newItems: StagedAttachment[] = result.assets.map((asset: any) => {
            const fileName = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
            const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
            return {
              id: Math.random().toString(36).substring(7),
              uri: asset.uri,
              name: fileName,
              size: asset.fileSize || 0,
              sizeFormatted: formatBytes(asset.fileSize || 0),
              type: 'IMAGE',
              extension: ext,
            };
          });
          setStagedFiles((prev) => [...prev, ...newItems]);
        }
      } catch (err: any) {
        Alert.alert('Upload Error', err.message || 'Could not pick images.');
      }
    }
  };

  const handleImageFileChange = async (e: any) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length > 0) {
      const processed = await Promise.all(files.map((f) => processHighQualityImage(f)));
      setStagedFiles((prev) => [...prev, ...processed]);
    }
  };

  const handlePickDocument = async () => {
    if (Platform.OS === 'web') {
      if (documentInputRef.current) {
        documentInputRef.current.click();
      }
    } else {
      try {
        const DocumentPicker = require('expo-document-picker');
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (!result.canceled && result.assets) {
          const newItems: StagedAttachment[] = result.assets.map((asset: any) => {
            const fileName = asset.name || 'document';
            const ext = fileName.split('.').pop()?.toLowerCase() || '';
            return {
              id: Math.random().toString(36).substring(7),
              uri: asset.uri,
              name: fileName,
              size: asset.size || 0,
              sizeFormatted: formatBytes(asset.size || 0),
              type: 'DOCUMENT',
              extension: ext,
            };
          });
          setStagedFiles((prev) => [...prev, ...newItems]);
        }
      } catch (err: any) {
        Alert.alert('Upload Error', err.message || 'Could not pick documents.');
      }
    }
  };

  const handleDocumentFileChange = (e: any) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newItems: StagedAttachment[] = files.map((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        return {
          id: Math.random().toString(36).substring(7),
          uri: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          type: 'DOCUMENT',
          extension: ext,
          file,
        };
      });
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const getAspectRatioNumber = (): number | undefined => {
    switch (aspectRatio) {
      case '1:1':
        return 1;
      case '4:5':
        return 4 / 5;
      case '16:9':
        return 16 / 9;
      case 'ORIGINAL':
      default:
        return 4 / 3;
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && stagedFiles.length === 0) {
      Alert.alert('Empty Post', 'Please write something or attach photos/documents.');
      return;
    }

    try {
      setSubmitting(true);
      const targetCommunity = selectedCommunity || communities[0]?.id || 1;

      const hasImages = stagedFiles.some((f) => f.type === 'IMAGE');
      const hasDocs = stagedFiles.some((f) => f.type === 'DOCUMENT');
      let determinedMediaType: 'TEXT' | 'IMAGE' | 'DOCUMENT' = 'TEXT';
      if (hasImages && hasDocs) determinedMediaType = 'IMAGE'; // backend sets attachments
      else if (hasImages) determinedMediaType = 'IMAGE';
      else if (hasDocs) determinedMediaType = 'DOCUMENT';

      const formData = new FormData();
      formData.append('visibility', postScope);
      if (postScope === 'COMMUNITY') {
        const targetCommunity = selectedCommunity || communities[0]?.id || 1;
        formData.append('community', String(targetCommunity));
      } else if (selectedCommunity) {
        formData.append('community', String(selectedCommunity));
      }
      formData.append('content', content.trim());
      formData.append('is_anonymous', String(isAnonymous));
      formData.append('media_type', determinedMediaType);

      // Append all attachments
      stagedFiles.forEach((item, index) => {
        if (item.file) {
          formData.append('attachments', item.file);
          // Legacy backwards compatibility for first doc or image
          if (item.type === 'DOCUMENT' && index === 0) {
            formData.append('document', item.file);
            formData.append('document_name', item.name);
            formData.append('document_size', item.sizeFormatted);
          }
        } else if (item.uri) {
          formData.append('attachments', {
            uri: item.uri,
            name: item.name || `file_${index}`,
            type: item.type === 'IMAGE' ? 'image/jpeg' : 'application/octet-stream',
          } as any);
        }
      });

      // Legacy fallback for media_url if single web image
      const firstImg = stagedFiles.find((f) => f.type === 'IMAGE');
      if (firstImg && firstImg.uri.startsWith('data:')) {
        formData.append('media_url', firstImg.uri);
      }

      await postService.createPost(formData);
      handleClose();
      onPostCreated();
    } catch (err: any) {
      Alert.alert('Post Failed', err.response?.data?.error || err.message || 'Could not publish post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const imageFiles = stagedFiles.filter((f) => f.type === 'IMAGE');
  const documentFiles = stagedFiles.filter((f) => f.type === 'DOCUMENT');

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        {/* Hidden inputs for web */}
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
              ref={documentInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              multiple
              onChange={handleDocumentFileChange}
            />
          </>
        )}

        {/* Top Navigation Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} disabled={submitting}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Post</Text>
          {(() => {
            const canPublish = (content.trim().length > 0 || stagedFiles.length > 0) && !submitting;
            return (
              <TouchableOpacity
                style={[styles.postBtn, !canPublish && styles.postBtnDisabled]}
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
                  <Text style={[styles.postBtnText, !canPublish && styles.postBtnTextDisabled]}>
                    Publish Post
                  </Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {/* Post Audience & Scope Selector (Global vs College vs Community) */}
          <View style={styles.scopeContainer}>
            <Text style={styles.scopeHeaderLabel}>Who can see this post?</Text>
            <View style={styles.scopePillRow}>
              <TouchableOpacity
                style={[styles.scopePill, postScope === 'GLOBAL' && styles.scopePillActive]}
                onPress={() => setPostScope('GLOBAL')}
                activeOpacity={0.8}
              >
                <Globe size={14} color={postScope === 'GLOBAL' ? '#38bdf8' : '#94a3b8'} />
                <Text style={[styles.scopePillText, postScope === 'GLOBAL' && styles.scopePillTextActive]}>
                  Global (All Campuses)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scopePill, postScope === 'COLLEGE' && styles.scopePillActive]}
                onPress={() => setPostScope('COLLEGE')}
                activeOpacity={0.8}
              >
                <Building2 size={14} color={postScope === 'COLLEGE' ? '#38bdf8' : '#94a3b8'} />
                <Text style={[styles.scopePillText, postScope === 'COLLEGE' && styles.scopePillTextActive]}>
                  My College Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scopePill, postScope === 'FOLLOWERS' && styles.scopePillActive]}
                onPress={() => setPostScope('FOLLOWERS')}
                activeOpacity={0.8}
              >
                <UserCheck size={14} color={postScope === 'FOLLOWERS' ? '#38bdf8' : '#94a3b8'} />
                <Text style={[styles.scopePillText, postScope === 'FOLLOWERS' && styles.scopePillTextActive]}>
                  Followers Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scopePill, postScope === 'COMMUNITY' && styles.scopePillActive]}
                onPress={() => setPostScope('COMMUNITY')}
                activeOpacity={0.8}
              >
                <Users size={14} color={postScope === 'COMMUNITY' ? '#38bdf8' : '#94a3b8'} />
                <Text style={[styles.scopePillText, postScope === 'COMMUNITY' && styles.scopePillTextActive]}>
                  Specific Community / Hub
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scopePill, postScope === 'ONLY_ME' && styles.scopePillActive]}
                onPress={() => setPostScope('ONLY_ME')}
                activeOpacity={0.8}
              >
                <Lock size={14} color={postScope === 'ONLY_ME' ? '#38bdf8' : '#94a3b8'} />
                <Text style={[styles.scopePillText, postScope === 'ONLY_ME' && styles.scopePillTextActive]}>
                  Only Me
                </Text>
              </TouchableOpacity>
            </View>

            {/* When Specific Community is chosen: search and select community */}
            {postScope === 'COMMUNITY' && (
              <View style={styles.commSearchContainer}>
                <View style={styles.commSearchBar}>
                  <Search size={14} color="#64748b" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.commSearchInput}
                    placeholder="Search community or club to post in..."
                    placeholderTextColor="#64748b"
                    value={communitySearchQuery}
                    onChangeText={setCommunitySearchQuery}
                  />
                  {communitySearchQuery ? (
                    <TouchableOpacity onPress={() => setCommunitySearchQuery('')}>
                      <X size={14} color="#64748b" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.communityScroll}>
                  {communities
                    .filter((c) =>
                      !communitySearchQuery.trim() ||
                      c.name.toLowerCase().includes(communitySearchQuery.toLowerCase())
                    )
                    .map((c) => {
                      const isSelected = selectedCommunity === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.commPill, isSelected && styles.commPillSelected]}
                          onPress={() => setSelectedCommunity(c.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.commPillText, isSelected && styles.commPillTextSelected]}>
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

          {/* Main Content Input */}
          <TextInput
            style={styles.contentInput}
            multiline
            placeholder="Share an update, notes, questions, or ask for help..."
            placeholderTextColor={colors.textSecondary}
            value={content}
            onChangeText={setContent}
            maxLength={3000}
          />

          {/* Image Aspect Ratio / Auto-Crop Studio (When images attached) */}
          {imageFiles.length > 0 && (
            <View style={styles.mediaStudio}>
              <View style={styles.studioHeader}>
                <View style={styles.hdBadge}>
                  <Sparkles size={14} color="#38bdf8" />
                  <Text style={styles.hdBadgeText}>HD • {imageFiles.length} Photo{imageFiles.length > 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.studioActions}>
                  <TouchableOpacity
                    style={styles.autoCropBtn}
                    onPress={() => handleDirectAutoCrop(imageFiles[0])}
                    disabled={autoCropping}
                    activeOpacity={0.8}
                  >
                    <Zap size={13} color="#fbbf24" />
                    <Text style={styles.autoCropBtnText}>
                      {autoCropping ? 'Cropping...' : '⚡ Auto Crop'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.openCropperBtn}
                    onPress={() => setCroppingImage(imageFiles[0])}
                    activeOpacity={0.8}
                  >
                    <Crop size={13} color="#38bdf8" />
                    <Text style={styles.openCropperBtnText}>✂️ Crop & Adjust</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Crop Aspect Ratio Presets Bar */}
              <View style={styles.aspectRatioBar}>
                <Crop size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                {(['ORIGINAL', '1:1', '4:5', '16:9'] as AspectRatioMode[]).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.aspectRatioBtn, aspectRatio === mode && styles.aspectRatioBtnActive]}
                    onPress={() => setAspectRatio(mode)}
                  >
                    <Text
                      style={[
                        styles.aspectRatioBtnText,
                        aspectRatio === mode && styles.aspectRatioBtnTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Hero Image Preview with Crop Aspect Ratio */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setCroppingImage(imageFiles[0])}
                style={[styles.imagePreviewContainer, { aspectRatio: getAspectRatioNumber() }]}
              >
                <Image
                  source={{ uri: imageFiles[0].uri }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Staged Attachments Strip (Images & Documents) */}
          {stagedFiles.length > 0 && (
            <View style={styles.stagedSection}>
              <Text style={styles.stagedTitle}>
                Attached Files ({stagedFiles.length}):
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stagedScroll}>
                {stagedFiles.map((file) => (
                  <View key={file.id} style={styles.stagedCard}>
                    {file.type === 'IMAGE' ? (
                      <View style={{ position: 'relative' }}>
                        <Image source={{ uri: file.uri }} style={styles.stagedThumb} />
                        <TouchableOpacity
                          style={styles.stagedCropBadge}
                          onPress={() => setCroppingImage(file)}
                          activeOpacity={0.8}
                          accessibilityLabel="Crop photo"
                        >
                          <Crop size={11} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.stagedDocThumb}>
                        <FileText size={22} color="#ef4444" />
                        <Text style={styles.stagedDocExt}>{file.extension.toUpperCase() || 'DOC'}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.stagedRemoveBtn}
                      onPress={() => handleRemoveAttachment(file.id)}
                    >
                      <X size={12} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.stagedName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={styles.stagedSize}>{file.sizeFormatted}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Attachment Action Buttons Toolbar (Always accessible!) */}
          <View style={styles.toolbar}>
            <TouchableOpacity style={styles.toolBtn} onPress={handlePickImage}>
              <View style={[styles.toolIconBox, { backgroundColor: '#1e3a8a' }]}>
                <ImageIcon size={18} color="#60a5fa" />
              </View>
              <Text style={styles.toolBtnText}>Add Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={handlePickDocument}>
              <View style={[styles.toolIconBox, { backgroundColor: '#450a0a' }]}>
                <FileText size={18} color="#f87171" />
              </View>
              <Text style={styles.toolBtnText}>Add Documents</Text>
            </TouchableOpacity>
          </View>

          {/* Zero-Leak Anonymity Toggle Card */}
          <View style={styles.anonCard}>
            <View style={styles.anonInfo}>
              <Text style={styles.anonTitle}>🎭 Post Anonymously</Text>
              <Text style={styles.anonSubtitle}>
                Your real name and admission details will be completely hidden. A random mascot will be assigned.
              </Text>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: '#334155', true: '#7c3aed' }}
              thumbColor={isAnonymous ? '#c084fc' : '#94a3b8'}
            />
          </View>
        </ScrollView>
      </View>

      {/* Interactive Custom Freeform Crop & Rotate Modal */}
      {croppingImage && (
        <ImageCropperModal
          visible={!!croppingImage}
          imageUri={croppingImage.uri}
          onClose={() => setCroppingImage(null)}
          onCropComplete={handleCropComplete}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  postBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnDisabled: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  postBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  postBtnTextDisabled: {
    color: '#64748b',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    padding: 16,
  },
  scopeContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  scopeHeaderLabel: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 6,
  },
  scopePillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  scopePillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scopePillTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  commSearchContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  commSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b0f19',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  commSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12.5,
  },
  communityScroll: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  commPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  commPillSelected: {
    backgroundColor: '#1e3a8a',
    borderColor: '#38bdf8',
  },
  commPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  commPillTextSelected: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  contentInput: {
    color: colors.textPrimary,
    fontSize: 16,
    minHeight: 110,
    textAlignVertical: 'top',
    marginBottom: 14,
    lineHeight: 22,
  },
  mediaStudio: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 16,
  },
  studioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  hdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  hdBadgeText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  aspectRatioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  aspectRatioBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1e293b',
  },
  aspectRatioBtnActive: {
    backgroundColor: '#0284c7',
  },
  aspectRatioBtnText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  aspectRatioBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  imagePreviewContainer: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  stagedSection: {
    marginBottom: 16,
  },
  stagedTitle: {
    color: colors.textSecondary,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedDocExt: {
    color: '#ef4444',
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
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  stagedName: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
  },
  stagedSize: {
    color: colors.textSecondary,
    fontSize: 9,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  toolIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  anonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  anonInfo: {
    flex: 1,
    marginRight: 10,
  },
  anonTitle: {
    color: '#c084fc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  anonSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  studioActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#fbbf24',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  autoCropBtnText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  openCropperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#0284c7',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  openCropperBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  stagedCropBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0284c7',
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
});
