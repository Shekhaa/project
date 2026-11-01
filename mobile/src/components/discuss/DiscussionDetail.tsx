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
  communityService,
} from '../../services/communityService';
import { colors } from '../../theme/colors';
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
} from 'lucide-react-native';

interface DiscussionDetailProps {
  visible: boolean;
  discussion: Discussion | null;
  communitySlug: string;
  currentUser?: any;
  onClose: () => void;
  onVote: (discussion: Discussion) => void;
}

export const DiscussionDetail: React.FC<DiscussionDetailProps> = ({
  visible,
  discussion,
  communitySlug,
  currentUser,
  onClose,
  onVote,
}) => {
  const [detail, setDetail] = useState<Discussion | null>(discussion);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<DiscussionReply | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

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
  }, [discussion?.id, visible]);

  if (!detail) return null;

  const isQuestionAuthor = currentUser && detail.author === currentUser.id;
  const isQuestion = detail.discussion_type === 'QUESTION';
  const authorInitial = (detail.author_name || 'S').trim()[0]?.toUpperCase() || 'S';

  const handleSendReply = async () => {
    if (!replyText.trim() || submittingReply) return;
    setSubmittingReply(true);
    try {
      const newReply = await communityService.postReply(
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
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Text style={styles.backBtnArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Discussion
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
          {/* Main Discussion Post Card */}
          <View style={styles.mainPostCard}>
            {/* Badges */}
            <View style={styles.badgeRow}>
              {detail.is_pinned && (
                <View style={styles.pinnedBadge}>
                  <Pin size={11} color="#f59e0b" />
                  <Text style={styles.pinnedBadgeText}>PINNED</Text>
                </View>
              )}
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{detail.discussion_type}</Text>
              </View>
              {detail.is_solved && (
                <View style={styles.solvedBadge}>
                  <CheckCircle size={11} color="#10b981" />
                  <Text style={styles.solvedBadgeText}>SOLVED</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={styles.detailTitle}>{detail.title}</Text>

            {/* Author Row */}
            <View style={styles.authorRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{authorInitial}</Text>
              </View>
              <View>
                <Text style={styles.authorName}>{detail.author_name}</Text>
                <Text style={styles.dateText}>
                  {new Date(detail.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>

            {/* Body */}
            <Text style={styles.detailContent}>{detail.content}</Text>

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
            <View style={styles.statsBar}>
              <TouchableOpacity
                style={[styles.voteBtn, detail.user_has_voted && styles.voteBtnActive]}
                onPress={() => onVote(detail)}
                activeOpacity={0.7}
              >
                <ArrowBigUp
                  size={16}
                  color={detail.user_has_voted ? '#38bdf8' : '#94a3b8'}
                  fill={detail.user_has_voted ? '#38bdf8' : 'none'}
                />
                <Text style={[styles.voteBtnText, detail.user_has_voted && styles.voteBtnTextActive]}>
                  {detail.upvotes_count || 0} Upvotes
                </Text>
              </TouchableOpacity>

              <View style={styles.replyStat}>
                <MessageSquare size={15} color="#94a3b8" />
                <Text style={styles.replyStatText}>{detail.replies_count || 0} Answers</Text>
              </View>
            </View>
          </View>

          {/* Answers & Replies Section */}
          <View style={styles.repliesSection}>
            <Text style={styles.repliesHeaderTitle}>
              {isQuestion ? 'Answers & Solutions' : 'Replies & Discussion'} (
              {detail.replies?.length || 0})
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
                onReplyToReply={(r) => setReplyingTo(r)}
              />
            ) : (
              <View style={styles.emptyReplies}>
                <Text style={styles.emptyRepliesText}>
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
        <View style={styles.bottomComposer}>
          {replyingTo && (
            <View style={styles.replyingToBanner}>
              <CornerDownRight size={13} color="#38bdf8" />
              <Text style={styles.replyingToText} numberOfLines={1}>
                Replying to {replyingTo.author_name}
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <X size={14} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder={
                replyingTo
                  ? `Reply to ${replyingTo.author_name}...`
                  : isQuestion
                  ? 'Write your answer or solution...'
                  : 'Add to the discussion...'
              }
              placeholderTextColor="#64748b"
              value={replyText}
              onChangeText={setReplyText}
              multiline
            />

            <TouchableOpacity
              style={[styles.sendBtn, (!replyText.trim() || submittingReply) && styles.sendBtnDisabled]}
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
  backBtn: {
    padding: 6,
  },
  backBtnArrow: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
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
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#38bdf8',
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
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 23,
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
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  authorName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    color: '#64748b',
    fontSize: 10.5,
  },
  detailContent: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 21,
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
    borderTopColor: '#1e293b',
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  voteBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  voteBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  voteBtnTextActive: {
    color: '#38bdf8',
  },
  replyStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyStatText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  repliesSection: {
    marginTop: 8,
  },
  repliesHeaderTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyReplies: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptyRepliesText: {
    color: '#94a3b8',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomComposer: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  replyingToBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 8,
  },
  replyingToText: {
    color: '#38bdf8',
    fontSize: 11.5,
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
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: '#ffffff',
    fontSize: 13,
    maxHeight: 90,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
