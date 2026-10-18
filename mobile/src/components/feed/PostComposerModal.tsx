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
import {
  X,
  Image as ImageIcon,
  FileText,
  Crop,
  Sparkles,
  ShieldAlert,
  Check,
  Trash2,
  UploadCloud,
} from 'lucide-react-native';

interface CommunityOption {
  id: number;
  name: string;
}

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
  const [selectedCommunity, setSelectedCommunity] = useState<number>(
    defaultCommunityId || (communities[0]?.id || 1)
  );
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [mediaType, setMediaType] = useState<'NONE' | 'IMAGE' | 'DOCUMENT'>('NONE');
  
  // Photo State
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('ORIGINAL');
  
  // Document State
  const [documentFile, setDocumentFile] = useState<any | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [documentSize, setDocumentSize] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Hidden file input refs for Web
  const imageInputRef = useRef<any>(null);
  const documentInputRef = useRef<any>(null);

  const resetForm = () => {
    setContent('');
    setMediaType('NONE');
    setMediaUrl(null);
    setAspectRatio('ORIGINAL');
    setDocumentFile(null);
    setDocumentName('');
    setDocumentSize('');
    setIsAnonymous(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // High-Resolution Image Processing (Sharp Canvas Resize, Quality 0.92)
  const processHighQualityImage = (file: File) => {
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
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          const highResDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          setMediaUrl(highResDataUrl);
          setMediaType('IMAGE');
        } else {
          setMediaUrl(e.target?.result as string);
          setMediaType('IMAGE');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePickImage = () => {
    if (Platform.OS === 'web') {
      if (imageInputRef.current) {
        imageInputRef.current.click();
      }
    } else {
      Alert.alert('Mobile Upload', 'Photo picker ready.');
    }
  };

  const handleImageFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      processHighQualityImage(file);
    }
  };

  const handlePickDocument = () => {
    if (Platform.OS === 'web') {
      if (documentInputRef.current) {
        documentInputRef.current.click();
      }
    } else {
      Alert.alert('Mobile Upload', 'PDF picker ready.');
    }
  };

  const handleDocumentFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentFile(file);
      setDocumentName(file.name);
      const sizeKb = file.size / 1024;
      const sizeStr = sizeKb < 1024 ? `${sizeKb.toFixed(1)} KB` : `${(sizeKb / 1024).toFixed(1)} MB`;
      setDocumentSize(sizeStr);
      setMediaType('DOCUMENT');

      // Also read as data url so it can be previewed or sent
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMediaUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
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
    if (!content.trim() && !mediaUrl && !documentFile) {
      Alert.alert('Empty Post', 'Please write a caption or attach media to post.');
      return;
    }

    try {
      setSubmitting(true);

      const targetCommunity = selectedCommunity || communities[0]?.id || 1;

      if (mediaType === 'DOCUMENT' && documentFile && Platform.OS === 'web') {
        const formData = new FormData();
        formData.append('community', String(targetCommunity));
        formData.append('content', content.trim());
        formData.append('is_anonymous', String(isAnonymous));
        formData.append('media_type', 'DOCUMENT');
        formData.append('document', documentFile);
        formData.append('document_name', documentName);
        formData.append('document_size', documentSize);

        await postService.createPost(formData);
      } else {
        await postService.createPost({
          community: targetCommunity,
          content: content.trim(),
          is_anonymous: isAnonymous,
          media_type: mediaType === 'NONE' ? 'TEXT' : mediaType,
          media_url: mediaUrl || '',
          document_name: mediaType === 'DOCUMENT' ? documentName : undefined,
          document_size: mediaType === 'DOCUMENT' ? documentSize : undefined,
        });
      }

      handleClose();
      onPostCreated();
    } catch (err: any) {
      Alert.alert('Post Failed', err.response?.data?.error || 'Could not publish post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
              onChange={handleImageFileChange}
            />
            <input
              type="file"
              ref={documentInputRef}
              style={{ display: 'none' }}
              accept="application/pdf"
              onChange={handleDocumentFileChange}
            />
          </>
        )}

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Campus Post</Text>
          <TouchableOpacity
            style={[styles.postBtn, submitting && styles.postBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollBody} keyboardShouldPersistTaps="handled">
          {/* Target Community Selector */}
          {communities.length > 0 && (
            <View style={styles.communitySelector}>
              <Text style={styles.sectionLabel}>Post in:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.communityScroll}>
                {communities.map((c) => {
                  const isSelected = selectedCommunity === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.communityPill, isSelected && styles.communityPillActive]}
                      onPress={() => setSelectedCommunity(c.id)}
                    >
                      <Text
                        style={[
                          styles.communityPillText,
                          isSelected && styles.communityPillTextActive,
                        ]}
                      >
                        🎓 {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Caption Text Area */}
          <TextInput
            style={styles.contentInput}
            multiline
            numberOfLines={4}
            placeholder="What's happening on campus? Share announcements, questions, notes, or tips..."
            placeholderTextColor={colors.textSecondary}
            value={content}
            onChangeText={setContent}
            maxLength={3000}
          />

          {/* Dedicated Media Upload & Auto-Crop Studio */}
          {mediaType === 'IMAGE' && mediaUrl && (
            <View style={styles.mediaStudio}>
              <View style={styles.studioHeader}>
                <View style={styles.hdBadge}>
                  <Sparkles size={14} color="#38bdf8" />
                  <Text style={styles.hdBadgeText}>HD • High Quality Photo</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeMediaBtn}
                  onPress={() => {
                    setMediaUrl(null);
                    setMediaType('NONE');
                  }}
                >
                  <Trash2 size={16} color="#ef4444" />
                  <Text style={styles.removeMediaText}>Remove</Text>
                </TouchableOpacity>
              </View>

              {/* Crop Aspect Ratio Presets Bar */}
              <View style={styles.aspectRatioBar}>
                <Crop size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                {(['ORIGINAL', '1:1', '4:5', '16:9'] as AspectRatioMode[]).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.aspectRatioBtn,
                      aspectRatio === mode && styles.aspectRatioBtnActive,
                    ]}
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

              {/* Aspect Ratio Preview Container */}
              <View
                style={[
                  styles.imagePreviewContainer,
                  { aspectRatio: getAspectRatioNumber() },
                ]}
              >
                <Image
                  source={{ uri: mediaUrl }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
              </View>
            </View>
          )}

          {/* PDF Document Preview Card */}
          {mediaType === 'DOCUMENT' && (
            <View style={styles.documentPreviewCard}>
              <View style={styles.documentIconCircle}>
                <FileText size={26} color="#ef4444" />
              </View>
              <View style={styles.documentMeta}>
                <Text style={styles.documentName} numberOfLines={1}>
                  {documentName || 'Campus Document.pdf'}
                </Text>
                <Text style={styles.documentSizeText}>
                  {documentSize || 'PDF Document'} • Attached
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setDocumentFile(null);
                  setDocumentName('');
                  setDocumentSize('');
                  setMediaUrl(null);
                  setMediaType('NONE');
                }}
                style={styles.removeDocBtn}
              >
                <X size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}

          {/* Media Attachment Action Buttons (When no media attached) */}
          {mediaType === 'NONE' && (
            <View style={styles.mediaPickerRow}>
              <TouchableOpacity style={styles.mediaPickerOption} onPress={handlePickImage}>
                <View style={[styles.optionIconBox, { backgroundColor: '#1e3a8a' }]}>
                  <ImageIcon size={22} color="#60a5fa" />
                </View>
                <View style={styles.optionTextBox}>
                  <Text style={styles.optionTitle}>Upload Photo</Text>
                  <Text style={styles.optionSub}>HD Quality with Auto-Crop</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.mediaPickerOption} onPress={handlePickDocument}>
                <View style={[styles.optionIconBox, { backgroundColor: '#450a0a' }]}>
                  <FileText size={22} color="#f87171" />
                </View>
                <View style={styles.optionTextBox}>
                  <Text style={styles.optionTitle}>Upload PDF Notes</Text>
                  <Text style={styles.optionSub}>Assignments & Syllabus</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Zero-Leak Anonymity Toggle Card */}
          <View style={styles.anonCard}>
            <View style={styles.anonInfo}>
              <Text style={styles.anonTitle}>🎭 Post Anonymously</Text>
              <Text style={styles.anonSubtitle}>
                Your real name, profile photo and admission number will be hidden. A random mascot
                will be assigned.
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
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollBody: {
    flex: 1,
    padding: 16,
  },
  communitySelector: {
    marginBottom: 14,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  communityScroll: {
    flexDirection: 'row',
  },
  communityPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginRight: 8,
  },
  communityPillActive: {
    backgroundColor: '#1e3a8a',
    borderColor: colors.primary,
  },
  communityPillText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  communityPillTextActive: {
    color: '#93c5fd',
    fontWeight: '700',
  },
  contentInput: {
    color: colors.textPrimary,
    fontSize: 15.5,
    lineHeight: 24,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
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
    gap: 6,
  },
  hdBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  removeMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  removeMediaText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  aspectRatioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    padding: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  aspectRatioBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
  },
  aspectRatioBtnActive: {
    backgroundColor: colors.primary,
  },
  aspectRatioBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  aspectRatioBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  imagePreviewContainer: {
    width: '100%',
    maxHeight: 400,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  documentPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  documentIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#450a0a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  documentMeta: {
    flex: 1,
  },
  documentName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  documentSizeText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  removeDocBtn: {
    padding: 8,
  },
  mediaPickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  mediaPickerOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 12,
  },
  optionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  optionTextBox: {
    flex: 1,
  },
  optionTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  optionSub: {
    color: colors.textSecondary,
    fontSize: 10.5,
    marginTop: 2,
  },
  anonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a103c',
    borderWidth: 1,
    borderColor: '#581c87',
    borderRadius: 12,
    padding: 14,
    marginBottom: 30,
  },
  anonInfo: {
    flex: 1,
    marginRight: 12,
  },
  anonTitle: {
    color: '#e9d5ff',
    fontSize: 14,
    fontWeight: '700',
  },
  anonSubtitle: {
    color: '#c084fc',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
  },
});
