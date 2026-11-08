import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme/ThemeContext';
import { colors } from '../../theme/colors';
import { Post } from '../../services/postService';
import { MediaGrid } from '../media/MediaGrid';
import { DocumentCard } from '../media/DocumentCard';
import { getFullMediaUrl } from '../../config/api';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreVertical,
  Trash2,
  Archive,
  FileText,
  Download,
  ShieldCheck,
  Sparkles,
  Image as ImageIcon,
  Play,
} from 'lucide-react-native';

interface PostCardProps {
  post: Post;
  currentUser?: any;
  onLike: (postId: number) => void;
  onCommentPress: (post: Post) => void;
  onSharePress: (post: Post) => void;
  onDeletePost?: (postId: number) => void;
  onArchivePost?: (postId: number) => void;
  onAuthorPress?: (authorId: number) => void;
  onBookmarkToggle?: (postId: number, isBookmarked: boolean) => void;
}

const PostCardComponent: React.FC<PostCardProps> = ({
  post,
  currentUser,
  onLike,
  onCommentPress,
  onSharePress,
  onDeletePost,
  onArchivePost,
  onAuthorPress,
  onBookmarkToggle,
}) => {
  const { colors, isDark } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem('campus_saved_posts').then((val) => {
      if (!isMounted || !val) return;
      try {
        const list = JSON.parse(val);
        if (Array.isArray(list) && list.includes(post.id)) {
          setIsBookmarked(true);
        }
      } catch {}
    });
    return () => {
      isMounted = false;
    };
  }, [post.id]);

  const handleToggleBookmark = async () => {
    try {
      const val = await AsyncStorage.getItem('campus_saved_posts');
      let list: number[] = val ? JSON.parse(val) : [];
      const willBookmark = !isBookmarked;
      if (willBookmark) {
        if (!list.includes(post.id)) list.push(post.id);
      } else {
        list = list.filter((id) => id !== post.id);
      }
      await AsyncStorage.setItem('campus_saved_posts', JSON.stringify(list));
      setIsBookmarked(willBookmark);
      onBookmarkToggle?.(post.id, willBookmark);
    } catch (err) {
      console.log('Error saving bookmark', err);
    }
  };

  const getAnonymousMascot = (name?: string) => {
    const str = (name || '').toLowerCase();
    if (str.includes('owl')) return '🦉';
    if (str.includes('fox')) return '🦊';
    if (str.includes('tiger')) return '🐯';
    if (str.includes('falcon') || str.includes('eagle')) return '🦅';
    if (str.includes('bear')) return '🐻';
    if (str.includes('wolf')) return '🐺';
    if (str.includes('panda')) return '🐼';
    return '🎭';
  };

  const isAuthor = Boolean(
    post.is_author ||
    (currentUser && (
      (post.author && currentUser.id && post.author === currentUser.id) ||
      (currentUser.email && post.author_name === currentUser.email.split('@')[0]) ||
      (currentUser.full_name && post.author_name === currentUser.full_name) ||
      (currentUser.username && post.author_username === currentUser.username)
    ))
  );

  const formatTimestamp = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleOpenDocument = (url?: string) => {
    if (!url) {
      Alert.alert('Document', 'Document file is being processed.');
      return;
    }
    const fullUrl = getFullMediaUrl(url);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(fullUrl, '_blank');
    } else {
      Linking.openURL(fullUrl).catch(() => {
        Alert.alert('Cannot Open File', 'Could not open document URL.');
      });
    }
  };

  const authorInitial = (post.author_name || 'S').charAt(0).toUpperCase();

  // Unified Media Attachments with backend host resolution
  const imageAttachments = (post.attachments || [])
    .filter((a) => a.file_type === 'IMAGE' && a.file_url)
    .map((a) => ({ ...a, file_url: getFullMediaUrl(a.file_url) }));

  const legacyImages = (post.images || [])
    .filter((img) => img.image)
    .map((img) => ({
      id: String(img.id),
      file_url: getFullMediaUrl(img.image),
      download_url: getFullMediaUrl(img.image),
      file_name: 'Campus image',
      file_type: 'IMAGE' as const,
      file_extension: 'jpg',
      mime_type: 'image/jpeg',
      file_size: 0,
      file_size_formatted: '',
      created_at: img.uploaded_at || post.created_at,
    }));

  const allImages = [...imageAttachments, ...legacyImages];
  const singleMediaUrl = post.media_url ? getFullMediaUrl(post.media_url) : null;
  const docAttachments = (post.attachments || []).filter((a) => a.file_type === 'DOCUMENT');

  const videoAttachment = (post.attachments || []).find(
    (a) => a.file_type === 'VIDEO' || a.file_extension?.match(/^(mp4|webm|mov|mkv|avi|m4v)$/i)
  );
  const isVideoMedia =
    post.media_type === 'VIDEO' ||
    Boolean(videoAttachment) ||
    Boolean(singleMediaUrl && singleMediaUrl.match(/\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i));
  const postVideoUrl = videoAttachment ? getFullMediaUrl(videoAttachment.file_url) : (isVideoMedia ? singleMediaUrl : null);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          disabled={post.is_anonymous || !post.author}
          onPress={() => post.author && onAuthorPress?.(post.author)}
          activeOpacity={0.7}
        >
          {post.is_anonymous ? (
            <View style={[styles.avatar, styles.anonAvatar]}>
              <Text style={styles.avatarText}>
                {getAnonymousMascot(post.author_name || (post as any).anonymous_alias)}
              </Text>
            </View>
          ) : post.author_avatar ? (
            <Image source={{ uri: getFullMediaUrl(post.author_avatar) }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
              <Text style={[styles.avatarText, { color: colors.textPrimary }]}>{authorInitial}</Text>
            </View>
          )}

          <View style={styles.authorInfo}>
            <View style={styles.nameLine}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {post.author_name}
              </Text>
              {!post.is_anonymous && post.author_verification_tier === 'FULLY_VERIFIED' && (
                <ShieldCheck size={14} color="#38bdf8" style={styles.badgeIcon} />
              )}
              {post.is_anonymous && (
                <View style={[styles.anonPill, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.anonPillText, { color: colors.textMuted }]}>Anonymous</Text>
                </View>
              )}
            </View>

            <View style={styles.metaLine}>
              <Text style={styles.communityTag}>
                {post.community_name || post.author_college_name || 'Campus Feed'}
                {' • '}
              </Text>
              <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatTimestamp(post.created_at)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* 3-dots Menu */}
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreVertical size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Post Text Content */}
      {post.content ? (
        <TouchableOpacity onPress={() => onCommentPress(post)} activeOpacity={0.92}>
          <Text style={[styles.content, { color: colors.textPrimary }]}>{post.content}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Post Attachments (Playable Video, Images, & Academic Documents) */}
      {postVideoUrl ? (
        <View style={{ marginHorizontal: 12, marginVertical: 6, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
          {Platform.OS === 'web' ? (
            <video
              src={postVideoUrl}
              controls
              playsInline
              style={{ width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block', borderRadius: 12 }}
            />
          ) : (
            <TouchableOpacity
              style={[styles.imageContainer, { height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }]}
              onPress={() => Linking.openURL(postVideoUrl)}
            >
              <Play size={40} color="#fff" />
              <Text style={{ color: '#fff', marginTop: 8, fontWeight: '600' }}>Play Video</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : allImages.length > 0 ? (
        <View style={{ marginHorizontal: 12, marginVertical: 6 }}>
          <MediaGrid images={allImages} />
        </View>
      ) : singleMediaUrl && (post.media_type === 'IMAGE' || !post.media_type) && !imageError ? (
        <TouchableOpacity
          style={[styles.imageContainer, { backgroundColor: isDark ? '#141516' : '#f1f5f9' }]}
          onPress={() => onCommentPress(post)}
          activeOpacity={0.95}
        >
          <Image
            source={{ uri: singleMediaUrl }}
            style={styles.postImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        </TouchableOpacity>
      ) : null}

      {/* Unified Academic Documents */}
      {docAttachments.length > 0 ? (
        <View style={{ marginHorizontal: 12, marginVertical: 6, gap: 6 }}>
          {docAttachments.map((doc, idx) => (
            <DocumentCard key={doc.id || idx} attachment={doc} />
          ))}
        </View>
      ) : post.media_type === 'DOCUMENT' ? (
        <TouchableOpacity
          style={styles.documentCard}
          onPress={() => handleOpenDocument(post.document || post.media_url)}
          activeOpacity={0.8}
        >
          <View style={styles.documentIconBox}>
            <FileText size={24} color="#ef4444" />
          </View>
          <View style={styles.documentInfo}>
            <Text style={styles.documentTitle} numberOfLines={1}>
              {post.document_name || 'Campus Academic Document.pdf'}
            </Text>
            <Text style={styles.documentSize}>
              {post.document_size || 'PDF Document'} • Tap to preview
            </Text>
          </View>
          <View style={styles.downloadBadge}>
            <Download size={16} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Footer Action Bar */}
      <View style={styles.footer}>
        <View style={styles.actionGroup}>
          {/* Like */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onLike(post.id)}
            activeOpacity={0.7}
          >
            <Heart
              size={20}
              color={post.has_liked ? '#ef4444' : colors.textSecondary}
              fill={post.has_liked ? '#ef4444' : 'transparent'}
            />
            <Text
              style={[
                styles.actionCount,
                post.has_liked && { color: '#ef4444', fontWeight: '700' },
              ]}
            >
              {post.likes_count || 0}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onCommentPress(post)}
            activeOpacity={0.7}
          >
            <MessageCircle size={20} color={colors.textSecondary} />
            <Text style={[styles.actionCount, { color: colors.textSecondary }]}>{post.comments_count || 0}</Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onSharePress(post)}
            activeOpacity={0.7}
          >
            <Share2 size={19} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Bookmark / Save */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleToggleBookmark}
            activeOpacity={0.7}
            accessibilityLabel={isBookmarked ? 'Remove saved bookmark' : 'Bookmark post'}
          >
            <Bookmark
              size={19}
              color={isBookmarked ? '#f59e0b' : colors.textSecondary}
              fill={isBookmarked ? '#f59e0b' : 'transparent'}
            />
          </TouchableOpacity>
        </View>

        {/* Post Visibility / Audience Badge */}
        {(() => {
          let label = 'All colleges';
          if (post.visibility === 'COLLEGE') label = 'My college';
          else if (post.visibility === 'FOLLOWERS') label = 'Followers only';
          else if (post.visibility === 'CONNECTIONS') label = 'Connections';
          else if (post.visibility === 'COMMUNITY') label = 'Community';
          else if (post.visibility === 'ONLY_ME') label = 'Only me';

          return (
            <View style={[styles.audienceBadge, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
              <Text style={[styles.audienceText, { color: colors.textMuted }]}>{label}</Text>
            </View>
          );
        })()}
      </View>

      {/* Options Menu Modal */}
      {menuVisible && (
        <Modal
          transparent
          animationType="fade"
          visible={menuVisible}
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          >
            <View style={[styles.menuSheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              {isAuthor && onDeletePost && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    onDeletePost(post.id);
                  }}
                >
                  <Trash2 size={18} color="#ef4444" />
                  <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Delete Post</Text>
                </TouchableOpacity>
              )}

              {isAuthor && onArchivePost && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    onArchivePost(post.id);
                  }}
                >
                  <Archive size={18} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>Archive Post</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  Alert.alert('Reported', 'Thank you for keeping our campus safe.');
                }}
              >
                <Text style={[styles.menuItemText, { color: colors.textSecondary }]}>
                  Report Post
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 14,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  anonAvatar: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.cardBorder,
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  authorInfo: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '75%',
  },
  badgeIcon: {
    marginLeft: 4,
  },
  anonPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginLeft: 6,
  },
  anonPillText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  communityTag: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  timestamp: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  moreButton: {
    padding: 6,
  },
  content: {
    color: colors.textPrimary,
    fontSize: 14.5,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 14,
    marginVertical: 8,
  },
  documentIconBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  documentSize: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  downloadBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 6,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  actionCount: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuSheet: {
    width: '80%',
    maxWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 8,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  audienceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  audienceText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});

export const PostCard = React.memo(PostCardComponent);
