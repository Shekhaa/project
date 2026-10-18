import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { postService, Post } from '../services/postService';
import { communityService, Community } from '../services/communityService';
import { PostCard } from '../components/feed/PostCard';
import { PostComposerModal } from '../components/feed/PostComposerModal';
import { CommentsModal } from '../components/feed/CommentsModal';
import { ShareModal } from '../components/feed/ShareModal';
import { Plus, Bell, RefreshCw, Sparkles } from 'lucide-react-native';

interface FeedScreenProps {
  currentUser?: any;
  composerTrigger?: number;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({
  currentUser,
  composerTrigger,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals state
  const [composerVisible, setComposerVisible] = useState(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);

  // Trigger from navigation/header
  useEffect(() => {
    if (composerTrigger && composerTrigger > 0) {
      setComposerVisible(true);
    }
  }, [composerTrigger]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [feedData, commsData] = await Promise.all([
        postService.getFeed(selectedCommunityId),
        communityService.getMyCommunities(),
      ]);
      setPosts(feedData || []);
      setCommunities(commsData || []);
    } catch (e) {
      console.log('Error loading feed data', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCommunityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleLikePost = async (postId: number) => {
    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const newHasLiked = !p.has_liked;
          return {
            ...p,
            has_liked: newHasLiked,
            likes_count: newHasLiked ? p.likes_count + 1 : Math.max(0, p.likes_count - 1),
          };
        }
        return p;
      })
    );

    try {
      const res = await postService.toggleLike(postId);
      // Sync exact server count
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, has_liked: res.has_liked ?? res.liked, likes_count: res.likes_count }
            : p
        )
      );
    } catch (e) {
      // Revert if error
      loadData();
    }
  };

  const handleDeletePost = async (postId: number) => {
    try {
      await postService.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      Alert.alert('Deleted', 'Post removed from campus feed.');
    } catch (e) {
      Alert.alert('Error', 'Could not delete post.');
    }
  };

  const handleArchivePost = async (postId: number) => {
    try {
      await postService.archivePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      Alert.alert('Archived', 'Post moved to archive.');
    } catch (e) {
      Alert.alert('Error', 'Could not archive post.');
    }
  };

  const renderHeader = () => (
    <View style={styles.headerArea}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>Campus</Text>
          <Text style={styles.brandAccent}>Connect</Text>
          <View style={styles.campusBadge}>
            <Text style={styles.campusBadgeText}>GEU/GEHU</Text>
          </View>
        </View>

        <View style={styles.navActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => Alert.alert('Campus Notifications', 'You have no unread notifications.')}
          >
            <Bell size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createPostBtn}
            onPress={() => setComposerVisible(true)}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.createPostBtnText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Community Filters */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedCommunityId === undefined && styles.filterPillActive,
            ]}
            onPress={() => setSelectedCommunityId(undefined)}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedCommunityId === undefined && styles.filterPillTextActive,
              ]}
            >
              🌟 All Campus
            </Text>
          </TouchableOpacity>

          {communities.map((c) => {
            const isSelected = selectedCommunityId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.filterPill, isSelected && styles.filterPillActive]}
                onPress={() => setSelectedCommunityId(c.id)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  🎓 {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Sparkles size={36} color={colors.primary} />
        <Text style={styles.emptyTitle}>Campus feed is quiet right now</Text>
        <Text style={styles.emptySub}>
          Be the first to share an announcement, ask a question, or upload study notes!
        </Text>
        <TouchableOpacity
          style={styles.emptyCta}
          onPress={() => setComposerVisible(true)}
        >
          <Text style={styles.emptyCtaText}>Create First Post</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderHeader()}

      {loading && posts.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Syncing campus updates...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUser={currentUser}
              onLike={handleLikePost}
              onCommentPress={(p) => setActiveCommentsPost(p)}
              onSharePress={(p) => setActiveSharePost(p)}
              onDeletePost={handleDeletePost}
              onArchivePost={handleArchivePost}
            />
          )}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      {/* Dedicated Post Composer & Photo Editor / PDF Modal */}
      <PostComposerModal
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onPostCreated={loadData}
        communities={communities}
        defaultCommunityId={selectedCommunityId}
      />

      {/* Comments Modal */}
      <CommentsModal
        visible={!!activeCommentsPost}
        post={activeCommentsPost}
        onClose={() => setActiveCommentsPost(null)}
      />

      {/* Share Modal */}
      <ShareModal
        visible={!!activeSharePost}
        post={activeSharePost}
        onClose={() => setActiveSharePost(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerArea: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  brandAccent: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  campusBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  campusBadgeText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  createPostBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterSection: {
    paddingVertical: 10,
  },
  filterScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  filterPill: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterPillActive: {
    backgroundColor: '#1e3a8a',
    borderColor: colors.primary,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#93c5fd',
    fontWeight: '700',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    marginTop: 40,
    gap: 10,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyCta: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
