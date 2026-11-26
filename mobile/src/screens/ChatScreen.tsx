import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ScrollView,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
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
import { GroupDetailsModal } from '../components/chat/GroupDetailsModal';
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
import { UserAvatar } from '../components/common/UserAvatar';
import { backHandlerRegistry } from '../services/backHandlerRegistry';
import {
  Search,
  Plus,
  Flame,
  ArrowLeft,
  Trash2,
  Send,
  X,
  MessageSquare,
  Copy,
  Paperclip,
  Mic,
  Link2,
  UserPlus,
  MoreVertical,
  ShieldCheck,
  CornerDownRight,
  Share2,
} from 'lucide-react-native';

interface ChatScreenProps {
  currentUser?: any;
  canParticipate?: boolean;
  onRequireVerify?: (reason?: string) => void;
  initialConversation?: Conversation | null;
  onClearInitialConversation?: () => void;
  onOpenProfile?: (userId: number) => void;
  onStartCall?: (receiverId: number, receiverName: string, callType: any) => Promise<void> | void;
}

const extractApiError = (err: any, fallback: string): string => {
  const data = err?.response?.data;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  if (typeof data === 'string' && data.trim()) return data;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return fallback;
};

const MASCOTS = [
  { name: '🦉 Night Owl', icon: '🦉' },
  { name: '🐅 Brave Tiger', icon: '🐅' },
  { name: '👻 Campus Ghost', icon: '👻' },
  { name: '🥷 Stealth Ninja', icon: '🥷' },
  { name: '🦅 High Falcon', icon: '🦅' },
];

export const ChatScreen: React.FC<ChatScreenProps> = ({
  currentUser,
  canParticipate = true,
  onRequireVerify,
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
  const [checkingRequestStatus, setCheckingRequestStatus] = useState(false);

  // Chat Mode: NORMAL (Direct Chats) vs ANONYMOUS (7-Day Fading Ghost Chats)
  const [chatMode, setChatMode] = useState<'NORMAL' | 'ANONYMOUS'>('NORMAL');
  const [chosenMascot, setChosenMascot] = useState<string>('🦉 Night Owl');

  // Inline feedback banners (visible on both Web & Native)
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);

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
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardingConvId, setForwardingConvId] = useState<string | null>(null);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);

  // Live Voice Note Recording & Draft State (Instagram style)
  const [draftVoiceNote, setDraftVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const voiceRecorder = useVoiceRecorder({
    onFallbackNative: () => setAttachmentPickerVisible(true),
  });

  // Group Invite & Add Members Modals (Instagram Style)
  const [addMembersModalVisible, setAddMembersModalVisible] = useState(false);
  const [inviteLinkModalVisible, setInviteLinkModalVisible] = useState(false);
  const [joinViaInviteModalVisible, setJoinViaInviteModalVisible] = useState(false);

  // Group Details & Shared Media Modal
  const [groupDetailsModalVisible, setGroupDetailsModalVisible] = useState(false);

  // In-Chat Search State (Legacy search function for notes & texts)
  const [isSearchingInChat, setIsSearchingInChat] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  const flatListRef = useRef<FlatList>(null);

  const recipientReplied = messages.some(
    (m) =>
      currentUser &&
      m.sender !== currentUser.id &&
      (!m.sender_email || m.sender_email.toLowerCase() !== currentUser.email?.toLowerCase())
  );
  const isRequestPending = Boolean(
    activeConv && !activeConv.is_group && activeConv.is_request_pending && !recipientReplied
  );

  // Initial load
  useEffect(() => {
    loadInbox();
  }, []);

  // Back button handling in ChatScreen: Step back from active conversation to inbox, or close open modals
  useEffect(() => {
    if (activeConv) {
      backHandlerRegistry.push('chat-active-conv', () => {
        setActiveConv(null);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-active-conv');
    }
  }, [activeConv]);

  useEffect(() => {
    if (directoryModalVisible) {
      backHandlerRegistry.push('chat-directory-modal', () => {
        setDirectoryModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-directory-modal');
    }
  }, [directoryModalVisible]);

  useEffect(() => {
    if (ephemeralModalVisible) {
      backHandlerRegistry.push('chat-ephemeral-modal', () => {
        setEphemeralModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-ephemeral-modal');
    }
  }, [ephemeralModalVisible]);

  useEffect(() => {
    if (messageRequestsVisible) {
      backHandlerRegistry.push('chat-requests-modal', () => {
        setMessageRequestsVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-requests-modal');
    }
  }, [messageRequestsVisible]);

  useEffect(() => {
    if (addMembersModalVisible) {
      backHandlerRegistry.push('chat-add-members-modal', () => {
        setAddMembersModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-add-members-modal');
    }
  }, [addMembersModalVisible]);

  useEffect(() => {
    if (inviteLinkModalVisible) {
      backHandlerRegistry.push('chat-invite-link-modal', () => {
        setInviteLinkModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-invite-link-modal');
    }
  }, [inviteLinkModalVisible]);

  useEffect(() => {
    if (joinViaInviteModalVisible) {
      backHandlerRegistry.push('chat-join-invite-modal', () => {
        setJoinViaInviteModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-join-invite-modal');
    }
  }, [joinViaInviteModalVisible]);

  useEffect(() => {
    if (groupDetailsModalVisible) {
      backHandlerRegistry.push('chat-group-details-modal', () => {
        setGroupDetailsModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-group-details-modal');
    }
  }, [groupDetailsModalVisible]);

  useEffect(() => {
    if (attachmentPickerVisible) {
      backHandlerRegistry.push('chat-attachment-modal', () => {
        setAttachmentPickerVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('chat-attachment-modal');
    }
  }, [attachmentPickerVisible]);

  useEffect(() => {
    if (initialConversation) {
      setActiveConv(initialConversation);
      if (onClearInitialConversation) onClearInitialConversation();
    }
  }, [initialConversation]);

  // Clean up active voice recording/playback & banners when switching conversations
  useEffect(() => {
    voiceRecorder.cancelRecording();
    setDraftVoiceNote(null);
    setDeliveryError(null);
    setRoomNotice(null);
    pauseAllActiveVoiceNotes();
  }, [activeConv?.id]);

  // Load messages when conversation id changes
  useEffect(() => {
    const convId = activeConv?.id;
    if (convId) {
      loadMessages(convId);
      const pollTimer = setInterval(() => {
        loadMessages(convId, true);
      }, 3500);
      return () => {
        clearInterval(pollTimer);
        pauseAllActiveVoiceNotes();
      };
    }
  }, [activeConv?.id]);

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

  const loadInbox = async (modeOverride?: 'NORMAL' | 'ANONYMOUS'): Promise<Conversation[]> => {
    try {
      setLoadingInbox(true);
      const activeMode = modeOverride || chatMode;
      const data: any = await chatService.getInbox(activeMode);
      const list: Conversation[] = data.results || (Array.isArray(data) ? data : []);
      setConversations(list);
      if (data.pending_requests_count !== undefined) {
        setPendingRequestsCount(data.pending_requests_count);
      }
      setActiveConv((prev) => {
        if (!prev) return prev;
        const fresh = list.find((c) => String(c.id) === String(prev.id));
        if (!fresh) return prev;
        return { ...prev, ...fresh };
      });
      return list;
    } catch (e) {
      console.log('Error loading inbox', e);
      return [];
    } finally {
      setLoadingInbox(false);
    }
  };

  // Automatically refresh chats on app switch or tab return
  useAutoRefresh(loadInbox, 20000);

  const handleToggleChatMode = (newMode: 'NORMAL' | 'ANONYMOUS') => {
    if (newMode === 'ANONYMOUS') {
      if (!canParticipate) {
        onRequireVerify?.('Verify your campus ID first to chat anonymously.');
        return;
      }
      if (currentUser?.verification_tier !== 'FULLY_VERIFIED') {
        const msg =
          'Anonymous messaging is exclusive to Green-Verified students. Please verify your student ID.';
        setInboxError(msg);
        if (Platform.OS !== 'web') {
          Alert.alert('Green Badge Required', msg);
        }
        return;
      }
    }
    setInboxError(null);
    setChatMode(newMode);
    loadInbox(newMode);
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

  const handleCheckRequestStatus = async () => {
    if (!activeConv || checkingRequestStatus) return;
    setCheckingRequestStatus(true);
    try {
      const list = await loadInbox();
      await loadMessages(activeConv.id, true);
      const fresh = list.find((c) => String(c.id) === String(activeConv.id));
      if (fresh && !fresh.is_request_pending) {
        setDeliveryError(null);
        setRoomNotice('Message request accepted! You can chat freely now.');
      } else {
        setRoomNotice('Still pending acceptance.');
      }
    } finally {
      setCheckingRequestStatus(false);
    }
  };

  const handleAddChatMembers = async (selectedIds: number[]) => {
    if (!activeConv) return;
    await chatService.addMembers(activeConv.id, selectedIds);
    await loadMessages(activeConv.id);
    await loadInbox();
    setRoomNotice(`Added ${selectedIds.length} member(s) to the group.`);
    if (Platform.OS !== 'web') {
      Alert.alert('Success', `Added ${selectedIds.length} members to the group.`);
    }
  };

  const handleJoinedChatViaInvite = async (conv: any) => {
    await loadInbox();
    setActiveConv(conv);
  };

  const isVerifyRequiredErr = (err: any) =>
    err?.response?.status === 403 || err?.response?.data?.code === 'CAMPUS_VERIFICATION_REQUIRED';

  const handleSendRecordedVoiceNow = async () => {
    if (!canParticipate) {
      await voiceRecorder.cancelRecording();
      onRequireVerify?.('Verify your campus ID or enter an invite code to send voice notes.');
      return;
    }
    const recorded = await voiceRecorder.stopRecording();
    if (!recorded || !activeConv) return;
    if (isRequestPending) {
      setDeliveryError('Waiting for recipient to accept your message request.');
      return;
    }
    const typedCaption = inputMessage.trim();
    if (typedCaption) {
      setInputMessage('');
    }
    await handleSendAttachments([recorded], typedCaption);
  };

  const handleAttachRecordedVoiceToDraft = async () => {
    const recorded = await voiceRecorder.stopRecording();
    if (!recorded) return;
    setDeliveryError(null);
    setDraftVoiceNote(recorded);
  };

  const getChatReplyPreviewText = (msg: Message) => {
    const clean = (msg.text || '').trim();
    if (clean.startsWith('[CAMPUS_POST_CARD:')) return '📌 Shared Post';
    if (clean) return clean;
    const atts = msg.attachments || [];
    if (atts.some((a) => a.file_type === 'AUDIO')) return '🎙️ Voice Note';
    if (atts.some((a) => a.file_type === 'VIDEO')) return '🎬 Video';
    if (atts.some((a) => a.file_type === 'IMAGE')) return '🖼️ Photo';
    if (atts.length > 0 || msg.attachment) return '📄 Document';
    return 'Attachment';
  };

  const handleSendMessage = async () => {
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID or enter an invite code to send messages.');
      return;
    }
    if (!activeConv || sending) return;
    const rawText = inputMessage.trim();
    if (!rawText && !draftVoiceNote) return;

    setDeliveryError(null);
    setRoomNotice(null);

    if (draftVoiceNote) {
      const voiceToSend = draftVoiceNote;
      setDraftVoiceNote(null);
      setInputMessage('');
      await handleSendAttachments([voiceToSend], rawText);
      return;
    }

    const activeReply = replyToMessage;
    setReplyToMessage(null);
    let textToSend = rawText;
    setInputMessage('');

    const isConvAnon = Boolean(activeConv.is_anonymous);
    const isOutAnon = Boolean(activeConv.is_anonymous_sender || activeConv.recipient?.is_outgoing_anonymous);
    const mySenderName = isConvAnon
      ? isOutAnon
        ? `You (${activeConv.anonymous_alias || chosenMascot || 'Mascot'})`
        : (currentUser?.full_name || 'You')
      : (currentUser?.full_name || 'You');

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: Message = {
      id: tempId as any,
      conversation: activeConv.id as any,
      sender: currentUser?.id,
      sender_name: mySenderName,
      sender_email: currentUser?.email || '',
      reply_to: activeReply ? activeReply.id : null,
      reply_to_preview: activeReply
        ? {
            id: activeReply.id,
            sender_name: activeReply.sender_name || 'Student',
            text: getChatReplyPreviewText(activeReply),
          }
        : null,
      text: textToSend,
      attachments: [],
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending' as any,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      setSending(true);
      const sent = await chatService.sendMessage(activeConv.id, textToSend, {
        reply_to: activeReply ? activeReply.id : undefined,
      });
      setMessages((prev) => upsertMessageUnique(prev, sent, tempId));
    } catch (e: any) {
      if (isVerifyRequiredErr(e)) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInputMessage(rawText);
        onRequireVerify?.(extractApiError(e, 'Campus verification required to send messages.'));
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m)));
      const errMsg = extractApiError(e, 'Could not deliver message.');
      setRoomNotice(null);
      setDeliveryError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Delivery Failed', errMsg);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendAttachments = async (staged: StagedAttachment[], caption: string) => {
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID or enter an invite code to share attachments.');
      return;
    }
    if (!activeConv) return;
    setDeliveryError(null);
    setRoomNotice(null);
    const activeReply = replyToMessage;
    setReplyToMessage(null);
    const tempId = `temp_att_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let finalCaption = (caption || '').trim();

    const isConvAnon = Boolean(activeConv.is_anonymous);
    const isOutAnon = Boolean(activeConv.is_anonymous_sender || activeConv.recipient?.is_outgoing_anonymous);
    const mySenderName = isConvAnon
      ? isOutAnon
        ? `You (${activeConv.anonymous_alias || chosenMascot || 'Mascot'})`
        : (currentUser?.full_name || 'You')
      : (currentUser?.full_name || 'You');

    const optimisticMsg: Message = {
      id: tempId as any,
      conversation: activeConv.id as any,
      sender: currentUser?.id,
      sender_name: mySenderName,
      sender_email: currentUser?.email || '',
      reply_to: activeReply ? activeReply.id : null,
      reply_to_preview: activeReply
        ? {
            id: activeReply.id,
            sender_name: activeReply.sender_name || 'Student',
            text: getChatReplyPreviewText(activeReply),
          }
        : null,
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
      setSending(true);
      const filesToSend = staged.map((item) => ({
        file: item.file,
        uri: item.uri,
        name: item.name,
        type: item.mimeType || (item.type === 'IMAGE' ? 'image/jpeg' : (item.type === 'AUDIO' ? 'audio/webm' : (item.type === 'VIDEO' ? 'video/mp4' : 'application/octet-stream'))),
      }));
      const sent = await chatService.sendMessageWithAttachments(
        activeConv.id,
        finalCaption,
        filesToSend,
        undefined,
        { reply_to: activeReply ? activeReply.id : undefined }
      );
      setMessages((prev) => upsertMessageUnique(prev, sent, tempId));
    } catch (err: any) {
      if (isVerifyRequiredErr(err)) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        onRequireVerify?.(extractApiError(err, 'Campus verification required to share files.'));
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m)));
      const errStatus = err?.response?.data?.status;
      const errMsg = extractApiError(err, 'Could not send attachments.');
      if (err?.response?.status === 403 && errStatus === 'MESSAGE_REQUEST_PENDING') {
        setActiveConv((prev) => (prev ? { ...prev, is_request_pending: true } : prev));
      }
      setRoomNotice(null);
      setDeliveryError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Upload Failed', errMsg);
      }
    } finally {
      setSending(false);
    }
  };

  const handleStartDirectChat = async (user: any) => {
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID or enter an invite code to message classmates.');
      return;
    }
    setInboxError(null);
    try {
      setDirectoryModalVisible(false);
      setSearchQuery('');
      setDirectoryResults([]);
      const isAnon = chatMode === 'ANONYMOUS';
      const conv = await chatService.startDirectChat(
        user.email || user.username || String(user.id),
        isAnon,
        isAnon ? chosenMascot : undefined
      );
      await loadInbox(chatMode);
      setActiveConv(conv);
    } catch (e: any) {
      if (isVerifyRequiredErr(e)) {
        onRequireVerify?.(extractApiError(e, 'Campus verification required to start chats.'));
        return;
      }
      const errMsg = extractApiError(e, 'Could not start conversation.');
      setInboxError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    }
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
        setInboxError('Could not clear chat history.');
        if (Platform.OS !== 'web') {
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
        setInboxError('Could not delete conversation.');
        if (Platform.OS !== 'web') {
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
    if (msg.status === 'failed' || String(msg.id).startsWith('temp_')) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      return;
    }
    try {
      await chatService.unsendMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Could not unsend message.');
      setDeliveryError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    }
  };

  const handleDeleteForMe = async (msg: Message) => {
    setActionMessage(null);
    if (msg.status === 'failed' || String(msg.id).startsWith('temp_')) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      return;
    }
    try {
      await chatService.deleteMessageForMe(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Could not remove message.');
      setDeliveryError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    }
  };

  const handleCopyMessage = (msg: Message) => {
    setActionMessage(null);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(msg.text || '');
    }
    setRoomNotice('Message copied to clipboard.');
    if (Platform.OS !== 'web') {
      Alert.alert('Copied', 'Message text copied to clipboard.');
    }
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

    const handleJumpToMessage = (messageId: string) => {
      const idx = messages.findIndex((m) => String(m.id) === String(messageId));
      if (idx !== -1 && flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        } catch {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }
    };

    // Filter messages when user searches inside the active conversation
    const displayedMessages = messages.filter((m) => {
      if (!chatSearchQuery.trim()) return true;
      const q = chatSearchQuery.trim().toLowerCase();
      if (m.text && m.text.toLowerCase().includes(q)) return true;
      if (m.sender_name && m.sender_name.toLowerCase().includes(q)) return true;
      if (
        m.attachments &&
        m.attachments.some(
          (a) =>
            (a.file_name && a.file_name.toLowerCase().includes(q)) ||
            (a.caption && a.caption.toLowerCase().includes(q))
        )
      )
        return true;
      return false;
    });

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
              setIsSearchingInChat(false);
              setChatSearchQuery('');
              loadInbox();
            }}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => setGroupDetailsModalVisible(true)}
            activeOpacity={0.7}
          >
            <UserAvatar
              uri={
                !activeConv.is_group
                  ? activeConv.recipient?.avatar || activeConv.recipient?.profile_picture
                  : undefined
              }
              name={roomTitle}
              size={36}
              borderWidth={1}
              borderColor={colors.cardBorder}
              backgroundColor={
                isDark ? 'rgba(0, 112, 243, 0.22)' : 'rgba(0, 102, 204, 0.12)'
              }
              textColor={colors.primary}
              style={{ marginRight: 10 }}
            />

            <View style={styles.roomMeta}>
              <Text style={[styles.roomTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {roomTitle}
              </Text>
              <Text style={[styles.roomSubtitle, { color: colors.textSecondary }]}>
                {activeConv.is_ephemeral
                  ? `Self-destructing (${activeConv.duration || 24}h)`
                  : activeConv.is_group
                  ? 'Campus Group • Tap for Info & Media'
                  : 'Direct Message • Tap for Info & Media'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Header Action Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Search in Chat Button */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => {
                setIsSearchingInChat((prev) => !prev);
                if (isSearchingInChat) setChatSearchQuery('');
              }}
              accessibilityLabel="Search in chat"
            >
              <Search size={18} color={isSearchingInChat ? colors.primary : colors.textSecondary} />
            </TouchableOpacity>

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

        {/* In-Chat Search Bar (Legacy Chat Search for Notes/Texts) */}
        {isSearchingInChat && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: isDark ? colors.surfaceLight : '#f1f5f9',
              borderBottomWidth: 1,
              borderBottomColor: colors.cardBorder,
              gap: 8,
            }}
          >
            <Search size={15} color={colors.textMuted} />
            <TextInput
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.textPrimary,
                paddingVertical: 3,
              }}
              placeholder="Search chat notes, assignments, topics..."
              placeholderTextColor={colors.textTertiary}
              value={chatSearchQuery}
              onChangeText={setChatSearchQuery}
              autoFocus
            />
            {chatSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setChatSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Search match indicator */}
        {isSearchingInChat && chatSearchQuery.trim().length > 0 && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 4,
              backgroundColor: isDark ? 'rgba(94, 106, 210, 0.15)' : 'rgba(94, 106, 210, 0.08)',
              borderBottomWidth: 1,
              borderBottomColor: colors.cardBorder,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>
              Showing {displayedMessages.length} match(es) for &quot;{chatSearchQuery}&quot;
            </Text>
          </View>
        )}

        {/* Message List */}
        {loadingMessages ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={displayedMessages}
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
                  onSwipeReply={(m) => setReplyToMessage(m)}
                  onPress={(m) => {
                    if (m.status === 'failed') {
                      setActionMessage(m);
                    }
                  }}
                  onLongPress={(m) => setActionMessage(m)}
                  onPostCardPress={(card) => setSelectedPostCard(card)}
                  onSenderPress={onOpenProfile}
                  onForward={(m) => setForwardMessage(m)}
                />
              );
            }}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Pending Message Request Lock Banner */}
        {isRequestPending && (
          <View
            style={[
              styles.pendingRequestBanner,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
                borderTopColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#fde68a',
              },
            ]}
          >
            <Text style={[styles.pendingRequestText, { color: colors.warning }]}>
              ⏳ Message request pending — waiting for {roomTitle} to accept before you can send follow-ups.
            </Text>
            <TouchableOpacity
              style={[
                styles.checkStatusBtn,
                {
                  backgroundColor: isDark ? '#141516' : '#ffffff',
                  borderColor: colors.warning,
                },
              ]}
              onPress={handleCheckRequestStatus}
              disabled={checkingRequestStatus}
              activeOpacity={0.8}
            >
              {checkingRequestStatus ? (
                <ActivityIndicator size="small" color={colors.warning} />
              ) : (
                <Text style={[styles.checkStatusText, { color: colors.warning }]}>Check</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Inline Delivery Error Banner */}
        {deliveryError && (
          <View
            style={[
              styles.roomFeedbackBanner,
              {
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
                borderTopColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#fecaca',
              },
            ]}
          >
            <Text style={[styles.roomFeedbackText, { color: colors.danger }]} numberOfLines={3}>
              ⚠️ {deliveryError}
            </Text>
            <TouchableOpacity onPress={() => setDeliveryError(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <X size={14} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}

        {/* Inline Notice Banner */}
        {roomNotice && (
          <View
            style={[
              styles.roomFeedbackBanner,
              {
                backgroundColor: isDark ? 'rgba(39, 166, 68, 0.14)' : '#f0fdf4',
                borderTopColor: isDark ? 'rgba(39, 166, 68, 0.35)' : '#bbf7d0',
              },
            ]}
          >
            <Text style={[styles.roomFeedbackText, { color: colors.success }]} numberOfLines={2}>
              ✓ {roomNotice}
            </Text>
            <TouchableOpacity onPress={() => setRoomNotice(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <X size={14} color={colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* Anonymous Mode Active Indicator Banner */}
        {chatMode === 'ANONYMOUS' && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: isDark ? 'rgba(147, 51, 234, 0.15)' : 'rgba(147, 51, 234, 0.08)',
              borderTopWidth: 1,
              borderColor: 'rgba(147, 51, 234, 0.25)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 11, color: isDark ? '#c084fc' : '#7e22ce', fontWeight: '600', flex: 1 }}>
              🎭 Anonymous DM Active • Your real name is hidden.
            </Text>
            <TouchableOpacity onPress={() => handleToggleChatMode('NORMAL')}>
              <X size={14} color={isDark ? '#c084fc' : '#7e22ce'} />
            </TouchableOpacity>
          </View>
        )}

        {/* Docked Voice Note Draft Preview (allows typing + voice note together) */}
        {draftVoiceNote && !voiceRecorder.isRecording && (
          <View
            style={{
              paddingHorizontal: 10,
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

        {/* Quoted Reply Banner */}
        {replyToMessage && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: colors.surfaceLight,
              borderTopWidth: 1,
              borderTopColor: colors.cardBorder,
              borderLeftWidth: 4,
              borderLeftColor: colors.primary,
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CornerDownRight size={13} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }} numberOfLines={1}>
                  Replying to {replyToMessage.sender_name || 'Student'}
                </Text>
              </View>
              <Text style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                {getChatReplyPreviewText(replyToMessage)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReplyToMessage(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              <X size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Message Input Bar, Voice Bar, or Read-Only Verification CTA */}
        {!canParticipate ? (
          <View
            style={[
              styles.inputArea,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.cardBorder,
                justifyContent: 'space-between',
                paddingVertical: 10,
                paddingHorizontal: 14,
              },
            ]}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                Verify your campus ID or invite code to send messages.
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}
              onPress={() => onRequireVerify?.('Verify your campus ID or enter an invite code to send messages.')}
            >
              <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '700' }}>Verify ID</Text>
            </TouchableOpacity>
          </View>
        ) : voiceRecorder.isRecording ? (
          <View
            style={{
              paddingHorizontal: 8,
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
              style={[
                styles.attachBtn,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.cardBorder,
                },
              ]}
              onPress={() => setAttachmentPickerVisible(true)}
              activeOpacity={0.7}
              accessibilityLabel="Share media or document"
            >
              <Paperclip size={17} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.attachBtn,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.cardBorder,
                },
              ]}
              onPress={() => voiceRecorder.startRecording()}
              activeOpacity={0.7}
              accessibilityLabel="Record voice note"
            >
              <Mic size={17} color={colors.primary} />
            </TouchableOpacity>

            <TextInput
              style={[
                styles.messageInput,
                {
                  backgroundColor: colors.surfaceLight,
                  color: colors.textPrimary,
                  borderColor: colors.cardBorder,
                },
              ]}
              placeholder={
                draftVoiceNote
                  ? 'Add text to voice note...'
                  : 'Type a message...'
              }
              placeholderTextColor={colors.textMuted}
              value={inputMessage}
              onChangeText={(txt) => {
                setInputMessage(txt);
                if (deliveryError) setDeliveryError(null);
              }}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: colors.primary },
                (!(inputMessage.trim() || draftVoiceNote) || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!(inputMessage.trim() || draftVoiceNote) || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Send size={16} color={colors.onPrimary} />
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
            <TouchableOpacity
              style={[styles.menuBackdrop, { backgroundColor: colors.modalOverlay }]}
              activeOpacity={1}
              onPress={() => setActionMessage(null)}
            >
              <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                {(() => {
                  const isTempOrFailed =
                    actionMessage.status === 'failed' || String(actionMessage.id).startsWith('temp_');
                  const isSenderMe =
                    currentUser &&
                    (actionMessage.sender === currentUser.id ||
                      actionMessage.sender_email?.toLowerCase() === currentUser.email?.toLowerCase());

                  return (
                    <>
                      {actionMessage.status === 'failed' && (
                        <Text
                          style={{
                            paddingHorizontal: 18,
                            paddingTop: 6,
                            paddingBottom: 8,
                            color: colors.danger,
                            fontSize: 12,
                            fontWeight: '700',
                            borderBottomWidth: 1,
                            borderBottomColor: colors.hairline,
                            marginBottom: 4,
                          }}
                        >
                          Message failed to deliver
                        </Text>
                      )}

                      {!isTempOrFailed && (
                        <TouchableOpacity
                          style={styles.actionSheetItem}
                          onPress={() => {
                            const target = actionMessage;
                            setActionMessage(null);
                            if (target) setReplyToMessage(target);
                          }}
                        >
                          <CornerDownRight size={18} color={colors.primary} />
                          <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Reply</Text>
                        </TouchableOpacity>
                      )}

                      {!isTempOrFailed && !actionMessage.is_unsent && (
                        <TouchableOpacity
                          style={styles.actionSheetItem}
                          onPress={() => {
                            const target = actionMessage;
                            setActionMessage(null);
                            if (target) setForwardMessage(target);
                          }}
                        >
                          <Share2 size={18} color={colors.primary} />
                          <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Forward / Share</Text>
                        </TouchableOpacity>
                      )}

                      {isSenderMe && !isTempOrFailed && (
                        <TouchableOpacity
                          style={styles.actionSheetItem}
                          onPress={() => handleUnsendMessage(actionMessage)}
                        >
                          <Trash2 size={18} color={colors.danger} />
                          <Text style={[styles.actionSheetText, { color: colors.danger }]}>Unsend for Everyone</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.actionSheetItem}
                        onPress={() => handleDeleteForMe(actionMessage)}
                      >
                        <Trash2 size={18} color={colors.textSecondary} />
                        <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>
                          {isTempOrFailed ? 'Remove Failed Message' : 'Delete for Me'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionSheetItem}
                        onPress={() => handleCopyMessage(actionMessage)}
                      >
                        <Copy size={18} color={colors.textSecondary} />
                        <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Copy Text</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* FORWARD / SHARE MESSAGE OR MEDIA MODAL */}
        {forwardMessage && (
          <Modal
            transparent
            animationType="slide"
            visible={!!forwardMessage}
            onRequestClose={() => setForwardMessage(null)}
          >
            <TouchableOpacity
              style={[styles.menuBackdrop, { backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' }]}
              activeOpacity={1}
              onPress={() => setForwardMessage(null)}
            >
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 24,
                  maxHeight: '72%',
                  width: '100%',
                  maxWidth: 680,
                  alignSelf: 'center',
                  borderTopWidth: 1,
                  borderTopColor: colors.cardBorder,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
                    Forward to Chat
                  </Text>
                  <TouchableOpacity onPress={() => setForwardMessage(null)}>
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {conversations.map((conv) => {
                    const targetName = conv.is_group
                      ? conv.name || 'Group Chat'
                      : conv.recipient?.full_name || conv.recipient?.username || 'Campus Peer';
                    const isBusy = forwardingConvId === String(conv.id);
                    return (
                      <TouchableOpacity
                        key={conv.id}
                        disabled={!!forwardingConvId}
                        onPress={async () => {
                          setForwardingConvId(String(conv.id));
                          try {
                            const attIds = (forwardMessage.attachments || []).map((a) => String(a.id)).filter(Boolean);
                            const fwdText = forwardMessage.text?.trim() || (attIds.length > 0 ? '' : 'Shared media');
                            await chatService.sendMessage(conv.id, fwdText, false, '', attIds);
                            setForwardMessage(null);
                            setRoomNotice(`Forwarded to ${targetName}`);
                            setTimeout(() => setRoomNotice(null), 2200);
                          } catch {
                            setDeliveryError('Could not forward message to selected chat.');
                          } finally {
                            setForwardingConvId(null);
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.hairline,
                          gap: 10,
                        }}
                      >
                        <UserAvatar
                          uri={!conv.is_group ? conv.recipient?.avatar || conv.recipient?.profile_picture : undefined}
                          name={targetName}
                          size={34}
                        />
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                          {targetName}
                        </Text>
                        <View
                          style={{
                            backgroundColor: colors.primary,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 12,
                          }}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={colors.onPrimary} />
                          ) : (
                            <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '700' }}>Send</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* ADD MEMBERS MODAL */}
        {activeConv && activeConv.is_group && (
          <AddMembersModal
            visible={addMembersModalVisible}
            title={`Add to ${activeConv.name || 'Group Chat'}`}
            existingMemberIds={(activeConv.members || []).map((m: any) => m.user_id || m.id)}
            onClose={() => setAddMembersModalVisible(false)}
            onAddMembers={handleAddChatMembers}
          />
        )}

        {/* GROUP INVITE LINK MODAL */}
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

        {/* GROUP DETAILS & SHARED MEDIA MODAL */}
        {activeConv && (
          <GroupDetailsModal
            visible={groupDetailsModalVisible}
            conversation={activeConv}
            messages={messages}
            currentUser={currentUser}
            onClose={() => setGroupDetailsModalVisible(false)}
            onAddMembersPress={() => setAddMembersModalVisible(true)}
            onInviteLinkPress={() => setInviteLinkModalVisible(true)}
            onPostCardPress={(card) => setSelectedPostCard(card)}
            onJumpToMessage={handleJumpToMessage}
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
        <Text style={[styles.inboxTitle, { color: colors.textPrimary }]}>Messages</Text>
        <View style={styles.headerBtnGroup}>
          <TouchableOpacity
            style={[
              styles.requestsPill,
              pendingRequestsCount > 0
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
            ]}
            onPress={() => setMessageRequestsVisible(true)}
            activeOpacity={0.8}
          >
            <MessageSquare size={13} color={pendingRequestsCount > 0 ? '#ffffff' : colors.textSecondary} />
            <Text
              style={[
                styles.requestsPillText,
                { color: pendingRequestsCount > 0 ? '#ffffff' : colors.textSecondary },
              ]}
            >
              Requests{pendingRequestsCount > 0 ? ` (${pendingRequestsCount})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.joinLinkPill,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
            ]}
            onPress={() => {
              if (!canParticipate) {
                onRequireVerify?.('Verify your campus ID or enter an invite code to join group chats.');
                return;
              }
              setJoinViaInviteModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Link2 size={13} color={colors.textSecondary} />
            <Text style={[styles.joinLinkPillText, { color: colors.textSecondary }]}>Join</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.ephemeralPill,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
            ]}
            onPress={() => {
              if (!canParticipate) {
                onRequireVerify?.('Verify your campus ID or enter an invite code to launch ephemeral rooms.');
                return;
              }
              setEphemeralModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Flame size={13} color={colors.ephemeralFire} />
            <Text style={[styles.ephemeralPillText, { color: colors.textSecondary }]}>Ephemeral</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.newChatBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!canParticipate) {
                onRequireVerify?.('Verify your campus ID or enter an invite code to message classmates.');
                return;
              }
              setDirectoryModalVisible(true);
            }}
            activeOpacity={0.8}
            accessibilityLabel="New message"
          >
            <Plus size={17} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Inbox Mode Switcher: Direct Chats vs Anonymous Mode */}
      <View style={[styles.modeTabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={[
            styles.modeTab,
            chatMode === 'NORMAL' && [styles.modeTabActive, { borderColor: colors.primary, backgroundColor: isDark ? '#18181b' : '#f1f5f9' }],
          ]}
          onPress={() => handleToggleChatMode('NORMAL')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.modeTabText,
              { color: chatMode === 'NORMAL' ? colors.textPrimary : colors.textMuted },
              chatMode === 'NORMAL' && { fontWeight: '700' },
            ]}
          >
            💬 Direct Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            chatMode === 'ANONYMOUS' && [styles.modeTabActive, { borderColor: '#a855f7', backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.08)' }],
          ]}
          onPress={() => handleToggleChatMode('ANONYMOUS')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.modeTabText,
              { color: chatMode === 'ANONYMOUS' ? (isDark ? '#c084fc' : '#9333ea') : colors.textMuted },
              chatMode === 'ANONYMOUS' && { fontWeight: '700' },
            ]}
          >
            🎭 Anonymous (7D)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mascot Selector Bar when Anonymous Mode is Active */}
      {chatMode === 'ANONYMOUS' && (
        <View style={[styles.anonBarContainer, { backgroundColor: isDark ? '#0e0b14' : '#faf5ff', borderBottomColor: isDark ? '#2e1065' : '#f3e8ff' }]}>
          <View style={styles.anonBannerHeader}>
            <Text style={[styles.anonBannerTitle, { color: isDark ? '#e9d5ff' : '#6b21a8' }]}>
              🎭 Ghost Incognito Active · 7-Day Auto-Fade
            </Text>
            <Text style={[styles.anonBannerSub, { color: colors.textMuted }]}>
              Choose your mascot identity before searching and pinging:
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mascotScroll}>
            {MASCOTS.map((m) => {
              const selected = chosenMascot === m.name;
              return (
                <TouchableOpacity
                  key={m.name}
                  style={[
                    styles.mascotChip,
                    {
                      backgroundColor: selected ? (isDark ? '#581c87' : '#e9d5ff') : (isDark ? '#1c1917' : '#ffffff'),
                      borderColor: selected ? '#a855f7' : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setChosenMascot(m.name)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.mascotText, { color: selected ? (isDark ? '#ffffff' : '#581c87') : colors.textSecondary }]}>
                    {m.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!canParticipate && (
        <TouchableOpacity
          style={[
            styles.readOnlyBanner,
            {
              backgroundColor: isDark ? '#141516' : '#f1f5f9',
              borderColor: colors.cardBorder,
            },
          ]}
          onPress={() => onRequireVerify?.('Verify your Campus ID or enter an invite code to message classmates.')}
          activeOpacity={0.85}
        >
          <ShieldCheck size={16} color={colors.primary} />
          <Text style={[styles.readOnlyBannerText, { color: colors.textSecondary }]}>
            Read-only mode — verify your Campus ID or enter an invite code to message classmates.
          </Text>
          <Text style={[styles.readOnlyBannerCta, { color: colors.primary }]}>Verify</Text>
        </TouchableOpacity>
      )}

      {/* Inbox Error Banner */}
      {inboxError && (
        <View
          style={[
            styles.inboxErrorBanner,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#fecaca',
            },
          ]}
        >
          <Text style={[styles.roomFeedbackText, { color: colors.danger }]}>⚠️ {inboxError}</Text>
          <TouchableOpacity onPress={() => setInboxError(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <X size={14} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Search Input Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
        <Search size={17} color={colors.textSecondary} style={{ marginRight: 8 }} />
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
        <View style={[styles.directorySection, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Campus Directory</Text>
          {searchingDirectory ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 10 }} />
          ) : directoryResults.length === 0 ? (
            <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>No students matching "{searchQuery}"</Text>
          ) : (
            <FlatList
              data={directoryResults}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.directoryRow, { borderBottomColor: colors.hairline }]}
                  onPress={() => handleStartDirectChat(item)}
                >
                  <UserAvatar
                    uri={item.avatar || item.profile_picture}
                    name={item.full_name || item.email}
                    size={34}
                    borderWidth={1}
                    borderColor={colors.cardBorder}
                    backgroundColor={colors.surfaceLight}
                    textColor={colors.textSecondary}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.directoryName, { color: colors.textPrimary }]}>{item.full_name || item.email}</Text>
                    <Text style={[styles.directoryEmail, { color: colors.textSecondary }]}>{item.email}</Text>
                  </View>
                  <Text style={[styles.startChatLink, { color: colors.primary }]}>Chat</Text>
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
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            Start a direct message with a batchmate or launch an ephemeral group!
          </Text>
          <TouchableOpacity
            style={[styles.startChatCta, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!canParticipate) {
                onRequireVerify?.('Verify your campus ID or enter an invite code to message classmates.');
                return;
              }
              setDirectoryModalVisible(true);
            }}
          >
            <Text style={[styles.startChatCtaText, { color: colors.onPrimary }]}>Find Classmates</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConvs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isAnon = Boolean(item.is_anonymous);
            const isOutgoingAnon = Boolean(item.is_anonymous_sender || item.recipient?.is_outgoing_anonymous);
            const rawName =
              item.name ||
              item.recipient?.full_name ||
              item.recipient?.email?.split('@')[0] ||
              'Campus Student';
            const name = item.display_title || rawName;
            const daysLeft = item.expires_in_days !== undefined ? item.expires_in_days : 7;

            return (
              <TouchableOpacity
                style={[styles.convCard, { backgroundColor: colors.surface, borderColor: isAnon ? (isDark ? '#3b1c61' : '#e9d5ff') : colors.cardBorder }]}
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
                <UserAvatar
                  uri={
                    !item.is_group && !isAnon
                      ? item.recipient?.avatar || item.recipient?.profile_picture
                      : undefined
                  }
                  name={isAnon ? (item.anonymous_alias || '🎭') : name}
                  size={44}
                  borderWidth={item.is_ephemeral || isAnon ? 1.5 : 1}
                  borderColor={item.is_ephemeral ? colors.ephemeralFire : isAnon ? '#a855f7' : colors.cardBorder}
                  backgroundColor={isAnon ? (isDark ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff') : colors.surfaceLight}
                  textColor={isAnon ? '#a855f7' : colors.textPrimary}
                  style={{ marginRight: 12 }}
                />

                <View style={styles.convBody}>
                  <View style={styles.convTopRow}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 6 }}>
                      <Text style={[styles.convName, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
                        {item.is_ephemeral ? `🔥 ${name}` : name}
                      </Text>
                      {isAnon && (
                        <View style={[styles.anonPillSmall, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.25)' : '#f3e8ff' }]}>
                          <Text style={[styles.anonPillTextSmall, { color: isDark ? '#c084fc' : '#9333ea' }]}>
                            {isOutgoingAnon ? 'OUT' : 'IN'} · ⏳{daysLeft}d
                          </Text>
                        </View>
                      )}
                    </View>
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

      {/* Join By Invite Modal */}
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
            style={[styles.menuBackdrop, { backgroundColor: colors.modalOverlay }]}
            activeOpacity={1}
            onPress={() => setActionConv(null)}
          >
            <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Text
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 8,
                  paddingBottom: 8,
                  color: colors.textMuted,
                  fontSize: 13,
                  fontWeight: '700',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.hairline,
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
                <Trash2 size={18} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetText, { color: colors.warning }]}>Clear Messages</Text>
                </View>
              </TouchableOpacity>

              {/* Delete Conversation */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => handleDeleteConversationFromSheet(actionConv)}
              >
                <Trash2 size={18} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetText, { color: colors.danger }]}>Delete Chat</Text>
                </View>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                style={[
                  styles.actionSheetItem,
                  { borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 4 },
                ]}
                onPress={() => setActionConv(null)}
              >
                <X size={18} color={colors.textMuted} />
                <Text style={[styles.actionSheetText, { color: colors.textMuted }]}>Cancel</Text>
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  inboxHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  inboxTitle: {
    fontSize: 19,
    fontWeight: '800',
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requestsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  requestsPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  joinLinkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  joinLinkPillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  ephemeralPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  ephemeralPillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  newChatBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  readOnlyBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  readOnlyBannerCta: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  directorySection: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    maxHeight: 200,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  noResultsText: {
    fontSize: 13,
    paddingVertical: 6,
  },
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  directoryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  directoryAvatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  directoryName: {
    fontSize: 13,
    fontWeight: '700',
  },
  directoryEmail: {
    fontSize: 11,
  },
  startChatLink: {
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
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  convAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  convAvatarText: {
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
    fontSize: 14.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  convTime: {
    fontSize: 11,
  },
  convBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  lastMsg: {
    fontSize: 13,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  startChatCta: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  startChatCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  roomContainer: {
    flex: 1,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  roomAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  roomAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  roomMeta: {
    flex: 1,
  },
  roomTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  roomSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerActionBtn: {
    padding: 8,
  },
  messagesList: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  pendingRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pendingRequestText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  checkStatusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  roomFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  roomFeedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlDisabled: {
    opacity: 0.45,
  },
  messageInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 36,
    fontSize: 13.5,
    maxHeight: 90,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheet: {
    width: '82%',
    maxWidth: 290,
    borderRadius: 12,
    borderWidth: 1,
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
  modeTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeTabActive: {
    borderWidth: 1,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  anonBarContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  anonBannerHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  anonBannerTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  anonBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  mascotScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  mascotChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  mascotText: {
    fontSize: 12,
    fontWeight: '700',
  },
  anonPillSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  anonPillTextSmall: {
    fontSize: 10,
    fontWeight: '700',
  },
});
