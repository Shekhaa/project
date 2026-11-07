import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Discussion,
  DiscussionReply,
  CommunityMemberItem,
  communityService,
} from '../../services/communityService';
import { useTheme } from '../../theme/ThemeContext';
import { DiscussionReplies } from './DiscussionReplies';
import { DocumentCard } from '../media/DocumentCard';
import { MediaGrid } from '../media/MediaGrid';
import {
  X,
  ArrowBigUp,
  MessageSquare,
  CheckCircle,
  Pin,
  Send,
  CornerDownRight,
  MoreVertical,
  Trash2,
  Flag,
  AlertTriangle,
} from 'lucide-react-native';

interface DiscussionDetailProps {
  visible: boolean;
  discussion: Discussion | null;
  communitySlug: string;
  currentUser?: any;
  onClose: () => void;
  onVote: (discussion: Discussion) => void;
  onOpenProfile?: (userId: number) => void;
  onDeleteDiscussion?: (id: string) => void;
}

export const DiscussionDetail: React.FC<DiscussionDetailProps> = ({
  visible,
  discussion,
  communitySlug,
  currentUser,
  onClose,
  onVote,
  onOpenProfile,
  onDeleteDiscussion,
}) => {
  const { colors, isDark } = useTheme();
  const [detail, setDetail] = useState<Discussion | null>(discussion);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<DiscussionReply | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [members, setMembers] = useState<CommunityMemberItem[]>([]);

  // Menu & Reporting State
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'DISCUSSION' | 'REPLY'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState<'SPAM' | 'HARASSMENT' | 'ABUSIVE' | 'INAPPROPRIATE' | 'OTHER'>('SPAM');
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    if (!discussion || !visible) return;
    setDetail(discussion);

    const loadDetail = async () => {
      setLoading(true);
      try {
        const full = await communityService.getDiscussionDetail(communitySlug, discussion.id);
        setDetail(full);
      } catch (e) {
        console.log('Error loading discussion detail', e);
      } finally {
        setLoading(false);
      }
    };
    loadDetail();

    communityService
      .getMembers(communitySlug)
      .then((res) => {
        if (Array.isArray(res)) setMembers(res);
      })
      .catch((e) => console.log('Error fetching members for mentions', e));
  }, [discussion?.id, visible, communitySlug]);

  const lastAtMatch = replyText.match(/@([a-zA-Z0-9_\.]*)$/);
  const mentionQuery = lastAtMatch !== null ? lastAtMatch[1].toLowerCase() : null;
  const matchingMembers =
    mentionQuery !== null
      ? members
          .filter((m) => m.user?.full_name?.toLowerCase().includes(mentionQuery))
          .slice(0, 5)
      : [];

  const handleSelectMention = (member: CommunityMemberItem) => {
    const name = member.user?.full_name || '';
    if (!name) return;
    const updated = replyText.replace(/@([a-zA-Z0-9_\.]*)$/, `@${name} `);
    setReplyText(updated);
  };

  if (!detail) return null;

  const isQuestionAuthor = currentUser && (
    String(detail.author) === String(currentUser.id) ||
    String((detail as any).author_id) === String(currentUser.id) ||
    detail.author_name === currentUser.full_name ||
    detail.author_name === currentUser.email?.split('@')[0]
  );
  const canDeletePost = isQuestionAuthor || currentUser?.is_staff || currentUser?.is_superuser;
  const isQuestion = detail.discussion_type === 'QUESTION';
  const authorInitial = (detail.author_name || 'S').trim()[0]?.toUpperCase() || 'S';

  const handleDeleteDiscussion = () => {
    setMenuVisible(false);
    const executeDelete = async () => {
      try {
        await communityService.deleteDiscussion(communitySlug, detail.id);
        onClose();
        onDeleteDiscussion?.(detail.id);
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || 'Could not delete discussion.';
        if (Platform.OS === 'web') {
          window.alert(errorMsg);
        } else {
          Alert.alert('Error', errorMsg);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Are you sure you want to delete this discussion post? This action cannot be undone.') : true;
      if (ok) executeDelete();
    } else {
      Alert.alert(
        'Delete Discussion',
        'Are you sure you want to delete this discussion post? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  const handleDeleteReply = async (reply: DiscussionReply) => {
    const executeDeleteReply = async () => {
      try {
        await communityService.deleteReply(communitySlug, detail.id, reply.id);
        const updated = await communityService.getDiscussionDetail(communitySlug, detail.id);
        setDetail(updated);
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || 'Could not delete reply.';
        if (Platform.OS === 'web') {
          window.alert(errorMsg);
        } else {
          Alert.alert('Error', errorMsg);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Are you sure you want to delete this reply?') : true;
      if (ok) executeDeleteReply();
    } else {
      Alert.alert('Delete Reply', 'Are you sure you want to delete this reply?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: executeDeleteReply },
      ]);
    }
  };

  const handleOpenReport = (type: 'DISCUSSION' | 'REPLY', id: string) => {
    setMenuVisible(false);
    setReportTarget({ type, id });
    setReportReason('SPAM');
    setReportDescription('');
    setReportModalVisible(true);
  };

  const handleSubmitReport = async () => {
    if (!reportTarget) return;
    setSubmittingReport(true);
    try {
      await communityService.submitReport(communitySlug, {
        target_type: reportTarget.type,
        target_id: reportTarget.id,
        reason: reportReason,
        description: reportDescription.trim(),
      });
      setReportModalVisible(false);
      Alert.alert(
        'Report Submitted 🛡️',
        'Thank you for reporting. Campus moderators will review this discussion to maintain a safe and productive environment.'
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Could not submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || submittingReply) return;
    setSubmittingReply(true);
    try {
      await communityService.postReply(
        communitySlug,
        detail.id,
        replyText.trim(),
        replyingTo ? replyingTo.id : undefined
      );

      // Re-fetch detail to get updated tree
      const updated = await communityService.getDiscussionDetail(communitySlug, detail.id);
      setDetail(updated);
      setReplyText('');
      setReplyingTo(null);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not post reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleVoteReply = async (reply: DiscussionReply) => {
    try {
      const res = await communityService.voteDiscussion(communitySlug, detail.id, reply.id);
      const updateTree = (list: DiscussionReply[]): DiscussionReply[] => {
        return list.map((r) => {
          if (r.id === reply.id) {
            return { ...r, user_has_voted: res.voted, upvotes_count: res.upvotes_count };
          }
          if (r.children) {
            return { ...r, children: updateTree(r.children) };
          }
          return r;
        });
      };
      if (detail.replies) {
        setDetail({ ...detail, replies: updateTree(detail.replies) });
      }
    } catch (e) {
      console.log('Error voting reply', e);
    }
  };

  const handleAcceptReply = async (reply: DiscussionReply) => {
    try {
      await communityService.acceptReply(communitySlug, detail.id, reply.id);
      const updated = await communityService.getDiscussionDetail(communitySlug, detail.id);
      setDetail(updated);
      Alert.alert('Accepted! 🎯', 'This reply is marked as the verified solution.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not accept reply.');
    }
  };

  const imageAttachments = detail.attachments?.filter((a) => a.file_type === 'IMAGE') || [];
  const docAttachments = detail.attachments?.filter((a) => a.file_type === 'DOCUMENT') || [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Text style={[styles.backBtnArrow, { color: colors.textPrimary }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            Discussion
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={styles.headerBtn}
              accessibilityLabel="More options"
            >
              <MoreVertical size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
          {/* Main Discussion Post Card */}
          <View style={[styles.mainPostCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            {/* Badges */}
            <View style={styles.badgeRow}>
              {detail.is_pinned && (
                <View style={styles.pinnedBadge}>
                  <Pin size={11} color="#f59e0b" />
                  <Text style={styles.pinnedBadgeText}>PINNED</Text>
                </View>
              )}
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: isDark ? 'rgba(94, 106, 210, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                  },
                ]}
              >
                <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{detail.discussion_type}</Text>
              </View>
              {detail.is_solved && (
                <View style={styles.solvedBadge}>
                  <CheckCircle size={11} color="#10b981" />
                  <Text style={styles.solvedBadgeText}>SOLVED</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>{detail.title}</Text>

            {/* Author Row */}
            <TouchableOpacity
              disabled={!detail.author}
              onPress={() => detail.author && onOpenProfile?.(detail.author)}
              activeOpacity={0.7}
              style={styles.authorRow}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.surfaceLight,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.avatarText, { color: colors.primary }]}>{authorInitial}</Text>
              </View>
              <View>
                <Text style={[styles.authorName, { color: colors.textPrimary }]}>{detail.author_name}</Text>
                <Text style={[styles.dateText, { color: colors.textMuted }]}>
                  {new Date(detail.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Body */}
            <Text style={[styles.detailContent, { color: colors.textSecondary }]}>{detail.content}</Text>

            {/* Image Attachments */}
            {imageAttachments.length > 0 && (
              <View style={styles.mediaContainer}>
                <MediaGrid images={imageAttachments} />
              </View>
            )}

            {/* Document Attachments */}
            {docAttachments.length > 0 && (
              <View style={styles.docsContainer}>
                {docAttachments.map((doc, idx) => (
                  <DocumentCard key={doc.id || idx} attachment={doc} />
                ))}
              </View>
            )}

            {/* Post Vote & Stats Bar */}
            <View style={[styles.statsBar, { borderTopColor: colors.cardBorder }]}>
              <TouchableOpacity
                style={[
                  styles.voteBtn,
                  {
                    backgroundColor: colors.surfaceLight,
                    borderColor: colors.cardBorder,
                  },
                  detail.user_has_voted && {
                    backgroundColor: isDark ? 'rgba(94, 106, 210, 0.25)' : 'rgba(79, 70, 229, 0.12)',
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => onVote(detail)}
                activeOpacity={0.7}
              >
                <ArrowBigUp
                  size={16}
                  color={detail.user_has_voted ? colors.primary : colors.textMuted}
                  fill={detail.user_has_voted ? colors.primary : 'none'}
                />
                <Text
                  style={[
                    styles.voteBtnText,
                    { color: detail.user_has_voted ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {detail.upvotes_count || 0} Upvotes
                </Text>
              </TouchableOpacity>

              <View style={styles.replyStat}>
                <MessageSquare size={15} color={colors.textMuted} />
                <Text style={[styles.replyStatText, { color: colors.textMuted }]}>
                  {detail.replies_count || 0} Answers
                </Text>
              </View>
            </View>
          </View>

          {/* Answers & Replies Section */}
          <View style={styles.repliesSection}>
            <Text style={[styles.repliesHeaderTitle, { color: colors.textPrimary }]}>
              {isQuestion ? 'Answers & Solutions' : 'Replies & Discussion'} ({detail.replies?.length || 0})
            </Text>

            {loading && !detail.replies ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : detail.replies && detail.replies.length > 0 ? (
              <DiscussionReplies
                replies={detail.replies}
                currentUserId={currentUser?.id}
                isQuestionAuthor={isQuestionAuthor}
                isSolved={detail.is_solved}
                onVoteReply={handleVoteReply}
                onAcceptReply={handleAcceptReply}
                onReplyToReply={(r) => {
                  setReplyingTo(r);
                  setReplyText((prev) => (prev ? prev : `@${r.author_name} `));
                }}
                onDeleteReply={handleDeleteReply}
                onReportReply={(r) => handleOpenReport('REPLY', r.id)}
                onOpenProfile={onOpenProfile}
              />
            ) : (
              <View
                style={[
                  styles.emptyReplies,
                  { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={[styles.emptyRepliesText, { color: colors.textSecondary }]}>
                  {isQuestion
                    ? 'No answers yet. Be the first classmate to answer this question!'
                    : 'No replies yet. Join the conversation below!'}
                </Text>
              </View>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Reply Composer Bar */}
        <View style={[styles.bottomComposer, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
          {replyingTo && (
            <View
              style={[
                styles.replyingToBanner,
                {
                  backgroundColor: isDark ? 'rgba(94, 106, 210, 0.18)' : 'rgba(79, 70, 229, 0.1)',
                },
              ]}
            >
              <CornerDownRight size={13} color={colors.primary} />
              <Text style={[styles.replyingToText, { color: colors.primary }]} numberOfLines={1}>
                Replying to {replyingTo.author_name}
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <X size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}

          {matchingMembers.length > 0 && (
            <View
              style={[
                styles.mentionSuggestionsContainer,
                { backgroundColor: colors.surface, borderTopColor: colors.cardBorder },
              ]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.mentionSuggestionsList}
              >
                {matchingMembers.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.mentionPill,
                      {
                        backgroundColor: colors.surfaceLight,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                    onPress={() => handleSelectMention(m)}
                  >
                    <View style={[styles.mentionAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.mentionAvatarText}>
                        {(m.user?.full_name || 'U')[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.mentionName, { color: colors.primary }]}>@{m.user?.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.inputField,
                {
                  backgroundColor: isDark ? '#141516' : '#f1f5f9',
                  borderColor: colors.cardBorder,
                  color: colors.textPrimary,
                },
              ]}
              placeholder={
                replyingTo
                  ? `Reply to ${replyingTo.author_name}...`
                  : isQuestion
                  ? 'Write your answer or solution...'
                  : 'Add to the discussion...'
              }
              placeholderTextColor={colors.textMuted}
              value={replyText}
              onChangeText={setReplyText}
              multiline
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: colors.primary },
                (!replyText.trim() || submittingReply) && styles.sendBtnDisabled,
              ]}
              onPress={handleSendReply}
              disabled={!replyText.trim() || submittingReply}
            >
              {submittingReply ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Send size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Post Options Action Sheet */}
        {menuVisible && (
          <Modal transparent animationType="fade" visible={menuVisible} onRequestClose={() => setMenuVisible(false)}>
            <TouchableOpacity style={styles.menuModalBackdrop} activeOpacity={1} onPress={() => setMenuVisible(false)}>
              <View style={[styles.menuModalSheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={styles.dragBar} />
                <Text style={[styles.menuModalTitle, { color: colors.textPrimary }]}>Discussion Options</Text>

                {canDeletePost && (
                  <TouchableOpacity style={styles.menuModalItem} onPress={handleDeleteDiscussion}>
                    <Trash2 size={17} color={colors.danger} />
                    <Text style={[styles.menuModalItemText, { color: colors.danger, fontWeight: '700' }]}>
                      Delete Discussion
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.menuModalItem}
                  onPress={() => handleOpenReport('DISCUSSION', detail.id)}
                >
                  <Flag size={17} color={colors.textSecondary} />
                  <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                    Report Discussion
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuModalItem, { borderTopWidth: 1, borderTopColor: colors.cardBorder, marginTop: 4 }]}
                  onPress={() => setMenuVisible(false)}
                >
                  <X size={17} color={colors.textMuted} />
                  <Text style={[styles.menuModalItemText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Clean Report Modal */}
        {reportModalVisible && (
          <Modal
            transparent
            animationType="fade"
            visible={reportModalVisible}
            onRequestClose={() => setReportModalVisible(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.menuModalBackdrop}
            >
              <View style={[styles.reportModalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={styles.reportModalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={18} color="#f59e0b" />
                    <Text style={[styles.reportModalTitle, { color: colors.textPrimary }]}>
                      Report {reportTarget?.type === 'DISCUSSION' ? 'Post' : 'Reply'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setReportModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.reportSub, { color: colors.textMuted }]}>
                  Select the reason that best describes this issue:
                </Text>

                <View style={styles.reportReasonsList}>
                  {(
                    [
                      { key: 'SPAM', label: 'Spam or Advertising' },
                      { key: 'HARASSMENT', label: 'Harassment or Bullying' },
                      { key: 'ABUSIVE', label: 'Abusive or Hate Speech' },
                      { key: 'INAPPROPRIATE', label: 'Inappropriate Content' },
                      { key: 'OTHER', label: 'Other Guidelines Violation' },
                    ] as const
                  ).map((item) => {
                    const active = reportReason === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[
                          styles.reportReasonPill,
                          {
                            backgroundColor: active
                              ? isDark
                                ? 'rgba(99, 102, 241, 0.2)'
                                : 'rgba(79, 70, 229, 0.12)'
                              : colors.surfaceLight,
                            borderColor: active ? colors.primary : colors.cardBorder,
                          },
                        ]}
                        onPress={() => setReportReason(item.key)}
                      >
                        <Text
                          style={[
                            styles.reportReasonPillText,
                            { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '700' : '500' },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={[
                    styles.reportInput,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.cardBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="Optional details for campus moderators..."
                  placeholderTextColor={colors.textMuted}
                  value={reportDescription}
                  onChangeText={setReportDescription}
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.reportBtnRow}>
                  <TouchableOpacity
                    style={[styles.reportCancelBtn, { borderColor: colors.cardBorder }]}
                    onPress={() => setReportModalVisible(false)}
                  >
                    <Text style={[styles.reportCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.reportSubmitBtn, { backgroundColor: colors.danger }]}
                    onPress={handleSubmitReport}
                    disabled={submittingReport}
                  >
                    {submittingReport ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.reportSubmitBtnText}>Submit Report</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}
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
  headerBtn: {
    padding: 6,
  },
  backBtn: {
    padding: 6,
  },
  backBtnArrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginHorizontal: 12,
  },
  closeBtn: {
    padding: 6,
  },
  scrollArea: {
    flex: 1,
    padding: 16,
  },
  mainPostCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pinnedBadgeText: {
    color: '#f59e0b',
    fontSize: 9.5,
    fontWeight: '800',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  solvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  solvedBadgeText: {
    color: '#10b981',
    fontSize: 9.5,
    fontWeight: '800',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 10.5,
  },
  detailContent: {
    fontSize: 14.5,
    lineHeight: 22,
    marginBottom: 14,
  },
  mediaContainer: {
    marginBottom: 14,
  },
  docsContainer: {
    gap: 6,
    marginBottom: 14,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  voteBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  replyStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyStatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  repliesSection: {
    marginTop: 8,
  },
  repliesHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyReplies: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyRepliesText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  bottomComposer: {
    borderTopWidth: 1,
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  replyingToBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  replyingToText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginHorizontal: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputField: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13.5,
    borderWidth: 1,
    maxHeight: 90,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  mentionSuggestionsContainer: {
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mentionSuggestionsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mentionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  mentionAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  mentionAvatarText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  mentionName: {
    fontSize: 12,
    fontWeight: '600',
  },
  menuModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  menuModalSheet: {
    width: '100%',
    maxWidth: 680,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  menuModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  menuModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  menuModalItemText: {
    fontSize: 14,
  },
  reportModalCard: {
    width: '92%',
    maxWidth: 480,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    marginVertical: 'auto',
    alignSelf: 'center',
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reportModalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  reportSub: {
    fontSize: 12,
    marginBottom: 14,
  },
  reportReasonsList: {
    gap: 8,
    marginBottom: 14,
  },
  reportReasonPill: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  reportReasonPillText: {
    fontSize: 13,
  },
  reportInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  reportBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  reportCancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  reportCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reportSubmitBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  reportSubmitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
