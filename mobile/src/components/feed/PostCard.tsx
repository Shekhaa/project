import React, { useState } from 'react';
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
import { colors } from '../../theme/colors';
import { Post } from '../../services/postService';
import {
  Heart,
  MessageCircle,
  Share2,
  MoreVertical,
  Trash2,
  Archive,
  FileText,
  Download,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';

interface PostCardProps {
  post: Post;
  currentUser?: any;
  onLike: (postId: number) => void;
  onCommentPress: (post: Post) => void;
  onSharePress: (post: Post) => void;
  onDeletePost?: (postId: number) => void;
  onArchivePost?: (postId: number) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  onLike,
  onCommentPress,
  onSharePress,
  onDeletePost,
  onArchivePost,
}) => {
  const [menuVisible, setMenuVisible] = useState(false);

  const isAuthor = currentUser && (
    (currentUser.email && post.author_name === currentUser.email.split('@')[0]) ||
    (currentUser.full_name && post.author_name === currentUser.full_name) ||
    (currentUser.username && post.author_username === currentUser.username)
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
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        Alert.alert('Cannot Open File', 'Could not open document URL.');
      });
    }
  };

  const authorInitial = (post.author_name || 'S').charAt(0).toUpperCase();

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.authorRow}>
          {post.is_anonymous ? (
            <View style={[styles.avatar, styles.anonAvatar]}>
              <Text style={styles.avatarText}>🎭</Text>
            </View>
          ) : post.author_avatar ? (
            <Image source={{ uri: post.author_avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{authorInitial}</Text>
            </View>
          )}

          <View style={styles.authorInfo}>
            <View style={styles.nameLine}>
              <Text style={styles.authorName} numberOfLines={1}>
                {post.author_name}
              </Text>
              {!post.is_anonymous && post.author_verification_tier === 'FULLY_VERIFIED' && (
                <ShieldCheck size={14} color="#38bdf8" style={styles.badgeIcon} />
              )}
              {post.is_anonymous && (
                <View style={styles.anonPill}>
                  <Text style={styles.anonPillText}>Anonymous</Text>
                </View>
              )}
            </View>

            <View style={styles.metaLine}>
              {post.community_name ? (
                <Text style={styles.communityTag}>🎓 {post.community_name} • </Text>
              ) : null}
              <Text style={styles.timestamp}>{formatTimestamp(post.created_at)}</Text>
            </View>
          </View>
        </View>

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
          <Text style={styles.content}>{post.content}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Post Media: IMAGE */}
      {post.media_type === 'IMAGE' && post.media_url ? (
        <TouchableOpacity
          style={styles.imageContainer}
          onPress={() => onCommentPress(post)}
          activeOpacity={0.95}
        >
          <Image
            source={{ uri: post.media_url }}
            style={styles.postImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ) : null}

      {/* Post Media: DOCUMENT / PDF */}
      {post.media_type === 'DOCUMENT' && (
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
      )}

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
            <Text style={styles.actionCount}>{post.comments_count || 0}</Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onSharePress(post)}
            activeOpacity={0.7}
          >
            <Share2 size={19} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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
            <View style={styles.menuSheet}>
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
    backgroundColor: '#3b0764',
    borderColor: '#7e22ce',
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
    backgroundColor: '#581c87',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  anonPillText: {
    color: '#e9d5ff',
    fontSize: 10,
    fontWeight: '700',
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
    backgroundColor: '#0a0f1d',
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
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 14,
    marginVertical: 8,
  },
  documentIconBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#450a0a',
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
    backgroundColor: '#1e3a8a',
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
});
