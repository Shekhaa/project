import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import {
  chatService,
  Conversation,
  Message,
  mergeMessagesUnique,
  upsertMessageUnique,
} from '../services/chatService';
import { api } from '../config/api';
import { MessageBubble, SharedPostCardData } from '../components/chat/MessageBubble';
import { SharedPostViewerModal } from '../components/chat/SharedPostViewerModal';
import { DirectorySearchModal } from '../components/chat/DirectorySearchModal';
import { EphemeralGroupModal } from '../components/chat/EphemeralGroupModal';
import { AttachmentPickerModal, StagedAttachment } from '../components/media/AttachmentPickerModal';
import {
  VoiceRecordingBar,
  VoiceNoteDraftCard,
  useVoiceRecorder,
  RecordedVoiceNote,
} from '../components/media/VoiceNoteRecorder';
import { pauseAllActiveVoiceNotes } from '../components/media/VoiceNotePlayer';
import { AddMembersModal } from '../components/chat/AddMembersModal';
import { InviteLinkModal } from '../components/chat/InviteLinkModal';
import { JoinByInviteModal } from '../components/chat/JoinByInviteModal';
import { MessageRequestsModal } from '../components/chat/MessageRequestsModal';
import {
  Search,
  Plus,
  Flame,
  ArrowLeft,
  Trash2,
  Send,
  X,
  MessageSquare,
  Users,
  Copy,
  Paperclip,
  Mic,
  Link2,
  UserPlus,
  MoreVertical,
} from 'lucide-react-native';

interface ChatScreenProps {
  currentUser?: any;
  initialConversation?: Conversation | null;
  onClearInitialConversation?: () => void;
  onOpenProfile?: (userId: number) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  currentUser,
  initialConversation,
  onClearInitialConversation,
  onOpenProfile,
}) => {
  const { colors, isDark } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [actionConv, setActionConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Message Requests State (Safe Direct Messaging)
  const [messageRequestsVisible, setMessageRequestsVisible] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Search in Inbox
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryResults, setDirectoryResults] = useState<any[]>([]);
  const [searchingDirectory, setSearchingDirectory] = useState(false);

  // Modals
  const [directoryModalVisible, setDirectoryModalVisible] = useState(false);
  const [ephemeralModalVisible, setEphemeralModalVisible] = useState(false);
  const [selectedPostCard, setSelectedPostCard] = useState<SharedPostCardData | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);

  // Live Voice Note Recording & Draft State (Instagram style)
  const [draftVoiceNote, setDraftVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const voiceRecorder = useVoiceRecorder({
    onFallbackNative: () => setAttachmentPickerVisible(true),
  });

  // Anonymous Messaging (Green Verified Only)
  const [isAnonMode, setIsAnonMode] = useState(false);

  // Group Invite & Add Members Modals (Instagram Style)
  const [addMembersModalVisible, setAddMembersModalVisible] = useState(false);
  const [inviteLinkModalVisible, setInviteLinkModalVisible] = useState(false);
  const [joinViaInviteModalVisible, setJoinViaInviteModalVisible] = useState(false);

  const handleAddChatMembers = async (selectedIds: number[]) => {
    if (!activeConv) return;
    await chatService.addMembers(activeConv.id, selectedIds);
    await loadMessages(activeConv.id);
    await loadInbox();
    Alert.alert('Success! 🎉', `Added ${selectedIds.length} members to the group.`);
  };

  const handleJoinedChatViaInvite = async (conv: any) => {
    await loadInbox();
    setActiveConv(conv);
  };

  const flatListRef = useRef<FlatList>(null);

  // Initial load & Polling
  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (initialConversation) {
      setActiveConv(initialConversation);
      if (onClearInitialConversation) onClearInitialConversation();
    }
  }, [initialConversation]);

  // Clean up active voice recording/playback when switching conversations
  useEffect(() => {
    voiceRecorder.cancelRecording();
    setDraftVoiceNote(null);
    pauseAllActiveVoiceNotes();
  }, [activeConv?.id]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
      const pollTimer = setInterval(() => {
        loadMessages(activeConv.id, true);
      }, 3500);
      return () => {
        clearInterval(pollTimer);
        pauseAllActiveVoiceNotes();
      };
    }
  }, [activeConv]);

  // Live Campus Directory search when typing in inbox search
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timer = setTimeout(async () => {
        try {
          setSearchingDirectory(true);
          const res = await api.get(`/authentication/users/search/?q=${encodeURIComponent(searchQuery.trim())}`);
          setDirectoryResults(res.data.results || res.data || []);
        } catch (e) {
        } finally {
          setSearchingDirectory(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setDirectoryResults([]);
    }
  }, [searchQuery]);

  const loadInbox = async () => {
    try {
      setLoadingInbox(true);
      const data: any = await chatService.getInbox();
      setConversations(data.results || (Array.isArray(data) ? data : []));
      if (data.pending_requests_count !== undefined) {
        setPendingRequestsCount(data.pending_requests_count);
      }
    } catch (e) {
      console.log('Error loading inbox', e);
    } finally {
      setLoadingInbox(false);
    }
  };

  const loadMessages = async (convId?: string, isSilent = false) => {
    if (!convId || convId === 'undefined' || convId === 'null') return;
    try {
      if (!isSilent) setLoadingMessages(true);
      const msgs = await chatService.getMessages(convId);
      setMessages((prev) => mergeMessagesUnique(prev, msgs));
    } catch (e) {
      console.log('Error loading messages', e);
    } finally {
      if (!isSilent) setLoadingMessages(false);
    }
  };

  const handleSendRecordedVoiceNow = async () => {
    const recorded = await voiceRecorder.stopRecording();
    if (!recorded || !activeConv) return;
    const typedCaption = inputMessage.trim();
    if (typedCaption) {
      setInputMessage('');
    }
    await handleSendAttachments([recorded], typedCaption);
  };

  const handleAttachRecordedVoiceToDraft = async () => {
    const recorded = await voiceRecorder.stopRecording();
    if (!recorded) return;
    setDraftVoiceNote(recorded);
  };

  const toggleAnonMode = () => {
    if (currentUser?.verification_tier !== 'FULLY_VERIFIED') {
      Alert.alert(
        'Green Badge Required 🛡️',
        'Anonymous campus messaging is exclusive to Green-Verified students to maintain a trusted campus community. Please verify your student ID.'
      );
      return;
    }
    setIsAnonMode(!isAnonMode);
  };

  const handleSendMessage = async () => {
    if (!activeConv || sending) return;
    const rawText = inputMessage.trim();
    if (!rawText && !draftVoiceNote) return;

    if (draftVoiceNote) {
      const voiceToSend = draftVoiceNote;
      setDraftVoiceNote(null);
      setInputMessage('');
      await handleSendAttachments([voiceToSend], rawText);
      return;
    }

    let textToSend = rawText;
    if (isAnonMode) {
      const mascots = ['Anonymous Owl', 'Anonymous Fox', 'Anonymous Tiger', 'Anonymous Panda', 'Anonymous Falcon'];
      const chosenMascot = mascots[Math.floor(Math.random() * mascots.length)];
      textToSend = `[ANON_MSG: ${chosenMascot}] ${textToSend}`;
    }
    setInputMessage('');

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: Message = {
      id: tempId as any,
      conversation: activeConv.id as any,
      sender: currentUser?.id,
      sender_name: isAnonMode ? 'Anonymous Mascot' : (currentUser?.full_name || 'You'),
      sender_email: currentUser?.email || '',
      text: textToSend,
      attachments: [],
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending' as any,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      setSending(true);
      const sent = await chatService.sendMessage(activeConv.id, textToSend);
      setMessages((prev) => upsertMessageUnique(prev, sent, tempId));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m)));
      Alert.alert('Delivery Failed', 'Could not deliver message.');
    } finally {
      setSending(false);
    }
  };

  const handleSendAttachments = async (staged: StagedAttachment[], caption: string) => {
    if (!activeConv) return;
    const tempId = `temp_att_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let finalCaption = (caption || '').trim();
    if (isAnonMode) {
      const mascots = ['Anonymous Owl', 'Anonymous Fox', 'Anonymous Tiger', 'Anonymous Panda', 'Anonymous Falcon'];
      const chosenMascot = mascots[Math.floor(Math.random() * mascots.length)];
      finalCaption = finalCaption ? `[ANON_MSG: ${chosenMascot}] ${finalCaption}` : `[ANON_MSG: ${chosenMascot}]`;
    }

    const optimisticMsg: Message = {
      id: tempId as any,
      conversation: activeConv.id as any,
      sender: currentUser?.id,
      sender_name: isAnonMode ? 'Anonymous Mascot' : (currentUser?.full_name || 'You'),
      sender_email: currentUser?.email || '',
      text: finalCaption,
      created_at: new Date().toISOString(),
      attachments: staged.map((item, idx) => ({
        id: `temp_att_${idx}`,
        file_url: item.uri,
        download_url: item.uri,
        file_name: item.name,
        file_type: item.type as any,
        file_extension: item.extension || item.name.split('.').pop() || '',
        mime_type: item.mimeType || '',
        file_size: item.size || 0,
        file_size_formatted: item.sizeFormatted || '',
        created_at: new Date().toISOString(),
      })),
      is_read: false,
      status: 'sending' as any,
    };

    // Instant optimistic delivery into thread so user is never frozen!
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const filesToSend = staged.map((item) => ({
        file: item.file,
        uri: item.uri,
        name: item.name,
        type: item.mimeType || (item.type === 'IMAGE' ? 'image/jpeg' : (item.type === 'AUDIO' ? 'audio/webm' : (item.type === 'VIDEO' ? 'video/mp4' : 'application/octet-stream'))),
      }));
      const sent = await chatService.sendMessageWithAttachments(activeConv.id, finalCaption, filesToSend);
      setMessages((prev) => upsertMessageUnique(prev, sent, tempId));
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m)));
      Alert.alert('Upload Failed', err.response?.data?.error || err.message || 'Could not send attachments.');
    }
  };

  const handleStartDirectChat = async (user: any) => {
    try {
      setDirectoryModalVisible(false);
      setSearchQuery('');
      setDirectoryResults([]);
      const conv = await chatService.startDirectChat(user.email || user.username || String(user.id));
      await loadInbox();
      setActiveConv(conv);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not start conversation.');
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteConversation(convId);
              if (activeConv?.id === convId) {
                setActiveConv(null);
              }
              setConversations((prev) => prev.filter((c) => c.id !== convId));
            } catch (e) {
              Alert.alert('Error', 'Could not delete conversation.');
            }
          },
        },
      ]
    );
  };

  const handleClearConversationFromSheet = (conv: Conversation) => {
    setActionConv(null);
    const doClear = async () => {
      try {
        await chatService.clearChatHistory(conv.id);
        if (activeConv?.id === conv.id) {
          setMessages([]);
        }
        await loadInbox();
      } catch (e) {
        if (Platform.OS === 'web') {
          window.alert('Could not clear chat history.');
        } else {
          Alert.alert('Error', 'Could not clear chat history.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Are you sure you want to clear message history? Messages will be removed from your view, but other participants will keep their copies.') : true;
      if (ok) doClear();
    } else {
      Alert.alert(
        'Clear Conversation',
        'Are you sure you want to clear message history? Messages will be removed from your view, but other participants will keep their copies.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear', style: 'destructive', onPress: doClear },
        ]
      );
    }
  };

  const handleDeleteConversationFromSheet = (conv: Conversation) => {
    setActionConv(null);
    const doDelete = async () => {
      try {
        await chatService.deleteConversation(conv.id);
        if (activeConv?.id === conv.id) {
          setActiveConv(null);
        }
        setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      } catch (e) {
        if (Platform.OS === 'web') {
          window.alert('Could not delete conversation.');
        } else {
          Alert.alert('Error', 'Could not delete conversation.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Are you sure you want to remove this conversation from your inbox?') : true;
      if (ok) doDelete();
    } else {
      Alert.alert(
        'Delete Conversation',
        'Are you sure you want to remove this conversation from your inbox?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleUnsendMessage = async (msg: Message) => {
    setActionMessage(null);
    try {
      await chatService.unsendMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not unsend message.');
    }
  };

  const handleDeleteForMe = async (msg: Message) => {
    setActionMessage(null);
    try {
      await chatService.deleteMessageForMe(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e) {
      Alert.alert('Error', 'Could not remove message.');
    }
  };

  const handleCopyMessage = (msg: Message) => {
    setActionMessage(null);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(msg.text);
    }
    Alert.alert('Copied', 'Message text copied to clipboard.');
  };

  const getFilteredConversations = () => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.name || c.recipient?.full_name || c.recipient?.email || '';
      return name.toLowerCase().includes(q);
    });
  };

  // ================= ROOM VIEW =================
  if (activeConv) {
    const roomTitle =
      activeConv.name ||
      activeConv.recipient?.full_name ||
      activeConv.recipient?.email?.split('@')[0] ||
      'Campus Chat';

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.roomContainer, { backgroundColor: colors.background }]}
      >
        {/* Room Header */}
        <View style={[styles.roomHeader, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setActiveConv(null);
              loadInbox();
            }}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            disabled={activeConv.is_group || !activeConv.recipient?.id}
            onPress={() => activeConv.recipient?.id && onOpenProfile?.(activeConv.recipient.id)}
            activeOpacity={0.7}
          >
            <View style={styles.roomAvatar}>
              <Text style={styles.roomAvatarText}>{roomTitle.charAt(0).toUpperCase()}</Text>
            </View>

            <View style={styles.roomMeta}>
              <Text style={[styles.roomTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {roomTitle}
              </Text>
              <Text style={[styles.roomSubtitle, { color: colors.textSecondary }]}>
                {activeConv.is_ephemeral
                  ? `Self-destructing (${activeConv.duration || 24}h)`
                  : activeConv.is_group
                  ? 'Campus Group'
                  : 'Direct Message'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Header Action Buttons (Instagram Style) */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {activeConv.is_group && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => setInviteLinkModalVisible(true)}
                accessibilityLabel="Group invite link"
              >
                <Link2 size={19} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {activeConv.is_group && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => setAddMembersModalVisible(true)}
                accessibilityLabel="Add people"
              >
                <UserPlus size={19} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

          </View>
        </View>

        {/* Message List */}
        {loadingMessages ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const isMe =
                currentUser &&
                (item.sender === currentUser.id ||
                  item.sender_email?.toLowerCase() === currentUser.email?.toLowerCase());

              return (
                <MessageBubble
                  message={item}
                  isMe={isMe}
                  isGroup={activeConv.is_group}
                  onLongPress={(m) => setActionMessage(m)}
                  onPostCardPress={(card) => setSelectedPostCard(card)}
                  onSenderPress={onOpenProfile}
                />
              );
            }}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Anonymous Mode Active Indicator Banner */}
        {isAnonMode && (
          <View style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: isDark ? 'rgba(147, 51, 234, 0.15)' : 'rgba(147, 51, 234, 0.1)', borderTopWidth: 1, borderColor: 'rgba(147, 51, 234, 0.25)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, color: isDark ? '#c084fc' : '#7e22ce', fontWeight: '600' }}>
              🎭 Anonymous DM Active • Your real name is hidden. Sent as an Anonymous Mascot.
            </Text>
            <TouchableOpacity onPress={() => setIsAnonMode(false)}>
              <X size={14} color={isDark ? '#c084fc' : '#7e22ce'} />
            </TouchableOpacity>
          </View>
        )}

        {/* Docked Voice Note Draft Preview (allows typing + voice note together) */}
        {draftVoiceNote && !voiceRecorder.isRecording && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingTop: 8,
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.cardBorder,
            }}
          >
            <VoiceNoteDraftCard
              voiceNote={draftVoiceNote}
              onRemove={() => setDraftVoiceNote(null)}
              compact
            />
          </View>
        )}

        {/* Bottom Message Input Bar / Live Instagram Voice Recording Bar */}
        {voiceRecorder.isRecording ? (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.cardBorder,
            }}
          >
            <VoiceRecordingBar
              recordSeconds={voiceRecorder.recordSeconds}
              liveLevels={voiceRecorder.liveLevels}
              isFinalizing={voiceRecorder.isFinalizing}
              onCancel={voiceRecorder.cancelRecording}
              onAttachToDraft={handleAttachRecordedVoiceToDraft}
              onSend={handleSendRecordedVoiceNow}
            />
          </View>
        ) : (
          <View
            style={[
              styles.inputArea,
              {
                backgroundColor: colors.surface,
                borderTopColor: draftVoiceNote ? 'transparent' : colors.cardBorder,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => setAttachmentPickerVisible(true)}
              activeOpacity={0.7}
              accessibilityLabel="Share media or document"
            >
              <Paperclip size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachBtn}
              onPress={voiceRecorder.startRecording}
              activeOpacity={0.7}
              accessibilityLabel="Record voice note"
            >
              <Mic size={20} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.anonToggleBtn,
                {
                  backgroundColor: isAnonMode ? (isDark ? 'rgba(147, 51, 234, 0.25)' : 'rgba(147, 51, 234, 0.12)') : colors.surfaceLight,
                  borderColor: isAnonMode ? '#a855f7' : colors.cardBorder,
                },
              ]}
              onPress={toggleAnonMode}
              activeOpacity={0.8}
              accessibilityLabel="Toggle anonymous message"
            >
              <Text style={[styles.anonToggleText, { color: isAnonMode ? '#a855f7' : colors.textMuted }]}>
                🎭 {isAnonMode ? 'Anon ON' : 'Anon'}
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.messageInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
              placeholder={
                draftVoiceNote
                  ? 'Add text to send with voice note...'
                  : isAnonMode
                  ? 'Type anonymous message...'
                  : 'Type a message...'
              }
              placeholderTextColor={colors.textMuted}
              value={inputMessage}
              onChangeText={setInputMessage}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!(inputMessage.trim() || draftVoiceNote) || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!(inputMessage.trim() || draftVoiceNote) || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* WhatsApp-Style Media & Document Attachment Drawer */}
        <AttachmentPickerModal
          visible={attachmentPickerVisible}
          onClose={() => setAttachmentPickerVisible(false)}
          onSend={handleSendAttachments}
        />

        {/* Shared Post Viewer Modal */}
        <SharedPostViewerModal
          cardData={selectedPostCard}
          onClose={() => setSelectedPostCard(null)}
        />

        {/* Action Sheet Modal for Message */}
        {actionMessage && (
          <Modal transparent animationType="fade" visible={!!actionMessage} onRequestClose={() => setActionMessage(null)}>
            <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setActionMessage(null)}>
              <View style={styles.actionSheet}>
                {currentUser &&
                  (actionMessage.sender === currentUser.id ||
                    actionMessage.sender_email?.toLowerCase() === currentUser.email?.toLowerCase()) && (
                    <TouchableOpacity
                      style={styles.actionSheetItem}
                      onPress={() => handleUnsendMessage(actionMessage)}
                    >
                      <Trash2 size={18} color="#ef4444" />
                      <Text style={[styles.actionSheetText, { color: '#ef4444' }]}>Unsend for Everyone</Text>
                    </TouchableOpacity>
                  )}

                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => handleDeleteForMe(actionMessage)}
                >
                  <Trash2 size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Delete for Me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => handleCopyMessage(actionMessage)}
                >
                  <Copy size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Copy Text</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* ADD MEMBERS MODAL (Instagram Style) */}
        {activeConv && activeConv.is_group && (
          <AddMembersModal
            visible={addMembersModalVisible}
            title={`Add to ${activeConv.name || 'Group Chat'}`}
            existingMemberIds={(activeConv.members || []).map((m: any) => m.user_id || m.id)}
            onClose={() => setAddMembersModalVisible(false)}
            onAddMembers={handleAddChatMembers}
          />
        )}

        {/* GROUP INVITE LINK MODAL (Instagram Style) */}
        {activeConv && activeConv.is_group && (
          <InviteLinkModal
            visible={inviteLinkModalVisible}
            title={activeConv.name || 'Group Chat'}
            type="CHAT"
            targetIdOrSlug={activeConv.id}
            canReset={true}
            onClose={() => setInviteLinkModalVisible(false)}
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  // ================= INBOX VIEW =================
  const filteredConvs = getFilteredConversations();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.inboxHeader, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Text style={[styles.inboxTitle, { color: colors.textPrimary }]}>Campus Messages</Text>
        <View style={styles.headerBtnGroup}>
          <TouchableOpacity
            style={pendingRequestsCount > 0 ? styles.requestsPillActive : styles.requestsPill}
            onPress={() => setMessageRequestsVisible(true)}
            activeOpacity={0.8}
          >
            <MessageSquare size={13} color={pendingRequestsCount > 0 ? '#fff' : colors.textSecondary} />
            <Text style={pendingRequestsCount > 0 ? styles.requestsPillTextActive : styles.requestsPillText}>
              Requests{pendingRequestsCount > 0 ? ` (${pendingRequestsCount})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.joinLinkPill}
            onPress={() => setJoinViaInviteModalVisible(true)}
            activeOpacity={0.8}
          >
            <Link2 size={13} color={colors.textSecondary} />
            <Text style={styles.joinLinkPillText}>Join Link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ephemeralPill}
            onPress={() => setEphemeralModalVisible(true)}
            activeOpacity={0.8}
          >
            <Flame size={14} color={colors.ephemeralFire} />
            <Text style={styles.ephemeralPillText}>Ephemeral</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => setDirectoryModalVisible(true)}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
        <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search chats or find classmates..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Live Campus Directory search section */}
      {searchQuery.trim().length >= 2 && (
        <View style={styles.directorySection}>
          <Text style={styles.sectionHeader}>Campus Directory</Text>
          {searchingDirectory ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 10 }} />
          ) : directoryResults.length === 0 ? (
            <Text style={styles.noResultsText}>No students matching "{searchQuery}"</Text>
          ) : (
            <FlatList
              data={directoryResults}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.directoryRow}
                  onPress={() => handleStartDirectChat(item)}
                >
                  <View style={styles.directoryAvatar}>
                    <Text style={styles.directoryAvatarText}>
                      {(item.full_name || item.email).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.directoryName, { color: colors.textPrimary }]}>{item.full_name || item.email}</Text>
                    <Text style={[styles.directoryEmail, { color: colors.textSecondary }]}>{item.email}</Text>
                  </View>
                  <Text style={styles.startChatLink}>Chat</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Active Conversations List */}
      {loadingInbox ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredConvs.length === 0 ? (
        <View style={styles.centerBox}>
          <MessageSquare size={40} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>
            Start a direct message with a batchmate or launch an ephemeral group!
          </Text>
          <TouchableOpacity
            style={styles.startChatCta}
            onPress={() => setDirectoryModalVisible(true)}
          >
            <Text style={styles.startChatCtaText}>Find Classmates</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConvs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const name =
              item.name ||
              item.recipient?.full_name ||
              item.recipient?.email?.split('@')[0] ||
              'Campus Student';

            return (
              <TouchableOpacity
                style={[styles.convCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                onPress={() => setActiveConv(item)}
                delayLongPress={450}
                onLongPress={() => setActionConv(item)}
                // @ts-ignore
                onContextMenu={(e: any) => {
                  if (Platform.OS === 'web') {
                    e.preventDefault();
                    setActionConv(item);
                  }
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.convAvatar,
                    item.is_ephemeral && styles.convAvatarEphemeral,
                  ]}
                >
                  <Text style={styles.convAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>

                <View style={styles.convBody}>
                  <View style={styles.convTopRow}>
                    <Text style={[styles.convName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.is_ephemeral ? `🔥 ${name}` : name}
                    </Text>
                    {item.last_message?.created_at && (
                      <Text style={[styles.convTime, { color: colors.textMuted }]}>
                        {new Date(item.last_message.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    )}
                  </View>

                  <View style={styles.convBottomRow}>
                    <Text style={[styles.lastMsg, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.last_message?.text
                        ? item.last_message.text.includes('[CAMPUS_POST_CARD:')
                          ? '📎 Shared a post'
                          : item.last_message.text
                        : 'No messages yet'}
                    </Text>
                    {item.unread_count && item.unread_count > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Direct Action Menu (•••) for Delete / Clear */}
                <TouchableOpacity
                  style={{ padding: 8, marginLeft: 4, justifyContent: 'center', alignItems: 'center' }}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    setActionConv(item);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Conversation options"
                >
                  <MoreVertical size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.convList}
        />
      )}

      {/* Directory Search Modal */}
      <DirectorySearchModal
        visible={directoryModalVisible}
        onClose={() => setDirectoryModalVisible(false)}
        onSelectUser={handleStartDirectChat}
      />

      {/* Ephemeral Group Modal */}
      <EphemeralGroupModal
        visible={ephemeralModalVisible}
        onClose={() => setEphemeralModalVisible(false)}
        onGroupCreated={(conv) => {
          loadInbox();
          setActiveConv(conv);
        }}
      />

      {/* Join By Invite Modal (Instagram Style) */}
      <JoinByInviteModal
        visible={joinViaInviteModalVisible}
        onClose={() => setJoinViaInviteModalVisible(false)}
        onJoinedChat={handleJoinedChatViaInvite}
      />

      {/* Message Requests Modal (Safe Direct Messaging) */}
      <MessageRequestsModal
        visible={messageRequestsVisible}
        onClose={() => setMessageRequestsVisible(false)}
        onOpenConversation={(conv) => setActiveConv(conv)}
        onRequestCountChanged={(count) => setPendingRequestsCount(count)}
      />

      {/* Contextual Conversation Options Modal (Clear / Delete / Cancel) */}
      {actionConv && (
        <Modal
          transparent
          animationType="fade"
          visible={!!actionConv}
          onRequestClose={() => setActionConv(null)}
        >
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setActionConv(null)}
          >
            <View style={styles.actionSheet}>
              <Text
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 8,
                  paddingBottom: 8,
                  color: '#94a3b8',
                  fontSize: 13,
                  fontWeight: '700',
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                  marginBottom: 4,
                }}
                numberOfLines={1}
              >
                {actionConv.name ||
                  actionConv.recipient?.full_name ||
                  actionConv.recipient?.username ||
                  'Conversation Options'}
              </Text>

              {/* Clear Conversation */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => handleClearConversationFromSheet(actionConv)}
              >
                <Trash2 size={18} color="#f59e0b" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetText, { color: '#f59e0b' }]}>Clear Messages</Text>
                </View>
              </TouchableOpacity>

              {/* Delete Conversation */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => handleDeleteConversationFromSheet(actionConv)}
              >
                <Trash2 size={18} color="#ef4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetText, { color: '#ef4444' }]}>Delete Chat</Text>
                </View>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 4 },
                ]}
                onPress={() => setActionConv(null)}
              >
                <X size={18} color="#94a3b8" />
                <Text style={[styles.actionSheetText, { color: '#94a3b8' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  inboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.surface,
  },
  inboxTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  requestsPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  requestsPillText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  requestsPillTextActive: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  joinLinkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 2,
    gap: 4,
  },
  joinLinkPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  ephemeralPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  ephemeralPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  newChatBtn: {
    backgroundColor: colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  directorySection: {
    backgroundColor: colors.surface,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    maxHeight: 200,
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  noResultsText: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingVertical: 6,
  },
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  directoryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  directoryAvatarText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  directoryName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  directoryEmail: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  startChatLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  convList: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  convAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  convAvatarEphemeral: {
    borderColor: colors.ephemeralFire,
  },
  convAvatarText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  convBody: {
    flex: 1,
  },
  convTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convName: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  convTime: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  convBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  lastMsg: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  trashBtn: {
    padding: 6,
    marginLeft: 8,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  startChatCta: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  startChatCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  roomContainer: {
    flex: 1,
    backgroundColor: colors.background,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  roomAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  roomAvatarText: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '700',
  },
  roomMeta: {
    flex: 1,
  },
  roomTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  roomSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  headerActionBtn: {
    padding: 8,
  },
  messagesList: {
    paddingVertical: 12,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachBtn: {
    padding: 8,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 90,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheet: {
    width: '80%',
    maxWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 8,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    gap: 12,
  },
  actionSheetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulsingRedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    gap: 4,
  },
  cancelRecordText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  sendRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#10b981',
    gap: 4,
  },
  sendRecordText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  anonToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  anonToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
