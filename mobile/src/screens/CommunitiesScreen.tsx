import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import {
  communityService,
  Community,
  CommunityMemberItem,
} from '../services/communityService';
import { chatService, Message, mergeMessagesUnique, upsertMessageUnique } from '../services/chatService';
import {
  Paperclip,
  Search,
  Plus,
  X,
  MoreVertical,
  Users,
  AlertTriangle,
  Trash2,
  Copy,
  Send,
  Share2,
  Link2,
  UserPlus,
  Mic,
} from 'lucide-react-native';
import { AttachmentPickerModal, StagedAttachment } from '../components/media/AttachmentPickerModal';
import {
  VoiceRecordingBar,
  VoiceNoteDraftCard,
  useVoiceRecorder,
  RecordedVoiceNote,
} from '../components/media/VoiceNoteRecorder';
import { pauseAllActiveVoiceNotes } from '../components/media/VoiceNotePlayer';
import { MessageBubble, SharedPostCardData } from '../components/chat/MessageBubble';
import { SharedPostViewerModal } from '../components/chat/SharedPostViewerModal';
import { DiscussTab } from '../components/discuss/DiscussTab';
import { AddMembersModal } from '../components/chat/AddMembersModal';
import { InviteLinkModal } from '../components/chat/InviteLinkModal';
import { JoinByInviteModal } from '../components/chat/JoinByInviteModal';
import { UserAvatar } from '../components/common/UserAvatar';

interface CommunitiesScreenProps {
  currentUser?: any;
  onOpenCommunityChat?: (conversation: any) => void;
  onOpenPostDetail?: (postId: number) => void;
  onOpenProfile?: (userId: number) => void;
}

const extractApiError = (err: any, fallback: string): string => {
  const data = err?.response?.data;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data === 'string' && data.trim()) return data;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return fallback;
};

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({
  currentUser,
  onOpenCommunityChat,
  onOpenPostDetail,
  onOpenProfile,
}) => {
  const { colors, isDark } = useTheme();
  // Discovery State
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'COLLEGE' | 'COURSE' | 'CUSTOM'>('ALL');
  const [createCommunityModalVisible, setCreateCommunityModalVisible] = useState(false);

  // Active Community State
  const [activeCommunity, setActiveCommunity] = useState<Community | null>(null);
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DISCUSS'>('CHAT');

  // Chat State
  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [viewingSharedPost, setViewingSharedPost] = useState<SharedPostCardData | null>(null);
  const [hubChatError, setHubChatError] = useState<string | null>(null);
  const [hubChatNotice, setHubChatNotice] = useState<string | null>(null);

  // Live Voice Note Recording & Draft State (Instagram style)
  const [draftVoiceNote, setDraftVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const voiceRecorder = useVoiceRecorder({
    onFallbackNative: () => setAttachmentPickerVisible(true),
  });

  // Members Modal State
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [membersList, setMembersList] = useState<CommunityMemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [membersFeedback, setMembersFeedback] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);

  // Report Modal State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'MESSAGE' | 'DISCUSSION' | 'REPLY' | 'COMMUNITY'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState<any>('SPAM');
  const [reportDesc, setReportDesc] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  // More Options Menu
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  // Custom Community Creation
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingCommunity, setCreatingCommunity] = useState(false);

  // Invite Link & Add Members Modal States (Instagram Style)
  const [addMembersModalVisible, setAddMembersModalVisible] = useState(false);
  const [inviteLinkModalVisible, setInviteLinkModalVisible] = useState(false);
  const [joinViaInviteModalVisible, setJoinViaInviteModalVisible] = useState(false);

  const handleAddCommunityMembers = async (selectedIds: number[]) => {
    if (!activeCommunity) return;
    await communityService.addMembers(activeCommunity.slug, selectedIds);
    const noticeMsg = `Added ${selectedIds.length} member${selectedIds.length === 1 ? '' : 's'} to ${activeCommunity.name}.`;
    setHubChatNotice(noticeMsg);
    setMembersFeedback({ kind: 'notice', text: noticeMsg });
    if (Platform.OS !== 'web') {
      Alert.alert('Success', noticeMsg);
    }
    setMembersLoading(true);
    try {
      const data = await communityService.getMembers(activeCommunity.slug);
      setMembersList(data || []);
    } catch {
    } finally {
      setMembersLoading(false);
    }
  };

  const handleJoinedCommunityViaInvite = async (slug: string) => {
    await loadCommunities();
    try {
      const comm = await communityService.getCommunityDetail(slug);
      setActiveCommunity(comm);
    } catch {
    }
  };

  // FlatList Ref for Auto-Scroll
  const chatFlatListRef = useRef<FlatList>(null);

  // Load My Enrolled Communities (Default 2 Communities + Custom)
  const loadCommunities = async () => {
    setLoading(true);
    try {
      const myData = await communityService.getMyCommunities();
      setCommunities(myData || []);
    } catch (e) {
      console.log('Error loading communities', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommunities();
  }, []);

  // Cancel active recording / clear draft & banners / pause audio when switching hub or tab
  useEffect(() => {
    voiceRecorder.cancelRecording();
    setDraftVoiceNote(null);
    setHubChatError(null);
    setHubChatNotice(null);
    pauseAllActiveVoiceNotes();
  }, [activeCommunity?.slug, activeTab]);

  // When active community changes, open its chat room and load discussions
  useEffect(() => {
    if (!activeCommunity) {
      setActiveConv(null);
      setMessages([]);
      return;
    }

    // 1. Open dedicated chat conversation
    const initChat = async () => {
      setChatLoading(true);
      try {
        const conv = await communityService.openCommunityChat(activeCommunity.slug);
        setActiveConv(conv);
        if (onOpenCommunityChat) {
          onOpenCommunityChat(conv);
        }
      } catch (e: any) {
        setHubChatError(extractApiError(e, 'Could not load community chat.'));
      } finally {
        setChatLoading(false);
      }
    };
    initChat();

  }, [activeCommunity]);

  // Polling chat messages
  useEffect(() => {
    if (!activeConv || activeTab !== 'CHAT') return;

    let isMounted = true;
    const fetchChatMessages = async (silent = false) => {
      if (!silent) setChatLoading(true);
      try {
        const msgs = await chatService.getMessages(activeConv.id);
        if (isMounted) setMessages((prev) => mergeMessagesUnique(prev, msgs));
      } catch (e) {
        if (!silent) console.log('Error fetching hub messages', e);
      } finally {
        if (!silent && isMounted) setChatLoading(false);
      }
    };

    fetchChatMessages(false);
    const interval = setInterval(() => fetchChatMessages(true), 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeConv, activeTab]);

  // Send Message in Hub Chat
  const handleSendHubMessage = async () => {
    if (!activeConv || sendingMessage) return;
    const textToSend = messageText.trim();
    if (!textToSend && !draftVoiceNote) return;

    setHubChatError(null);
    setHubChatNotice(null);

    if (draftVoiceNote) {
      const voiceToSend = draftVoiceNote;
      setDraftVoiceNote(null);
      setMessageText('');
      await handleSendAttachments([voiceToSend], textToSend);
      return;
    }

    setMessageText('');
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: Message = {
      id: tempId as any,
      conversation: activeConv.id as any,
      sender: currentUser?.id,
      sender_name: currentUser?.full_name || 'You',
      sender_email: currentUser?.email || '',
      text: textToSend,
      attachments: [],
      created_at: new Date().toISOString(),
      is_read: false,
      status: 'sending' as any,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setSendingMessage(true);

    try {
      const newMsg = await chatService.sendMessage(activeConv.id, textToSend);
      setMessages((prev) => upsertMessageUnique(prev, newMsg, tempId));
      setTimeout(() => chatFlatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Failed to send message.');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m)));
      setHubChatError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  // Send Staged Attachments & Voice Notes
  const handleSendAttachments = async (
    files: StagedAttachment[],
    caption?: string
  ) => {
    if (!activeConv) return;
    setHubChatError(null);
    setHubChatNotice(null);
    const finalCaption = (caption || '').trim();
    const tempId = `temp_att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: Message = {
      id: tempId as any,
      conversation: activeConv.id as any,
      sender: currentUser?.id,
      sender_name: currentUser?.full_name || 'You',
      sender_email: currentUser?.email || '',
      text: finalCaption,
      created_at: new Date().toISOString(),
      attachments: files.map((item, idx) => ({
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

    setMessages((prev) => [...prev, optimisticMsg]);
    setSendingMessage(true);
    try {
      const normalizedFiles = files.map((item) => ({
        file: item.file,
        uri: item.uri,
        name: item.name,
        type:
          item.mimeType ||
          (item.type === 'IMAGE'
            ? 'image/jpeg'
            : item.type === 'AUDIO'
            ? 'audio/webm'
            : item.type === 'VIDEO'
            ? 'video/mp4'
            : 'application/octet-stream'),
      }));
      const newMsg = await chatService.sendMessageWithAttachments(
        activeConv.id,
        finalCaption,
        normalizedFiles
      );
      setMessages((prev) => upsertMessageUnique(prev, newMsg, tempId));
      setTimeout(() => chatFlatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Could not upload selected attachments.');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as any } : m)));
      setHubChatError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Upload Failed', errMsg);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendRecordedVoiceNow = async () => {
    const recorded = await voiceRecorder.stopRecording();
    if (!recorded || !activeConv) return;
    const typedCaption = messageText.trim();
    if (typedCaption) {
      setMessageText('');
    }
    await handleSendAttachments([recorded], typedCaption);
  };

  const handleAttachRecordedVoiceToDraft = async () => {
    const recorded = await voiceRecorder.stopRecording();
    if (!recorded) return;
    setHubChatError(null);
    setDraftVoiceNote(recorded);
  };

  const handleDeleteCommunityFromList = (comm: Community) => {
    const doDelete = async () => {
      try {
        await communityService.deleteCommunity(comm.slug);
        loadCommunities();
        if (Platform.OS === 'web') {
          window.alert(`Community "${comm.name}" deleted.`);
        } else {
          Alert.alert('Deleted', `Community "${comm.name}" deleted.`);
        }
      } catch (e: any) {
        const err = extractApiError(e, 'Could not delete community.');
        if (Platform.OS === 'web') {
          window.alert(err);
        } else {
          Alert.alert('Error', err);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(`Are you sure you want to delete "${comm.name}"? All group messages and discussions will be permanently deleted.`) : true;
      if (ok) doDelete();
    } else {
      Alert.alert('Delete Community', `Are you sure you want to delete "${comm.name}"? This action cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Open Members List
  const handleOpenMembers = async () => {
    if (!activeCommunity) return;
    setMembersFeedback(null);
    setMembersModalVisible(true);
    setMembersLoading(true);
    try {
      const members = await communityService.getMembers(activeCommunity.slug);
      setMembersList(members);
    } catch (e: any) {
      setMembersFeedback({ kind: 'error', text: extractApiError(e, 'Could not load members.') });
    } finally {
      setMembersLoading(false);
    }
  };

  const handleUpdateRole = async (memberId: number, currentRole: string) => {
    if (!activeCommunity) return;
    const nextRole = currentRole === 'MEMBER' ? 'MODERATOR' : currentRole === 'MODERATOR' ? 'ADMIN' : 'MEMBER';
    setMembersFeedback(null);
    try {
      await communityService.updateMemberRole(activeCommunity.slug, memberId, nextRole);
      setMembersList((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: nextRole as any } : m))
      );
      const noticeMsg = `Member role updated to ${nextRole}.`;
      setMembersFeedback({ kind: 'notice', text: noticeMsg });
      if (Platform.OS !== 'web') {
        Alert.alert('Role Updated', noticeMsg);
      }
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Could not change member role.');
      setMembersFeedback({ kind: 'error', text: errMsg });
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    }
  };

  const handleRemoveMember = async (memberId: number, memberName: string) => {
    if (!activeCommunity) return;
    const slug = activeCommunity.slug;
    const executeRemove = async () => {
      setMembersFeedback(null);
      try {
        await communityService.removeMember(slug, memberId);
        setMembersList((prev) => prev.filter((m) => m.id !== memberId));
        const noticeMsg = `${memberName} was removed from the community.`;
        setMembersFeedback({ kind: 'notice', text: noticeMsg });
        if (Platform.OS !== 'web') {
          Alert.alert('Removed', noticeMsg);
        }
      } catch (e: any) {
        const errMsg = extractApiError(e, 'Could not remove member.');
        setMembersFeedback({ kind: 'error', text: errMsg });
        if (Platform.OS !== 'web') {
          Alert.alert('Error', errMsg);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined'
        ? window.confirm(`Are you sure you want to remove ${memberName} from this community?`)
        : true;
      if (ok) executeRemove();
    } else {
      Alert.alert(
        'Remove Member',
        `Are you sure you want to remove ${memberName} from this community?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: executeRemove },
        ]
      );
    }
  };

  const handleLeaveCommunity = async () => {
    if (!activeCommunity) return;
    const commSlug = activeCommunity.slug;
    const commName = activeCommunity.name;
    const executeLeave = async () => {
      try {
        await communityService.joinLeaveCommunity(commSlug);
        setMembersModalVisible(false);
        setActiveCommunity(null);
        loadCommunities();
        if (Platform.OS !== 'web') {
          Alert.alert('Left Community', `You have left ${commName}.`);
        }
      } catch (e: any) {
        const errMsg = extractApiError(e, 'Could not leave community.');
        setMembersFeedback({ kind: 'error', text: errMsg });
        if (Platform.OS !== 'web') {
          Alert.alert('Error', errMsg);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined'
        ? window.confirm(`Are you sure you want to leave ${commName}?`)
        : true;
      if (ok) executeLeave();
    } else {
      Alert.alert(
        'Leave Community',
        `Are you sure you want to leave ${commName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: executeLeave },
        ]
      );
    }
  };

  // Submit Community Report
  const handleSubmitReport = async () => {
    if (!reportTarget || !activeCommunity || submittingReport) return;
    setSubmittingReport(true);
    setReportError(null);
    try {
      await communityService.submitReport(activeCommunity.slug, {
        target_type: reportTarget.type,
        target_id: reportTarget.id,
        reason: reportReason,
        description: reportDesc.trim(),
      });
      setReportModalVisible(false);
      setReportDesc('');
      setReportTarget(null);
      setHubChatNotice('Report submitted. Community moderators will review this item.');
      if (Platform.OS !== 'web') {
        Alert.alert('Report Submitted', 'Community moderators will review this item.');
      }
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Could not submit report.');
      setReportError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    } finally {
      setSubmittingReport(false);
    }
  };

  // Message Context Menu Actions (Triggered ONLY on deliberate Long Press or Failed tap)
  const handleCopyText = (text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text || '');
    }
    setHubChatNotice('Message text copied to clipboard.');
    setActionMessage(null);
    if (Platform.OS !== 'web') {
      Alert.alert('Copied', 'Message text copied to clipboard.');
    }
  };

  const handleDeleteForMe = async (msg: Message) => {
    const isLocalOnly = String(msg.id).startsWith('temp_') || (msg as any).status === 'failed';
    if (isLocalOnly) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setActionMessage(null);
      return;
    }
    try {
      await chatService.deleteForMe(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setActionMessage(null);
    } catch (e: any) {
      const errMsg = extractApiError(e, 'Failed to delete message for you.');
      setHubChatError(errMsg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errMsg);
      }
    }
  };

  const handleDeleteForEveryone = async (msg: Message) => {
    const isLocalOnly = String(msg.id).startsWith('temp_') || (msg as any).status === 'failed';
    if (isLocalOnly) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setActionMessage(null);
      return;
    }

    const executeDelete = async () => {
      try {
        await chatService.deleteForEveryone(msg.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, is_unsent: true, text: 'This message was deleted' } : m
          )
        );
        setActionMessage(null);
      } catch (e: any) {
        const errMsg = extractApiError(e, 'Could not delete message for everyone.');
        setHubChatError(errMsg);
        if (Platform.OS !== 'web') {
          Alert.alert('Error', errMsg);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined'
        ? window.confirm('Are you sure? This message will be permanently removed for all members.')
        : true;
      if (ok) executeDelete();
    } else {
      Alert.alert(
        'Delete for Everyone',
        'Are you sure? This message will be permanently removed for all members.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  // Create Custom Community
  const handleCreateCustom = async () => {
    if (!newTitle.trim()) {
      const msg = 'Please enter a community title.';
      setCreateError(msg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', msg);
      }
      return;
    }
    setCreateError(null);
    setCreatingCommunity(true);
    try {
      const created = await communityService.createCustomCommunity({
        name: newTitle.trim(),
        description: newDesc.trim(),
      });
      setCommunities((prev) => [created, ...prev]);
      setCreateCommunityModalVisible(false);
      setNewTitle('');
      setNewDesc('');
      setActiveCommunity(created);
    } catch (e: any) {
      const msg = extractApiError(e, 'Failed to create community.');
      setCreateError(msg);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', msg);
      }
    } finally {
      setCreatingCommunity(false);
    }
  };

  // Color badges helper
  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'COLLEGE':
        return '#3b82f6';
      case 'COURSE':
        return '#10b981';
      case 'BRANCH':
        return '#06b6d4';
      case 'YEAR':
        return '#8b5cf6';
      case 'SECTION':
        return '#f59e0b';
      case 'CLUB':
        return '#ec4899';
      default:
        return '#8b5cf6';
    }
  };

  // Filtered Community List
  const filteredCommunities = communities.filter((c) => {
    if (!c || !c.name) return false;
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCat =
      selectedCategory === 'ALL' ||
      (selectedCategory === 'COLLEGE' && c.community_type === 'COLLEGE') ||
      (selectedCategory === 'COURSE' && c.community_type === 'COURSE') ||
      (selectedCategory === 'CUSTOM' && (c.community_type === 'CUSTOM' || c.community_type === 'CLUB'));

    return matchesSearch && matchesCat;
  });

  // =========================================================================
  // VIEW 1: DEDICATED COMMUNITY DETAILS VIEW (CHAT | DISCUSS)
  // =========================================================================
  if (activeCommunity) {
    const isActionFailedOrLocal = Boolean(
      actionMessage &&
        ((actionMessage as any).status === 'failed' || String(actionMessage.id).startsWith('temp_'))
    );

    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Community Top Header Bar */}
        <View style={[styles.communityHeader, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setActiveCommunity(null)}
            accessibilityLabel="Back to Hubs"
          >
            <Text style={[styles.backBtnArrow, { color: colors.textPrimary }]}>←</Text>
          </TouchableOpacity>

          <View style={styles.communityHeaderCenter}>
            <View style={styles.titleRow}>
              <Text style={[styles.communityTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {activeCommunity.name}
              </Text>
              <View
                style={[
                  styles.headerTypeBadge,
                  { backgroundColor: getBadgeColor(activeCommunity.community_type) },
                ]}
              >
                <Text style={styles.headerTypeBadgeText}>
                  {activeCommunity.community_type}
                </Text>
              </View>
            </View>

            {/* Clickable Subtitle to open Members */}
            <TouchableOpacity onPress={handleOpenMembers} activeOpacity={0.7}>
              <Text style={[styles.communitySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                👥 {activeCommunity.total_members} members · Campus Community
              </Text>
            </TouchableOpacity>
          </View>

          {/* Action Menu */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, borderWidth: 1 }]}
              onPress={() => setInviteLinkModalVisible(true)}
              accessibilityLabel="Invite link"
            >
              <Link2 size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, borderWidth: 1 }]}
              onPress={() => {
                handleOpenMembers();
                setAddMembersModalVisible(true);
              }}
              accessibilityLabel="Add members"
            >
              <UserPlus size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, borderWidth: 1 }]}
              onPress={handleOpenMembers}
              accessibilityLabel="View members"
            >
              <Users size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, borderWidth: 1 }]}
              onPress={() => setMoreMenuVisible(true)}
              accessibilityLabel="More options"
            >
              <MoreVertical size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Segmented Two-Tab Bar */}
        <View
          style={[
            styles.segmentedTabContainer,
            {
              backgroundColor: isDark ? '#141516' : '#f1f5f9',
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              activeTab === 'CHAT' && {
                backgroundColor: colors.primary,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 3,
                elevation: 2,
              },
            ]}
            onPress={() => setActiveTab('CHAT')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.segmentedTabText,
                {
                  color: activeTab === 'CHAT' ? '#ffffff' : colors.textSecondary,
                  fontWeight: activeTab === 'CHAT' ? '800' : '600',
                },
              ]}
            >
              💬 Chat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentedTab,
              activeTab === 'DISCUSS' && {
                backgroundColor: colors.primary,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 3,
                elevation: 2,
              },
            ]}
            onPress={() => setActiveTab('DISCUSS')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.segmentedTabText,
                {
                  color: activeTab === 'DISCUSS' ? '#ffffff' : colors.textSecondary,
                  fontWeight: activeTab === 'DISCUSS' ? '800' : '600',
                },
              ]}
            >
              💡 Discuss
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB A: CHAT EXPERIENCE */}
        {activeTab === 'CHAT' && (
          <View style={{ flex: 1 }}>
            {chatLoading && messages.length === 0 ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading hub chat...</Text>
              </View>
            ) : (
              <FlatList
                ref={chatFlatListRef}
                data={messages}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.chatListContent}
                renderItem={({ item }) => {
                  const isMe = currentUser
                    ? item.sender === currentUser.id ||
                      (item.sender_email && currentUser.email && item.sender_email.toLowerCase() === currentUser.email.toLowerCase())
                    : false;

                  return (
                    <MessageBubble
                      message={item}
                      isMe={isMe}
                      isGroup={true}
                      onPress={(msg) => {
                        if ((msg as any).status === 'failed') {
                          setActionMessage(msg);
                        }
                      }}
                      onLongPress={setActionMessage}
                      onSenderPress={(senderId) => onOpenProfile?.(senderId)}
                      onPostCardPress={(cardData) => {
                        if (onOpenPostDetail) {
                          onOpenPostDetail(cardData.id);
                        } else {
                          setViewingSharedPost(cardData);
                        }
                      }}
                    />
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <Text style={styles.emptyIcon}>🏛️</Text>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Welcome to {activeCommunity.name}!</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                      This is the official college community channel. Share notes, questions, and connect with your peers.
                    </Text>
                  </View>
                }
              />
            )}

            {/* Inline Feedback Banners */}
            {(hubChatError || hubChatNotice) && (
              <View
                style={[
                  styles.feedbackBanner,
                  {
                    backgroundColor: hubChatError
                      ? isDark
                        ? 'rgba(239, 68, 68, 0.14)'
                        : '#fef2f2'
                      : isDark
                      ? 'rgba(94, 106, 210, 0.14)'
                      : '#eef2ff',
                    borderTopColor: hubChatError ? 'rgba(239, 68, 68, 0.35)' : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.feedbackBannerText,
                    { color: hubChatError ? colors.danger : colors.primary },
                  ]}
                  numberOfLines={3}
                >
                  {hubChatError || hubChatNotice}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setHubChatError(null);
                    setHubChatNotice(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={14} color={hubChatError ? colors.danger : colors.textSecondary} />
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

            {/* Chat Input Bar or Live Instagram Voice Recording Bar */}
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
                  styles.chatInputBar,
                  {
                    backgroundColor: colors.surface,
                    borderTopColor: draftVoiceNote ? 'transparent' : colors.cardBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[styles.attachBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                  onPress={() => setAttachmentPickerVisible(true)}
                  activeOpacity={0.7}
                  accessibilityLabel="Attach media or documents"
                >
                  <Paperclip size={17} color={colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.attachBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                  onPress={() => voiceRecorder.startRecording()}
                  activeOpacity={0.7}
                  accessibilityLabel="Record voice note"
                >
                  <Mic size={17} color={colors.primary} />
                </TouchableOpacity>

                <TextInput
                  style={[
                    styles.chatTextInput,
                    {
                      backgroundColor: isDark ? '#141516' : '#f1f5f9',
                      borderColor: colors.cardBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder={
                    draftVoiceNote
                      ? 'Add text to send with voice note...'
                      : `Message ${activeCommunity.name}...`
                  }
                  placeholderTextColor={colors.textMuted}
                  value={messageText}
                  onChangeText={(txt) => {
                    setMessageText(txt);
                    if (hubChatError) setHubChatError(null);
                  }}
                  multiline
                />

                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    { backgroundColor: colors.primary },
                    (!(messageText.trim() || draftVoiceNote) || sendingMessage) && styles.sendBtnDisabled,
                  ]}
                  onPress={handleSendHubMessage}
                  disabled={!(messageText.trim() || draftVoiceNote) || sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Send size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* TAB B: DISCUSS EXPERIENCE */}
        {activeTab === 'DISCUSS' && (
          <DiscussTab
            community={activeCommunity}
            currentUser={currentUser}
            onOpenProfile={onOpenProfile}
          />
        )}

        {/* Attachment Picker Modal */}
        <AttachmentPickerModal
          visible={attachmentPickerVisible}
          onClose={() => setAttachmentPickerVisible(false)}
          onSend={handleSendAttachments}
        />

        {/* Message Actions Bottom Sheet */}
        {actionMessage && (
          <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={() => setActionMessage(null)}>
            <TouchableOpacity
              style={[styles.sheetOverlay, { backgroundColor: colors.modalOverlay }]}
              activeOpacity={1}
              onPress={() => setActionMessage(null)}
            >
              <View style={[styles.sheetMenu, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder, borderTopWidth: 1 }]}>
                <View style={[styles.sheetDragBar, { backgroundColor: colors.hairlineStrong }]} />
                <Text style={[styles.sheetHeaderTitle, { color: colors.textPrimary }]}>
                  {isActionFailedOrLocal ? 'Message failed to deliver' : 'Message Options'}
                </Text>

                {Boolean(actionMessage.text?.trim()) && (
                  <TouchableOpacity
                    style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                    onPress={() => handleCopyText(actionMessage.text)}
                  >
                    <Copy size={16} color={colors.primary} />
                    <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Copy Text</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => handleDeleteForMe(actionMessage)}
                >
                  <Trash2 size={16} color={colors.danger} />
                  <Text style={[styles.sheetActionText, { color: colors.danger }]}>
                    {isActionFailedOrLocal ? 'Remove Failed Message' : 'Delete for Me'}
                  </Text>
                </TouchableOpacity>

                {!isActionFailedOrLocal && currentUser && actionMessage.sender === currentUser.id && (
                  <TouchableOpacity
                    style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                    onPress={() => handleDeleteForEveryone(actionMessage)}
                  >
                    <AlertTriangle size={16} color={colors.danger} />
                    <Text style={[styles.sheetActionText, { color: colors.danger, fontWeight: '700' }]}>
                      Delete for Everyone
                    </Text>
                  </TouchableOpacity>
                )}

                {!isActionFailedOrLocal && currentUser && actionMessage.sender !== currentUser.id && (
                  <TouchableOpacity
                    style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                    onPress={() => {
                      setReportTarget({ type: 'MESSAGE', id: actionMessage.id });
                      setReportError(null);
                      setActionMessage(null);
                      setReportModalVisible(true);
                    }}
                  >
                    <AlertTriangle size={16} color={colors.warning} />
                    <Text style={[styles.sheetActionText, { color: colors.warning }]}>Report Message</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* MEMBERS MODAL */}
        <Modal visible={membersModalVisible} animationType="slide" onRequestClose={() => setMembersModalVisible(false)}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
              <TouchableOpacity onPress={() => setMembersModalVisible(false)}>
                <X size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>Community Members</Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
              {membersFeedback && (
                <View
                  style={[
                    styles.inlineModalBanner,
                    {
                      backgroundColor: membersFeedback.kind === 'error'
                        ? isDark
                          ? 'rgba(239, 68, 68, 0.14)'
                          : '#fef2f2'
                        : isDark
                        ? 'rgba(94, 106, 210, 0.14)'
                        : '#eef2ff',
                      borderColor: membersFeedback.kind === 'error' ? 'rgba(239, 68, 68, 0.35)' : colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: '600',
                      color: membersFeedback.kind === 'error' ? colors.danger : colors.primary,
                    }}
                  >
                    {membersFeedback.text}
                  </Text>
                  <TouchableOpacity onPress={() => setMembersFeedback(null)}>
                    <X size={13} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Quick Action Bar for Add People & Invite Link */}
              <View style={styles.membersActionBar}>
                <TouchableOpacity
                  style={[
                    styles.memberActionPill,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                  onPress={() => setAddMembersModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <UserPlus size={15} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.memberActionPillText, { color: colors.primary }]}>Add People</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.memberActionPill,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                  onPress={() => setInviteLinkModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Link2 size={15} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.memberActionPillText, { color: colors.primary }]}>Invite Link</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.discussSearchBox,
                  {
                    backgroundColor: isDark ? '#141516' : '#f1f5f9',
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Search size={14} color={colors.textMuted} />
                <TextInput
                  style={[styles.discussSearchInput, { color: colors.textPrimary }]}
                  placeholder="Search members by name or email..."
                  placeholderTextColor={colors.textMuted}
                  value={memberSearchQuery}
                  onChangeText={setMemberSearchQuery}
                />
              </View>
            </View>

            {membersLoading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : (
              <FlatList
                data={membersList.filter((m) =>
                  !memberSearchQuery.trim() ||
                  m.user.full_name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                  m.user.email.toLowerCase().includes(memberSearchQuery.toLowerCase())
                )}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                renderItem={({ item }) => {
                  const isCustom = activeCommunity?.community_type === 'CUSTOM';
                  const isAdmin = activeCommunity?.user_role === 'OWNER' || activeCommunity?.user_role === 'ADMIN';
                  const canManage = isCustom && isAdmin && item.role !== 'OWNER';

                  return (
                    <View
                      style={[
                        styles.memberRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.cardBorder,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                        disabled={!item.user?.id}
                        onPress={() => {
                          setMembersModalVisible(false);
                          item.user?.id && onOpenProfile?.(item.user.id);
                        }}
                        activeOpacity={0.7}
                      >
                        <UserAvatar
                          uri={item.user.avatar || item.user.profile_picture}
                          name={item.user.full_name}
                          size={36}
                          backgroundColor={isDark ? 'rgba(94, 106, 210, 0.2)' : '#e0e7ff'}
                          textColor={colors.primary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.memberName, { color: colors.textPrimary }]}>{item.user.full_name}</Text>
                          <Text style={[styles.memberCourse, { color: colors.textSecondary }]}>
                            {item.user.course_branch || item.user.email}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={[
                            styles.roleBadge,
                            {
                              backgroundColor: isDark ? 'rgba(94, 106, 210, 0.16)' : '#eef2ff',
                            },
                          ]}
                        >
                          <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{item.role}</Text>
                        </View>
                        {canManage && (
                          <>
                            <TouchableOpacity
                              style={[
                                styles.memberActionBtn,
                                {
                                  borderColor: colors.primary,
                                  backgroundColor: colors.surfaceLight,
                                },
                              ]}
                              onPress={() => handleUpdateRole(item.id, item.role)}
                            >
                              <Text style={[styles.memberActionText, { color: colors.primary }]}>Role</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.memberActionBtn,
                                {
                                  borderColor: colors.danger,
                                  backgroundColor: colors.surfaceLight,
                                },
                              ]}
                              onPress={() => handleRemoveMember(item.id, item.user.full_name)}
                            >
                              <Text style={[styles.memberActionText, { color: colors.danger }]}>Remove</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}

            {activeCommunity?.community_type === 'CUSTOM' && activeCommunity?.user_role !== 'OWNER' && (
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.surface }}>
                <TouchableOpacity
                  style={[
                    styles.leaveCommunityBtn,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.danger,
                    },
                  ]}
                  onPress={handleLeaveCommunity}
                >
                  <Text style={[styles.leaveCommunityBtnText, { color: colors.danger }]}>Leave Community</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>

        {/* REPORT MODAL */}
        <Modal visible={reportModalVisible} transparent animationType="fade" onRequestClose={() => setReportModalVisible(false)}>
          <View style={[styles.sheetOverlay, { backgroundColor: colors.modalOverlay }]}>
            <View
              style={[
                styles.reportModalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.cardBorder,
                  borderTopWidth: 1,
                },
              ]}
            >
              <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>Report Inappropriate Content</Text>
              <Text style={[styles.reportSubtitle, { color: colors.textSecondary }]}>
                Reports are sent directly to community administrators and moderators.
              </Text>

              {reportError && (
                <View
                  style={[
                    styles.inlineModalBanner,
                    {
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                    },
                  ]}
                >
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.danger }}>{reportError}</Text>
                </View>
              )}

              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Reason</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {(['SPAM', 'HARASSMENT', 'ABUSIVE', 'INAPPROPRIATE', 'FAKE_INFO', 'OTHER'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.typeSelectPill,
                      {
                        backgroundColor: reportReason === r ? colors.primary : colors.surfaceLight,
                        borderColor: reportReason === r ? colors.primary : colors.cardBorder,
                        borderWidth: 1,
                      },
                    ]}
                    onPress={() => setReportReason(r)}
                  >
                    <Text
                      style={[
                        styles.typeSelectText,
                        {
                          color: reportReason === r ? '#ffffff' : colors.textSecondary,
                          fontWeight: reportReason === r ? '700' : '600',
                        },
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={[
                  styles.modalInput,
                  {
                    height: 80,
                    marginTop: 8,
                    backgroundColor: isDark ? '#141516' : '#f1f5f9',
                    borderColor: colors.cardBorder,
                    borderWidth: 1,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Additional details (optional)..."
                placeholderTextColor={colors.textMuted}
                value={reportDesc}
                onChangeText={setReportDesc}
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[
                    styles.cancelBtn,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.cardBorder,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    setReportError(null);
                    setReportModalVisible(false);
                  }}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSubmitReport}
                  disabled={submittingReport}
                >
                  {submittingReport ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Submit Report</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MORE OPTIONS MENU SHEET */}
        {moreMenuVisible && (
          <Modal visible={moreMenuVisible} transparent animationType="fade" onRequestClose={() => setMoreMenuVisible(false)}>
            <TouchableOpacity
              style={[styles.sheetOverlay, { backgroundColor: colors.modalOverlay }]}
              activeOpacity={1}
              onPress={() => setMoreMenuVisible(false)}
            >
              <View style={[styles.sheetMenu, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder, borderTopWidth: 1 }]}>
                <View style={[styles.sheetDragBar, { backgroundColor: colors.hairlineStrong }]} />
                <Text style={[styles.sheetHeaderTitle, { color: colors.textPrimary }]}>{activeCommunity.name}</Text>

                <TouchableOpacity
                  style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    handleOpenMembers();
                    setAddMembersModalVisible(true);
                  }}
                >
                  <UserPlus size={16} color={colors.primary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Add People</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    setInviteLinkModalVisible(true);
                  }}
                >
                  <Link2 size={16} color={colors.primary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Group Invite Link</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    handleOpenMembers();
                  }}
                >
                  <Users size={16} color={colors.primary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>
                    View Members ({activeCommunity.total_members})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    Share.share({
                      message: `Join ${activeCommunity.name} on Campus Connect!`,
                    });
                  }}
                >
                  <Share2 size={16} color={colors.primary} />
                  <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share Community</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    setReportTarget({ type: 'COMMUNITY', id: String(activeCommunity.id) });
                    setReportError(null);
                    setReportModalVisible(true);
                  }}
                >
                  <AlertTriangle size={16} color={colors.warning} />
                  <Text style={[styles.sheetActionText, { color: colors.warning }]}>Report Community</Text>
                </TouchableOpacity>

                {!activeCommunity.is_system_managed && (
                  <TouchableOpacity
                    style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                    onPress={() => {
                      setMoreMenuVisible(false);
                      const targetSlug = activeCommunity.slug;
                      const targetName = activeCommunity.name;
                      const executeDelete = async () => {
                        try {
                          await communityService.deleteCommunity(targetSlug);
                          setActiveCommunity(null);
                          loadCommunities();
                          if (Platform.OS === 'web') {
                            window.alert(`Community "${targetName}" deleted successfully.`);
                          } else {
                            Alert.alert('Deleted', `Community "${targetName}" deleted successfully.`);
                          }
                        } catch (e: any) {
                          const err = extractApiError(e, 'Could not delete community.');
                          setHubChatError(err);
                          if (Platform.OS === 'web') {
                            window.alert(err);
                          } else {
                            Alert.alert('Error', err);
                          }
                        }
                      };

                      if (Platform.OS === 'web') {
                        const ok = typeof window !== 'undefined' ? window.confirm(`Are you sure you want to delete "${targetName}"? All group messages and discussions will be permanently deleted.`) : true;
                        if (ok) executeDelete();
                      } else {
                        Alert.alert(
                          'Delete Community',
                          `Are you sure you want to delete "${targetName}"? This action cannot be undone.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: executeDelete },
                          ]
                        );
                      }
                    }}
                  >
                    <Trash2 size={16} color={colors.danger} />
                    <Text style={[styles.sheetActionText, { color: colors.danger, fontWeight: '700' }]}>Delete Community</Text>
                  </TouchableOpacity>
                )}

                {!activeCommunity.is_system_managed && (
                  <TouchableOpacity
                    style={[styles.sheetActionItem, { borderBottomColor: colors.cardBorder }]}
                    onPress={() => {
                      setMoreMenuVisible(false);
                      const targetSlug = activeCommunity.slug;
                      const targetName = activeCommunity.name;
                      const executeLeave = async () => {
                        try {
                          await communityService.toggleJoin(targetSlug);
                          setActiveCommunity(null);
                          loadCommunities();
                        } catch (e: any) {
                          const err = extractApiError(e, 'Cannot leave community');
                          if (Platform.OS === 'web') {
                            window.alert(err);
                          } else {
                            Alert.alert('Error', err);
                          }
                        }
                      };

                      if (Platform.OS === 'web') {
                        const ok = typeof window !== 'undefined' ? window.confirm(`Leave ${targetName}?`) : true;
                        if (ok) executeLeave();
                      } else {
                        Alert.alert('Leave Community', `Are you sure you want to leave ${targetName}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Leave', style: 'destructive', onPress: executeLeave },
                        ]);
                      }
                    }}
                  >
                    <Trash2 size={16} color={colors.warning} />
                    <Text style={[styles.sheetActionText, { color: colors.warning }]}>Leave Community</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* SHARED POST VIEWER MODAL */}
        {viewingSharedPost && (
          <SharedPostViewerModal
            cardData={viewingSharedPost}
            onClose={() => setViewingSharedPost(null)}
          />
        )}

        {/* ADD MEMBERS MODAL (Instagram Style) */}
        <AddMembersModal
          visible={addMembersModalVisible}
          title={`Add to ${activeCommunity.name}`}
          existingMemberIds={membersList.map((m) => m.user.id)}
          onClose={() => setAddMembersModalVisible(false)}
          onAddMembers={handleAddCommunityMembers}
        />

        {/* GROUP INVITE LINK MODAL (Instagram Style) */}
        <InviteLinkModal
          visible={inviteLinkModalVisible}
          title={activeCommunity.name}
          type="COMMUNITY"
          targetIdOrSlug={activeCommunity.slug}
          canReset={activeCommunity.user_role === 'OWNER' || activeCommunity.user_role === 'ADMIN'}
          onClose={() => setInviteLinkModalVisible(false)}
        />
      </KeyboardAvoidingView>
    );
  }

  // =========================================================================
  // VIEW 2: CAMPUS DISCOVERY & HUBS LIST (REDESIGNED)
  // =========================================================================
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Campus Hubs</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Your verified academic & student communities
          </Text>
        </View>
        <View style={styles.headerBtnGroup}>
          <TouchableOpacity
            style={[
              styles.joinLinkHeaderBtn,
              {
                backgroundColor: colors.surfaceLight,
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={() => setJoinViaInviteModalVisible(true)}
            activeOpacity={0.8}
          >
            <Link2 size={14} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.joinLinkHeaderBtnText, { color: colors.primary }]}>Join via Link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setCreateError(null);
              setCreateCommunityModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Plus size={15} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.createBtnText}>Create Hub</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
        <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search official college, course, or custom hubs..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category Chips Bar (2 Default: College & Course, plus Custom) */}
      <View style={styles.categoryBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {(['ALL', 'COLLEGE', 'COURSE', 'CUSTOM'] as const).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: active
                      ? colors.primary
                      : isDark
                      ? '#141516'
                      : '#ffffff',
                    borderColor: active ? colors.primary : colors.cardBorder,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    {
                      color: active ? '#ffffff' : colors.textSecondary,
                      fontWeight: active ? '700' : '600',
                    },
                  ]}
                >
                  {cat === 'ALL'
                    ? '🏛️ All Hubs'
                    : cat === 'COLLEGE'
                    ? '🎓 College'
                    : cat === 'COURSE'
                    ? '📚 Course'
                    : '👥 Custom'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Communities List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading campus communities...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCommunities}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const badgeColor = getBadgeColor(item.community_type);
            return (
              <TouchableOpacity
                style={[styles.communityCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                onPress={() => setActiveCommunity(item)}
                activeOpacity={0.9}
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      👥 {item.total_members || 0} members • Campus Community
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.typeBadgeText}>{item.community_type}</Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                ) : null}

                {/* Card Action Row */}
                <View style={[styles.cardActionRow, { borderTopColor: colors.cardBorder }]}>
                  <View style={styles.openCommunityBtn}>
                    <Text style={[styles.openCommunityBtnText, { color: colors.primary }]}>Open Hub Chat & Discussions →</Text>
                  </View>
                  {!item.is_system_managed && item.community_type === 'CUSTOM' && (
                    <TouchableOpacity
                      style={{ padding: 6, marginLeft: 10 }}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        handleDeleteCommunityFromList(item);
                      }}
                      accessibilityLabel="Delete community"
                    >
                      <Trash2 size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No communities found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Try adjusting your search query or category filters.
              </Text>
            </View>
          }
        />
      )}

      {/* CREATE CUSTOM COMMUNITY MODAL */}
      <Modal visible={createCommunityModalVisible} animationType="slide" transparent onRequestClose={() => setCreateCommunityModalVisible(false)}>
        <View style={[styles.sheetOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View
            style={[
              styles.reportModalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
                borderTopWidth: 1,
              },
            ]}
          >
            <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>Create Student Community</Text>
            <Text style={[styles.reportSubtitle, { color: colors.textSecondary }]}>
              Create a custom club, society, or hostel group for your campus mates.
            </Text>

            {createError && (
              <View
                style={[
                  styles.inlineModalBanner,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                  },
                ]}
              >
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.danger }}>{createError}</Text>
              </View>
            )}

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Community Name</Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: isDark ? '#141516' : '#f1f5f9',
                  borderColor: colors.cardBorder,
                  borderWidth: 1,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="e.g. AI & Robotics Club, Devsthali Hostel"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={(txt) => {
                setNewTitle(txt);
                if (createError) setCreateError(null);
              }}
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  height: 80,
                  backgroundColor: isDark ? '#141516' : '#f1f5f9',
                  borderColor: colors.cardBorder,
                  borderWidth: 1,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="What is this community about?"
              placeholderTextColor={colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  {
                    backgroundColor: colors.surfaceLight,
                    borderColor: colors.cardBorder,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => {
                  setCreateError(null);
                  setCreateCommunityModalVisible(false);
                }}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreateCustom}
                disabled={creatingCommunity}
              >
                {creatingCommunity ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Create Hub</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* JOIN VIA INVITE LINK MODAL */}
      <JoinByInviteModal
        visible={joinViaInviteModalVisible}
        onClose={() => setJoinViaInviteModalVisible(false)}
        onJoinedCommunity={handleJoinedCommunityViaInvite}
      />
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
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 48 : 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  joinLinkHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  joinLinkHeaderBtnText: {
    fontWeight: '700',
    fontSize: 12,
  },
  membersActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  memberActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  memberActionPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  categoryBar: {
    paddingVertical: 10,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 14,
    paddingBottom: 40,
  },
  communityCard: {
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  openCommunityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openCommunityBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Community Details Header
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    paddingRight: 10,
    paddingVertical: 4,
  },
  backBtnArrow: {
    fontSize: 22,
    fontWeight: '700',
  },
  communityHeaderCenter: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  communityTitle: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerTypeBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  communitySubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Segmented Two Tabs
  segmentedTabContainer: {
    flexDirection: 'row',
    padding: 3,
    marginHorizontal: 14,
    marginVertical: 8,
    borderRadius: 10,
    maxWidth: 420,
    width: '92%',
    alignSelf: 'center',
    borderWidth: 1,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentedTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Chat Styles
  chatListContent: {
    padding: 14,
    paddingBottom: 24,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  feedbackBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  inlineModalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTextInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13.5,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  discussSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
  },
  discussSearchInput: {
    flex: 1,
    fontSize: 12.5,
  },
  // Modal Base Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  typeSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  typeSelectText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  modalInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  // Members List Styles
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 13,
    fontWeight: '700',
  },
  memberCourse: {
    fontSize: 10.5,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  memberActionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  memberActionText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  leaveCommunityBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveCommunityBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Report Sheet & Bottom Sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  reportModalCard: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 20,
    maxHeight: '85%',
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  reportSubtitle: {
    fontSize: 11.5,
    marginTop: 4,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetMenu: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  sheetDragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
    borderBottomWidth: 1,
  },
  sheetActionText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 12,
    marginTop: 8,
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 20,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});

