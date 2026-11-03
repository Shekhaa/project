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
  Image,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  communityService,
  Community,
  Discussion,
  DiscussionReply,
  CommunityMemberItem,
} from '../services/communityService';
import { chatService, Message } from '../services/chatService';
import {
  Paperclip,
  Search,
  Plus,
  X,
  MoreVertical,
  ArrowUp,
  MessageSquare,
  CheckCircle,
  Pin,
  Users,
  AlertTriangle,
  Trash2,
  Copy,
  Send,
  Check,
  Share2,
  Filter,
  FileText,
  CornerDownRight,
  ExternalLink,
  Heart,
  MessageCircle,
  Link2,
  UserPlus,
} from 'lucide-react-native';
import { MediaGrid } from '../components/media/MediaGrid';
import { DocumentCard } from '../components/media/DocumentCard';
import { AttachmentPickerModal, StagedAttachment } from '../components/media/AttachmentPickerModal';
import { parseSharedPostCard, SharedPostCardData } from '../components/chat/MessageBubble';
import { SharedPostViewerModal } from '../components/chat/SharedPostViewerModal';
import { ImageViewerModal } from '../components/media/ImageViewerModal';
import { DiscussTab } from '../components/discuss/DiscussTab';
import { AddMembersModal } from '../components/chat/AddMembersModal';
import { InviteLinkModal } from '../components/chat/InviteLinkModal';
import { JoinByInviteModal } from '../components/chat/JoinByInviteModal';

interface CommunitiesScreenProps {
  currentUser?: any;
  onOpenCommunityChat?: (conversation: any) => void;
  onOpenPostDetail?: (postId: number) => void;
  onOpenProfile?: (userId: number) => void;
}

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({
  currentUser,
  onOpenCommunityChat,
  onOpenPostDetail,
  onOpenProfile,
}) => {
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

  // Members Modal State
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [membersList, setMembersList] = useState<CommunityMemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Report Modal State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'MESSAGE' | 'DISCUSSION' | 'REPLY' | 'COMMUNITY'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState<any>('SPAM');
  const [reportDesc, setReportDesc] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // More Options Menu
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  // Custom Community Creation
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creatingCommunity, setCreatingCommunity] = useState(false);

  // Invite Link & Add Members Modal States (Instagram Style)
  const [addMembersModalVisible, setAddMembersModalVisible] = useState(false);
  const [inviteLinkModalVisible, setInviteLinkModalVisible] = useState(false);
  const [joinViaInviteModalVisible, setJoinViaInviteModalVisible] = useState(false);

  const handleAddCommunityMembers = async (selectedIds: number[]) => {
    if (!activeCommunity) return;
    await communityService.addMembers(activeCommunity.slug, selectedIds);
    Alert.alert('Success! 🎉', `Added ${selectedIds.length} members to ${activeCommunity.name}.`);
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
      } catch (e) {
        console.log('Error opening community chat', e);
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
        if (isMounted) setMessages(msgs);
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
    if (!messageText.trim() || !activeConv || sendingMessage) return;

    const textToSend = messageText.trim();
    setMessageText('');
    setSendingMessage(true);

    try {
      const newMsg = await chatService.sendMessage(activeConv.id, textToSend);
      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => chatFlatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Send Staged Attachments
  const handleSendAttachments = async (
    files: StagedAttachment[],
    caption?: string
  ) => {
    if (!activeConv) return;
    setSendingMessage(true);
    try {
      const newMsg = await chatService.sendMessageWithAttachments(
        activeConv.id,
        caption || '',
        files
      );
      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => chatFlatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Upload Failed', 'Could not upload selected attachments.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Open Members List
  const handleOpenMembers = async () => {
    if (!activeCommunity) return;
    setMembersModalVisible(true);
    setMembersLoading(true);
    try {
      const members = await communityService.getMembers(activeCommunity.slug);
      setMembersList(members);
    } catch (e) {
      console.log('Error loading members', e);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleUpdateRole = async (memberId: number, currentRole: string) => {
    if (!activeCommunity) return;
    const nextRole = currentRole === 'MEMBER' ? 'MODERATOR' : currentRole === 'MODERATOR' ? 'ADMIN' : 'MEMBER';
    try {
      await communityService.updateMemberRole(activeCommunity.slug, memberId, nextRole);
      setMembersList((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: nextRole as any } : m))
      );
      Alert.alert('Role Updated', `Member role updated to ${nextRole}`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not change member role.');
    }
  };

  const handleRemoveMember = async (memberId: number, memberName: string) => {
    if (!activeCommunity) return;
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this community?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.removeMember(activeCommunity.slug, memberId);
              setMembersList((prev) => prev.filter((m) => m.id !== memberId));
              Alert.alert('Removed', `${memberName} was removed from the community.`);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not remove member.');
            }
          },
        },
      ]
    );
  };

  const handleLeaveCommunity = async () => {
    if (!activeCommunity) return;
    Alert.alert(
      'Leave Community',
      `Are you sure you want to leave ${activeCommunity.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.joinLeaveCommunity(activeCommunity.slug);
              setMembersModalVisible(false);
              setActiveCommunity(null);
              loadCommunities();
              Alert.alert('Left Community', `You have left ${activeCommunity.name}.`);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not leave community.');
            }
          },
        },
      ]
    );
  };

  // Submit Community Report
  const handleSubmitReport = async () => {
    if (!reportTarget || !activeCommunity || submittingReport) return;
    setSubmittingReport(true);
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
      Alert.alert('Report Submitted', 'Community moderators will review this item.');
    } catch (e) {
      Alert.alert('Error', 'Could not submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Message Context Menu Actions (Triggered ONLY on deliberate Long Press)
  const handleCopyText = (text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
    }
    Alert.alert('Copied', 'Message text copied to clipboard.');
    setActionMessage(null);
  };

  const handleDeleteForMe = async (msg: Message) => {
    try {
      await chatService.deleteForMe(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setActionMessage(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to delete message for you.');
    }
  };

  const handleDeleteForEveryone = async (msg: Message) => {
    Alert.alert(
      'Delete for Everyone',
      'Are you sure? This message will be permanently removed for all members.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteForEveryone(msg.id);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msg.id ? { ...m, is_unsent: true, text: 'This message was deleted' } : m
                )
              );
              setActionMessage(null);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not delete message for everyone.');
            }
          },
        },
      ]
    );
  };

  // Create Custom Community
  const handleCreateCustom = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Please enter a community title');
      return;
    }
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
    } catch (e) {
      Alert.alert('Error', 'Failed to create community');
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

  const getDiscussionTypeColor = (type: string) => {
    switch (type) {
      case 'QUESTION':
        return '#10b981'; // Green (matches screenshot)
      case 'RESOURCE':
        return '#f59e0b'; // Amber
      case 'ANNOUNCEMENT':
        return '#8b5cf6'; // Purple
      default:
        return '#3b82f6'; // Blue
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
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Community Top Header Bar */}
        <View style={styles.communityHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setActiveCommunity(null)}
            accessibilityLabel="Back to Hubs"
          >
            <Text style={styles.backBtnArrow}>←</Text>
          </TouchableOpacity>

          <View style={styles.communityHeaderCenter}>
            <View style={styles.titleRow}>
              <Text style={styles.communityTitle} numberOfLines={1}>
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
              <Text style={styles.communitySubtitle}>
                👥 {activeCommunity.total_members} members · Campus Community
              </Text>
            </TouchableOpacity>
          </View>

          {/* Action Menu (•••) */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setInviteLinkModalVisible(true)}
              accessibilityLabel="Invite link"
            >
              <Link2 size={18} color="#38bdf8" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => {
                handleOpenMembers();
                setAddMembersModalVisible(true);
              }}
              accessibilityLabel="Add members"
            >
              <UserPlus size={18} color="#38bdf8" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={handleOpenMembers}
              accessibilityLabel="View members"
            >
              <Users size={18} color="#94a3b8" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setMoreMenuVisible(true)}
              accessibilityLabel="More options"
            >
              <MoreVertical size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Segmented Two-Tab Bar (Matches Exact Screenshot!) */}
        <View style={styles.segmentedTabContainer}>
          <TouchableOpacity
            style={[styles.segmentedTab, activeTab === 'CHAT' && styles.segmentedTabActive]}
            onPress={() => setActiveTab('CHAT')}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentedTabText, activeTab === 'CHAT' && styles.segmentedTabTextActive]}>
              Chat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentedTab, activeTab === 'DISCUSS' && styles.segmentedTabActive]}
            onPress={() => setActiveTab('DISCUSS')}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentedTabText, activeTab === 'DISCUSS' && styles.segmentedTabTextActive]}>
              Discuss
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB A: CHAT EXPERIENCE (WhatsApp / Discord Style) */}
        {activeTab === 'CHAT' && (
          <View style={{ flex: 1 }}>
            {chatLoading && messages.length === 0 ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.loadingText}>Loading hub chat...</Text>
              </View>
            ) : (
              <FlatList
                ref={chatFlatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.chatListContent}
                renderItem={({ item }) => {
                  const isMe = currentUser
                    ? item.sender === currentUser.id ||
                      (item.sender_email && currentUser.email && item.sender_email.toLowerCase() === currentUser.email.toLowerCase())
                    : false;

                  const senderName = item.sender_name || 'Campus Student';
                  const initialLetter = senderName.trim()[0]?.toUpperCase() || '?';
                  const { cleanText, cardData } = parseSharedPostCard(item.text);
                  const imageAttachments = (item.attachments || []).filter((a: any) => a.file_type === 'IMAGE');
                  const docAttachments = (item.attachments || []).filter((a: any) => a.file_type === 'DOCUMENT');
                  const hasMedia = imageAttachments.length > 0 || docAttachments.length > 0 || Boolean(cardData);

                  return (
                    <View
                      style={[
                        styles.bubbleRow,
                        isMe ? styles.bubbleRowRight : styles.bubbleRowLeft,
                      ]}
                    >
                      {!isMe && (
                        <TouchableOpacity
                          disabled={!item.sender}
                          onPress={() => item.sender && onOpenProfile?.(item.sender)}
                          activeOpacity={0.7}
                          style={styles.senderAvatarMini}
                        >
                          <Text style={styles.senderAvatarMiniText}>{initialLetter}</Text>
                        </TouchableOpacity>
                      )}

                      {/* Deliberate Long Press triggers context menu (NO single tap trigger!) */}
                      <TouchableOpacity
                        activeOpacity={0.92}
                        delayLongPress={450}
                        onLongPress={() => setActionMessage(item)}
                        style={[
                          styles.chatBubble,
                          isMe ? styles.chatBubbleRight : styles.chatBubbleLeft,
                          hasMedia && styles.chatBubbleWithMedia,
                        ]}
                      >
                        {!isMe && (
                          <TouchableOpacity
                            disabled={!item.sender}
                            onPress={() => item.sender && onOpenProfile?.(item.sender)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.senderNameLabel}>{senderName}</Text>
                          </TouchableOpacity>
                        )}

                        {/* Media Grid */}
                        {item.attachments && item.attachments.filter((a: any) => a.file_type === 'IMAGE').length > 0 && (
                          <View style={{ marginBottom: cleanText ? 6 : 2 }}>
                            <MediaGrid images={item.attachments.filter((a: any) => a.file_type === 'IMAGE')} />
                          </View>
                        )}

                        {/* Document Cards */}
                        {item.attachments && item.attachments.filter((a: any) => a.file_type === 'DOCUMENT').length > 0 && (
                          <View style={{ marginBottom: cleanText ? 6 : 2, gap: 4 }}>
                            {item.attachments
                              .filter((a: any) => a.file_type === 'DOCUMENT')
                              .map((doc: any, idx: number) => (
                                <DocumentCard key={doc.id || idx} attachment={doc} />
                              ))}
                          </View>
                        )}

                        {/* Clean Text */}
                        {cleanText ? (
                          <Text style={[styles.bubbleMsgText, isMe && styles.bubbleMsgTextRight]}>
                            {cleanText}
                          </Text>
                        ) : null}

                        {/* Interactive Shared Campus Post Card */}
                        {cardData && (
                          <TouchableOpacity
                            style={styles.sharedPostCard}
                            onPress={() => {
                              if (onOpenPostDetail) {
                                onOpenPostDetail(cardData.id);
                              } else {
                                setViewingSharedPost(cardData);
                              }
                            }}
                            activeOpacity={0.88}
                          >
                            <View style={styles.sharedPostHeader}>
                              <Text style={styles.sharedPostAuthor} numberOfLines={1}>
                                {cardData.author_name}
                              </Text>
                              {cardData.community_name && (
                                <Text style={styles.sharedPostCommunity} numberOfLines={1}>
                                  🎓 {cardData.community_name}
                                </Text>
                              )}
                            </View>
                            {cardData.media_type === 'IMAGE' && cardData.media_url ? (
                              <Image
                                source={{ uri: cardData.media_url }}
                                style={styles.sharedPostThumb}
                                resizeMode="cover"
                              />
                            ) : null}
                            {cardData.content ? (
                              <Text style={styles.sharedPostSnippet} numberOfLines={2}>
                                {cardData.content}
                              </Text>
                            ) : null}
                            <View style={styles.sharedPostFooter}>
                              <Text style={styles.sharedPostCta}>View Original Post ↗</Text>
                            </View>
                          </TouchableOpacity>
                        )}

                        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeRight]}>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <Text style={styles.emptyIcon}>🏛️</Text>
                    <Text style={styles.emptyTitle}>Welcome to {activeCommunity.name}!</Text>
                    <Text style={styles.emptySubtitle}>
                      This is the official college community channel. Share notes, questions, and connect with your peers.
                    </Text>
                  </View>
                }
              />
            )}

            {/* Chat Input Bar */}
            <View style={styles.chatInputBar}>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => setAttachmentPickerVisible(true)}
                activeOpacity={0.7}
                accessibilityLabel="Attach media or documents"
              >
                <Paperclip size={20} color={colors.textMuted} />
              </TouchableOpacity>

              <TextInput
                style={styles.chatTextInput}
                placeholder={`Message ${activeCommunity.name}...`}
                placeholderTextColor={colors.textMuted}
                value={messageText}
                onChangeText={setMessageText}
                multiline
              />

              <TouchableOpacity
                style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
                onPress={handleSendHubMessage}
                disabled={!messageText.trim() || sendingMessage}
              >
                {sendingMessage ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Send size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB B: DISCUSS EXPERIENCE (Reddit / Stack Overflow Style - Modular) */}
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

        {/* Message Actions Bottom Sheet (TRIGGERED ONLY BY LONG-PRESS) */}
        {actionMessage && (
          <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={() => setActionMessage(null)}>
            <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setActionMessage(null)}>
              <View style={styles.sheetMenu}>
                <View style={styles.sheetDragBar} />
                <Text style={styles.sheetHeaderTitle}>Message Options</Text>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => handleCopyText(actionMessage.text)}
                >
                  <Copy size={16} color="#38bdf8" />
                  <Text style={styles.sheetActionText}>Copy Text</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => handleDeleteForMe(actionMessage)}
                >
                  <Trash2 size={16} color="#f87171" />
                  <Text style={[styles.sheetActionText, { color: '#f87171' }]}>Delete for Me</Text>
                </TouchableOpacity>

                {currentUser && actionMessage.sender === currentUser.id && (
                  <TouchableOpacity
                    style={styles.sheetActionItem}
                    onPress={() => handleDeleteForEveryone(actionMessage)}
                  >
                    <AlertTriangle size={16} color="#ef4444" />
                    <Text style={[styles.sheetActionText, { color: '#ef4444', fontWeight: '700' }]}>
                      Delete for Everyone
                    </Text>
                  </TouchableOpacity>
                )}

                {currentUser && actionMessage.sender !== currentUser.id && (
                  <TouchableOpacity
                    style={styles.sheetActionItem}
                    onPress={() => {
                      setReportTarget({ type: 'MESSAGE', id: actionMessage.id });
                      setActionMessage(null);
                      setReportModalVisible(true);
                    }}
                  >
                    <AlertTriangle size={16} color="#fbbf24" />
                    <Text style={[styles.sheetActionText, { color: '#fbbf24' }]}>Report Message</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* MEMBERS MODAL */}
        <Modal visible={membersModalVisible} animationType="slide" onRequestClose={() => setMembersModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMembersModalVisible(false)}>
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Community Members</Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
              {/* Quick Action Bar for Add People & Invite Link */}
              <View style={styles.membersActionBar}>
                <TouchableOpacity
                  style={styles.memberActionPill}
                  onPress={() => setAddMembersModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <UserPlus size={15} color="#38bdf8" style={{ marginRight: 6 }} />
                  <Text style={styles.memberActionPillText}>Add People</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.memberActionPill}
                  onPress={() => setInviteLinkModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Link2 size={15} color="#38bdf8" style={{ marginRight: 6 }} />
                  <Text style={styles.memberActionPillText}>Invite Link</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.discussSearchBox}>
                <Search size={14} color="#64748b" />
                <TextInput
                  style={styles.discussSearchInput}
                  placeholder="Search members by name or email..."
                  placeholderTextColor="#64748b"
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
                    <View style={styles.memberRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        disabled={!item.user?.id}
                        onPress={() => {
                          setMembersModalVisible(false);
                          item.user?.id && onOpenProfile?.(item.user.id);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>
                            {item.user.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{item.user.full_name}</Text>
                          <Text style={styles.memberCourse}>{item.user.course_branch || item.user.email}</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={styles.roleBadge}>
                          <Text style={styles.roleBadgeText}>{item.role}</Text>
                        </View>
                        {canManage && (
                          <>
                            <TouchableOpacity
                              style={[styles.memberActionBtn, { borderColor: '#38bdf8' }]}
                              onPress={() => handleUpdateRole(item.id, item.role)}
                            >
                              <Text style={[styles.memberActionText, { color: '#38bdf8' }]}>Role</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.memberActionBtn, { borderColor: '#ef4444' }]}
                              onPress={() => handleRemoveMember(item.id, item.user.full_name)}
                            >
                              <Text style={[styles.memberActionText, { color: '#ef4444' }]}>Remove</Text>
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
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
                <TouchableOpacity style={styles.leaveCommunityBtn} onPress={handleLeaveCommunity}>
                  <Text style={styles.leaveCommunityBtnText}>Leave Community</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>

        {/* REPORT MODAL */}
        <Modal visible={reportModalVisible} transparent animationType="fade" onRequestClose={() => setReportModalVisible(false)}>
          <View style={styles.sheetOverlay}>
            <View style={styles.reportModalCard}>
              <Text style={styles.reportTitle}>Report Inappropriate Content</Text>
              <Text style={styles.reportSubtitle}>
                Reports are sent directly to community administrators and moderators.
              </Text>

              <Text style={styles.formLabel}>Reason</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {(['SPAM', 'HARASSMENT', 'ABUSIVE', 'INAPPROPRIATE', 'FAKE_INFO', 'OTHER'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.typeSelectPill, reportReason === r && styles.typeSelectPillActive]}
                    onPress={() => setReportReason(r)}
                  >
                    <Text style={[styles.typeSelectText, reportReason === r && styles.typeSelectTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={[styles.modalInput, { height: 80, marginTop: 8 }]}
                placeholder="Additional details (optional)..."
                placeholderTextColor="#64748b"
                value={reportDesc}
                onChangeText={setReportDesc}
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setReportModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleSubmitReport} disabled={submittingReport}>
                  {submittingReport ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Submit Report</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MORE OPTIONS MENU SHEET */}
        {moreMenuVisible && (
          <Modal visible={moreMenuVisible} transparent animationType="fade" onRequestClose={() => setMoreMenuVisible(false)}>
            <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMoreMenuVisible(false)}>
              <View style={styles.sheetMenu}>
                <View style={styles.sheetDragBar} />
                <Text style={styles.sheetHeaderTitle}>{activeCommunity.name}</Text>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    handleOpenMembers();
                    setAddMembersModalVisible(true);
                  }}
                >
                  <UserPlus size={16} color="#38bdf8" />
                  <Text style={styles.sheetActionText}>Add People</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    setInviteLinkModalVisible(true);
                  }}
                >
                  <Link2 size={16} color="#38bdf8" />
                  <Text style={styles.sheetActionText}>Group Invite Link</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    handleOpenMembers();
                  }}
                >
                  <Users size={16} color="#38bdf8" />
                  <Text style={styles.sheetActionText}>View Members ({activeCommunity.total_members})</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    Share.share({
                      message: `Join ${activeCommunity.name} on Campus Connect!`,
                    });
                  }}
                >
                  <Share2 size={16} color="#38bdf8" />
                  <Text style={styles.sheetActionText}>Share Community</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    setReportTarget({ type: 'COMMUNITY', id: String(activeCommunity.id) });
                    setReportModalVisible(true);
                  }}
                >
                  <AlertTriangle size={16} color="#fbbf24" />
                  <Text style={[styles.sheetActionText, { color: '#fbbf24' }]}>Report Community</Text>
                </TouchableOpacity>

                {!activeCommunity.is_system_managed && (
                  <TouchableOpacity
                    style={styles.sheetActionItem}
                    onPress={async () => {
                      setMoreMenuVisible(false);
                      try {
                        await communityService.toggleJoin(activeCommunity.slug);
                        setActiveCommunity(null);
                        loadCommunities();
                      } catch (e) {
                        Alert.alert('Error', 'Cannot leave community');
                      }
                    }}
                  >
                    <Trash2 size={16} color="#ef4444" />
                    <Text style={[styles.sheetActionText, { color: '#ef4444' }]}>Leave Community</Text>
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Campus Hubs</Text>
          <Text style={styles.headerSubtitle}>
            Your verified academic & student communities
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.joinLinkHeaderBtn}
            onPress={() => setJoinViaInviteModalVisible(true)}
            activeOpacity={0.8}
          >
            <Link2 size={14} color="#38bdf8" style={{ marginRight: 4 }} />
            <Text style={styles.joinLinkHeaderBtnText}>Join via Link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setCreateCommunityModalVisible(true)}
            activeOpacity={0.8}
          >
            <Plus size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.createBtnText}>Create Hub</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search official college, course, or custom hubs..."
          placeholderTextColor={colors.textSecondary}
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
          {(['ALL', 'COLLEGE', 'COURSE', 'CUSTOM'] as const).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>
                {cat === 'ALL'
                  ? '🏛️ All Hubs'
                  : cat === 'COLLEGE'
                  ? '🎓 College'
                  : cat === 'COURSE'
                  ? '📚 Course'
                  : '👥 Custom'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Communities List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading campus communities...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCommunities}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const badgeColor = getBadgeColor(item.community_type);
            const latestDisc = item.latest_discussion;
            return (
              <TouchableOpacity
                style={styles.communityCard}
                onPress={() => setActiveCommunity(item)}
                activeOpacity={0.9}
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      👥 {item.total_members || 0} members • Campus Community
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.typeBadgeText}>{item.community_type}</Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}

                {/* Card Action Row */}
                <View style={styles.cardActionRow}>
                  <View style={styles.openCommunityBtn}>
                    <Text style={styles.openCommunityBtnText}>Open Hub Chat & Discussions →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No communities found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search query or category filters.</Text>
            </View>
          }
        />
      )}

      {/* CREATE CUSTOM COMMUNITY MODAL */}
      <Modal visible={createCommunityModalVisible} animationType="slide" transparent onRequestClose={() => setCreateCommunityModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.reportModalCard}>
            <Text style={styles.reportTitle}>Create Student Community</Text>
            <Text style={styles.reportSubtitle}>
              Create a custom club, society, or hostel group for your campus mates.
            </Text>

            <Text style={styles.formLabel}>Community Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. AI & Robotics Club, Devsthali Hostel"
              placeholderTextColor="#64748b"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="What is this community about?"
              placeholderTextColor="#64748b"
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateCommunityModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleCreateCustom} disabled={creatingCommunity}>
                {creatingCommunity ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Create Hub</Text>}
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
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
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  joinLinkHeaderBtnText: {
    color: '#38bdf8',
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
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  memberActionPillText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
  },
  categoryBar: {
    paddingVertical: 10,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  categoryPillActive: {
    backgroundColor: '#0284c7',
  },
  categoryPillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  communityCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: colors.textSecondary,
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
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  latestDiscCard: {
    backgroundColor: '#0b0f19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 10,
    marginBottom: 10,
  },
  latestDiscHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  latestDiscTime: {
    color: '#64748b',
    fontSize: 10,
  },
  latestDiscTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    marginTop: 4,
  },
  openCommunityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openCommunityBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  // Community Details Header
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  backBtn: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  backBtnArrow: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  communityHeaderCenter: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  communityTitle: {
    color: '#ffffff',
    fontSize: 16,
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
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Segmented Two Tabs (Matches Exact Screenshot!)
  segmentedTabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0b0f19',
    gap: 12,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  segmentedTabActive: {
    backgroundColor: '#2563eb', // Matches blue button in screenshot
  },
  segmentedTabText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '700',
  },
  segmentedTabTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  // Chat Styles
  chatListContent: {
    padding: 16,
    paddingBottom: 24,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  senderAvatarMini: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  senderAvatarMiniText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '700',
  },
  chatBubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  chatBubbleWithMedia: {
    width: 260,
    maxWidth: '85%',
  },
  chatBubbleRight: {
    backgroundColor: '#1d4ed8',
    borderBottomRightRadius: 3,
  },
  chatBubbleLeft: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  senderNameLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  bubbleMsgText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 19,
  },
  bubbleMsgTextRight: {
    color: '#ffffff',
  },
  bubbleTime: {
    color: '#94a3b8',
    fontSize: 9.5,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleTimeRight: {
    color: '#bfdbfe',
  },
  sharedPostCard: {
    backgroundColor: '#0b0f19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    padding: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  sharedPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sharedPostAuthor: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  sharedPostCommunity: {
    color: '#38bdf8',
    fontSize: 10,
  },
  sharedPostSnippet: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 4,
  },
  sharedPostThumb: {
    width: '100%',
    height: 120,
    borderRadius: 6,
    marginVertical: 4,
  },
  sharedPostFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 4,
  },
  sharedPostCta: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 8,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTextInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    backgroundColor: '#1e293b',
    color: '#ffffff',
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  // Discuss Tab Styles
  discussTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  startDiscussBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  startDiscussBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  discussSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    gap: 6,
  },
  discussSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
  },
  filterBar: {
    paddingVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#1e293b',
  },
  filterChipActive: {
    backgroundColor: '#0284c7',
  },
  filterChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  discussListContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  discussionCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 14,
  },
  discussCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  discussBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discussTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  discussTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  pinnedBadgeText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
  },
  solvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  solvedBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
  discussTime: {
    color: '#64748b',
    fontSize: 10.5,
  },
  discussTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 6,
  },
  discussSnippet: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  attachmentIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  attachmentIndicatorText: {
    color: '#38bdf8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  discussFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    paddingTop: 10,
    gap: 14,
  },
  upvoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  upvoteBtnActive: {
    backgroundColor: '#0284c7',
  },
  upvoteText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  upvoteTextActive: {
    color: '#ffffff',
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerStatText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  discussAuthor: {
    color: '#64748b',
    fontSize: 10.5,
    marginLeft: 'auto',
  },
  // Discussion Detail Modal
  detailContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  detailBackBtn: {
    padding: 4,
  },
  detailHeaderTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  detailReportBtn: {
    padding: 6,
  },
  detailScroll: {
    flex: 1,
  },
  detailMainTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginVertical: 10,
  },
  detailAuthorInfo: {
    color: '#94a3b8',
    fontSize: 11.5,
    marginBottom: 14,
  },
  detailContentText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  sectionSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailVoteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 14,
  },
  modActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  modActionPillText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  answersHeaderRow: {
    marginVertical: 12,
  },
  answersHeaderText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  replyCard: {
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 12,
    marginBottom: 10,
  },
  acceptedReplyCard: {
    borderColor: '#10b981',
    borderWidth: 1.5,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  acceptedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  acceptedBannerText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  replyAuthor: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  replyTime: {
    color: '#64748b',
    fontSize: 10,
  },
  replyBody: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  replyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    paddingTop: 6,
  },
  replyVoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  replyVoteBtnActive: {
    backgroundColor: '#0284c7',
  },
  replyVoteText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  acceptActionBtn: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  acceptActionText: {
    color: '#34d399',
    fontSize: 10.5,
    fontWeight: '700',
  },
  noRepliesText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 20,
  },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 18,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    maxHeight: 80,
  },
  replySendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySendBtnDisabled: {
    opacity: 0.5,
  },
  // Modal Base Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  modalHeaderTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  publishBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  publishBtnDisabled: {
    opacity: 0.5,
  },
  publishBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  formLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  typeSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  typeSelectPillActive: {
    backgroundColor: '#0284c7',
  },
  typeSelectText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  typeSelectTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  attachPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 18,
  },
  attachPickerTriggerText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  stagedFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  stagedFileName: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 11.5,
  },
  // Members List Styles
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
  },
  memberName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  memberCourse: {
    color: '#94a3b8',
    fontSize: 10.5,
  },
  roleBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  memberActionBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#0f172a',
  },
  memberActionText: {
    fontSize: 10,
    fontWeight: '600',
  },
  leaveCommunityBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveCommunityBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  // Report Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  reportModalCard: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '85%',
  },
  reportTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  reportSubtitle: {
    color: '#94a3b8',
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
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0284c7',
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetMenu: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  sheetDragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeaderTitle: {
    color: '#ffffff',
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
    borderBottomColor: '#1e293b',
  },
  sheetActionText: {
    color: '#ffffff',
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
    color: '#94a3b8',
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
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
