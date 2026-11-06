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
  Modal,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { colors } from '../theme/colors';
import { postService, Post } from '../services/postService';
import { communityService, Community } from '../services/communityService';
import { PostCard } from '../components/feed/PostCard';
import { PostComposerModal } from '../components/feed/PostComposerModal';
import { CommentsModal } from '../components/feed/CommentsModal';
import { ShareModal } from '../components/feed/ShareModal';
import { NotificationsModal } from '../components/notifications/NotificationsModal';
import { notificationService, NotificationItem } from '../services/notificationService';
import { api } from '../config/api';
import { Plus, Bell, RefreshCw, Sparkles, SlidersHorizontal, Check, X, Sun, Moon } from 'lucide-react-native';

interface FeedScreenProps {
  currentUser?: any;
  composerTrigger?: number;
  onNavigateToChat?: (conversationId?: string | number) => void;
  onOpenProfile?: (userId: number) => void;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({
  currentUser,
  composerTrigger,
  onNavigateToChat,
  onOpenProfile,
}) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | undefined>(undefined);
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'GLOBAL' | 'COLLEGE' | 'FOLLOWING' | 'MEDIA' | 'RESOURCES' | undefined>('ALL');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Instagram-style Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modals state
  const [composerVisible, setComposerVisible] = useState(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const handleSelectNotification = useCallback(
    async (notif: NotificationItem) => {
      if (notif.data?.post_id) {
        const postId = Number(notif.data.post_id);
        const found = posts.find((p) => p.id === postId);
        if (found) {
          setActiveCommentsPost(found);
        } else {
          try {
            const res = await api.get(`/posts/${postId}/`);
            if (res.data) {
              setActiveCommentsPost(res.data);
            }
          } catch {
            Alert.alert('Post', 'This post might have been removed or is unavailable.');
          }
        }
      } else if (notif.data?.conversation_id) {
        if (onNavigateToChat) {
          onNavigateToChat(notif.data.conversation_id);
        }
      } else if (notif.data?.discussion_id) {
        Alert.alert('Hub Discussion', notif.message);
      }
    },
    [posts, onNavigateToChat]
  );

  const syncNotifications = useCallback(async () => {
    try {
      const res = await notificationService.getNotifications();
      const newUnread = res.unread_count || 0;
      if (newUnread > unreadNotifCount && res.results && res.results.length > 0) {
        const latest = res.results[0];
        if (!latest.is_read) {
          notificationService.showExternalNotification(
            latest.title,
            latest.message,
            latest,
            (notifData) => handleSelectNotification(notifData)
          );
        }
      }
      setUnreadNotifCount(newUnread);
    } catch {
      // background sync fail silently
    }
  }, [unreadNotifCount, handleSelectNotification]);

  useEffect(() => {
    syncNotifications();
    const interval = setInterval(syncNotifications, 20000);
    return () => clearInterval(interval);
  }, [syncNotifications]);

  // Trigger from navigation/header
  useEffect(() => {
    if (composerTrigger && composerTrigger > 0) {
      setComposerVisible(true);
    }
  }, [composerTrigger]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPage(1);
      const feedQuery = selectedCommunityId
        ? { communityId: selectedCommunityId }
        : selectedScope && selectedScope !== 'ALL'
        ? { scope: selectedScope }
        : undefined;

      const [feedData, commsData] = await Promise.all([
        postService.getFeed(feedQuery, 1),
        communityService.getMyCommunities(),
      ]);
      setPosts(feedData.results || []);
      setHasMore(Boolean(feedData.next));
      setCommunities(commsData || []);
    } catch (e: any) {
      console.log('Error loading feed data', e);
      const msg = e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Could not sync campus feed. Please check your connection.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCommunityId, selectedScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || loading || refreshing) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const feedQuery = selectedCommunityId
        ? { communityId: selectedCommunityId }
        : selectedScope && selectedScope !== 'ALL'
        ? { scope: selectedScope }
        : undefined;

      const feedData = await postService.getFeed(feedQuery, nextPage);
      setPosts((prev) => [...prev, ...(feedData.results || [])]);
      setHasMore(Boolean(feedData.next));
      setPage(nextPage);
    } catch (e) {
      console.log('Error loading more posts', e);
    } finally {
      setLoadingMore(false);
    }
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

  const isFiltered = (selectedScope && selectedScope !== 'ALL') || selectedCommunityId !== undefined;

  const getActiveFilterLabel = () => {
    if (selectedCommunityId) {
      const comm = communities.find((c) => c.id === selectedCommunityId);
      return comm ? comm.name : 'Hub Community';
    }
    switch (selectedScope) {
      case 'COLLEGE':
        return 'My College';
      case 'FOLLOWING':
        return 'Following';
      case 'MEDIA':
        return 'Photos & Media';
      case 'RESOURCES':
        return 'Study Resources';
      case 'GLOBAL':
        return 'Global Campus';
      default:
        return '';
    }
  };

  const renderHeader = () => (
    <View style={[styles.headerArea, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <View style={styles.brandRow}>
          <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>Campus</Text>
          <Text style={[styles.brandAccent, { color: colors.primary }]}>Connect</Text>
          <View style={[styles.campusBadge, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <Text style={[styles.campusBadgeText, { color: colors.textSecondary }]}>GEU/GEHU</Text>
          </View>
        </View>

        <View style={styles.navActions}>
          {/* Quick 1-Tap Theme Toggle */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
            accessibilityLabel={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {isDark ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#4f46e5" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }, isFiltered && styles.iconBtnActive]}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.7}
          >
            <SlidersHorizontal size={18} color={isFiltered ? colors.primary : colors.textPrimary} />
            {isFiltered && <View style={styles.filterDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setNotificationsVisible(true)}
            activeOpacity={0.7}
          >
            <Bell size={20} color={colors.textPrimary} />
            {unreadNotifCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </Text>
              </View>
            )}
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

      {/* Active Filter Pill Bar if filtered */}
      {isFiltered && (
        <View style={[styles.activeFilterBar, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
          <Text style={[styles.activeFilterText, { color: colors.textSecondary }]}>
            Feed: <Text style={styles.activeFilterHighlight}>{getActiveFilterLabel()}</Text>
          </Text>
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={() => {
              setSelectedScope('ALL');
              setSelectedCommunityId(undefined);
            }}
          >
            <Text style={styles.clearFilterText}>Reset to Global</Text>
            <X size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Sparkles size={36} color={colors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Campus feed is quiet right now</Text>
        <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
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

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.footerLoaderText, { color: colors.textMuted }]}>Loading more campus posts...</Text>
        </View>
      );
    }
    if (!hasMore && posts.length > 2) {
      return (
        <View style={[styles.caughtUpBox, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
          <Text style={[styles.caughtUpText, { color: colors.textSecondary }]}>You're all caught up</Text>
          <Text style={[styles.caughtUpSub, { color: colors.textMuted }]}>Check back later for more campus updates</Text>
        </View>
      );
    }
    return <View style={{ height: 20 }} />;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}

      {loading && posts.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Syncing campus updates...</Text>
        </View>
      ) : error && posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load campus updates</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={loadData}
          >
            <Text style={styles.emptyCtaText}>🔄 Retry Sync</Text>
          </TouchableOpacity>
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
              onAuthorPress={onOpenProfile}
            />
          )}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
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

      {/* Clean Feed Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.filterModalOverlay}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <View style={styles.filterModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.filterModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={18} color={colors.primary} />
                <Text style={styles.filterModalTitle}>Campus Feed Scope</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.filterGroupTitle}>FEED VIEW</Text>

              {[
                { key: 'ALL', label: 'Global Campus Feed (Default)', desc: 'Cross-college feed with privacy safeguards', icon: '🌐' },
                { key: 'COLLEGE', label: 'My College Only', desc: 'Updates & questions from your campus', icon: '🏛️' },
                { key: 'FOLLOWING', label: 'Following Students', desc: 'Posts from creators and peers you follow', icon: '👤' },
                { key: 'MEDIA', label: 'Photos & Campus Gallery', desc: 'Photos, events & campus lifestyle', icon: '🖼️' },
                { key: 'RESOURCES', label: 'Study Resources & Notes', desc: 'PDFs, notes, documents & syllabus', icon: '📄' },
              ].map((opt) => {
                const isActive = selectedCommunityId === undefined && (selectedScope === opt.key || (opt.key === 'ALL' && selectedScope === 'ALL'));
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.filterOptionRow, isActive && styles.filterOptionRowActive]}
                    onPress={() => {
                      setSelectedScope(opt.key as any);
                      setSelectedCommunityId(undefined);
                      setFilterModalVisible(false);
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.filterOptionLabel, isActive && styles.filterOptionLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.filterOptionDesc}>{opt.desc}</Text>
                    </View>
                    {isActive && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}

              {communities.length > 0 && (
                <>
                  <Text style={[styles.filterGroupTitle, { marginTop: 16 }]}>FILTER BY HUB COMMUNITY</Text>
                  {communities.map((comm) => {
                    const isActive = selectedCommunityId === comm.id;
                    return (
                      <TouchableOpacity
                        key={comm.id}
                        style={[styles.filterOptionRow, isActive && styles.filterOptionRowActive]}
                        onPress={() => {
                          setSelectedCommunityId(comm.id);
                          setSelectedScope(undefined);
                          setFilterModalVisible(false);
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>
                          {comm.community_type === 'COLLEGE' ? '🎓' : comm.community_type === 'COURSE' ? '📚' : '👥'}
                        </Text>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.filterOptionLabel, isActive && styles.filterOptionLabelActive]} numberOfLines={1}>
                            {comm.name}
                          </Text>
                          <Text style={styles.filterOptionDesc}>
                            {comm.community_type === 'COLLEGE' ? 'College Hub' : comm.community_type === 'COURSE' ? 'Course Hub' : 'Custom Community'}
                          </Text>
                        </View>
                        {isActive && <Check size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.resetFilterBtn}
              onPress={() => {
                setSelectedScope('ALL');
                setSelectedCommunityId(undefined);
                setFilterModalVisible(false);
              }}
            >
              <Text style={styles.resetFilterBtnText}>Reset to Global Campus Feed</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
        onOpenProfile={onOpenProfile}
      />

      {/* Share Modal */}
      <ShareModal
        visible={!!activeSharePost}
        post={activeSharePost}
        onClose={() => setActiveSharePost(null)}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
        onSelectNotification={handleSelectNotification}
        onUnreadCountChange={(c) => setUnreadNotifCount(c)}
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
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  campusBadgeText: {
    color: colors.textMuted,
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
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(94, 106, 210, 0.15)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },
  activeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  activeFilterText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  activeFilterHighlight: {
    color: colors.primaryHover,
    fontWeight: '700',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  clearFilterText: {
    color: colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  filterModalTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  filterGroupTitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: colors.surfaceLight,
  },
  filterOptionRowActive: {
    backgroundColor: '#1e3a8a',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  filterOptionLabel: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  filterOptionLabelActive: {
    color: '#93c5fd',
    fontWeight: '700',
  },
  filterOptionDesc: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  resetFilterBtn: {
    marginTop: 14,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  resetFilterBtnText: {
    color: '#94a3b8',
    fontSize: 12.5,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#ef4444',
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  footerLoaderText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  caughtUpBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  caughtUpText: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  caughtUpSub: {
    color: colors.textSecondary,
    fontSize: 11.5,
  },
});
