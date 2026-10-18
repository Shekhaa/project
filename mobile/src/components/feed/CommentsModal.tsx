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
  Switch,
} from 'react-native';
import { colors } from '../../theme/colors';
import { postService, Comment, Post } from '../../services/postService';
import { X, Send, CornerDownRight } from 'lucide-react-native';

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

  const handleSendComment = async () => {
    if (!post || !newComment.trim()) return;

    try {
      setSubmitting(true);
      const created = await postService.addComment(
        post.id,
        newComment.trim(),
        isAnonymous,
        replyingTo ? replyingTo.id : undefined
      );
      setComments((prev) => [created, ...prev]);
      setNewComment('');
      setReplyingTo(null);
    } catch (e) {
      console.log('Failed to post comment', e);
    } finally {
      setSubmitting(false);
    }
  };

  const renderCommentItem = ({ item }: { item: Comment }) => {
    return (
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
          <Text style={styles.commentText}>{item.text}</Text>
          <TouchableOpacity
            style={styles.replyBtn}
            onPress={() => setReplyingTo(item)}
          >
            <CornerDownRight size={12} color={colors.textSecondary} />
            <Text style={styles.replyBtnText}>Reply</Text>
          </TouchableOpacity>
        </View>
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
              <Text style={styles.replyBannerText}>
                Replying to <Text style={{ fontWeight: '700' }}>{replyingTo.author_name}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom Input Bar */}
          <View style={styles.inputBar}>
            <TouchableOpacity
              style={[styles.anonToggle, isAnonymous && styles.anonToggleActive]}
              onPress={() => setIsAnonymous(!isAnonymous)}
            >
              <Text style={styles.anonToggleText}>🎭</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder={isAnonymous ? 'Comment anonymously...' : 'Add a comment...'}
              placeholderTextColor={colors.textSecondary}
              value={newComment}
              onChangeText={setNewComment}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!newComment.trim() || submitting) && styles.sendBtnDisabled,
              ]}
              onPress={handleSendComment}
              disabled={!newComment.trim() || submitting}
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    maxHeight: 600,
    overflow: 'hidden',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  anonAvatar: {
    backgroundColor: '#3b0764',
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  anonBadge: {
    backgroundColor: '#581c87',
    paddingHorizontal: 6,
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
    fontSize: 14,
    lineHeight: 20,
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
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  replyBannerText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  anonToggle: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    marginRight: 8,
  },
  anonToggleActive: {
    backgroundColor: '#581c87',
  },
  anonToggleText: {
    fontSize: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
