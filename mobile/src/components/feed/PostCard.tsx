import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Archive,
  Bookmark,
  Download,
  FileText,
  Heart,
  MessageCircle,
  MoreVertical,
  Play,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Post } from '../../services/postService';
import { MediaGrid } from '../media/MediaGrid';
import { MediaDeckCarousel, UnifiedMediaItem } from '../media/MediaDeckCarousel';
import { DocumentCard } from '../media/DocumentCard';
import { ImageViewerModal } from '../media/ImageViewerModal';
import { PollCard } from './PollCard';
import { UserAvatar } from '../common/UserAvatar';
import { getFullMediaUrl } from '../../config/api';
import { showCrossPlatformAlert } from '../../utils/mediaUtils';

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

  const postAuthorId =
    typeof post.author === 'object' && post.author !== null
      ? (post.author as any).id
      : post.author;

  const isAuthor = Boolean(
    post.is_author ||
      currentUser?.is_staff ||
      currentUser?.is_superuser ||
      (currentUser &&
        ((postAuthorId && currentUser.id && String(postAuthorId) === String(currentUser.id)) ||
          (currentUser.email && post.author_name === currentUser.email.split('@')[0]) ||
          (currentUser.full_name && post.author_name === currentUser.full_name) ||
          (currentUser.username && post.author_username === currentUser.username)))
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
      showCrossPlatformAlert('Document', 'Document file is being processed.');
      return;
    }
    const fullUrl = getFullMediaUrl(url);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(fullUrl, '_blank');
    } else {
      Linking.openURL(fullUrl).catch(() => {
        showCrossPlatformAlert('Cannot Open File', 'Could not open document URL.');
      });
    }
  };

  // Unified Visual Media Items (Images AND Multiple Videos combined for Reddit/Twitter style slide deck)
  const unifiedMediaDeck: UnifiedMediaItem[] = [];

  // 1. Process all attachments preserving sequence
  (post.attachments || []).forEach((att) => {
    const isVid = att.file_type === 'VIDEO' || att.file_extension?.match(/^(mp4|webm|mov|mkv|avi|m4v)$/i);
    const isImg = att.file_type === 'IMAGE' || att.file_extension?.match(/^(jpg|jpeg|png|webp|gif)$/i);
    if ((isVid || isImg) && att.file_url) {
      unifiedMediaDeck.push({
        ...att,
        file_type: isVid ? 'VIDEO' : 'IMAGE',
        file_url: getFullMediaUrl(att.file_url),
      });
    }
  });

  // 2. Legacy post images
  (post.images || []).forEach((img) => {
    if (img.image) {
      unifiedMediaDeck.push({
        id: String(img.id),
        file_url: getFullMediaUrl(img.image),
        download_url: getFullMediaUrl(img.image),
        file_name: 'Campus image',
        file_type: 'IMAGE',
        file_extension: 'jpg',
      });
    }
  });

  // 3. Fallback post.media_url if not already represented in attachments
  if (post.media_url && unifiedMediaDeck.length === 0) {
    const fullMedia = getFullMediaUrl(post.media_url);
    const isVid =
      post.media_type === 'VIDEO' ||
      Boolean(fullMedia.match(/\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i));
    unifiedMediaDeck.push({
      id: `media_url_${post.id}`,
      file_url: fullMedia,
      file_type: isVid ? 'VIDEO' : 'IMAGE',
      file_name: isVid ? 'Campus video' : 'Campus image',
    });
  }

  const docAttachments = (post.attachments || []).filter((a) => a.file_type === 'DOCUMENT');

  const renderContentWithMentions = (text: string) => {
    const tokens = text.split(/(\s+)/);
    return (
      <Text style={[styles.content, { color: colors.textPrimary }]}>
        {tokens.map((tok, idx) => {
          if (/^@[a-zA-Z0-9_.-]{1,32}[.,!?:;)]*$/.test(tok)) {
            return (
              <Text key={idx} style={{ color: colors.primaryHover, fontWeight: '700' }}>
                {tok}
              </Text>
            );
          }
          return tok;
        })}
      </Text>
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder,
        },
      ]}
    >
      {/* 1. Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          disabled={post.is_anonymous || !post.author}
          onPress={() => post.author && onAuthorPress?.(post.author)}
          activeOpacity={0.75}
        >
          <UserAvatar
            uri={post.author_avatar}
            name={post.author_name}
            size={42}
            borderWidth={1.5}
            borderColor={isDark ? 'rgba(255, 255, 255, 0.12)' : colors.cardBorder}
            isAnonymous={post.is_anonymous}
            mascot={getAnonymousMascot(post.author_name || post.anonymous_alias)}
            style={{ marginRight: 11 }}
          />

          <View style={styles.authorInfo}>
            <View style={styles.nameLine}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {post.author_name}
              </Text>
              {!post.is_anonymous && post.author_verification_tier === 'FULLY_VERIFIED' && (
                <View
                  style={[
                    styles.verifiedBadgePill,
                    {
                      backgroundColor: `${colors.success}1a`,
                      borderColor: `${colors.success}44`,
                    },
                  ]}
                >
                  <ShieldCheck size={12} color={colors.success} />
                  <Text style={[styles.verifiedBadgeText, { color: colors.success }]}>VERIFIED</Text>
                </View>
              )}
              {!post.is_anonymous && post.author_verification_tier === 'INVITE_VERIFIED' && (
                <View style={styles.invitedBadgePill}>
                  <Text style={styles.invitedBadgeText}>🎓 Invited</Text>
                </View>
              )}
              {post.is_anonymous && (
                <View
                  style={[
                    styles.anonPill,
                    {
                      backgroundColor: colors.anonBadge,
                      borderColor: colors.anonPurple + '44',
                    },
                  ]}
                >
                  <Text style={[styles.anonPillText, { color: colors.anonPurple }]}>
                    Anonymous
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.metaLine}>
              <View
                style={[
                  styles.communityBadge,
                  {
                    backgroundColor: colors.surfaceLight,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.communityBadgeText, { color: isDark ? colors.textSecondary : colors.primary }]}>
                  {post.community_name || post.author_college_name || 'Campus Feed'}
                </Text>
              </View>
              <Text style={[styles.metaDot, { color: colors.textTertiary }]}>•</Text>
              <Text style={[styles.timestamp, { color: colors.textMuted }]}>
                {formatTimestamp(post.created_at)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* 3-dots Menu Button */}
        <TouchableOpacity
          style={[
            styles.moreButton,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'transparent' },
          ]}
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Post options"
        >
          <MoreVertical size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 2. Post Text Content */}
      {post.content ? (
        <TouchableOpacity onPress={() => onCommentPress(post)} activeOpacity={0.92}>
          {renderContentWithMentions(post.content)}
        </TouchableOpacity>
      ) : null}

      {/* 3. Visual Media Deck (Photos & Videos in Reddit/Twitter style slide deck) */}
      {unifiedMediaDeck.length > 0 && (
        <View style={styles.mediaGridWrapper}>
          <MediaDeckCarousel media={unifiedMediaDeck} />
        </View>
      )}

      {/* 4. 1-Tap Campus Poll */}
      {post.poll && (
        <View style={{ marginHorizontal: 12 }}>
          <PollCard
            poll={post.poll}
            postId={post.id}
            canVote={canParticipate}
            onRequireAuth={onRequireAuth}
            onRequireVerify={onRequireVerify}
          />
        </View>
      )}

      {/* 5. Academic Documents */}
      {docAttachments.length > 0 ? (
        <View style={{ marginHorizontal: 12, marginVertical: 6, gap: 6 }}>
          {docAttachments.map((doc, idx) => (
            <DocumentCard key={doc.id || idx} attachment={doc} />
          ))}
        </View>
      ) : post.media_type === 'DOCUMENT' ? (
        <TouchableOpacity
          style={[
            styles.documentCard,
            {
              backgroundColor: colors.surfaceLight,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder,
            },
          ]}
          onPress={() => handleOpenDocument(post.document || post.media_url)}
          activeOpacity={0.8}
        >
          <View style={styles.documentIconBox}>
            <FileText size={22} color="#ef4444" />
          </View>
          <View style={styles.documentInfo}>
            <Text style={[styles.documentTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {post.document_name || 'Campus Academic Document.pdf'}
            </Text>
            <Text style={[styles.documentSize, { color: colors.textMuted }]}>
              {post.document_size || 'PDF Document'} • Tap to preview
            </Text>
          </View>
          <View
            style={[
              styles.downloadBadge,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.cardBorder,
              },
            ]}
          >
            <Download size={15} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ) : null}

      {/* 6. Footer Action Bar */}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.hairline,
          },
        ]}
      >
        <View style={styles.actionGroup}>
          <TouchableOpacity
            style={[
              styles.actionPill,
              post.has_liked && {
                backgroundColor: isDark ? 'rgba(244, 63, 94, 0.12)' : '#ffe4e6',
              },
            ]}
            onPress={() => onLike(post.id)}
            activeOpacity={0.7}
          >
            <Heart
              size={18}
              color={post.has_liked ? '#f43f5e' : colors.textSecondary}
              fill={post.has_liked ? '#f43f5e' : 'transparent'}
            />
            <Text
              style={[
                styles.actionCount,
                { color: post.has_liked ? '#f43f5e' : colors.textSecondary },
                post.has_liked && { fontWeight: '700' },
              ]}
            >
              {post.likes_count || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionPill}
            onPress={() => onCommentPress(post)}
            activeOpacity={0.7}
          >
            <MessageCircle size={18} color={colors.textSecondary} />
            <Text style={[styles.actionCount, { color: colors.textSecondary }]}>
              {post.comments_count || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={() => onSharePress(post)}
            activeOpacity={0.7}
          >
            <Share2 size={17} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionIconBtn,
              isBookmarked && {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fef3c7',
              },
            ]}
            onPress={handleToggleBookmark}
            activeOpacity={0.7}
            accessibilityLabel={isBookmarked ? 'Remove saved bookmark' : 'Bookmark post'}
          >
            <Bookmark
              size={17}
              color={isBookmarked ? '#f59e0b' : colors.textSecondary}
              fill={isBookmarked ? '#f59e0b' : 'transparent'}
            />
          </TouchableOpacity>
        </View>

        {(() => {
          let label = 'All campus';
          if (post.visibility === 'COLLEGE') label = 'My college';
          else if (post.visibility === 'FOLLOWERS') label = 'Followers';
          else if (post.visibility === 'CONNECTIONS') label = 'Connections';
          else if (post.visibility === 'COMMUNITY') label = 'Community';
          else if (post.visibility === 'ONLY_ME') label = 'Private';

          return (
            <View
              style={[
                styles.audienceBadge,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : colors.surfaceLight,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder,
                },
              ]}
            >
              <Text style={[styles.audienceText, { color: colors.textTertiary }]}>{label}</Text>
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
            <View
              style={[
                styles.menuSheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.cardBorder,
                },
              ]}
            >
              {isAuthor && onDeletePost && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    onDeletePost(post.id);
                  }}
                >
                  <Trash2 size={17} color="#ef4444" />
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
                  <Archive size={17} color={colors.textPrimary} />
                  <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>
                    Archive Post
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  showCrossPlatformAlert('Reported', 'Thank you for keeping our campus safe.');
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
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authorInfo: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    maxWidth: '70%',
  },
  verifiedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  verifiedBadgeText: {
    color: '#10b981',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  invitedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(94, 106, 210, 0.14)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.3)',
  },
  invitedBadgeText: {
    color: '#828fff',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  anonPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  anonPillText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 5,
  },
  communityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  communityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaDot: {
    fontSize: 10,
  },
  timestamp: {
    fontSize: 11.5,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    fontSize: 14.5,
    lineHeight: 22,
    letterSpacing: -0.15,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  videoWrapper: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoPlaceholder: {
    width: '100%',
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playVideoLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  mediaGridWrapper: {
    marginHorizontal: 12,
    marginVertical: 6,
  },
  imageContainer: {
    width: '100%',
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
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 14,
    marginVertical: 6,
  },
  documentIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  documentSize: {
    fontSize: 11,
    marginTop: 2,
  },
  downloadBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
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
    marginTop: 6,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  audienceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  audienceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuSheet: {
    width: '82%',
    maxWidth: 290,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    elevation: 12,
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

export const PostCard = React.memo(PostCardComponent);
