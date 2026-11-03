import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import {
  X,
  Image as ImageIcon,
  FileText,
  Camera,
  Send,
  Trash2,
  Crop,
  Zap,
} from 'lucide-react-native';
import { ImageCropperModal, smartAutoCropImage } from './ImageCropperModal';

export interface StagedAttachment {
  id: string;
  uri: string;
  name: string;
  size: number;
  sizeFormatted: string;
  type: 'IMAGE' | 'DOCUMENT';
  extension: string;
  file?: any; // Native File on Web
  caption?: string;
}

interface AttachmentPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (attachments: StagedAttachment[], messageText: string) => Promise<void>;
}

export const dataURLtoFile = (dataurl: string, filename: string): any => {
  if (typeof window === 'undefined' || !dataurl.startsWith('data:')) return null;
  try {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (e) {
    console.warn('dataURLtoFile failed', e);
    return null;
  }
};

export const AttachmentPickerModal: React.FC<AttachmentPickerModalProps> = ({
  visible,
  onClose,
  onSend,
}) => {
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [messageText, setMessageText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [croppingImage, setCroppingImage] = useState<StagedAttachment | null>(null);
  const [autoCropping, setAutoCropping] = useState(false);

  const handleCropComplete = (croppedUri: string) => {
    if (!croppingImage) return;
    const newFile = croppedUri.startsWith('data:')
      ? (dataURLtoFile(croppedUri, croppingImage.name || 'cropped.jpg') || croppingImage.file)
      : croppingImage.file;

    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === croppingImage.id
          ? { ...item, uri: croppedUri, file: newFile }
          : item
      )
    );
    setCroppingImage(null);
  };

  const handleDirectAutoCrop = async (targetFile: StagedAttachment) => {
    try {
      setAutoCropping(true);
      const cropped = await smartAutoCropImage(targetFile.uri);
      const newFile = cropped.startsWith('data:')
        ? (dataURLtoFile(cropped, targetFile.name || 'cropped.jpg') || targetFile.file)
        : targetFile.file;

      setStagedFiles((prev) =>
        prev.map((item) => (item.id === targetFile.id ? { ...item, uri: cropped, file: newFile } : item))
      );
    } catch (e) {
      console.warn('Direct auto crop error', e);
    } finally {
      setAutoCropping(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const handlePickWeb = (accept: string, isDoc: boolean) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.onchange = (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      const newItems: StagedAttachment[] = files.map((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = !isDoc && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        return {
          id: Math.random().toString(36).substring(7),
          uri: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          type: isImage ? 'IMAGE' : 'DOCUMENT',
          extension: ext,
          file,
        };
      });
      setStagedFiles((prev) => [...prev, ...newItems]);
    };
    input.click();
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
        Alert.alert('Permission Denied', 'Camera roll permission is required to select photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
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
      Alert.alert('Error', err.message || 'Could not pick photos.');
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
      Alert.alert('Error', err.message || 'Could not pick documents.');
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSend = async () => {
    if (stagedFiles.length === 0 && !messageText.trim()) return;
    try {
      setUploading(true);
      setUploadProgress(10);
      await onSend(stagedFiles, messageText.trim());
      setStagedFiles([]);
      setMessageText('');
      onClose();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to send attachments.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setStagedFiles([]);
    setMessageText('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Share Media & Documents</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              disabled={uploading}
            >
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* WhatsApp-Style Action Icons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePickPhotos}
              disabled={uploading}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#3b82f6' }]}>
                <ImageIcon size={22} color="#ffffff" />
              </View>
              <Text style={styles.actionLabel}>Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePickDocuments}
              disabled={uploading}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#10b981' }]}>
                <FileText size={22} color="#ffffff" />
              </View>
              <Text style={styles.actionLabel}>Document</Text>
            </TouchableOpacity>
          </View>

          {/* Selected Files Preview List */}
          {stagedFiles.length > 0 && (
            <View style={styles.stagedSection}>
              <Text style={styles.sectionSubtitle}>
                Ready to send ({stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}):
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stagedList}
                contentContainerStyle={{ paddingHorizontal: 4, gap: 10 }}
              >
                {stagedFiles.map((file) => (
                  <View key={file.id} style={styles.stagedCard}>
                    {file.type === 'IMAGE' ? (
                      <View style={{ position: 'relative' }}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setCroppingImage(file)}
                        >
                          <Image
                            source={{ uri: file.uri }}
                            style={styles.stagedThumb}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.autoCropBadge}
                          onPress={() => handleDirectAutoCrop(file)}
                          disabled={autoCropping}
                          activeOpacity={0.8}
                          accessibilityLabel="⚡ Auto Crop photo"
                        >
                          <Zap size={10} color="#fbbf24" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cropBtnBadge}
                          onPress={() => setCroppingImage(file)}
                          activeOpacity={0.8}
                          accessibilityLabel="Crop photo"
                        >
                          <Crop size={11} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.docPlaceholder}>
                        <FileText size={24} color="#38bdf8" />
                        <Text style={styles.docExtBadge}>{file.extension.toUpperCase() || 'FILE'}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => handleRemoveAttachment(file.id)}
                      disabled={uploading}
                    >
                      <X size={12} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.stagedName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={styles.stagedSize}>
                      {file.sizeFormatted}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Caption / Message Input Box */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Add a caption or message..."
              placeholderTextColor="#64748b"
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={1000}
              editable={!uploading}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (stagedFiles.length === 0 && !messageText.trim()) && styles.sendBtnDisabled,
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

      {/* Interactive Custom Crop & Rotate Modal */}
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  actionPill: {
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  stagedSection: {
    marginTop: 14,
  },
  sectionSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  stagedList: {
    maxHeight: 125,
  },
  stagedCard: {
    width: 86,
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 6,
  },
  stagedThumb: {
    width: 74,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  docPlaceholder: {
    width: 74,
    height: 60,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docExtBadge: {
    color: '#38bdf8',
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
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  autoCropBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#fbbf24',
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
    backgroundColor: '#0284c7',
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  stagedName: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
  },
  stagedSize: {
    color: '#64748b',
    fontSize: 9,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#475569',
  },
});
