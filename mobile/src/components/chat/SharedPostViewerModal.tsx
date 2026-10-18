import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { postService, Post, Comment } from '../../services/postService';
import { SharedPostCardData } from './MessageBubble';
import { X, Heart, MessageCircle, Send } from 'lucide-react-native';

interface SharedPostViewerModalProps {
  cardData: SharedPostCardData | null;
  onClose: () => void;
}

export const SharedPostViewerModal: React.FC<SharedPostViewerModalProps> = ({
  cardData,
  onClose,
}) => {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (cardData) {
      loadFullPost(cardData.id);
    } else {
      setPost(null);
      setComments([]);
      setNewComment('');
    }
  }, [cardData]);

  const loadFullPost = async (postId: number) => {
    try {
      setLoading(true);
      const [postRes, commentsRes] = await Promise.all([
        postService.getPost(postId).catch(() => null),
        postService.getComments(postId).catch(() => []),
      ]);
      if (postRes) setPost(postRes);
      setComments(commentsRes || []);
    } catch (e) {
      console.log('Error loading shared post details', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!post) return;
    try {
      const res = await postService.toggleLike(post.id);
      setPost((prev) =>
        prev
          ? {
              ...prev,
              has_liked: res.has_liked ?? res.liked,
              likes_count: res.likes_count,
            }
          : null
      );
    } catch (e) {}
  };

  const handleSendComment = async () => {
    if (!post || !newComment.trim()) return;
    try {
      setSubmittingComment(true);
      const created = await postService.addComment(post.id, newComment.trim(), false);
      setComments((prev) => [created, ...prev]);
      setPost((prev) => (prev ? { ...prev, comments_count: prev.comments_count + 1 } : null));
      setNewComment('');
    } catch (e) {
    } finally {
      setSubmittingComment(false);
    }
  };

  if (!cardData) return null;

  return (
    <Modal visible={!!cardData} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shared Post</Text>
          <View style={{ width: 30 }} />
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.postBody}>
              {/* Author Row */}
              <View style={styles.authorRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {cardData.author_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.authorName}>{cardData.author_name}</Text>
                  {cardData.community_name && (
                    <Text style={styles.communityTag}>🎓 {cardData.community_name}</Text>
                  )}
                </View>
              </View>

              {/* Text Content */}
              {cardData.content ? (
                <Text style={styles.postText}>{cardData.content}</Text>
              ) : null}

              {/* Photo */}
              {cardData.media_type === 'IMAGE' && cardData.media_url ? (
                <View style={styles.imageBox}>
                  <Image
                    source={{ uri: cardData.media_url }}
                    style={styles.postImg}
                    resizeMode="cover"
                  />
                </View>
              ) : null}

              {/* Actions */}
              <View style={styles.statsRow}>
                <TouchableOpacity style={styles.statBtn} onPress={handleLike}>
                  <Heart
                    size={20}
                    color={post?.has_liked ? '#ef4444' : colors.textSecondary}
                    fill={post?.has_liked ? '#ef4444' : 'transparent'}
                  />
                  <Text
                    style={[
                      styles.statText,
                      post?.has_liked && { color: '#ef4444', fontWeight: '700' },
                    ]}
                  >
                    {post?.likes_count ?? cardData.likes_count ?? 0}
                  </Text>
                </TouchableOpacity>

                <View style={styles.statBtn}>
                  <MessageCircle size={20} color={colors.textSecondary} />
                  <Text style={styles.statText}>
                    {post?.comments_count ?? cardData.comments_count ?? 0}
                  </Text>
                </View>
              </View>

              <Text style={styles.commentsHeading}>Comments</Text>
              {loading && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {(item.author_name || 'S').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.commentMeta}>
                <Text style={styles.commentAuthor}>{item.author_name}</Text>
                <Text style={styles.commentBodyText}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        {/* Comment input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textSecondary}
            value={newComment}
            onChangeText={setNewComment}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !newComment.trim() && styles.sendBtnDisabled]}
            onPress={handleSendComment}
            disabled={!newComment.trim() || submittingComment}
          >
            {submittingComment ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </TouchableOpacity>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 20,
  },
  postBody: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#93c5fd',
    fontSize: 16,
    fontWeight: '700',
  },
  authorName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  communityTag: {
    color: colors.primary,
    fontSize: 12,
    marginTop: 2,
  },
  postText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  imageBox: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 14,
  },
  postImg: {
    width: '100%',
    height: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  statBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  commentsHeading: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 8,
  },
  commentItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  commentAvatarText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  commentMeta: {
    flex: 1,
  },
  commentAuthor: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  commentBodyText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 18,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
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
