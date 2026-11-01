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
import { X, Paperclip, FileText, Check } from 'lucide-react-native';
import { colors } from '../../theme/colors';
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
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT'>('QUESTION');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a discussion title.');
      return;
    }
    if (title.trim().length < 4) {
      Alert.alert('Validation', 'Title must be at least 4 characters long.');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Required', 'Please write discussion details or questions.');
      return;
    }

    setSubmitting(true);
    try {
      let attachment_ids: string[] = [];
      if (stagedFiles.length > 0) {
        const uploaded = await Promise.all(
          stagedFiles.map((file) => chatService.uploadAttachmentFile(file))
        );
        attachment_ids = uploaded.map((u) => u.id);
      }

      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        discussion_type: type,
        tags: tags.trim(),
        attachment_ids,
      });

      // Reset
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
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Community Discussion</Text>
          <TouchableOpacity
            style={[styles.publishBtn, (!title.trim() || submitting) && styles.publishBtnDisabled]}
            onPress={handleSubmit}
            disabled={!title.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.publishBtnText}>Publish</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Discussion Type Selector */}
          <Text style={styles.label}>Discussion Type</Text>
          <View style={styles.typeRow}>
            {(
              [
                { key: 'QUESTION', label: '❓ Question / Doubt' },
                { key: 'RESOURCE', label: '📚 Study Resource' },
                { key: 'GENERAL', label: '💬 Discussion' },
                { key: 'ANNOUNCEMENT', label: '📢 Notice' },
              ] as const
            ).map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.typePill, type === item.key && styles.typePillActive]}
                onPress={() => setType(item.key)}
              >
                {type === item.key && <Check size={12} color="#fff" style={{ marginRight: 4 }} />}
                <Text style={[styles.typePillText, type === item.key && styles.typePillTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="e.g. How to prepare for DBMS end term exam?"
            placeholderTextColor="#64748b"
            value={title}
            onChangeText={setTitle}
            maxLength={250}
          />

          {/* Content / Question Body */}
          <Text style={styles.label}>Details & Description</Text>
          <TextInput
            style={styles.contentInput}
            placeholder="Explain your problem, question, or share helpful college notes/syllabus details..."
            placeholderTextColor="#64748b"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          {/* Tags */}
          <Text style={styles.label}>Tags (comma separated)</Text>
          <TextInput
            style={styles.tagInput}
            placeholder="e.g. dbms, exam, notes, unit-3"
            placeholderTextColor="#64748b"
            value={tags}
            onChangeText={setTags}
          />

          {/* Study Attachments (WhatsApp doc & media picker) */}
          <Text style={styles.label}>Attachments (Optional)</Text>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => setPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Paperclip size={16} color="#38bdf8" />
            <Text style={styles.attachBtnText}>Attach Notes, PDFs, Images or Word Docs</Text>
          </TouchableOpacity>

          {/* Staged files list */}
          {stagedFiles.length > 0 && (
            <View style={styles.stagedList}>
              {stagedFiles.map((file) => (
                <View key={file.id} style={styles.stagedItem}>
                  <FileText size={14} color="#38bdf8" />
                  <Text style={styles.stagedName} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStagedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                  >
                    <X size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        <AttachmentPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSend={(files) => {
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  publishBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  publishBtnDisabled: {
    opacity: 0.5,
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
    color: '#94a3b8',
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
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  typePillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8',
  },
  typePillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  typePillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '600',
  },
  contentInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 13.5,
    minHeight: 120,
  },
  tagInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  attachBtnText: {
    color: '#38bdf8',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stagedName: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 12,
  },
});
