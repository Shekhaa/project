import React, { useState, useEffect, useRef } from 'react';
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
import { X, Paperclip, FileText, Check, Send, AlertCircle, Mic } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { AttachmentPickerModal, StagedAttachment } from '../media/AttachmentPickerModal';
import {
  VoiceRecordingBar,
  VoiceNoteDraftCard,
  useVoiceRecorder,
  RecordedVoiceNote,
} from '../media/VoiceNoteRecorder';
import { pauseAllActiveVoiceNotes } from '../media/VoiceNotePlayer';
import { chatService } from '../../services/chatService';

interface DiscussionComposerProps {
  visible: boolean;
  autoStartVoice?: boolean;
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
  autoStartVoice = false,
  onClose,
  onSubmit,
}) => {
  const { colors, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT'>('QUESTION');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [draftVoiceNote, setDraftVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const voiceRecorder = useVoiceRecorder({
    onFallbackNative: () => setPickerVisible(true),
  });
  const startRecordingRef = useRef(voiceRecorder.startRecording);
  startRecordingRef.current = voiceRecorder.startRecording;
  const autoVoiceTriggeredRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      autoVoiceTriggeredRef.current = false;
      return;
    }
    if (autoStartVoice && !autoVoiceTriggeredRef.current) {
      autoVoiceTriggeredRef.current = true;
      const timer = setTimeout(() => {
        startRecordingRef.current({ suppressAlert: true });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [visible, autoStartVoice]);

  const handleClose = () => {
    if (submitting) return;
    voiceRecorder.cancelRecording();
    pauseAllActiveVoiceNotes();
    onClose();
  };

  const notify = (titleStr: string, msg: string) => {
    setErrorMessage(`${titleStr}: ${msg}`);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.warn(`[DiscussionComposer] ${titleStr}: ${msg}`);
    } else {
      Alert.alert(titleStr, msg);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    if (!cleanTitle) {
      notify('Title Required', 'Please enter a title for your post (e.g. "DBMS Unit 3 Notes").');
      return;
    }
    if (cleanTitle.length < 2) {
      notify('Title Too Short', 'Discussion title must be at least 2 characters long.');
      return;
    }
    if (!cleanContent && stagedFiles.length === 0 && !draftVoiceNote) {
      notify(
        'Details or Voice Note Required',
        'Please enter details, record a voice note, or attach a file for your post.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const filesToUpload: any[] = [
        ...(draftVoiceNote ? [draftVoiceNote] : []),
        ...stagedFiles,
      ];
      let attachment_ids: string[] = [];
      if (filesToUpload.length > 0) {
        const uploaded = await Promise.all(
          filesToUpload.map((file) => chatService.uploadAttachmentFile(file))
        );
        attachment_ids = uploaded.map((u: any) => u.id);
      }

      await onSubmit({
        title: cleanTitle,
        content: cleanContent,
        discussion_type: type,
        tags: tags.trim(),
        attachment_ids,
      });

      // Reset state
      voiceRecorder.cancelRecording();
      pauseAllActiveVoiceNotes();
      setTitle('');
      setContent('');
      setType('QUESTION');
      setTags('');
      setStagedFiles([]);
      setDraftVoiceNote(null);
      setErrorMessage(null);
      onClose();
    } catch (e: any) {
      let errText = e.response?.data?.error;
      if (!errText && e.response?.data) {
        if (typeof e.response.data === 'string') {
          errText = e.response.data;
        } else if (typeof e.response.data === 'object') {
          const firstKey = Object.keys(e.response.data)[0];
          const val = e.response.data[firstKey];
          errText = Array.isArray(val) ? val.join(' ') : String(val);
        }
      }
      errText = errText || e.message || 'Could not publish discussion.';
      setErrorMessage(errText);
      notify('Publication Failed', errText);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Community Post</Text>
          <TouchableOpacity
            style={[
              styles.publishBtn,
              { backgroundColor: colors.primary },
              submitting && styles.publishBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.publishBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Inline Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color="#ef4444" style={{ marginRight: 8 }} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}
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
            onChangeText={(t) => {
              setTitle(t);
              if (errorMessage) setErrorMessage(null);
            }}
            maxLength={250}
          />

          {/* Voice Note Recorder / Draft Preview (Prominent above Details so typing + speaking work seamlessly) */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Voice Note</Text>
          {voiceRecorder.isRecording ? (
            <VoiceRecordingBar
              recordSeconds={voiceRecorder.recordSeconds}
              liveLevels={voiceRecorder.liveLevels}
              isFinalizing={voiceRecorder.isFinalizing}
              onCancel={voiceRecorder.cancelRecording}
              onAttachToDraft={async () => {
                const note = await voiceRecorder.stopRecording();
                if (note) {
                  setDraftVoiceNote(note);
                  if (errorMessage) setErrorMessage(null);
                }
              }}
              attachLabel="Attach"
            />
          ) : draftVoiceNote ? (
            <VoiceNoteDraftCard
              voiceNote={draftVoiceNote}
              onRemove={() => setDraftVoiceNote(null)}
            />
          ) : (
            <TouchableOpacity
              style={[
                styles.voiceTriggerCard,
                {
                  backgroundColor: isDark ? 'rgba(94, 106, 210, 0.10)' : 'rgba(79, 70, 229, 0.06)',
                  borderColor: isDark ? 'rgba(94, 106, 210, 0.30)' : 'rgba(79, 70, 229, 0.24)',
                },
              ]}
              onPress={() => voiceRecorder.startRecording()}
              activeOpacity={0.8}
            >
              <View style={[styles.voiceMicBadge, { backgroundColor: colors.primary }]}>
                <Mic size={16} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.voiceTriggerTitle, { color: colors.textPrimary }]}>
                  Record Voice Explanation
                </Text>
                <Text style={[styles.voiceTriggerSub, { color: colors.textMuted }]}>
                  Speak your doubt or explain clearly & type notes below
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Content / Question Body */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Details (or type alongside your voice note)
          </Text>
          <TextInput
            style={[
              styles.contentInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Explain your problem, question, or add context to your voice note..."
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={(c) => {
              setContent(c);
              if (errorMessage) setErrorMessage(null);
            }}
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
              Attach Notes, PDFs, Images or Audio Files
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
              submitting && styles.bigSubmitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
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
            setStagedFiles((prev) => [...prev, ...files]);
            if (errorMessage) setErrorMessage(null);
            setPickerVisible(false);
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
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
    minHeight: 110,
  },
  voiceTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceMicBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTriggerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  voiceTriggerSub: {
    fontSize: 11.5,
    marginTop: 1,
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
