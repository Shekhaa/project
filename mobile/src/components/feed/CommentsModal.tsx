import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AtSign, CornerDownRight, Send, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Comment, Post, postService } from '../../services/postService';
import { UserAvatar } from '../common/UserAvatar';
import {
  MentionCandidate,
  MentionSuggestionsBar,
  applyMentionSelection,
  extractActiveMention,
} from '../common/MentionSuggestionsBar';

interface CommentsModalProps {
  visible: boolean;
  post: Post | null;
  currentUser?: any;
  canParticipate?: boolean;
  onRequireAuth?: () => void;
  onRequireVerify?: (reason?: string) => void;
  onClose: () => void;
  onOpenProfile?: (userId: number) => void;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({
  visible,
  post,
  currentUser,
  canParticipate = true,
  onRequireAuth,
  onRequireVerify,
  onClose,
  onOpenProfile,
}) => {
  const { colors } = useTheme();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [cursorPos, setCursorPos] = useState<number>(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  useEffect(() => {
    if (visible && post) {
      loadComments();
    } else {
      setComments([]);
      setNewComment('');
      setCursorPos(0);
      setMentionDismissed(false);
      setReplyingTo(null);
    }
  }, [visible, post]);

  const loadComments = async () => {
    if (!post) return;
    try {
      setLoading(true);
      const data = await postService.getComments(post.id);
      setComments(data);
    } catch (e) {
      console.log('Error loading comments', e);
    } finally {
      setLoading(false);
    }
  };

  const activeMention = mentionDismissed
    ? null
    : extractActiveMention(newComment, cursorPos);

  const handleCommentTextChange = (text: string) => {
    const delta = text.length - newComment.length;
    setNewComment(text);
    setCursorPos((prev) => Math.max(0, Math.min(text.length, prev + delta)));
    setMentionDismissed(false);
  };

  const handleSelectMention = (candidate: MentionCandidate & { username: string }) => {
    if (!activeMention) return;
    const { nextText, nextCursor } = applyMentionSelection(
      newComment,
      activeMention,
      candidate.username
    );
    setNewComment(nextText);
    setCursorPos(nextCursor);
    setMentionDismissed(false);
  };

  const handleReplyPress = (targetComment: Comment) => {
    if (!currentUser) {
      onClose();
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onClose();
      onRequireVerify?.('Verify your Campus ID or enter an invite code to reply to discussions.');
      return;
    }
    setReplyingTo(targetComment);
    if (targetComment.is_anonymous) return;
    const rawHandle =
      targetComment.author_username || targetComment.author_name.replace(/\s+/g, '');
    const tagHandle = `@${rawHandle} `;
    if (!newComment.includes(`@${rawHandle}`)) {
      const next = `${tagHandle}${newComment.trimStart()}`;
      setNewComment(next);
      setCursorPos(next.length);
      setMentionDismissed(false);
    }
  };

  const handleInsertTag = () => {
    setMentionDismissed(false);
    const pos = Math.min(cursorPos, newComment.length);
    const before = newComment.slice(0, pos);
    const after = newComment.slice(pos);
    const prefix = before.length === 0 || /\s$/.test(before) ? '@' : ' @';
    const next = `${before}${prefix}${after}`;
    setNewComment(next);
    setCursorPos(before.length + prefix.length);
  };

  const handleSendComment = async () => {
    if (!currentUser) {
      onClose();
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onClose();
      onRequireVerify?.('Verify your Campus ID or enter an invite code to post comments.');
      return;
    }
    if (!post || !newComment.trim()) return;

    try {
      setSubmitting(true);
      const parentId = replyingTo ? replyingTo.parent || replyingTo.id : undefined;
      const created = await postService.addComment(
        post.id,
        newComment.trim(),
        isAnonymous,
        parentId
      );

      if (parentId) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === parentId) {
              const currentReplies = c.replies || [];
              return {
                ...c,
                replies_count: (c.replies_count || 0) + 1,
                replies: [...currentReplies, created],
              };
            }
            return c;
          })
        );
      } else {
        setComments((prev) => [created, ...prev]);
      }

      setNewComment('');
      setCursorPos(0);
      setReplyingTo(null);
      setMentionDismissed(false);
    } catch (e: any) {
      if (e?.response?.status === 403 && e?.response?.data?.code === 'CAMPUS_VERIFICATION_REQUIRED') {
        onClose();
        onRequireVerify?.(e.response.data.error);
      } else {
        console.log('Failed to post comment', e);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const tokens = text.split(/(\s+)/);
    return (
      <Text style={[styles.commentText, { color: colors.textPrimary }]}>
        {tokens.map((tok, i) => {
          if (/^@[a-zA-Z0-9_.-]{1,32}[.,!?:;)]*$/.test(tok)) {
            return (
              <Text key={i} style={[styles.mentionTag, { color: colors.primaryHover }]}>
                {tok}
              </Text>
            );
          }
          return tok;
        })}
      </Text>
    );
  };

  const renderReplyItem = (reply: Comment) => {
    return (
      <View key={reply.id} style={styles.replyRow}>
        <TouchableOpacity
          disabled={reply.is_anonymous || !reply.author}
          onPress={() => reply.author && onOpenProfile?.(reply.author)}
          activeOpacity={0.7}
          style={{ marginRight: 8 }}
        >
          <UserAvatar
            uri={reply.author_avatar}
            name={reply.author_name}
            size={28}
            isAnonymous={reply.is_anonymous}
          />
        </TouchableOpacity>

        <View style={styles.commentBody}>
          <TouchableOpacity
            disabled={reply.is_anonymous || !reply.author}
            onPress={() => reply.author && onOpenProfile?.(reply.author)}
            activeOpacity={0.7}
            style={styles.commentHeader}
          >
            <Text style={[styles.commentAuthor, { color: colors.textPrimary }]}>
              {reply.author_name}
            </Text>
            {reply.is_anonymous && (
              <View
                style={[
                  styles.anonBadge,
                  { backgroundColor: colors.anonBadge, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={[styles.anonBadgeText, { color: colors.textMuted }]}>Anon</Text>
              </View>
            )}
          </TouchableOpacity>
          {renderFormattedText(reply.text)}
          <TouchableOpacity
            style={styles.replyBtn}
            onPress={() => handleReplyPress(reply)}
            activeOpacity={0.7}
          >
            <CornerDownRight size={12} color={colors.primaryHover} />
            <Text style={[styles.replyBtnText, { color: colors.primaryHover }]}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCommentItem = ({ item }: { item: Comment }) => {
    return (
      <View style={styles.commentContainer}>
        <View style={styles.commentRow}>
          <TouchableOpacity
            disabled={item.is_anonymous || !item.author}
            onPress={() => item.author && onOpenProfile?.(item.author)}
            activeOpacity={0.7}
            style={{ marginRight: 10 }}
          >
            <UserAvatar
              uri={item.author_avatar}
              name={item.author_name}
              size={36}
              isAnonymous={item.is_anonymous}
            />
          </TouchableOpacity>

          <View style={styles.commentBody}>
            <TouchableOpacity
              disabled={item.is_anonymous || !item.author}
              onPress={() => item.author && onOpenProfile?.(item.author)}
              activeOpacity={0.7}
              style={styles.commentHeader}
            >
              <Text style={[styles.commentAuthor, { color: colors.textPrimary }]}>
                {item.author_name}
              </Text>
              {item.is_anonymous && (
                <View
                  style={[
                    styles.anonBadge,
                    { backgroundColor: colors.anonBadge, borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={[styles.anonBadgeText, { color: colors.textMuted }]}>Anon</Text>
                </View>
              )}
            </TouchableOpacity>
            {renderFormattedText(item.text)}
            <TouchableOpacity
              style={styles.replyBtn}
              onPress={() => handleReplyPress(item)}
              activeOpacity={0.7}
            >
              <CornerDownRight size={12} color={colors.textSecondary} />
              <Text style={[styles.replyBtnText, { color: colors.textSecondary }]}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nested Replies */}
        {item.replies && item.replies.length > 0 && (
          <View style={[styles.nestedRepliesContainer, { borderLeftColor: colors.cardBorder }]}>
            {item.replies.map((reply) => renderReplyItem(reply))}
          </View>
        )}
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType={Platform.OS === 'web' ? 'none' : 'slide'} transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: colors.modalOverlay }]}
      >
        <TouchableOpacity style={styles.dismissOverlay} onPress={onClose} activeOpacity={1} />

        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: colors.surface, borderColor: colors.cardBorder },
          ]}
        >
          {/* Drag handle pill */}
          <View style={[styles.dragHandle, { backgroundColor: colors.hairlineStrong }]} />

          {/* Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: colors.cardBorder }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Comments</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Comments List */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No comments yet. Start the conversation!
              </Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderCommentItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Replying Banner */}
          {replyingTo && (
            <View
              style={[
                styles.replyBanner,
                { backgroundColor: colors.primary + '16', borderLeftColor: colors.primary },
              ]}
            >
              <View style={styles.replyBannerContent}>
                <CornerDownRight size={14} color={colors.primary} />
                <Text style={[styles.replyBannerText, { color: colors.textSecondary }]}>
                  Replying to{' '}
                  <Text style={[styles.replyBannerHighlight, { color: colors.primaryHover }]}>
                    {replyingTo.author_name}
                  </Text>
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyCancelBtn}>
                <X size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* @ Student Recommendation Picker */}
          {activeMention && (
            <View style={styles.mentionBarWrapper}>
              <MentionSuggestionsBar
                query={activeMention.query}
                onSelect={handleSelectMention}
                onClose={() => setMentionDismissed(true)}
                maxHeight={200}
              />
            </View>
          )}

          {/* Bottom Input Bar (or Read-Only CTA for Guests / Unverified Users) */}
          {!currentUser || !canParticipate ? (
            <View
              style={[
                styles.inputBar,
                { borderTopColor: colors.cardBorder, backgroundColor: colors.surface, justifyContent: 'space-between' },
              ]}
            >
              <Text style={{ flex: 1, fontSize: 12.5, color: colors.textMuted, paddingRight: 8 }}>
                {!currentUser
                  ? 'Sign in to join the campus conversation'
                  : 'Verify with an invite code or College ID to comment'}
              </Text>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary, width: 'auto', paddingHorizontal: 14 }]}
                onPress={() => {
                  onClose();
                  if (!currentUser) {
                    onRequireAuth?.();
                  } else {
                    onRequireVerify?.('Verify your Campus ID or enter an invite code to comment.');
                  }
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>
                  {!currentUser ? 'Sign In' : 'Verify ID'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={[
                styles.inputBar,
                { borderTopColor: colors.cardBorder, backgroundColor: colors.surface },
              ]}
            >
              {/* Anonymous Toggle */}
              <TouchableOpacity
                style={[
                  styles.anonToggle,
                  {
                    backgroundColor: isAnonymous ? colors.anonBadge : colors.surfaceLight,
                    borderColor: isAnonymous ? colors.anonPurple : 'transparent',
                    borderWidth: 1,
                  },
                ]}
                onPress={() => setIsAnonymous(!isAnonymous)}
                activeOpacity={0.7}
              >
                <Text style={styles.anonToggleText}>🎭</Text>
              </TouchableOpacity>

              {/* @ Tag Directory Trigger */}
              <TouchableOpacity
                style={[
                  styles.tagToggle,
                  {
                    backgroundColor: activeMention ? colors.primary + '1E' : colors.surfaceLight,
                  },
                ]}
                onPress={handleInsertTag}
                activeOpacity={0.7}
                accessibilityLabel="Tag student with @"
              >
                <AtSign
                  size={16}
                  color={activeMention ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>

              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surfaceLight, color: colors.textPrimary },
                ]}
                placeholder={
                  isAnonymous ? 'Comment anonymously...' : 'Add comment (type @ to tag student)...'
                }
                placeholderTextColor={colors.textMuted}
                value={newComment}
                onChangeText={handleCommentTextChange}
                onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.end)}
                multiline
                maxLength={500}
              />

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { backgroundColor: colors.primary },
                  (!newComment.trim() || submitting) && styles.sendBtnDisabled,
                ]}
                onPress={handleSendComment}
                disabled={!newComment.trim() || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Send size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    height: '78%',
    display: 'flex',
    flexDirection: 'column',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentContainer: {
    marginBottom: 16,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  commentAuthor: {
    fontWeight: '700',
    fontSize: 13.5,
  },
  anonBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: 6,
  },
  anonBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  commentText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  mentionTag: {
    fontWeight: '700',
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  replyBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  nestedRepliesContainer: {
    marginLeft: 30,
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  replyBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyBannerText: {
    fontSize: 12.5,
  },
  replyBannerHighlight: {
    fontWeight: '700',
  },
  replyCancelBtn: {
    padding: 4,
  },
  mentionBarWrapper: {
    paddingHorizontal: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  anonToggle: {
    padding: 7,
    borderRadius: 18,
  },
  anonToggleText: {
    fontSize: 15,
  },
  tagToggle: {
    padding: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
    maxHeight: 80,
  },
  sendBtn: {
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
