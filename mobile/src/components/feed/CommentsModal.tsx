import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { postService, Comment, Post } from '../../services/postService';
import { X, Send, CornerDownRight, AtSign } from 'lucide-react-native';

interface CommentsModalProps {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({
  visible,
  post,
  onClose,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  useEffect(() => {
    if (visible && post) {
      loadComments();
    } else {
      setComments([]);
      setNewComment('');
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

  const handleReplyPress = (targetComment: Comment) => {
    setReplyingTo(targetComment);
    const tagHandle = targetComment.is_anonymous
      ? ''
      : `@${targetComment.author_name.replace(/\s+/g, '')} `;

    if (tagHandle && !newComment.includes(tagHandle)) {
      setNewComment((prev) => `${tagHandle}${prev.trimStart()}`);
    }
  };

  const handleInsertTag = () => {
    if (!newComment.includes('@')) {
      setNewComment((prev) => (prev ? `${prev} @` : '@'));
    } else {
      setNewComment((prev) => `${prev}@`);
    }
  };

  const handleSendComment = async () => {
    if (!post || !newComment.trim()) return;

    try {
      setSubmitting(true);
      const parentId = replyingTo ? (replyingTo.parent || replyingTo.id) : undefined;
      const created = await postService.addComment(
        post.id,
        newComment.trim(),
        isAnonymous,
        parentId
      );

      if (parentId) {
        // Nested under root parent comment
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
      setReplyingTo(null);
    } catch (e) {
      console.log('Failed to post comment', e);
    } finally {
      setSubmitting(false);
    }
  };

  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_\.]+)/g);
    return (
      <Text style={styles.commentText}>
        {parts.map((part, i) => {
          if (part.startsWith('@')) {
            return (
              <Text key={i} style={styles.mentionTag}>
                {part}
              </Text>
            );
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  };

  const renderReplyItem = (reply: Comment) => {
    return (
      <View key={reply.id} style={styles.replyRow}>
        <View
          style={[
            styles.avatarSmall,
            reply.is_anonymous && styles.anonAvatarSmall,
          ]}
        >
          <Text style={styles.avatarSmallText}>
            {reply.is_anonymous ? '🎭' : (reply.author_name || 'S').charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentAuthor}>{reply.author_name}</Text>
            {reply.is_anonymous && (
              <View style={styles.anonBadge}>
                <Text style={styles.anonBadgeText}>Anon</Text>
              </View>
            )}
          </View>
          {renderFormattedText(reply.text)}
          <TouchableOpacity
            style={styles.replyBtn}
            onPress={() => handleReplyPress(reply)}
            activeOpacity={0.7}
          >
            <CornerDownRight size={12} color="#38bdf8" />
            <Text style={[styles.replyBtnText, { color: '#38bdf8' }]}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCommentItem = ({ item }: { item: Comment }) => {
    return (
      <View style={styles.commentContainer}>
        <View style={styles.commentRow}>
          <View
            style={[
              styles.avatar,
              item.is_anonymous && styles.anonAvatar,
            ]}
          >
            <Text style={styles.avatarText}>
              {item.is_anonymous ? '🎭' : (item.author_name || 'S').charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.commentBody}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>{item.author_name}</Text>
              {item.is_anonymous && (
                <View style={styles.anonBadge}>
                  <Text style={styles.anonBadgeText}>Anon</Text>
                </View>
              )}
            </View>
            {renderFormattedText(item.text)}
            <TouchableOpacity
              style={styles.replyBtn}
              onPress={() => handleReplyPress(item)}
              activeOpacity={0.7}
            >
              <CornerDownRight size={12} color={colors.textSecondary} />
              <Text style={styles.replyBtnText}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nested Replies */}
        {item.replies && item.replies.length > 0 && (
          <View style={styles.nestedRepliesContainer}>
            {item.replies.map((reply) => renderReplyItem(reply))}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.dismissOverlay} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheetContainer}>
          {/* Drag handle pill */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comments</Text>
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
              <Text style={styles.emptyText}>No comments yet. Start the conversation!</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderCommentItem}
              contentContainerStyle={styles.listContent}
            />
          )}

          {/* Replying Banner */}
          {replyingTo && (
            <View style={styles.replyBanner}>
              <View style={styles.replyBannerContent}>
                <CornerDownRight size={14} color="#38bdf8" />
                <Text style={styles.replyBannerText}>
                  Replying to <Text style={styles.replyBannerHighlight}>{replyingTo.author_name}</Text>
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyCancelBtn}>
                <X size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom Input Bar */}
          <View style={styles.inputBar}>
            {/* Anonymous Toggle */}
            <TouchableOpacity
              style={[styles.anonToggle, isAnonymous && styles.anonToggleActive]}
              onPress={() => setIsAnonymous(!isAnonymous)}
              activeOpacity={0.7}
            >
              <Text style={styles.anonToggleText}>🎭</Text>
            </TouchableOpacity>

            {/* Quick @ Tag Button */}
            <TouchableOpacity
              style={[
                styles.tagToggle,
                newComment.includes('@') && styles.tagToggleActive,
              ]}
              onPress={handleInsertTag}
              activeOpacity={0.7}
            >
              <AtSign
                size={16}
                color={newComment.includes('@') ? '#38bdf8' : colors.textSecondary}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder={isAnonymous ? 'Comment anonymously...' : 'Add comment (use @ to tag)...'}
              placeholderTextColor={colors.textSecondary}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    height: '75%',
    display: 'flex',
    flexDirection: 'column',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
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
    borderBottomColor: colors.cardBorder,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
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
    color: colors.textSecondary,
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  anonAvatar: {
    backgroundColor: '#3b0764',
    borderColor: '#7e22ce',
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
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
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13.5,
  },
  anonBadge: {
    backgroundColor: '#581c87',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  anonBadgeText: {
    color: '#e9d5ff',
    fontSize: 10,
    fontWeight: '700',
  },
  commentText: {
    color: colors.textPrimary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  mentionTag: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  replyBtnText: {
    color: colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  nestedRepliesContainer: {
    marginLeft: 30,
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#334155',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  anonAvatarSmall: {
    backgroundColor: '#3b0764',
    borderColor: '#7e22ce',
  },
  avatarSmallText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 11,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  replyBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyBannerText: {
    color: colors.textSecondary,
    fontSize: 12.5,
  },
  replyBannerHighlight: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  replyCancelBtn: {
    padding: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.surface,
    gap: 6,
  },
  anonToggle: {
    padding: 7,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
  },
  anonToggleActive: {
    backgroundColor: '#581c87',
  },
  anonToggleText: {
    fontSize: 15,
  },
  tagToggle: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagToggleActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
    maxHeight: 80,
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
