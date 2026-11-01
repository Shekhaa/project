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
} from 'lucide-react-native';
import { MediaGrid } from '../components/media/MediaGrid';
import { DocumentCard } from '../components/media/DocumentCard';
import { AttachmentPickerModal, StagedAttachment } from '../components/media/AttachmentPickerModal';
import { parseSharedPostCard, SharedPostCardData } from '../components/chat/MessageBubble';
import { ImageViewerModal } from '../components/media/ImageViewerModal';

interface CommunitiesScreenProps {
  currentUser?: any;
  onOpenCommunityChat?: (conversation: any) => void;
  onOpenPostDetail?: (postId: number) => void;
}

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({
  currentUser,
  onOpenCommunityChat,
  onOpenPostDetail,
}) => {
  // Discovery State
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'COLLEGE' | 'COURSE' | 'CLUB' | 'CUSTOM'>('ALL');
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

  // Discuss State
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [discussionsLoading, setDiscussionsLoading] = useState(false);
  const [discussFilter, setDiscussFilter] = useState<'ALL' | 'QUESTION' | 'RESOURCE' | 'GENERAL' | 'SOLVED'>('ALL');
  const [discussSort, setDiscussSort] = useState<'latest' | 'upvoted' | 'popular' | 'unanswered'>('latest');
  const [discussSearch, setDiscussSearch] = useState('');
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null);
  const [discussionDetailLoading, setDiscussionDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<DiscussionReply | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Create Discussion State
  const [createDiscussionVisible, setCreateDiscussionVisible] = useState(false);
  const [newDiscTitle, setNewDiscTitle] = useState('');
  const [newDiscContent, setNewDiscContent] = useState('');
  const [newDiscType, setNewDiscType] = useState<'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT'>('GENERAL');
  const [newDiscTags, setNewDiscTags] = useState('');
  const [creatingDiscussion, setCreatingDiscussion] = useState(false);
  const [discStagedFiles, setDiscStagedFiles] = useState<StagedAttachment[]>([]);
  const [discAttachmentPickerVisible, setDiscAttachmentPickerVisible] = useState(false);

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

  // FlatList Ref for Auto-Scroll
  const chatFlatListRef = useRef<FlatList>(null);

  // Load My Enrolled Communities
  const loadCommunities = async () => {
    setLoading(true);
    try {
      const data = await communityService.getMyCommunities();
      setCommunities(data);
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
      setDiscussions([]);
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

    // 2. Fetch discussions
    loadDiscussions(activeCommunity.slug);
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

  // Load Discussions
  const loadDiscussions = async (slug?: string) => {
    const targetSlug = slug || activeCommunity?.slug;
    if (!targetSlug) return;

    setDiscussionsLoading(true);
    try {
      const params: any = { sort: discussSort };
      if (discussFilter === 'SOLVED') {
        params.status = 'solved';
      } else if (discussFilter !== 'ALL') {
        params.type = discussFilter;
      }
      if (discussSearch.trim()) {
        params.q = discussSearch.trim();
      }
      const data = await communityService.getDiscussions(targetSlug, params);
      setDiscussions(data);
    } catch (e) {
      console.log('Error loading discussions', e);
    } finally {
      setDiscussionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeCommunity && activeTab === 'DISCUSS') {
      loadDiscussions();
    }
  }, [discussFilter, discussSort, discussSearch, activeTab]);

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

  // Upvote Discussion
  const handleVoteDiscussion = async (discussion: Discussion, replyId?: string) => {
    if (!activeCommunity) return;
    try {
      const res = await communityService.voteDiscussion(activeCommunity.slug, discussion.id, replyId);
      if (!replyId) {
        setDiscussions((prev) =>
          prev.map((d) =>
            d.id === discussion.id
              ? { ...d, user_has_voted: res.voted, upvotes_count: res.upvotes_count }
              : d
          )
        );
        if (selectedDiscussion && selectedDiscussion.id === discussion.id) {
          setSelectedDiscussion((prev) =>
            prev ? { ...prev, user_has_voted: res.voted, upvotes_count: res.upvotes_count } : null
          );
        }
      } else {
        // Updated reply vote in selected discussion
        if (selectedDiscussion) {
          const updateReplies = (replies?: DiscussionReply[]): DiscussionReply[] => {
            if (!replies) return [];
            return replies.map((r) => {
              if (r.id === replyId) {
                return { ...r, user_has_voted: res.voted, upvotes_count: res.upvotes_count };
              }
              if (r.children && r.children.length > 0) {
                return { ...r, children: updateReplies(r.children) };
              }
              return r;
            });
          };
          setSelectedDiscussion({
            ...selectedDiscussion,
            replies: updateReplies(selectedDiscussion.replies),
          });
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Could not submit vote.');
    }
  };

  // Open Discussion Detail
  const handleOpenDiscussionDetail = async (disc: Discussion) => {
    if (!activeCommunity) return;
    setSelectedDiscussion(disc);
    setDiscussionDetailLoading(true);
    try {
      const detail = await communityService.getDiscussionDetail(activeCommunity.slug, disc.id);
      setSelectedDiscussion(detail);
    } catch (e) {
      console.log('Error opening discussion', e);
    } finally {
      setDiscussionDetailLoading(false);
    }
  };

  // Submit Reply
  const handleAddReply = async () => {
    if (!replyText.trim() || !selectedDiscussion || !activeCommunity || submittingReply) return;

    setSubmittingReply(true);
    try {
      const newReply = await communityService.createReply(
        activeCommunity.slug,
        selectedDiscussion.id,
        replyText.trim(),
        replyingTo?.id
      );

      // Refresh discussion detail
      const updatedDetail = await communityService.getDiscussionDetail(activeCommunity.slug, selectedDiscussion.id);
      setSelectedDiscussion(updatedDetail);
      setReplyText('');
      setReplyingTo(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to publish reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Mark Accepted Answer
  const handleMarkAccepted = async (replyId: string) => {
    if (!selectedDiscussion || !activeCommunity) return;
    try {
      const res = await communityService.markAcceptedAnswer(activeCommunity.slug, selectedDiscussion.id, replyId);
      const updated = await communityService.getDiscussionDetail(activeCommunity.slug, selectedDiscussion.id);
      setSelectedDiscussion(updated);
      setDiscussions((prev) =>
        prev.map((d) => (d.id === selectedDiscussion.id ? { ...d, is_solved: res.is_solved } : d))
      );
    } catch (e) {
      Alert.alert('Error', 'Only question author can accept answers.');
    }
  };

  // Pin/Solve Discussion
  const handleTogglePin = async () => {
    if (!selectedDiscussion || !activeCommunity) return;
    try {
      const res = await communityService.togglePinDiscussion(activeCommunity.slug, selectedDiscussion.id);
      setSelectedDiscussion({ ...selectedDiscussion, is_pinned: res.is_pinned });
      setDiscussions((prev) =>
        prev.map((d) => (d.id === selectedDiscussion.id ? { ...d, is_pinned: res.is_pinned } : d))
      );
    } catch (e) {
      Alert.alert('Permission Denied', 'Only community admins and moderators can pin discussions.');
    }
  };

  // Create Discussion
  const handleCreateDiscussion = async () => {
    if (!newDiscTitle.trim() || !newDiscContent.trim() || !activeCommunity || creatingDiscussion) {
      Alert.alert('Required', 'Please fill in both title and description.');
      return;
    }

    setCreatingDiscussion(true);
    try {
      let attachmentIds: string[] = [];
      if (discStagedFiles.length > 0) {
        // Upload attachments first via chat service upload utility if needed
        const uploaded = await Promise.all(
          discStagedFiles.map((file) => chatService.uploadAttachmentFile(file))
        );
        attachmentIds = uploaded.map((u) => u.id);
      }

      const newDisc = await communityService.createDiscussion(activeCommunity.slug, {
        title: newDiscTitle.trim(),
        content: newDiscContent.trim(),
        discussion_type: newDiscType,
        tags: newDiscTags.trim(),
        attachment_ids: attachmentIds,
      });

      setDiscussions((prev) => [newDisc, ...prev]);
      setCreateDiscussionVisible(false);
      setNewDiscTitle('');
      setNewDiscContent('');
      setNewDiscTags('');
      setDiscStagedFiles([]);
      Alert.alert('Published! 🚀', 'Your discussion is live for the community.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not publish discussion.');
    } finally {
      setCreatingDiscussion(false);
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
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCat =
      selectedCategory === 'ALL' ||
      (selectedCategory === 'COLLEGE' && c.community_type === 'COLLEGE') ||
      (selectedCategory === 'COURSE' && ['COURSE', 'BRANCH', 'YEAR', 'SECTION'].includes(c.community_type)) ||
      (selectedCategory === 'CLUB' && c.community_type === 'CLUB') ||
      (selectedCategory === 'CUSTOM' && c.community_type === 'CUSTOM');

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

                  return (
                    <View
                      style={[
                        styles.bubbleRow,
                        isMe ? styles.bubbleRowRight : styles.bubbleRowLeft,
                      ]}
                    >
                      {!isMe && (
                        <View style={styles.senderAvatarMini}>
                          <Text style={styles.senderAvatarMiniText}>{initialLetter}</Text>
                        </View>
                      )}

                      {/* Deliberate Long Press triggers context menu (NO single tap trigger!) */}
                      <TouchableOpacity
                        activeOpacity={0.92}
                        delayLongPress={450}
                        onLongPress={() => setActionMessage(item)}
                        style={[
                          styles.chatBubble,
                          isMe ? styles.chatBubbleRight : styles.chatBubbleLeft,
                        ]}
                      >
                        {!isMe && (
                          <Text style={styles.senderNameLabel}>{senderName}</Text>
                        )}

                        {/* Media Grid */}
                        {item.attachments && item.attachments.filter((a) => a.file_type === 'IMAGE').length > 0 && (
                          <View style={{ marginBottom: cleanText ? 6 : 2 }}>
                            <MediaGrid images={item.attachments.filter((a) => a.file_type === 'IMAGE')} />
                          </View>
                        )}

                        {/* Document Cards */}
                        {item.attachments && item.attachments.filter((a) => a.file_type === 'DOCUMENT').length > 0 && (
                          <View style={{ marginBottom: cleanText ? 6 : 2, gap: 4 }}>
                            {item.attachments
                              .filter((a) => a.file_type === 'DOCUMENT')
                              .map((doc, idx) => (
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
                            onPress={() => onOpenPostDetail && onOpenPostDetail(cardData.id)}
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

        {/* TAB B: DISCUSS EXPERIENCE (Reddit / Stack Overflow Style) */}
        {activeTab === 'DISCUSS' && (
          <View style={{ flex: 1 }}>
            {/* Top Toolbar: Start Discussion Button + Search */}
            <View style={styles.discussTopBar}>
              <TouchableOpacity
                style={styles.startDiscussBtn}
                onPress={() => setCreateDiscussionVisible(true)}
                activeOpacity={0.85}
              >
                <Plus size={16} color="#ffffff" />
                <Text style={styles.startDiscussBtnText}>Start a Discussion</Text>
              </TouchableOpacity>

              <View style={styles.discussSearchBox}>
                <Search size={14} color="#64748b" />
                <TextInput
                  style={styles.discussSearchInput}
                  placeholder="Search discussions..."
                  placeholderTextColor="#64748b"
                  value={discussSearch}
                  onChangeText={setDiscussSearch}
                />
              </View>
            </View>

            {/* Filter Chips Bar */}
            <View style={styles.filterBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
                {(['ALL', 'QUESTION', 'RESOURCE', 'GENERAL', 'SOLVED'] as const).map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterChip, discussFilter === filter && styles.filterChipActive]}
                    onPress={() => setDiscussFilter(filter)}
                  >
                    <Text style={[styles.filterChipText, discussFilter === filter && styles.filterChipTextActive]}>
                      {filter === 'ALL'
                        ? 'All'
                        : filter === 'QUESTION'
                        ? 'Questions ❓'
                        : filter === 'RESOURCE'
                        ? 'Resources 📚'
                        : filter === 'GENERAL'
                        ? 'General 💬'
                        : 'Solved ✅'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Discussion Feed */}
            {discussionsLoading && discussions.length === 0 ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.loadingText}>Loading discussions...</Text>
              </View>
            ) : (
              <FlatList
                data={discussions}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.discussListContent}
                renderItem={({ item }) => {
                  const typeColor = getDiscussionTypeColor(item.discussion_type);
                  return (
                    <TouchableOpacity
                      style={styles.discussionCard}
                      onPress={() => handleOpenDiscussionDetail(item)}
                      activeOpacity={0.9}
                    >
                      {/* Top Meta Row */}
                      <View style={styles.discussCardHeader}>
                        <View style={styles.discussBadgeRow}>
                          <View style={[styles.discussTypeBadge, { backgroundColor: `${typeColor}22`, borderColor: typeColor }]}>
                            <Text style={[styles.discussTypeBadgeText, { color: typeColor }]}>
                              {item.discussion_type}
                            </Text>
                          </View>
                          {item.is_pinned && (
                            <View style={styles.pinnedBadge}>
                              <Pin size={10} color="#f59e0b" />
                              <Text style={styles.pinnedBadgeText}>Pinned</Text>
                            </View>
                          )}
                          {item.is_solved && (
                            <View style={styles.solvedBadge}>
                              <CheckCircle size={10} color="#10b981" />
                              <Text style={styles.solvedBadgeText}>Solved</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.discussTime}>
                          {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>

                      {/* Discussion Title */}
                      <Text style={styles.discussTitle} numberOfLines={2}>
                        {item.title}
                      </Text>

                      {/* Content Preview */}
                      {item.content ? (
                        <Text style={styles.discussSnippet} numberOfLines={2}>
                          {item.content}
                        </Text>
                      ) : null}

                      {/* Attachments preview badge if exists */}
                      {item.attachments && item.attachments.length > 0 && (
                        <View style={styles.attachmentIndicatorRow}>
                          <FileText size={12} color="#38bdf8" />
                          <Text style={styles.attachmentIndicatorText}>
                            {item.attachments.length} attached file{item.attachments.length > 1 ? 's' : ''} (Notes / Docs)
                          </Text>
                        </View>
                      )}

                      {/* Bottom Action Row (Reddit / StackOverflow style) */}
                      <View style={styles.discussFooter}>
                        {/* Upvote Button */}
                        <TouchableOpacity
                          style={[styles.upvoteBtn, item.user_has_voted && styles.upvoteBtnActive]}
                          onPress={() => handleVoteDiscussion(item)}
                          activeOpacity={0.7}
                        >
                          <ArrowUp size={14} color={item.user_has_voted ? '#ffffff' : '#38bdf8'} />
                          <Text style={[styles.upvoteText, item.user_has_voted && styles.upvoteTextActive]}>
                            {item.upvotes_count || 0}
                          </Text>
                        </TouchableOpacity>

                        {/* Replies Count */}
                        <View style={styles.footerStat}>
                          <MessageSquare size={13} color="#94a3b8" />
                          <Text style={styles.footerStatText}>
                            {item.replies_count || 0} replies
                          </Text>
                        </View>

                        {/* Author */}
                        <Text style={styles.discussAuthor} numberOfLines={1}>
                          by {item.author_name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <Text style={styles.emptyIcon}>💡</Text>
                    <Text style={styles.emptyTitle}>No discussions yet</Text>
                    <Text style={styles.emptySubtitle}>
                      Be the first to ask a question, share college notes, or start a discussion in {activeCommunity.name}!
                    </Text>
                  </View>
                }
              />
            )}
          </View>
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

        {/* DISCUSSION DETAIL MODAL (Answers, Voting, Solved Answer) */}
        {selectedDiscussion && (
          <Modal visible={!!selectedDiscussion} animationType="slide" onRequestClose={() => setSelectedDiscussion(null)}>
            <KeyboardAvoidingView style={styles.detailContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              {/* Detail Header */}
              <View style={styles.detailHeader}>
                <TouchableOpacity onPress={() => setSelectedDiscussion(null)} style={styles.detailBackBtn}>
                  <Text style={styles.backBtnArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                  Discussion
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setReportTarget({ type: 'DISCUSSION', id: selectedDiscussion.id });
                    setReportModalVisible(true);
                  }}
                  style={styles.detailReportBtn}
                >
                  <AlertTriangle size={16} color="#fbbf24" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.detailScroll} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
                {/* Meta Row */}
                <View style={styles.discussBadgeRow}>
                  <View
                    style={[
                      styles.discussTypeBadge,
                      {
                        backgroundColor: `${getDiscussionTypeColor(selectedDiscussion.discussion_type)}22`,
                        borderColor: getDiscussionTypeColor(selectedDiscussion.discussion_type),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.discussTypeBadgeText,
                        { color: getDiscussionTypeColor(selectedDiscussion.discussion_type) },
                      ]}
                    >
                      {selectedDiscussion.discussion_type}
                    </Text>
                  </View>
                  {selectedDiscussion.is_pinned && (
                    <View style={styles.pinnedBadge}>
                      <Pin size={10} color="#f59e0b" />
                      <Text style={styles.pinnedBadgeText}>Pinned</Text>
                    </View>
                  )}
                  {selectedDiscussion.is_solved && (
                    <View style={styles.solvedBadge}>
                      <CheckCircle size={10} color="#10b981" />
                      <Text style={styles.solvedBadgeText}>Solved</Text>
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text style={styles.detailMainTitle}>{selectedDiscussion.title}</Text>

                {/* Author Info */}
                <Text style={styles.detailAuthorInfo}>
                  Asked by <Text style={{ color: '#38bdf8', fontWeight: '700' }}>{selectedDiscussion.author_name}</Text> •{' '}
                  {new Date(selectedDiscussion.created_at).toLocaleDateString()}
                </Text>

                {/* Full Body */}
                <Text style={styles.detailContentText}>{selectedDiscussion.content}</Text>

                {/* Attachments if any */}
                {selectedDiscussion.attachments && selectedDiscussion.attachments.length > 0 && (
                  <View style={{ marginTop: 12, marginBottom: 8, gap: 6 }}>
                    <Text style={styles.sectionSubtitle}>Attached Materials & Notes:</Text>
                    {selectedDiscussion.attachments.map((doc, idx) => (
                      <DocumentCard key={doc.id || idx} attachment={doc} />
                    ))}
                  </View>
                )}

                {/* Upvote & Pin Action Bar */}
                <View style={styles.detailVoteBar}>
                  <TouchableOpacity
                    style={[styles.upvoteBtn, selectedDiscussion.user_has_voted && styles.upvoteBtnActive]}
                    onPress={() => handleVoteDiscussion(selectedDiscussion)}
                  >
                    <ArrowUp size={14} color={selectedDiscussion.user_has_voted ? '#ffffff' : '#38bdf8'} />
                    <Text style={[styles.upvoteText, selectedDiscussion.user_has_voted && styles.upvoteTextActive]}>
                      {selectedDiscussion.upvotes_count || 0} Upvotes
                    </Text>
                  </TouchableOpacity>

                  {/* Mod / Author Controls */}
                  <TouchableOpacity style={styles.modActionPill} onPress={handleTogglePin}>
                    <Pin size={12} color="#f59e0b" />
                    <Text style={styles.modActionPillText}>
                      {selectedDiscussion.is_pinned ? 'Unpin' : 'Pin'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Answers / Replies Header */}
                <View style={styles.answersHeaderRow}>
                  <Text style={styles.answersHeaderText}>
                    Answers & Discussion ({selectedDiscussion.replies?.length || 0})
                  </Text>
                </View>

                {/* Replies Stream */}
                {selectedDiscussion.replies && selectedDiscussion.replies.length > 0 ? (
                  selectedDiscussion.replies.map((reply) => {
                    const isAccepted = reply.is_accepted;
                    return (
                      <View
                        key={reply.id}
                        style={[styles.replyCard, isAccepted && styles.acceptedReplyCard]}
                      >
                        {isAccepted && (
                          <View style={styles.acceptedBanner}>
                            <CheckCircle size={12} color="#10b981" />
                            <Text style={styles.acceptedBannerText}>✓ Accepted Solution</Text>
                          </View>
                        )}
                        <View style={styles.replyHeader}>
                          <Text style={styles.replyAuthor}>{reply.author_name}</Text>
                          <Text style={styles.replyTime}>
                            {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={styles.replyBody}>{reply.content}</Text>

                        {/* Reply Footer Controls */}
                        <View style={styles.replyFooter}>
                          <TouchableOpacity
                            style={[styles.replyVoteBtn, reply.user_has_voted && styles.replyVoteBtnActive]}
                            onPress={() => handleVoteDiscussion(selectedDiscussion, reply.id)}
                          >
                            <ArrowUp size={12} color={reply.user_has_voted ? '#ffffff' : '#94a3b8'} />
                            <Text style={styles.replyVoteText}>{reply.upvotes_count || 0}</Text>
                          </TouchableOpacity>

                          {/* Accept Answer action for Question author */}
                          {currentUser && selectedDiscussion.author === currentUser.id && (
                            <TouchableOpacity
                              style={styles.acceptActionBtn}
                              onPress={() => handleMarkAccepted(reply.id)}
                            >
                              <Text style={styles.acceptActionText}>
                                {isAccepted ? 'Unmark Accepted' : 'Accept Answer ✓'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.noRepliesText}>No answers yet. Share your knowledge below!</Text>
                )}
              </ScrollView>

              {/* Bottom Reply Composer */}
              <View style={styles.replyComposer}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Write an answer or helpful reply..."
                  placeholderTextColor="#64748b"
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.replySendBtn, !replyText.trim() && styles.replySendBtnDisabled]}
                  onPress={handleAddReply}
                  disabled={!replyText.trim() || submittingReply}
                >
                  <Send size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* CREATE DISCUSSION MODAL */}
        <Modal visible={createDiscussionVisible} animationType="slide" onRequestClose={() => setCreateDiscussionVisible(false)}>
          <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setCreateDiscussionVisible(false)}>
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Start a Discussion</Text>
              <TouchableOpacity
                style={[styles.publishBtn, (!newDiscTitle.trim() || !newDiscContent.trim()) && styles.publishBtnDisabled]}
                onPress={handleCreateDiscussion}
                disabled={!newDiscTitle.trim() || !newDiscContent.trim() || creatingDiscussion}
              >
                {creatingDiscussion ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.publishBtnText}>Post</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              {/* Discussion Type Selector */}
              <Text style={styles.formLabel}>Discussion Type</Text>
              <View style={styles.typeSelectorRow}>
                {(['GENERAL', 'QUESTION', 'RESOURCE', 'ANNOUNCEMENT'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeSelectPill, newDiscType === type && styles.typeSelectPillActive]}
                    onPress={() => setNewDiscType(type)}
                  >
                    <Text style={[styles.typeSelectText, newDiscType === type && styles.typeSelectTextActive]}>
                      {type === 'GENERAL'
                        ? 'General 💬'
                        : type === 'QUESTION'
                        ? 'Question ❓'
                        : type === 'RESOURCE'
                        ? 'Resource 📚'
                        : 'Notice 📢'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Title */}
              <Text style={styles.formLabel}>Title</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Which programming language should I learn for placements?"
                placeholderTextColor="#64748b"
                value={newDiscTitle}
                onChangeText={setNewDiscTitle}
              />

              {/* Content */}
              <Text style={styles.formLabel}>Description / Details</Text>
              <TextInput
                style={[styles.modalInput, { height: 130, textAlignVertical: 'top' }]}
                placeholder="Explain the context, requirements, or share your thoughts..."
                placeholderTextColor="#64748b"
                value={newDiscContent}
                onChangeText={setNewDiscContent}
                multiline
              />

              {/* Tags */}
              <Text style={styles.formLabel}>Tags (comma separated)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. cse, placements, dsa, exam"
                placeholderTextColor="#64748b"
                value={newDiscTags}
                onChangeText={setNewDiscTags}
              />

              {/* Attachments Section */}
              <TouchableOpacity
                style={styles.attachPickerTrigger}
                onPress={() => setDiscAttachmentPickerVisible(true)}
              >
                <Paperclip size={18} color="#38bdf8" />
                <Text style={styles.attachPickerTriggerText}>
                  Attach Photos or Study Documents (PDF, Word, Notes)
                </Text>
              </TouchableOpacity>

              {discStagedFiles.length > 0 && (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {discStagedFiles.map((f) => (
                    <View key={f.id} style={styles.stagedFileItem}>
                      <FileText size={14} color="#38bdf8" />
                      <Text style={styles.stagedFileName} numberOfLines={1}>{f.name}</Text>
                      <TouchableOpacity onPress={() => setDiscStagedFiles((prev) => prev.filter((item) => item.id !== f.id))}>
                        <X size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Staged Picker for Discussions */}
          <AttachmentPickerModal
            visible={discAttachmentPickerVisible}
            onClose={() => setDiscAttachmentPickerVisible(false)}
            onSend={(files) => {
              setDiscStagedFiles(files);
              setDiscAttachmentPickerVisible(false);
            }}
          />
        </Modal>

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

            <View style={{ padding: 16 }}>
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
                renderItem={({ item }) => (
                  <View style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {item.user.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{item.user.full_name}</Text>
                      <Text style={styles.memberCourse}>{item.user.course_branch || item.user.email}</Text>
                    </View>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{item.role}</Text>
                    </View>
                  </View>
                )}
              />
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
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setCreateCommunityModalVisible(true)}
          activeOpacity={0.8}
        >
          <Plus size={16} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.createBtnText}>Create Hub</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search colleges, branches, courses, clubs..."
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

      {/* Category Chips Bar */}
      <View style={styles.categoryBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {(['ALL', 'COLLEGE', 'COURSE', 'CLUB', 'CUSTOM'] as const).map((cat) => (
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
                  ? '📚 Courses & Branch'
                  : cat === 'CLUB'
                  ? '⚡ Clubs'
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
                      👥 {item.total_members} members • Campus Community
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.typeBadgeText}>{item.community_type}</Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}

                {/* Latest Discussion Preview (Matches User Mockup!) */}
                {latestDisc && (
                  <View style={styles.latestDiscCard}>
                    <View style={styles.latestDiscHeader}>
                      <View style={[styles.discussTypeBadge, { backgroundColor: '#10b98122', borderColor: '#10b981' }]}>
                        <Text style={[styles.discussTypeBadgeText, { color: '#10b981' }]}>
                          {latestDisc.type || 'QUESTION'}
                        </Text>
                      </View>
                      <Text style={styles.latestDiscTime}>Active Discussion</Text>
                    </View>
                    <Text style={styles.latestDiscTitle} numberOfLines={1}>
                      {latestDisc.title}
                    </Text>
                  </View>
                )}

                {/* Card Action Row */}
                <View style={styles.cardActionRow}>
                  <View style={styles.twoTabsHint}>
                    <Text style={styles.twoTabsHintText}>[ CHAT ]  [ DISCUSS ]</Text>
                  </View>
                  <View style={styles.openCommunityBtn}>
                    <Text style={styles.openCommunityBtnText}>Open Community →</Text>
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
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    marginTop: 4,
  },
  twoTabsHint: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  twoTabsHintText: {
    color: '#38bdf8',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
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
