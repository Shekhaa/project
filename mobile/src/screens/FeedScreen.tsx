import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  useWindowDimensions,
  Animated,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { colors } from '../theme/colors';
import { postService, Post } from '../services/postService';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { communityService, Community } from '../services/communityService';
import { authService } from '../services/authService';
import { UserAvatar } from '../components/common/UserAvatar';
import { PostCard } from '../components/feed/PostCard';
import { PostComposerModal } from '../components/feed/PostComposerModal';
import { CommentsModal } from '../components/feed/CommentsModal';
import { ShareModal } from '../components/feed/ShareModal';
import { NotificationsModal } from '../components/notifications/NotificationsModal';
import { VideoChainViewerModal } from '../components/media/VideoChainViewerModal';
import { videoFeedManager, VideoChainItem } from '../services/videoFeedManager';
import { notificationService, NotificationItem } from '../services/notificationService';
import { backHandlerRegistry } from '../services/backHandlerRegistry';
import { api, getFullMediaUrl } from '../config/api';
import { showCrossPlatformAlert } from '../utils/mediaUtils';
import { Plus, Bell, Sparkles, SlidersHorizontal, Check, X, Sun, Moon, Search, ArrowLeft, ShieldCheck } from 'lucide-react-native';

const SCOPE_TABS: Array<{
  key: 'ALL' | 'COLLEGE' | 'FOLLOWING' | 'SAVED' | 'MEDIA' | 'RESOURCES';
  label: string;
  icon: string;
}> = [
  { key: 'ALL', label: 'All Campus', icon: '🌐' },
  { key: 'COLLEGE', label: 'My College', icon: '🏛️' },
  { key: 'FOLLOWING', label: 'Following', icon: '👥' },
  { key: 'SAVED', label: 'Saved', icon: '🔖' },
  { key: 'MEDIA', label: 'Photos', icon: '🖼️' },
  { key: 'RESOURCES', label: 'Notes', icon: '📄' },
];

const extractVideosFromPosts = (postsList: Post[]): VideoChainItem[] => {
  const videoItems: VideoChainItem[] = [];
  postsList.forEach((p) => {
    const baseItem = {
      postId: p.id,
      post: p,
      authorId: typeof p.author === 'number' ? p.author : (p.author as any)?.id,
      authorName: p.author_name || (p.author as any)?.username,
      authorAvatar: p.author_avatar || (p.author as any)?.avatar,
      isAnonymous: p.is_anonymous,
      communityName: p.community_name,
      content: p.content,
      likesCount: p.likes_count,
      isLiked: p.is_liked,
      commentsCount: p.comments_count,
    };

    (p.attachments || []).forEach((att) => {
      const isVid = att.file_type === 'VIDEO' || att.file_extension?.match(/^(mp4|webm|mov|mkv|avi|m4v)$/i);
      if (isVid && att.file_url) {
        const fullUrl = getFullMediaUrl(att.file_url);
        if (!videoItems.some((v) => v.videoUrl === fullUrl)) {
          videoItems.push({
            ...baseItem,
            id: att.id || `${p.id}_${att.file_url}`,
            videoUrl: fullUrl,
            poster: att.thumbnail_url ? getFullMediaUrl(att.thumbnail_url) : undefined,
          });
        }
      }
    });

    if (p.media_url) {
      const full = getFullMediaUrl(p.media_url);
      const isVid = p.media_type === 'VIDEO' || Boolean(full.match(/\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i));
      if (isVid && !videoItems.some((v) => v.videoUrl === full)) {
        videoItems.push({
          ...baseItem,
          id: `media_${p.id}`,
          videoUrl: full,
        });
      }
    }
  });
  return videoItems;
};

interface FeedScreenProps {
  currentUser?: any;
  canParticipate?: boolean;
  onRequireAuth?: () => void;
  onRequireVerify?: (reason?: string) => void;
  composerTrigger?: number;
  feedRefreshTrigger?: number;
  isProfileModalOpen?: boolean;
  onNavigateToChat?: (conversationId?: string | number) => void;
  onNavigateToArena?: () => void;
  onNavigateToCommunities?: () => void;
  onOpenProfile?: (userId: number) => void;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({
  currentUser,
  canParticipate = true,
  onRequireAuth,
  onRequireVerify,
  composerTrigger,
  feedRefreshTrigger,
  isProfileModalOpen = false,
  onNavigateToChat,
  onNavigateToArena,
  onNavigateToCommunities,
  onOpenProfile,
}) => {
  const { width } = useWindowDimensions();
  const isCompactViewport = width < 480;
  const { colors, isDark, resolvedTheme, toggleTheme } = useTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | undefined>(undefined);
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'GLOBAL' | 'COLLEGE' | 'FOLLOWING' | 'MEDIA' | 'RESOURCES' | 'SAVED' | undefined>('ALL');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshBannerVisible, setRefreshBannerVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Restore persisted feed scope from AsyncStorage on mount (for signed-in users)
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem('@campus_connect_feed_scope').then((val) => {
      if (!isMounted || !val) return;
      if (['ALL', 'GLOBAL', 'COLLEGE', 'FOLLOWING', 'MEDIA', 'RESOURCES', 'SAVED'].includes(val)) {
        if (!currentUser && (val === 'FOLLOWING' || val === 'SAVED')) {
          return;
        }
        setSelectedScope(val as any);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Sync feed videos with videoFeedManager for full screen video chain
  useEffect(() => {
    const vids = extractVideosFromPosts(posts);
    videoFeedManager.setFeedVideos(vids);
  }, [posts]);

  const handleSelectScope = (scope: 'ALL' | 'GLOBAL' | 'COLLEGE' | 'FOLLOWING' | 'MEDIA' | 'RESOURCES' | 'SAVED' | undefined) => {
    if (!currentUser && (scope === 'FOLLOWING' || scope === 'SAVED' || scope === 'COLLEGE')) {
      onRequireAuth?.();
      return;
    }
    setSelectedScope(scope);
    setSelectedCommunityId(undefined);
    if (scope) {
      AsyncStorage.setItem('@campus_connect_feed_scope', scope).catch(() => {});
    }
  };

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

  // Universal Search State (Twitter / X Expanding Top Bar & Animated Search Window)
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchInputText, setSearchInputText] = useState('');
  const [studentSuggestions, setStudentSuggestions] = useState<any[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchDebounceRef = useRef<any>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchPanelAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem('@vike_recent_searches')
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecentSearches(parsed.slice(0, 6));
        }
      })
      .catch(() => {});
  }, []);

  const saveRecentSearch = useCallback((term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const next = [clean, ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
      AsyncStorage.setItem('@vike_recent_searches', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem('@vike_recent_searches').catch(() => {});
  }, []);

  const openSearchBar = useCallback(() => {
    setSearchInputText(activeSearchQuery);
    setSearchExpanded(true);
    setSearchPanelOpen(true);
    searchAnim.setValue(0);
    searchPanelAnim.setValue(0);
    Animated.parallel([
      Animated.spring(searchAnim, {
        toValue: 1,
        tension: 78,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(searchPanelAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    });
  }, [activeSearchQuery, searchAnim, searchPanelAnim]);

  const openSearchPanelOnly = useCallback(() => {
    setSearchPanelOpen(true);
    searchPanelAnim.setValue(0);
    Animated.timing(searchPanelAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [searchPanelAnim]);

  const closeSearchPanelOnly = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(searchPanelAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setSearchPanelOpen(false);
    });
  }, [searchPanelAnim]);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(searchAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(searchPanelAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSearchExpanded(false);
      setSearchPanelOpen(false);
      setSearchInputText('');
      setStudentSuggestions([]);
      setActiveSearchQuery('');
    });
  }, [searchAnim, searchPanelAnim]);

  // Universal Android Hardware & Browser Back Navigation
  useEffect(() => {
    if (searchExpanded) {
      backHandlerRegistry.push('FeedSearchBar', () => {
        if (searchPanelOpen && activeSearchQuery.trim().length > 0) {
          closeSearchPanelOnly();
        } else {
          closeSearch();
        }
        return true;
      });
      return () => backHandlerRegistry.pop('FeedSearchBar');
    }
  }, [searchExpanded, searchPanelOpen, activeSearchQuery, closeSearchPanelOnly, closeSearch]);
  useEffect(() => {
    if (activeCommentsPost) {
      backHandlerRegistry.push('FeedCommentsModal', () => {
        setActiveCommentsPost(null);
        return true;
      });
      return () => backHandlerRegistry.pop('FeedCommentsModal');
    }
  }, [activeCommentsPost]);

  useEffect(() => {
    if (activeSharePost) {
      backHandlerRegistry.push('FeedShareModal', () => {
        setActiveSharePost(null);
        return true;
      });
      return () => backHandlerRegistry.pop('FeedShareModal');
    }
  }, [activeSharePost]);

  useEffect(() => {
    if (composerVisible) {
      backHandlerRegistry.push('FeedComposerModal', () => {
        setComposerVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('FeedComposerModal');
    }
  }, [composerVisible]);

  useEffect(() => {
    if (filterModalVisible) {
      backHandlerRegistry.push('FeedFilterModal', () => {
        setFilterModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('FeedFilterModal');
    }
  }, [filterModalVisible]);

  useEffect(() => {
    if (notificationsVisible) {
      backHandlerRegistry.push('FeedNotificationsModal', () => {
        setNotificationsVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('FeedNotificationsModal');
    }
  }, [notificationsVisible]);

  const handleOpenComposer = () => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onRequireVerify?.('Verify your Campus ID or enter an invite code to publish posts or confessions.');
      return;
    }
    setComposerVisible(true);
  };

  const handleSelectNotification = useCallback(
    async (notif: NotificationItem) => {
      setNotificationsVisible(false);
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
            showCrossPlatformAlert('Post', 'This post might have been removed or is unavailable.');
          }
        }
      } else if (notif.data?.conversation_id) {
        onNavigateToChat?.(notif.data.conversation_id);
      } else if (notif.data?.lost_found_id || notif.notification_type === 'LOST_FOUND') {
        onNavigateToArena?.();
      } else if (notif.data?.community_id || notif.data?.discussion_id) {
        onNavigateToCommunities?.();
      } else if (notif.data?.sender_id || notif.data?.user_id || notif.data?.follower_id) {
        const uid = Number(notif.data.sender_id || notif.data.user_id || notif.data.follower_id);
        if (uid) onOpenProfile?.(uid);
      }
    },
    [posts, onNavigateToChat, onNavigateToArena, onNavigateToCommunities, onOpenProfile]
  );

  const syncNotifications = useCallback(async () => {
    if (!currentUser) return;
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
  }, [currentUser, unreadNotifCount, handleSelectNotification]);

  useEffect(() => {
    if (!currentUser) {
      setUnreadNotifCount(0);
      return;
    }
    syncNotifications();
    const interval = setInterval(syncNotifications, 45000);
    return () => clearInterval(interval);
  }, [currentUser, syncNotifications]);

  // Trigger from navigation/header
  useEffect(() => {
    if (composerTrigger && composerTrigger > 0) {
      handleOpenComposer();
    }
  }, [composerTrigger]);

  const loadCommunities = useCallback(async () => {
    if (!currentUser) {
      setCommunities([]);
      return;
    }
    try {
      const commsData = await communityService.getMyCommunities();
      setCommunities(commsData || []);
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setPage(1);

      if (selectedScope === 'SAVED') {
        const savedJson = await AsyncStorage.getItem('campus_saved_posts');
        const savedIds: number[] = savedJson ? JSON.parse(savedJson) : [];
        if (savedIds.length === 0) {
          setPosts([]);
          setHasMore(false);
          return;
        }
        const feedData = await postService.getFeed({ ids: savedIds }, 1);
        setPosts(feedData.results || []);
        setHasMore(Boolean(feedData.next));
        return;
      }

      const feedQuery: any = selectedCommunityId
        ? { communityId: selectedCommunityId }
        : selectedScope && selectedScope !== 'ALL'
        ? { scope: selectedScope }
        : {};

      if (activeSearchQuery.trim()) {
        feedQuery.search = activeSearchQuery.trim();
      }

      if (isRefresh) {
        feedQuery._t = Date.now();
      }

      const feedData = await postService.getFeed(feedQuery, 1);
      setPosts(feedData.results || []);
      setHasMore(Boolean(feedData.next));
    } catch (e: any) {
      console.log('Error loading feed data', e);
      const msg = e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Could not sync campus feed. Please check your connection.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCommunityId, selectedScope, activeSearchQuery]);

  const handleSearchInputChange = (text: string) => {
    setSearchInputText(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setStudentSuggestions([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        setSearchingStudents(true);
        const res: any = await authService.searchStudents(text.trim());
        const list = Array.isArray(res) ? res : res?.results || [];
        setStudentSuggestions(list.slice(0, 8));
      } catch {
        setStudentSuggestions([]);
      } finally {
        setSearchingStudents(false);
      }
    }, 220);
  };

  const handleSelectStudent = (student: any) => {
    if (searchInputText.trim()) {
      saveRecentSearch(searchInputText.trim());
    }
    Keyboard.dismiss();
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    const targetId = student.id || student.user_id;
    if (targetId) {
      onOpenProfile?.(targetId);
    }
  };

  const handleExecutePostSearch = () => {
    const q = searchInputText.trim();
    if (!q) {
      setActiveSearchQuery('');
      closeSearchPanelOnly();
      return;
    }
    saveRecentSearch(q);
    setActiveSearchQuery(q);
    closeSearchPanelOnly();
  };

  useEffect(() => {
    loadData();
  }, [loadData, currentUser?.id]);

  const handleRefresh = useCallback(async () => {
    try {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch {}
    setRefreshBannerVisible(true);
    loadCommunities();
    await loadData(true);
    setTimeout(() => {
      setRefreshBannerVisible(false);
    }, 1400);
  }, [loadCommunities, loadData]);

  // Automatically refresh feed when reopening app or switching back to window/tab
  useAutoRefresh(handleRefresh, 25000);

  useEffect(() => {
    if (feedRefreshTrigger) {
      handleRefresh();
    }
  }, [feedRefreshTrigger, handleRefresh]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || loading || refreshing) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;

      let feedData;
      if (selectedScope === 'SAVED') {
        const savedJson = await AsyncStorage.getItem('campus_saved_posts');
        const savedIds: number[] = savedJson ? JSON.parse(savedJson) : [];
        if (savedIds.length === 0) return;
        feedData = await postService.getFeed({ ids: savedIds }, nextPage);
      } else {
        const feedQuery: any = selectedCommunityId
          ? { communityId: selectedCommunityId }
          : selectedScope && selectedScope !== 'ALL'
          ? { scope: selectedScope }
          : {};
        if (activeSearchQuery.trim()) {
          feedQuery.search = activeSearchQuery.trim();
        }
        feedData = await postService.getFeed(feedQuery, nextPage);
      }

      setPosts((prev) => [...prev, ...(feedData.results || [])]);
      setHasMore(Boolean(feedData.next));
      setPage(nextPage);
    } catch (e) {
      console.log('Error loading more posts', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLikePost = useCallback(async (postId: number) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onRequireVerify?.('Verify your Campus ID or enter an invite code to react to campus posts.');
      return;
    }

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
    } catch (e: any) {
      loadData();
      if (e?.response?.status === 403 && e?.response?.data?.code === 'CAMPUS_VERIFICATION_REQUIRED') {
        onRequireVerify?.(e.response.data.error);
      }
    }
  }, [currentUser, canParticipate, onRequireAuth, onRequireVerify, loadData]);

  const handleDeletePost = useCallback(async (postId: number) => {
    try {
      await postService.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showCrossPlatformAlert('Deleted', 'Post removed from campus feed.');
    } catch {
      showCrossPlatformAlert('Error', 'Could not delete post.');
    }
  }, []);

  const handleArchivePost = useCallback(async (postId: number) => {
    try {
      await postService.archivePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showCrossPlatformAlert('Archived', 'Post moved to archive.');
    } catch {
      showCrossPlatformAlert('Error', 'Could not archive post.');
    }
  }, []);

  const handleBookmarkToggle = useCallback((postId: number, isBookmarked: boolean) => {
    if (selectedScope === 'SAVED' && !isBookmarked) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  }, [selectedScope]);

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
      case 'SAVED':
        return 'Saved & Bookmarked 🔖';
      case 'GLOBAL':
        return 'Global Campus';
      default:
        return '';
    }
  };

  const renderHeader = () => (
    <View style={[styles.headerArea, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
      <View style={[styles.headerInner, Platform.OS === 'web' && styles.webCenteredContainer]}>
        {/* Top Navbar (Normal Vike Header OR Twitter-Style Expanding Search Bar) */}
      <View style={[styles.navBar, isCompactViewport && { paddingHorizontal: 12 }, { position: 'relative', overflow: 'hidden', minHeight: 58 }]}>
        <Animated.View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: searchAnim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.1, 0] }),
            transform: [
              {
                translateX: searchAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -28],
                }),
              },
            ],
          }}
          pointerEvents={searchExpanded ? 'none' : 'auto'}
        >
        <TouchableOpacity
          style={styles.brandRow}
          onPress={handleRefresh}
          activeOpacity={0.75}
          accessibilityLabel="Refresh feed"
        >
          <Text style={[styles.brandTitle, { color: colors.textPrimary }, isCompactViewport && { fontSize: 18 }]}>Vike</Text>
          <Text style={[styles.brandAccent, { color: colors.primary }, isCompactViewport && { fontSize: 18 }]}>.</Text>
        </TouchableOpacity>

        <View style={[styles.navActions, isCompactViewport && { gap: 6 }]}>
          {/* Quick 1-Tap Dual-Mode Theme Switcher: Dark <-> Light */}
          <TouchableOpacity
            style={[
              styles.iconBtn,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              isCompactViewport && { width: 32, height: 32, borderRadius: 16 },
            ]}
            onPress={toggleTheme}
            activeOpacity={0.7}
            accessibilityLabel={
              isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'
            }
          >
            {isDark ? (
              <Sun size={isCompactViewport ? 15 : 17} color="#f59e0b" />
            ) : (
              <Moon size={isCompactViewport ? 15 : 17} color={colors.primary} />
            )}
          </TouchableOpacity>

          {/* Quick Universal Search Button */}
          <TouchableOpacity
            style={[
              styles.iconBtn,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              isCompactViewport && { width: 32, height: 32, borderRadius: 16 },
              Boolean(activeSearchQuery) && styles.iconBtnActive,
            ]}
            onPress={openSearchBar}
            activeOpacity={0.7}
            accessibilityLabel="Search students and posts"
          >
            <Search size={isCompactViewport ? 15 : 17} color={activeSearchQuery ? colors.primary : colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.iconBtn,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              isCompactViewport && { width: 32, height: 32, borderRadius: 16 },
              isFiltered && styles.iconBtnActive,
            ]}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.7}
            accessibilityLabel="Filter feed"
          >
            <SlidersHorizontal size={isCompactViewport ? 16 : 18} color={isFiltered ? colors.primary : colors.textPrimary} />
            {isFiltered && <View style={styles.filterDot} />}
          </TouchableOpacity>

          {currentUser ? (
            <TouchableOpacity
              style={[
                styles.iconBtn,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                isCompactViewport && { width: 32, height: 32, borderRadius: 16 },
              ]}
              onPress={() => setNotificationsVisible(true)}
              activeOpacity={0.7}
              accessibilityLabel="Open notifications"
            >
              <Bell size={isCompactViewport ? 17 : 20} color={colors.textPrimary} />
              {unreadNotifCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.navVerifyPill,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                isCompactViewport && { paddingHorizontal: 10, paddingVertical: 6 },
              ]}
              onPress={() => onRequireAuth?.()}
              activeOpacity={0.8}
              accessibilityLabel="Sign In"
            >
              <Text style={[styles.navVerifyPillText, { color: colors.textPrimary }, isCompactViewport && { fontSize: 12 }]}>
                Sign In
              </Text>
            </TouchableOpacity>
          )}

          {currentUser && !canParticipate && !isCompactViewport && (
            <TouchableOpacity
              style={[
                styles.navVerifyPill,
                {
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                },
              ]}
              onPress={() => onRequireVerify?.()}
              activeOpacity={0.8}
            >
              <Text style={[styles.navVerifyPillText, { color: '#d97706' }]}>Verify ID</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.createPostBtn,
              { backgroundColor: colors.primary },
              isCompactViewport && { paddingHorizontal: 10, paddingVertical: 7, gap: 4 },
            ]}
            onPress={handleOpenComposer}
            activeOpacity={0.8}
          >
            <Plus size={isCompactViewport ? 15 : 18} color={colors.onPrimary} />
            <Text style={[styles.createPostBtnText, { color: colors.onPrimary }, isCompactViewport && { fontSize: 12 }]}>Post</Text>
          </TouchableOpacity>
        </View>
        </Animated.View>

        {/* Twitter-Style Animated Expanding Top Search Bar Overlay */}
        {searchExpanded && (
          <Animated.View
            style={[
              styles.expandedSearchBarRow,
              isCompactViewport && { paddingHorizontal: 10 },
              {
                backgroundColor: colors.surface,
                opacity: searchAnim.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.85, 1] }),
                transform: [
                  {
                    translateX: searchAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [Math.min(width, 620) * 0.4, 0],
                    }),
                  },
                  {
                    scaleX: searchAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              onPress={closeSearch}
              style={[styles.searchBackBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
              activeOpacity={0.7}
              accessibilityLabel="Back to home feed"
            >
              <ArrowLeft size={19} color={colors.textPrimary} />
            </TouchableOpacity>

            <View
              style={[
                styles.topSearchInputPill,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: searchPanelOpen ? colors.primary : colors.cardBorder,
                },
              ]}
            >
              <Search size={17} color={searchPanelOpen ? colors.primary : colors.textMuted} />
              <TextInput
                ref={searchInputRef}
                style={[styles.topSearchTextInput, { color: colors.textPrimary }]}
                placeholder="Search Vike — students, posts, notes..."
                placeholderTextColor={colors.textMuted}
                value={searchInputText}
                onChangeText={handleSearchInputChange}
                onFocus={() => {
                  if (!searchPanelOpen) openSearchPanelOnly();
                }}
                onSubmitEditing={handleExecutePostSearch}
                returnKeyType="search"
                autoFocus
              />
              {searchInputText.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    handleSearchInputChange('');
                    setActiveSearchQuery('');
                    if (!searchPanelOpen) openSearchPanelOnly();
                    searchInputRef.current?.focus();
                  }}
                  style={[styles.topSearchClearBtn, { backgroundColor: colors.hairlineStrong || 'rgba(148,163,184,0.22)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={13} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
      </View>

      {!searchPanelOpen && (
      <>
      {/* Horizontal Fast Scope Pill Switcher */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scopeTabsContainer}
        style={[styles.scopeTabsScroll, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}
      >
        {SCOPE_TABS.map((tab) => {
          const isActive =
            selectedCommunityId === undefined &&
            (selectedScope === tab.key || (!selectedScope && tab.key === 'ALL'));
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.scopeTabPill,
                {
                  backgroundColor: isActive ? colors.chipActiveBg : colors.surfaceLight,
                  borderColor: isActive ? colors.chipActiveBorder : colors.cardBorder,
                },
              ]}
              onPress={() => handleSelectScope(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13 }}>{tab.icon}</Text>
              <Text
                style={[
                  styles.scopeTabLabel,
                  {
                    color: isActive ? colors.chipActiveText : colors.textSecondary,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Slim Read-Only Campus Banner */}
      {(!currentUser || !canParticipate) && !searchExpanded && (
        <View
          style={[
            styles.readOnlyBanner,
            {
              backgroundColor: colors.bannerBg,
              borderTopColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.readOnlyBannerText, { color: colors.textSecondary }]} numberOfLines={2}>
            {!currentUser
              ? 'Read-only campus preview · Sign in to post, comment & join chats'
              : currentUser.verification_method === 'ID_CARD_PENDING'
              ? 'ID card queued for review · Enter a batch invite code or link College ID to post now'
              : 'Read-only access · Unlock posting with a batch invite code or Student ID'}
          </Text>
          <TouchableOpacity
            style={[styles.readOnlyCtaBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!currentUser) {
                onRequireAuth?.();
              } else {
                onRequireVerify?.();
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.readOnlyCtaText, { color: colors.onPrimary }]}>{!currentUser ? 'Sign In' : 'Verify ID'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active Filter Pill Bar if filtered by a specific community */}
      {selectedCommunityId !== undefined && (
        <View style={[styles.activeFilterBar, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
          <Text style={[styles.activeFilterText, { color: colors.textSecondary }]}>
            Community: <Text style={styles.activeFilterHighlight}>{getActiveFilterLabel()}</Text>
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

      {/* Active Search Pill Bar if search query is active */}
      {activeSearchQuery.trim().length > 0 && (
        <View style={[styles.activeFilterBar, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
          <Text style={[styles.activeFilterText, { color: colors.textSecondary }]}>
            Posts matching <Text style={styles.activeFilterHighlight}>"{activeSearchQuery}"</Text>
          </Text>
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={closeSearch}
          >
            <Text style={styles.clearFilterText}>Clear</Text>
            <X size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      </>
      )}
      </View>
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
          onPress={handleOpenComposer}
        >
          <Text style={styles.emptyCtaText}>{!currentUser ? 'Sign In to Post' : 'Create First Post'}</Text>
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

      <View style={{ flex: 1, position: 'relative' }}>
        {refreshBannerVisible && (
          <View
            style={[
              styles.refreshBanner,
              { backgroundColor: isDark ? 'rgba(0, 112, 243, 0.95)' : '#0070f3' },
            ]}
          >
            <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.refreshBannerText}>
              {refreshing ? 'Updating campus feed...' : '✨ Feed up to date'}
            </Text>
          </View>
        )}

        {loading && posts.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Syncing campus updates...</Text>
          </View>
        ) : error && posts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>⚠️</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Could not load campus updates</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => loadData(false)}
            >
              <Text style={styles.emptyCtaText}>🔄 Retry Sync</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={posts}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={
              activeSearchQuery.trim().length > 0 && studentSuggestions.length > 0 ? (
                <View style={[styles.peopleResultsCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.searchSectionHeaderTitle, { color: colors.textMuted, marginBottom: 10 }]}>
                    PEOPLE MATCHING "{activeSearchQuery}"
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {studentSuggestions.map((st, idx) => (
                      <TouchableOpacity
                        key={st.id || st.user_id || idx}
                        style={[styles.peopleResultChip, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                        onPress={() => handleSelectStudent(st)}
                        activeOpacity={0.75}
                      >
                        <UserAvatar
                          uri={st.avatar || st.profile?.avatar}
                          name={st.full_name || st.name || st.username}
                          size={34}
                        />
                        <View style={{ marginLeft: 8, maxWidth: 140 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.studentSuggestionName, { color: colors.textPrimary, fontSize: 13 }]} numberOfLines={1}>
                              {st.full_name || st.name || st.username}
                            </Text>
                            {st.is_verified_student && <ShieldCheck size={12} color={colors.primary} />}
                          </View>
                          <Text style={[styles.studentSuggestionCollege, { color: colors.textMuted, fontSize: 11 }]} numberOfLines={1}>
                            @{st.username || 'student'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <PostCard
                post={item}
                currentUser={currentUser}
                canParticipate={canParticipate}
                onRequireAuth={onRequireAuth}
                onRequireVerify={onRequireVerify}
                onLike={handleLikePost}
                onCommentPress={(p) => setActiveCommentsPost(p)}
                onSharePress={(p) => setActiveSharePost(p)}
                onDeletePost={handleDeletePost}
                onArchivePost={handleArchivePost}
                onAuthorPress={(uid) => {
                  if (!currentUser) {
                    onRequireAuth?.();
                    return;
                  }
                  onOpenProfile?.(uid);
                }}
                onBookmarkToggle={handleBookmarkToggle}
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
            contentContainerStyle={[
              styles.listContent,
              Platform.OS === 'web' && styles.webListContent,
            ]}
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

        {/* Twitter-Style Animated Full-Screen Search Window (Spreads directly beneath top search bar) */}
        {searchExpanded && searchPanelOpen && (
          <Animated.View
            style={[
              styles.searchWindowOverlay,
              {
                backgroundColor: colors.background,
                opacity: searchPanelAnim,
                transform: [
                  {
                    translateY: searchPanelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <ScrollView
              style={[styles.searchWindowScroll, Platform.OS === 'web' && styles.webCenteredContainer]}
              contentContainerStyle={styles.searchWindowContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {searchInputText.trim().length > 0 ? (
                <>
                  {/* Execute Full Post Search Row */}
                  <TouchableOpacity
                    style={[
                      styles.searchPostsActionRow,
                      { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                    ]}
                    onPress={handleExecutePostSearch}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.searchPostsIconCircle, { backgroundColor: colors.primary + '1F' }]}>
                      <Search size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.searchPostsActionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        Search posts for "{searchInputText.trim()}"
                      </Text>
                      <Text style={[styles.searchPostsActionSub, { color: colors.textMuted }]}>
                        Posts, notes & polls across global & your campus
                      </Text>
                    </View>
                    <Text style={[styles.searchGoPill, { color: colors.primary }]}>Search →</Text>
                  </TouchableOpacity>

                  {/* Live Student / People Matches across all campuses */}
                  <View style={styles.searchSectionBlock}>
                    <View style={styles.searchSectionHeaderRow}>
                      <Text style={[styles.searchSectionHeaderTitle, { color: colors.textMuted }]}>
                        PEOPLE ACROSS CAMPUSES
                      </Text>
                      {searchingStudents && <ActivityIndicator size="small" color={colors.primary} />}
                    </View>

                    {studentSuggestions.length > 0 ? (
                      <View style={[styles.searchPeopleCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                        {studentSuggestions.map((st, idx) => (
                          <TouchableOpacity
                            key={st.id || st.user_id || idx}
                            style={[
                              styles.searchPersonRow,
                              idx < studentSuggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.hairline },
                            ]}
                            onPress={() => handleSelectStudent(st)}
                            activeOpacity={0.75}
                          >
                            <UserAvatar
                              uri={st.avatar || st.profile?.avatar}
                              name={st.full_name || st.name || st.username}
                              size={42}
                            />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Text style={[styles.studentSuggestionName, { color: colors.textPrimary }]} numberOfLines={1}>
                                  {st.full_name || st.name || st.username}
                                </Text>
                                {st.is_verified_student && <ShieldCheck size={14} color={colors.primary} />}
                              </View>
                              <Text style={[styles.studentSuggestionCollege, { color: colors.textSecondary }]} numberOfLines={1}>
                                @{st.username || 'student'} · {st.college_name || st.profile?.college_name || 'Student'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : !searchingStudents ? (
                      <View style={[styles.searchEmptyMiniBox, { borderColor: colors.cardBorder }]}>
                        <Text style={[styles.searchEmptyMiniText, { color: colors.textMuted }]}>
                          No students found matching "{searchInputText.trim()}". Press Enter or tap above to search posts!
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <View style={styles.searchEmptyDiscovery}>
                  {recentSearches.length > 0 && (
                    <View style={styles.searchSectionBlock}>
                      <View style={styles.searchSectionHeaderRow}>
                        <Text style={[styles.searchSectionHeaderTitle, { color: colors.textMuted }]}>RECENT SEARCHES</Text>
                        <TouchableOpacity onPress={clearRecentSearches}>
                          <Text style={[styles.clearRecentText, { color: colors.primary }]}>Clear all</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={[styles.searchPeopleCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                        {recentSearches.map((term, idx) => (
                          <TouchableOpacity
                            key={term}
                            style={[
                              styles.recentSearchRow,
                              idx < recentSearches.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.hairline },
                            ]}
                            onPress={() => {
                              handleSearchInputChange(term);
                              saveRecentSearch(term);
                              setActiveSearchQuery(term);
                              closeSearchPanelOnly();
                            }}
                            activeOpacity={0.75}
                          >
                            <Search size={15} color={colors.textMuted} />
                            <Text style={[styles.recentSearchText, { color: colors.textPrimary }]} numberOfLines={1}>
                              {term}
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                handleSearchInputChange(term);
                                searchInputRef.current?.focus();
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Fill</Text>
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={styles.searchPromptHero}>
                    <View style={[styles.searchPromptIconBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                      <Search size={26} color={colors.primary} />
                    </View>
                    <Text style={[styles.searchPromptTitle, { color: colors.textPrimary }]}>Search Vike</Text>
                    <Text style={[styles.searchPromptSub, { color: colors.textSecondary }]}>
                      Search students across all campuses, or press Enter to search posts, study notes & polls.
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {/* Clean Feed Filter Modal */}
      {filterModalVisible && (
      <Modal
        visible={filterModalVisible}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={[styles.filterModalOverlay, { backgroundColor: colors.modalOverlay }]}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <View
            style={[
              styles.filterModalCard,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.filterModalHeader, { borderBottomColor: colors.cardBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={18} color={colors.primary} />
                <Text style={[styles.filterModalTitle, { color: colors.textPrimary }]}>Campus Feed Scope</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.filterGroupTitle, { color: colors.textSecondary }]}>FEED VIEW</Text>

              {[
                { key: 'ALL', label: 'Global Campus Feed (Default)', desc: 'Cross-college feed with privacy safeguards', icon: '🌐' },
                { key: 'COLLEGE', label: 'My College Only', desc: 'Updates & questions from your campus', icon: '🏛️' },
                { key: 'SAVED', label: 'Saved & Bookmarked', desc: 'Posts & resources you saved for later', icon: '🔖' },
                { key: 'FOLLOWING', label: 'Following Students', desc: 'Posts from creators and peers you follow', icon: '👤' },
                { key: 'MEDIA', label: 'Photos & Campus Gallery', desc: 'Photos, events & campus lifestyle', icon: '🖼️' },
                { key: 'RESOURCES', label: 'Study Resources & Notes', desc: 'PDFs, notes, documents & syllabus', icon: '📄' },
              ].map((opt) => {
                const isActive = selectedCommunityId === undefined && (selectedScope === opt.key || (opt.key === 'ALL' && selectedScope === 'ALL'));
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.filterOptionRow,
                      { backgroundColor: colors.surfaceLight },
                      isActive && {
                        backgroundColor: isDark ? 'rgba(0, 112, 243, 0.2)' : 'rgba(0, 102, 204, 0.1)',
                        borderWidth: 1,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => {
                      handleSelectScope(opt.key as any);
                      setFilterModalVisible(false);
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={[
                          styles.filterOptionLabel,
                          { color: isActive ? colors.primary : colors.textPrimary },
                          isActive && { fontWeight: '700' },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={[styles.filterOptionDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                    </View>
                    {isActive && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}

              {communities.length > 0 && (
                <>
                  <Text style={[styles.filterGroupTitle, { marginTop: 16, color: colors.textSecondary }]}>FILTER BY HUB COMMUNITY</Text>
                  {communities.map((comm) => {
                    const isActive = selectedCommunityId === comm.id;
                    return (
                      <TouchableOpacity
                        key={comm.id}
                        style={[
                          styles.filterOptionRow,
                          { backgroundColor: colors.surfaceLight },
                          isActive && {
                            backgroundColor: isDark ? 'rgba(0, 112, 243, 0.2)' : 'rgba(0, 102, 204, 0.1)',
                            borderWidth: 1,
                            borderColor: colors.primary,
                          },
                        ]}
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
                          <Text
                            style={[
                              styles.filterOptionLabel,
                              { color: isActive ? colors.primary : colors.textPrimary },
                              isActive && { fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {comm.name}
                          </Text>
                          <Text style={[styles.filterOptionDesc, { color: colors.textSecondary }]}>
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
              style={[styles.resetFilterBtn, { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.cardBorder }]}
              onPress={() => {
                handleSelectScope('ALL');
                setFilterModalVisible(false);
              }}
            >
              <Text style={[styles.resetFilterBtnText, { color: colors.textSecondary }]}>Reset to Global Campus Feed</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      )}

      {/* Dedicated Post Composer & Photo Editor / PDF Modal */}
      <PostComposerModal
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onPostCreated={loadData}
        communities={communities}
        defaultCommunityId={selectedCommunityId}
        onRequireVerify={onRequireVerify}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
        onSelectNotification={handleSelectNotification}
        onUnreadCountChange={(c) => setUnreadNotifCount(c)}
      />

      {/* Fullscreen Video Chain Viewer Modal (Reels/Shorts swipe flow) */}
      <VideoChainViewerModal
        onToggleLike={handleLikePost}
        onOpenComments={(post) => setActiveCommentsPost(post)}
        onOpenShare={(post) => setActiveSharePost(post)}
        onOpenProfile={(authorId) => onOpenProfile?.(authorId)}
        temporarilyHidden={
          Platform.OS === 'web'
            ? isProfileModalOpen
            : Boolean(activeCommentsPost || activeSharePost || isProfileModalOpen)
        }
      />

      {/* Share Modal (rendered after VideoChainViewerModal so it opens inside Video Chain) */}
      <ShareModal
        visible={!!activeSharePost}
        post={activeSharePost}
        onClose={() => setActiveSharePost(null)}
      />

      {/* Comments Modal (rendered after VideoChainViewerModal so it opens inside Video Chain) */}
      <CommentsModal
        visible={!!activeCommentsPost}
        post={activeCommentsPost}
        currentUser={currentUser}
        canParticipate={canParticipate}
        onRequireAuth={onRequireAuth}
        onRequireVerify={onRequireVerify}
        onClose={() => setActiveCommentsPost(null)}
        onOpenProfile={onOpenProfile}
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
  headerInner: {
    width: '100%',
  },
  webCenteredContainer: {
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
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
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
  },
  navVerifyPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navVerifyPillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  readOnlyBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
  },
  readOnlyCtaBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 10,
  },
  readOnlyCtaText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  refreshBanner: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 999,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  refreshBannerText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
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
    backgroundColor: 'rgba(0, 112, 243, 0.15)',
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
  scopeTabsScroll: {
    borderTopWidth: 1,
  },
  scopeTabsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scopeTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  scopeTabLabel: {
    fontSize: 12.5,
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
  expandedSearchBarRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSearchInputPill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  topSearchTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  topSearchClearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWindowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  searchWindowScroll: {
    flex: 1,
    width: '100%',
  },
  searchWindowContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 16,
  },
  searchPostsActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchPostsIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPostsActionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  searchPostsActionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  searchGoPill: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchSectionBlock: {
    gap: 8,
  },
  searchSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  searchSectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  clearRecentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchPeopleCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  recentSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  recentSearchText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  searchEmptyMiniBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  searchEmptyMiniText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  searchEmptyDiscovery: {
    gap: 22,
  },
  searchPromptHero: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 10,
  },
  searchPromptIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  searchPromptTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  searchPromptSub: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  peopleResultsCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    marginTop: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  peopleResultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  studentSuggestionName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  studentSuggestionCollege: {
    fontSize: 12,
    marginTop: 2,
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
    paddingTop: 6,
    paddingBottom: 21,
  },
  webListContent: {
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
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
