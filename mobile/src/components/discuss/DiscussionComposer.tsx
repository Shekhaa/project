import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Paperclip, FileText, Check, Send } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { AttachmentPickerModal, StagedAttachment } from '../media/AttachmentPickerModal';
import { chatService } from '../../services/chatService';

interface DiscussionComposerProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    content: string;
    discussion_type: 'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT';
    tags: string;
    attachment_ids: string[];
  }) => Promise<void>;
}

export const DiscussionComposer: React.FC<DiscussionComposerProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const { colors, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT'>('QUESTION');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for your discussion (e.g. "DBMS End Term Notes").');
      return;
    }
    if (title.trim().length < 4) {
      Alert.alert('Title Too Short', 'Discussion title must be at least 4 characters long.');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Details Required', 'Please provide some details, notes, or explanation for your post.');
      return;
    }

    setSubmitting(true);
    try {
      let attachment_ids: string[] = [];
      if (stagedFiles.length > 0) {
        const uploaded = await Promise.all(
          stagedFiles.map((file) => chatService.uploadAttachmentFile(file))
        );
        attachment_ids = uploaded.map((u: any) => u.id);
      }

      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        discussion_type: type,
        tags: tags.trim(),
        attachment_ids,
      });

      // Reset state
      setTitle('');
      setContent('');
      setType('QUESTION');
      setTags('');
      setStagedFiles([]);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not publish discussion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Community Post</Text>
          <TouchableOpacity
            style={[
              styles.publishBtn,
              { backgroundColor: colors.primary },
              (!title.trim() || submitting) && styles.publishBtnDisabled,
            ]}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.publishBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Discussion Type Selector */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Post Type</Text>
          <View style={styles.typeRow}>
            {(
              [
                { key: 'QUESTION', label: '❓ Question / Doubt' },
                { key: 'RESOURCE', label: '📚 Study Resource' },
                { key: 'GENERAL', label: '💬 Discussion' },
                { key: 'ANNOUNCEMENT', label: '📢 Notice' },
              ] as const
            ).map((item) => {
              const active = type === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: active
                        ? isDark
                          ? 'rgba(94, 106, 210, 0.25)'
                          : 'rgba(79, 70, 229, 0.12)'
                        : isDark
                        ? '#141516'
                        : '#f1f5f9',
                      borderColor: active ? colors.primary : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setType(item.key)}
                >
                  {active && <Check size={12} color={colors.primary} style={{ marginRight: 4 }} />}
                  <Text
                    style={[
                      styles.typePillText,
                      { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '700' : '600' },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Title */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[
              styles.titleInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
                color: colors.textPrimary,
              },
            ]}
            placeholder="e.g. How to prepare for DBMS end term exam?"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={250}
          />

          {/* Content / Question Body */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Details & Description *</Text>
          <TextInput
            style={[
              styles.contentInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Explain your problem, question, or share helpful college notes/syllabus details..."
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          {/* Tags */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Tags (Optional, comma separated)</Text>
          <TextInput
            style={[
              styles.tagInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
                color: colors.textPrimary,
              },
            ]}
            placeholder="e.g. dbms, exam, notes, unit-3"
            placeholderTextColor={colors.textMuted}
            value={tags}
            onChangeText={setTags}
          />

          {/* Study Attachments (WhatsApp doc & media picker) */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Attachments (Optional)</Text>
          <TouchableOpacity
            style={[
              styles.attachBtn,
              {
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(79, 70, 229, 0.06)',
                borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(79, 70, 229, 0.25)',
              },
            ]}
            onPress={() => setPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Paperclip size={16} color={colors.primary} />
            <Text style={[styles.attachBtnText, { color: colors.primary }]}>
              Attach Notes, PDFs, Images or Documents
            </Text>
          </TouchableOpacity>

          {/* Staged files list */}
          {stagedFiles.length > 0 && (
            <View style={styles.stagedList}>
              {stagedFiles.map((file) => (
                <View
                  key={file.id}
                  style={[
                    styles.stagedItem,
                    { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                  ]}
                >
                  <FileText size={14} color={colors.primary} />
                  <Text style={[styles.stagedName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStagedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                  >
                    <X size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Large prominent bottom submit button */}
          <TouchableOpacity
            style={[
              styles.bigSubmitBtn,
              { backgroundColor: colors.primary },
              (!title.trim() || submitting) && styles.bigSubmitBtnDisabled,
            ]}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={styles.bigSubmitBtnInner}>
                <Send size={16} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.bigSubmitBtnText}>Post to Community</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>

        <AttachmentPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSend={async (files) => {
            setStagedFiles(files);
            setPickerVisible(false);
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  publishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  formContent: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 14,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  typePillText: {
    fontSize: 12.5,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    fontWeight: '600',
  },
  contentInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13.5,
    minHeight: 120,
  },
  tagInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  attachBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  stagedList: {
    marginTop: 8,
    gap: 6,
  },
  stagedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stagedName: {
    flex: 1,
    fontSize: 12,
  },
  bigSubmitBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigSubmitBtnDisabled: {
    opacity: 0.65,
  },
  bigSubmitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bigSubmitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
