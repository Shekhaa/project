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
import { useTheme } from '../../theme/ThemeContext';
import { postService, Post, Comment } from '../../services/postService';
import { SharedPostCardData } from './MessageBubble';
import { CustomVideoPlayer } from '../media/CustomVideoPlayer';
import { MediaDeckCarousel, UnifiedMediaItem } from '../media/MediaDeckCarousel';
import { UserAvatar } from '../common/UserAvatar';
import { getFullMediaUrl } from '../../config/api';
import { backHandlerRegistry } from '../../services/backHandlerRegistry';
import { X, Heart, MessageCircle, Send, MapPin, ExternalLink, ShieldCheck, AlertCircle } from 'lucide-react-native';

interface SharedPostViewerModalProps {
  cardData: SharedPostCardData | null;
  onClose: () => void;
}

export const SharedPostViewerModal: React.FC<SharedPostViewerModalProps> = ({
  cardData,
  onClose,
}) => {
  const { colors, isDark } = useTheme();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const isLostFound = cardData?.kind === 'LOST_FOUND';

  useEffect(() => {
    if (cardData) {
      backHandlerRegistry.push('SharedPostViewerModal', () => {
        onClose();
        return true;
      });
      return () => backHandlerRegistry.pop('SharedPostViewerModal');
    }
  }, [cardData]);

  useEffect(() => {
    if (cardData && !isLostFound && typeof cardData.id === 'number') {
      loadFullPost(cardData.id);
    } else {
      setPost(null);
      setComments([]);
      setNewComment('');
      setIsDeleted(false);
    }
  }, [cardData, isLostFound]);

  const loadFullPost = async (postId: number) => {
    try {
      setLoading(true);
      setIsDeleted(false);
      const [postRes, commentsRes] = await Promise.all([
        postService.getPost(postId).catch((err: any) => {
          if (err?.response?.status === 404 || err?.response?.data?.is_deleted) {
            setIsDeleted(true);
          }
          return null;
        }),
        postService.getComments(postId).catch(() => []),
      ]);
      if (postRes) {
        if (postRes.is_deleted) {
          setIsDeleted(true);
        } else {
          setPost(postRes);
        }
      } else {
        setIsDeleted(true);
      }
      setComments(commentsRes || []);
    } catch (e) {
      setIsDeleted(true);
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

  // Determine media for Postcard (Video, Multiple Images, or Single Image)
  const videoUrl =
    cardData.video_url ||
    (post?.attachments || []).find((a) => a.file_type === 'VIDEO')?.file_url ||
    (post?.media_type === 'VIDEO' ? post.media_url : null) ||
    (cardData.media_type === 'VIDEO' ? cardData.media_url : null);

  const mediaDeckItems: UnifiedMediaItem[] = (
    post?.attachments && post.attachments.length > 0
      ? post.attachments
      : cardData.media_urls && cardData.media_urls.length > 0
      ? cardData.media_urls.map((url, idx) => ({ id: idx, file_url: url, file_type: 'IMAGE' }))
      : []
  ).map((item) => ({
    ...item,
    file_url: getFullMediaUrl(item.file_url || item.uri || ''),
    uri: getFullMediaUrl(item.file_url || item.uri || ''),
  }));

  const singleImageUrl =
    !videoUrl && mediaDeckItems.length === 0 && cardData.media_url
      ? getFullMediaUrl(cardData.media_url)
      : null;

  return (
    <Modal visible={!!cardData} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        {/* Instagram-style Top Drag Handle Pill Bar */}
        <TouchableOpacity
          style={styles.dragHandleBar}
          activeOpacity={0.8}
          onPress={onClose}
          accessibilityLabel="Swipe down or tap to close"
        >
          <View style={[styles.dragHandlePill, { backgroundColor: colors.hairlineStrong || '#52525b' }]} />
        </TouchableOpacity>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.cardBorder, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {isLostFound ? 'Campus Notice' : 'Shared Campus Post'}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {isDeleted ? (
          // Content Deleted Tombstone
          <View
            style={[
              styles.lostFoundBody,
              { backgroundColor: colors.surface, alignItems: 'center', paddingVertical: 48 },
            ]}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <AlertCircle size={30} color="#ef4444" />
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: colors.textPrimary,
                marginBottom: 8,
              }}
            >
              Content Unavailable
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                textAlign: 'center',
                paddingHorizontal: 24,
                marginBottom: 24,
                lineHeight: 18,
              }}
            >
              This {isLostFound ? 'notice' : 'post'} was deleted by the owner and is no longer
              available on campus.
            </Text>
            <TouchableOpacity
              style={[
                styles.doneBtn,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.cardBorder,
                  borderWidth: 1,
                  paddingHorizontal: 28,
                },
              ]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        ) : isLostFound ? (
          // Lost & Found Notice Details (No comments chain, direct item inspect)
          <View style={[styles.lostFoundBody, { backgroundColor: colors.surface }]}>
            <View style={styles.authorRow}>
              <View
                style={[
                  styles.badgePill,
                  {
                    backgroundColor:
                      cardData.item_type === 'LOST'
                        ? 'rgba(239, 68, 68, 0.18)'
                        : 'rgba(34, 197, 94, 0.18)',
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: cardData.item_type === 'LOST' ? '#ef4444' : '#22c55e',
                  }}
                >
                  {cardData.item_type === 'LOST' ? '🔍 LOST NOTICE' : '📦 FOUND ITEM'}
                </Text>
              </View>
              <Text style={[styles.authorName, { color: colors.textPrimary, marginLeft: 8 }]}>
                Reported by {cardData.author_name}
              </Text>
            </View>

            {singleImageUrl && (
              <View style={[styles.imageBox, { borderColor: colors.cardBorder }]}>
                <Image source={{ uri: singleImageUrl }} style={styles.postImg} resizeMode="contain" />
              </View>
            )}

            <Text style={[styles.postText, { color: colors.textPrimary }]}>{cardData.content}</Text>

            {cardData.location && (
              <View style={[styles.locationRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                <MapPin size={16} color={colors.primary} />
                <Text style={[styles.locationText, { color: colors.textSecondary }]}>
                  Location: {cardData.location}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Regular Campus Post with Video, Photo Deck & Comment Chain
          <FlatList
            data={comments}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={[styles.postBody, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
                {/* Author Row */}
                <View style={styles.authorRow}>
                  <UserAvatar
                    name={cardData.author_name}
                    size={38}
                    uri={cardData.author_avatar || post?.author_avatar}
                  />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                      {cardData.author_name}
                    </Text>
                    {cardData.community_name && (
                      <Text style={[styles.communityTag, { color: colors.textMuted }]}>
                        🎓 {cardData.community_name}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Text Content */}
                {cardData.content ? (
                  <Text style={[styles.postText, { color: colors.textPrimary }]}>{cardData.content}</Text>
                ) : null}

                {/* Video Player (Full Screen-Level 10s Controls) */}
                {videoUrl ? (
                  <View style={styles.mediaBox}>
                    <CustomVideoPlayer url={videoUrl} autoPlay={false} />
                  </View>
                ) : mediaDeckItems.length > 0 ? (
                  /* Photo Carousel Deck (Reddit / Insta Slide Deck) */
                  <View style={styles.mediaBox}>
                    <MediaDeckCarousel media={mediaDeckItems} />
                  </View>
                ) : singleImageUrl ? (
                  <View style={[styles.imageBox, { borderColor: colors.cardBorder }]}>
                    <Image source={{ uri: singleImageUrl }} style={styles.postImg} resizeMode="contain" />
                  </View>
                ) : null}

                {/* Likes & Comments Counters */}
                <View style={[styles.statsRow, { borderTopColor: colors.cardBorder }]}>
                  <TouchableOpacity style={styles.statBtn} onPress={handleLike} activeOpacity={0.7}>
                    <Heart
                      size={20}
                      color={post?.has_liked ? '#ef4444' : colors.textSecondary}
                      fill={post?.has_liked ? '#ef4444' : 'transparent'}
                    />
                    <Text
                      style={[
                        styles.statText,
                        { color: post?.has_liked ? '#ef4444' : colors.textSecondary },
                      ]}
                    >
                      {post?.likes_count ?? cardData.likes_count ?? 0} Likes
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.statBtn}>
                    <MessageCircle size={20} color={colors.textSecondary} />
                    <Text style={[styles.statText, { color: colors.textSecondary }]}>
                      {post?.comments_count ?? cardData.comments_count ?? 0} Comments
                    </Text>
                  </View>
                </View>

                <Text style={[styles.commentsHeading, { color: colors.textPrimary }]}>Discussion Thread</Text>
                {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.commentItem, { borderBottomColor: colors.cardBorder }]}>
                <UserAvatar name={item.author_name} size={32} uri={item.author_avatar} />
                <View style={styles.commentMeta}>
                  <Text style={[styles.commentAuthor, { color: colors.textPrimary }]}>{item.author_name}</Text>
                  <Text style={[styles.commentBodyText, { color: colors.textSecondary }]}>{item.text}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyCommentsBox}>
                  <Text style={[styles.emptyCommentsText, { color: colors.textMuted }]}>
                    No comments yet. Start the chain below!
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Comment Input Bar for Posts */}
        {!isLostFound && (
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceLight,
                  color: colors.textPrimary,
                  borderColor: colors.cardBorder,
                },
              ]}
              placeholder="Reply to this postcard..."
              placeholderTextColor={colors.textMuted}
              value={newComment}
              onChangeText={setNewComment}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: colors.primary },
                !newComment.trim() && { opacity: 0.5 },
              ]}
              onPress={handleSendComment}
              disabled={!newComment.trim() || submittingComment}
              activeOpacity={0.8}
            >
              {submittingComment ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Send size={16} color={colors.onPrimary} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dragHandleBar: {
    alignItems: 'center',
    paddingVertical: 10,
    cursor: 'pointer',
  } as any,
  dragHandlePill: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  postBody: {
    padding: 16,
    borderBottomWidth: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  communityTag: {
    fontSize: 11.5,
    marginTop: 1,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  postText: {
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 12,
  },
  mediaBox: {
    marginBottom: 14,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageBox: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
    maxHeight: 400,
    backgroundColor: '#000000',
  },
  postImg: {
    width: '100%',
    height: 320,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  statBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  commentsHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    marginTop: 16,
    letterSpacing: 0.3,
  },
  listContent: {
    paddingBottom: 20,
  },
  commentItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentMeta: {
    marginLeft: 10,
    flex: 1,
  },
  commentAuthor: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  commentBodyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCommentsBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 13,
  },
  lostFoundBody: {
    padding: 18,
    margin: 16,
    borderRadius: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
