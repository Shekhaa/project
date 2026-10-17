import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  RefreshControl,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Animated,
  Share,
  PanResponder,
} from 'react-native';
import { colors } from '../theme/colors';
import { postService, Post, Comment } from '../services/postService';

// Quick Preset Media for Campus Testing
const PRESET_IMAGES = [
  { label: 'Campus Fest', url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop' },
  { label: 'Central Library', url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800&auto=format&fit=crop' },
  { label: 'Hackathon Sprint', url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop' },
  { label: 'Sports Ground', url: 'https://images.unsplash.com/photo-1526676037777-05a232554f77?w=800&auto=format&fit=crop' },
];

const PRESET_VIDEOS = [
  { label: 'Drone Test Flight', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
  { label: 'Fest Dance Rehearsal', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
  { label: 'Esports Championship', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' },
];

interface FeedScreenProps {
  composerTrigger?: number;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({ composerTrigger }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Composer Modal State
  const [composerVisible, setComposerVisible] = useState(false);
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [mediaType, setMediaType] = useState<'TEXT' | 'IMAGE' | 'VIDEO'>('TEXT');
  const [mediaUrl, setMediaUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Comments Sheet State
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentIsAnon, setCommentIsAnon] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  // Media Playback Simulation State
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);

  // Campus Notifications State & Interactive Notifications
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      icon: '🎓',
      title: 'Campus Geofence Verified',
      sub: 'You are verified inside Graphic Era Clement Town Campus.',
      time: 'Just now',
      read: false,
      detail: '📍 Campus Geofence Active!\n\nYour GPS coordinates match Graphic Era University (Clement Town Campus). All features and community channels are fully unlocked.',
    },
    {
      id: 2,
      icon: '🎉',
      title: 'Grafest 2026 Live!',
      sub: 'Annual college fest registration is now live in Campus channels.',
      time: '2 hours ago',
      read: false,
      detail: '🎉 Grafest 2026 Announced!\n\nRegistrations opened for Dance, Music, Hackathon, and Battle of Bands in the Campus tab. Head over to register!',
    },
    {
      id: 3,
      icon: '❤️',
      title: 'New Likes on your Story',
      sub: '3 batchmates liked your campus canteen reel.',
      time: '5 hours ago',
      read: false,
      detail: '❤️ Post Activity\n\nYour recent campus post received love from 3 students in your department.',
    },
    {
      id: 4,
      icon: '💬',
      title: 'New Reply in CSE Hub',
      sub: 'Priya Rawat replied: "Check library 2nd floor for notes".',
      time: 'Yesterday',
      read: false,
      detail: '💬 Campus Channel Reply\n\nPriya Rawat: "Check library 2nd floor for notes". Join the discussion in the Campus tab.',
    },
  ]);

  const handleNotificationPress = (notif: (typeof notifications)[0]) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    Alert.alert(notif.title, notif.detail, [{ text: 'OK', style: 'default' }]);
  };

  // Swipe down PanResponder for Comments Sheet (Instagram style with 50px threshold)
  const commentsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 50) {
          setActiveCommentPost(null);
        }
      },
    })
  ).current;

  // Aspect Ratio & Fit State (Instagram Style: 16:9, 1:1, 4:5, auto)
  const [mediaCropMode, setMediaCropMode] = useState<'AUTO' | '16:9' | '1:1' | '4:5'>('AUTO');
  const [imageFitMode, setImageFitMode] = useState<'contain' | 'cover'>('contain');
  const [cropModalVisible, setCropModalVisible] = useState(false);

  // Instagram-style Unified Media Picker (Photo or Video in 1-Click with Auto Aspect Ratio Detection)
  const handlePickMedia = (useCamera = false) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      if (useCamera) {
        input.capture = 'environment';
        input.accept = 'image/*';
      } else {
        input.accept = 'image/*,video/*,video/mp4,video/quicktime,video/webm';
      }
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const isVideoFile =
            file.type?.startsWith('video/') ||
            file.name?.toLowerCase().endsWith('.mp4') ||
            file.name?.toLowerCase().endsWith('.mov') ||
            file.name?.toLowerCase().endsWith('.webm');

          const reader = new FileReader();
          reader.onload = (uploadEvent: any) => {
            const rawResult = uploadEvent.target?.result as string;
            if (rawResult) {
              if (isVideoFile) {
                setMediaType('VIDEO');
                setMediaUrl(rawResult);
              } else {
                setMediaType('IMAGE');
                // Preserve full native aspect ratio without squishing/cropping!
                const img = new (window as any).Image();
                img.onload = () => {
                  const maxDim = 1280;
                  let { width, height } = img;
                  if (width > maxDim || height > maxDim) {
                    if (width > height) {
                      height = Math.round((height * maxDim) / width);
                      width = maxDim;
                    } else {
                      width = Math.round((width * maxDim) / height);
                      height = maxDim;
                    }
                  }
                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedUrl = canvas.toDataURL('image/jpeg', 0.85);
                    setMediaUrl(compressedUrl);
                    setCropModalVisible(true); // Open Crop Studio immediately!
                    return;
                  }
                  setMediaUrl(rawResult);
                  setCropModalVisible(true);
                };
                img.src = rawResult;
              }
            }
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      Alert.alert(
        'Upload Media',
        'Choose a campus preset below or paste any direct media link!'
      );
    }
  };

  const handleSharePost = async (post: Post) => {
    const postSnippet = post.content ? post.content.slice(0, 100) : 'Campus Story';
    const shareText = `Check out this GEHU Campus Post by ${post.author_name}:\n\n"${postSnippet}"\n\nShared via GEHU Campus Connect 🎓`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({
          title: `GEHU Campus Post by ${post.author_name}`,
          text: shareText,
          url: window.location.href,
        });
        return;
      }
      await Share.share({
        message: shareText,
        title: 'GEHU Campus Post',
      });
    } catch (e) {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(shareText);
        Alert.alert('Link Copied! 🔗', 'Post text and link copied to campus clipboard.');
      }
    }
  };

  const collegeCommunityId = 1;

  const loadFeed = async () => {
    try {
      const data = await postService.getFeed();
      setPosts(data);
    } catch (e: any) {
      console.log('Error fetching feed', e);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  };

  const handleCreatePost = async () => {
    if (!content.trim() && !mediaUrl) {
      Alert.alert('Empty Post', 'Please write something or attach a photo/video.');
      return;
    }

    setSubmitting(true);
    try {
      await postService.createPost({
        community: collegeCommunityId,
        content: content.trim(),
        is_anonymous: isAnonymous,
        media_type: mediaType,
        media_url: mediaUrl.trim(),
      });
      setContent('');
      setIsAnonymous(false);
      setMediaType('TEXT');
      setMediaUrl('');
      setComposerVisible(false);
      await loadFeed();
      Alert.alert(
        'Posted to Campus! 🚀',
        isAnonymous
          ? 'Your anonymous post is live with a mascot pseudonym.'
          : 'Your campus post is now live!'
      );
    } catch (e: any) {
      Alert.alert('Post Failed', e.response?.data?.error || 'Could not publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLike = async (postId: number) => {
    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const nextLiked = !p.has_liked;
          return {
            ...p,
            has_liked: nextLiked,
            likes_count: Math.max(0, (p.likes_count || 0) + (nextLiked ? 1 : -1)),
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
            ? { ...p, has_liked: res.has_liked, likes_count: res.likes_count }
            : p
        )
      );
    } catch (e) {
      console.log('Like toggle error', e);
      // Revert if error
      await loadFeed();
    }
  };

  // Open Comments Modal
  const handleOpenComments = async (post: Post) => {
    setActiveCommentPost(post);
    setComments([]);
    setLoadingComments(true);
    try {
      const data = await postService.getComments(post.id);
      setComments(data);
    } catch (e) {
      console.log('Error loading comments', e);
    } finally {
      setLoadingComments(false);
    }
  };

  // Submit Comment
  const handleAddComment = async () => {
    if (!commentText.trim() || !activeCommentPost || postingComment) return;

    const textToSend = commentText.trim();
    setCommentText('');
    setPostingComment(true);

    try {
      const newComment = await postService.addComment(
        activeCommentPost.id,
        textToSend,
        commentIsAnon
      );
      setComments((prev) => [newComment, ...prev]);

      // Update comments count on the post in feed
      setPosts((prev) =>
        prev.map((p) =>
          p.id === activeCommentPost.id
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );
    } catch (e: any) {
      Alert.alert('Comment Failed', e.response?.data?.error || 'Could not submit comment.');
    } finally {
      setPostingComment(false);
    }
  };

  const renderPost = ({ item }: { item: Post }) => {
    const isVideo = item.media_type === 'VIDEO';
    const isImage = item.media_type === 'IMAGE' || (item.media_url && !isVideo);
    const hasMedia = isVideo || isImage;
    const isPlaying = playingVideoId === item.id;

    return (
      <View style={styles.postCard}>
        {/* Post Top Header */}
        <View style={styles.postHeader}>
          {item.is_anonymous ? (
            <View style={styles.authorRow}>
              <View style={styles.anonAvatarCircle}>
                <Text style={styles.anonAvatarIcon}>🎭</Text>
              </View>
              <View style={styles.authorCol}>
                <View style={styles.authorNameRow}>
                  <Text style={styles.anonAuthorName}>
                    {item.anonymous_alias || 'Anonymous Campus Student'}
                  </Text>
                  <View style={styles.anonPill}>
                    <Text style={styles.anonPillText}>ANON</Text>
                  </View>
                </View>
                <Text style={styles.communityTag}>in {item.community_name}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.authorRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {(item.author_name || 'U')[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.authorCol}>
                <View style={styles.authorNameRow}>
                  <Text style={styles.authorName}>{item.author_name}</Text>
                  {item.author_verification_tier === 'FULLY_VERIFIED' ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedBadgeText}>🛡️ Verified</Text>
                    </View>
                  ) : item.author_verification_tier === 'SEMI_VERIFIED' ? (
                    <View style={styles.semiVerifiedBadge}>
                      <Text style={styles.semiVerifiedBadgeText}>🔴 Semi-Verified</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.communityTag}>in {item.community_name}</Text>
              </View>
            </View>
          )}

          <Text style={styles.timestampText}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Text Content */}
        {item.content ? (
          <Text style={styles.postContent}>{item.content}</Text>
        ) : null}

        {/* Instagram-style Media Attachment */}
        {hasMedia && item.media_url ? (
          <View style={styles.mediaContainer}>
            {isImage ? (
              // Photo Image Card (Preserves full size / aspect ratio)
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => handleToggleLike(item.id)}
                style={styles.imageWrapper}
              >
                <Image
                  source={{ uri: item.media_url }}
                  style={styles.postImage}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            ) : (
              // Video / Reel Card (Full 16:9 / 9:16 aspect ratio)
              Platform.OS === 'web' && isPlaying ? (
                <View style={styles.webVideoWrapper}>
                  {React.createElement('video', {
                    src: item.media_url,
                    controls: true,
                    autoPlay: true,
                    playsInline: true,
                    style: {
                      width: '100%',
                      maxHeight: '440px',
                      backgroundColor: '#000000',
                      objectFit: 'contain',
                    },
                  })}
                </View>
              ) : (
                <View style={styles.videoPlayerCard}>
                  <Image
                    source={{
                      uri: item.media_url?.startsWith('data:image') || item.media_url?.includes('.jpg') || item.media_url?.includes('.png')
                        ? item.media_url
                        : 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop',
                    }}
                    style={styles.postImage}
                    resizeMode="cover"
                  />
                  {/* Video Play Overlay */}
                  <TouchableOpacity
                    style={styles.videoPlayOverlay}
                    onPress={() => setPlayingVideoId(isPlaying ? null : item.id)}
                  >
                    <View style={styles.playButtonCircle}>
                      <Text style={styles.playButtonIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                    </View>
                    <View style={styles.reelBadge}>
                      <Text style={styles.reelBadgeText}>
                        📹 CAMPUS REEL • TAP TO PLAY FULL
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>
        ) : null}

        {/* Engagement Actions Bar (Instagram / Reddit style) */}
        <View style={styles.postFooter}>
          {/* Like / Heart */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleToggleLike(item.id)}
          >
            <Text style={[styles.actionIcon, item.has_liked && styles.likedText]}>
              {item.has_liked ? '❤️' : '🤍'}
            </Text>
            <Text style={[styles.actionText, item.has_liked && styles.likedText]}>
              {item.likes_count || 0}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleOpenComments(item)}
          >
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>{item.comments_count || 0}</Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSharePost(item)}
          >
            <Text style={styles.actionIcon}>🔗</Text>
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.screenTitle}>Campus Feed</Text>
          <Text style={styles.screenSubtitle}>Stories, confessions & student reels</Text>
        </View>
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerPostBtn}
            onPress={() => setComposerVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.headerPostIcon}>＋</Text>
            <Text style={styles.headerPostText}>Post</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshIconBtn}
            onPress={() => setNotificationsVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.refreshIconText}>🔔</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshIconBtn}
            onPress={handleRefresh}
            activeOpacity={0.8}
          >
            <Text style={styles.refreshIconText}>🔄</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed List */}
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.feedContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text style={styles.emptyTitle}>Campus feed is empty!</Text>
            <Text style={styles.emptySubtitle}>
              Tap the "+ Post" button to share the first campus photo, reel, or story.
            </Text>
          </View>
        }
      />

      {/* Post Composer Modal (Instagram + Reddit Hybrid) */}
      <Modal
        visible={composerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setComposerVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.composerSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setComposerVisible(false)}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Campus Post</Text>
              <TouchableOpacity
                style={[
                  styles.modalPostBtn,
                  (!content.trim() && !mediaUrl) && styles.modalPostBtnDisabled,
                ]}
                onPress={handleCreatePost}
                disabled={(!content.trim() && !mediaUrl) || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalPostBtnText}>Share</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.composerScroll} keyboardShouldPersistTaps="handled">
              {/* Anonymous Mascot Switch Banner */}
              <View
                style={[
                  styles.composerIdentityBanner,
                  isAnonymous && styles.composerIdentityBannerAnon,
                ]}
              >
                <Text style={styles.bannerEmoji}>{isAnonymous ? '🎭' : '🎓'}</Text>
                <View style={styles.bannerCol}>
                  <Text
                    style={[
                      styles.bannerTitle,
                      isAnonymous && styles.bannerTitleAnon,
                    ]}
                  >
                    {isAnonymous
                      ? 'Posting as Anonymous Mascot'
                      : 'Posting as Verified Student'}
                  </Text>
                  <Text style={styles.bannerSubtitle}>
                    {isAnonymous
                      ? 'Zero-leak alias assigned. Unlinked from your identity.'
                      : 'Shown with your verified student badge.'}
                  </Text>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: colors.cardBorder, true: colors.anonPurple }}
                  thumbColor={isAnonymous ? '#fff' : '#94a3b8'}
                />
              </View>

              {/* Caption Input */}
              <TextInput
                style={styles.composerInput}
                placeholder="What's happening on campus? Add caption, thoughts, questions..."
                placeholderTextColor={colors.textMuted}
                value={content}
                onChangeText={setContent}
                multiline
              />

              {/* Media Preview Box (Instagram Style with Aspect Ratio / Crop Controls) */}
              {mediaUrl ? (
                <View style={styles.mediaPreviewCard}>
                  {mediaType === 'VIDEO' ? (
                    Platform.OS === 'web' ? (
                      <View style={{ width: '100%', alignItems: 'center', backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
                        {React.createElement('video', {
                          src: mediaUrl,
                          controls: true,
                          playsInline: true,
                          style: {
                            width: '100%',
                            maxHeight: '320px',
                            objectFit: 'contain',
                            backgroundColor: '#000',
                          },
                        })}
                      </View>
                    ) : (
                      <View style={styles.videoPreviewBox}>
                        <Text style={styles.videoPreviewEmoji}>📹</Text>
                        <Text style={styles.videoPreviewTitle}>Campus Video Reel Attached</Text>
                        <Text style={styles.videoPreviewSub} numberOfLines={1}>{mediaUrl}</Text>
                      </View>
                    )
                  ) : (
                    <Image
                      source={{ uri: mediaUrl }}
                      style={[
                        styles.previewImage,
                        mediaCropMode === '16:9' && { aspectRatio: 16 / 9, height: undefined },
                        mediaCropMode === '1:1' && { aspectRatio: 1, height: undefined },
                        mediaCropMode === '4:5' && { aspectRatio: 4 / 5, height: undefined },
                      ]}
                      resizeMode={imageFitMode}
                    />
                  )}

                  {/* Aspect Ratio / Crop Controls */}
                  <View style={styles.cropControlSection}>
                    <Text style={styles.cropSectionTitle}>📐 Crop & Aspect Ratio:</Text>
                    <View style={styles.cropPillRow}>
                      {[
                        { label: 'Auto (Full)', mode: 'AUTO' },
                        { label: '16:9 Wide', mode: '16:9' },
                        { label: '1:1 Square', mode: '1:1' },
                        { label: '4:5 Portrait', mode: '4:5' },
                      ].map((c) => (
                        <TouchableOpacity
                          key={c.mode}
                          style={[
                            styles.cropPill,
                            mediaCropMode === c.mode && styles.cropPillActive,
                          ]}
                          onPress={() => setMediaCropMode(c.mode as any)}
                        >
                          <Text
                            style={[
                              styles.cropPillText,
                              mediaCropMode === c.mode && styles.cropPillTextActive,
                            ]}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {mediaType === 'IMAGE' && (
                      <View style={styles.fitModeRow}>
                        <TouchableOpacity
                          style={[
                            styles.fitBtn,
                            imageFitMode === 'contain' && styles.fitBtnActive,
                          ]}
                          onPress={() => setImageFitMode('contain')}
                        >
                          <Text style={[styles.fitBtnText, imageFitMode === 'contain' && styles.fitBtnTextActive]}>
                            🔍 Fit Full
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.fitBtn,
                            imageFitMode === 'cover' && styles.fitBtnActive,
                          ]}
                          onPress={() => setImageFitMode('cover')}
                        >
                          <Text style={[styles.fitBtnText, imageFitMode === 'cover' && styles.fitBtnTextActive]}>
                            🖼️ Fill Frame
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.previewActionsRow}>
                    {mediaType === 'IMAGE' && (
                      <TouchableOpacity
                        style={styles.adjustCropBtn}
                        onPress={() => setCropModalVisible(true)}
                      >
                        <Text style={styles.adjustCropText}>✂️ Crop Studio</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.changeMediaBtn}
                      onPress={() => handlePickMedia(false)}
                    >
                      <Text style={styles.changeMediaText}>＋ Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeMediaBtn}
                      onPress={() => {
                        setMediaUrl('');
                        setMediaType('TEXT');
                      }}
                    >
                      <Text style={styles.removeMediaText}>✕ Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* INSTAGRAM-STYLE UNIFIED '+' MEDIA PICKER */
                <View style={styles.instaMediaSection}>
                  <Text style={styles.instaMediaHeading}>📸 Add Media (Instagram Style)</Text>
                  <Text style={styles.instaMediaSubtitle}>
                    Select any photo or video clip — full aspect ratio preserved!
                  </Text>

                  {/* 2 Clean Unified Cards: Media & Camera */}
                  <View style={styles.instaTilesRow}>
                    {/* Unified 1-Click Media Card */}
                    <TouchableOpacity
                      style={[styles.instaTileCard, { flex: 1.5, backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}
                      onPress={() => handlePickMedia(false)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.instaTilePlusBadge}>
                        <Text style={styles.instaTilePlusIcon}>＋</Text>
                      </View>
                      <Text style={styles.instaTileEmoji}>📸 📹</Text>
                      <Text style={styles.instaTileTitle}>Add Photo or Video</Text>
                      <Text style={styles.instaTileSub}>All formats • 16:9 / 4:5 / Reels</Text>
                    </TouchableOpacity>

                    {/* Camera */}
                    <TouchableOpacity
                      style={[styles.instaTileCard, { flex: 1 }]}
                      onPress={() => handlePickMedia(true)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.instaTilePlusBadge, { backgroundColor: '#10b981' }]}>
                        <Text style={styles.instaTilePlusIcon}>🤳</Text>
                      </View>
                      <Text style={styles.instaTileEmoji}>📷</Text>
                      <Text style={styles.instaTileTitle}>Take Photo</Text>
                      <Text style={styles.instaTileSub}>Live Camera</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Fast Campus Preset Clips / Stories */}
                  <Text style={styles.mediaSubLabel}>Or Pick Campus Footage (1-Tap):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow}>
                    {PRESET_IMAGES.map((p, idx) => (
                      <TouchableOpacity
                        key={`img-${idx}`}
                        style={[
                          styles.presetPill,
                          mediaUrl === p.url && styles.presetPillActive,
                        ]}
                        onPress={() => {
                          setMediaType('IMAGE');
                          setMediaUrl(p.url);
                        }}
                      >
                        <Text style={styles.presetPillText}>📷 {p.label}</Text>
                      </TouchableOpacity>
                    ))}
                    {PRESET_VIDEOS.map((p, idx) => (
                      <TouchableOpacity
                        key={`vid-${idx}`}
                        style={[
                          styles.presetPillVideo,
                          mediaUrl === p.url && styles.presetPillVideoActive,
                        ]}
                        onPress={() => {
                          setMediaType('VIDEO');
                          setMediaUrl(p.url);
                        }}
                      >
                        <Text style={styles.presetPillText}>📹 {p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Custom URL Input */}
                  <TextInput
                    style={styles.customUrlInput}
                    placeholder="Or paste direct image / video link URL..."
                    placeholderTextColor={colors.textMuted}
                    value={mediaUrl}
                    onChangeText={(txt) => {
                      setMediaUrl(txt);
                      if (txt.includes('.mp4') || txt.includes('video')) {
                        setMediaType('VIDEO');
                      } else if (txt.length > 5) {
                        setMediaType('IMAGE');
                      }
                    }}
                    autoCapitalize="none"
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Instagram-style Dedicated Crop & Frame Studio Modal */}
      <Modal
        visible={cropModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCropModalVisible(false)}
      >
        <View style={styles.cropStudioModalContainer}>
          <SafeAreaView style={styles.cropStudioSafeArea}>
            {/* Studio Top Header */}
            <View style={styles.cropStudioHeader}>
              <TouchableOpacity
                style={styles.cropCancelBtn}
                onPress={() => setCropModalVisible(false)}
              >
                <Text style={styles.cropCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.cropStudioTitle}>Crop & Frame Studio ✂️</Text>
              <TouchableOpacity
                style={styles.cropApplyBtn}
                onPress={() => setCropModalVisible(false)}
              >
                <Text style={styles.cropApplyText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Interactive Crop Frame Canvas */}
            <View style={styles.cropPreviewViewport}>
              <View
                style={[
                  styles.cropFrameBox,
                  mediaCropMode === '1:1' && styles.cropFrame1x1,
                  mediaCropMode === '4:5' && styles.cropFrame4x5,
                  mediaCropMode === '16:9' && styles.cropFrame16x9,
                  mediaCropMode === 'AUTO' && styles.cropFrameAuto,
                ]}
              >
                {mediaUrl ? (
                  <Image
                    source={{ uri: mediaUrl }}
                    style={styles.cropTargetImage}
                    resizeMode={imageFitMode}
                  />
                ) : null}

                {/* Rule-of-Thirds Grid Overlay (Instagram Style) */}
                <View style={styles.gridOverlayContainer} pointerEvents="none">
                  <View style={styles.gridLineH1} />
                  <View style={styles.gridLineH2} />
                  <View style={styles.gridLineV1} />
                  <View style={styles.gridLineV2} />
                </View>
              </View>
            </View>

            {/* Bottom Controls Bar */}
            <View style={styles.cropStudioBottomControls}>
              <Text style={styles.cropRatioLabel}>SELECT FRAME RATIO</Text>
              <View style={styles.cropStudioRatioRow}>
                {[
                  { label: 'Original', mode: 'AUTO', icon: '📐' },
                  { label: '1:1 Square', mode: '1:1', icon: '⏹' },
                  { label: '4:5 Portrait', mode: '4:5', icon: '📱' },
                  { label: '16:9 Wide', mode: '16:9', icon: '🖥' },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.mode}
                    style={[
                      styles.cropStudioRatioBtn,
                      mediaCropMode === c.mode && styles.cropStudioRatioBtnActive,
                    ]}
                    onPress={() => setMediaCropMode(c.mode as any)}
                  >
                    <Text style={styles.cropStudioRatioIcon}>{c.icon}</Text>
                    <Text
                      style={[
                        styles.cropStudioRatioText,
                        mediaCropMode === c.mode && styles.cropStudioRatioTextActive,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.cropFitToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.cropFitChoiceBtn,
                    imageFitMode === 'contain' && styles.cropFitChoiceBtnActive,
                  ]}
                  onPress={() => setImageFitMode('contain')}
                >
                  <Text style={[styles.cropFitChoiceText, imageFitMode === 'contain' && styles.cropFitChoiceTextActive]}>
                    🔍 Fit Entire Photo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.cropFitChoiceBtn,
                    imageFitMode === 'cover' && styles.cropFitChoiceBtnActive,
                  ]}
                  onPress={() => setImageFitMode('cover')}
                >
                  <Text style={[styles.cropFitChoiceText, imageFitMode === 'cover' && styles.cropFitChoiceTextActive]}>
                    🖼️ Fill Frame
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Comments Drawer / Modal (Instagram Drag-to-Dismiss) */}
      <Modal
        visible={activeCommentPost !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveCommentPost(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          {/* Backdrop Tap to Dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setActiveCommentPost(null)}
          />

          <View style={styles.commentsSheet}>
            {/* Instagram-style Drag Handle Bar (Swipe down to dismiss) */}
            <View
              style={styles.dragHandleArea}
              {...commentsPanResponder.panHandlers}
            >
              <View style={styles.dragHandleBar} />
              <Text style={styles.dragHandleHint}>↓ Drag down to dismiss</Text>
            </View>

            <View style={styles.commentsHeader}>
              <View>
                <Text style={styles.commentsTitle}>Comments</Text>
                <Text style={styles.commentsSubtitle}>
                  Discussion on {activeCommentPost?.author_name}'s post
                </Text>
              </View>
              <TouchableOpacity
                style={styles.commentsCloseIconBtn}
                onPress={() => setActiveCommentPost(null)}
              >
                <Text style={styles.commentsCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Comments List */}
            {loadingComments ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id.toString()}
                contentContainerStyle={styles.commentsList}
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <View style={styles.commentAvatarCircle}>
                      <Text style={styles.commentAvatarInitial}>
                        {item.is_anonymous ? '🎭' : (item.author_name || 'U')[0]}
                      </Text>
                    </View>
                    <View style={styles.commentContentCol}>
                      <View style={styles.commentHeaderRow}>
                        <Text style={styles.commentAuthorName}>
                          {item.author_name}
                        </Text>
                        <Text style={styles.commentTime}>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <Text style={styles.commentBodyText}>{item.text}</Text>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyComments}>
                    <Text style={styles.emptyCommentsIcon}>💬</Text>
                    <Text style={styles.emptyCommentsText}>
                      No comments yet. Start the campus conversation!
                    </Text>
                  </View>
                }
              />
            )}

            {/* Add Comment Input Bar */}
            <View style={styles.addCommentBar}>
              <View style={styles.commentAnonToggle}>
                <TouchableOpacity
                  style={[
                    styles.anonCommentBtn,
                    commentIsAnon && styles.anonCommentBtnActive,
                  ]}
                  onPress={() => setCommentIsAnon(!commentIsAnon)}
                >
                  <Text style={styles.anonCommentIcon}>{commentIsAnon ? '🎭' : '🎓'}</Text>
                  <Text style={styles.anonCommentLabel}>
                    {commentIsAnon ? 'Mascot' : 'Public'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.commentTextInput}
                placeholder={
                  commentIsAnon ? 'Comment as Anonymous Mascot...' : 'Add a comment...'
                }
                placeholderTextColor={colors.textMuted}
                value={commentText}
                onChangeText={setCommentText}
              />

              <TouchableOpacity
                style={[
                  styles.commentSubmitBtn,
                  !commentText.trim() && styles.commentSubmitBtnDisabled,
                ]}
                onPress={handleAddComment}
                disabled={!commentText.trim() || postingComment}
              >
                {postingComment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.commentSubmitText}>Post</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Campus Notifications Drawer / Modal */}
      <Modal
        visible={notificationsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setNotificationsVisible(false)}
          />
          <View style={styles.notificationsSheet}>
            <View style={styles.dragHandleArea}>
              <View style={styles.dragHandleBar} />
              <Text style={styles.dragHandleHint}>↓ Drag down to dismiss</Text>
            </View>

            <View style={styles.notificationsHeader}>
              <View>
                <Text style={styles.commentsTitle}>Campus Notifications 🔔</Text>
                <Text style={styles.commentsSubtitle}>Tap any notification to view details</Text>
              </View>
              <TouchableOpacity
                style={styles.commentsCloseIconBtn}
                onPress={() => setNotificationsVisible(false)}
              >
                <Text style={styles.commentsCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {notifications.map((notif) => (
                <TouchableOpacity
                  key={notif.id}
                  style={[
                    styles.notificationCard,
                    notif.read && styles.notificationCardRead,
                  ]}
                  onPress={() => handleNotificationPress(notif)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.notifIconCircle, notif.read && styles.notifIconCircleRead]}>
                    <Text style={{ fontSize: 18 }}>{notif.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.notifTitle, notif.read && styles.notifTitleRead]}>
                        {notif.title}
                      </Text>
                      <Text style={styles.notifTime}>{notif.time}</Text>
                    </View>
                    <Text style={styles.notifSub}>{notif.sub}</Text>
                    {!notif.read && (
                      <View style={styles.notifTapPill}>
                        <Text style={styles.notifTapPillText}>👉 Tap to View Details</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 45,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  refreshIconText: {
    fontSize: 14,
  },
  feedContent: {
    padding: 14,
    paddingBottom: 90,
  },
  postCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  anonAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: colors.anonPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anonAvatarIcon: {
    fontSize: 18,
  },
  authorCol: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  anonAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.anonPurple,
  },
  anonPill: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  anonPillText: {
    color: colors.anonPurple,
    fontSize: 9,
    fontWeight: '800',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  verifiedBadgeText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '800',
  },
  semiVerifiedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  semiVerifiedBadgeText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
  },
  communityTag: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  timestampText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  postContent: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  mediaContainer: {
    width: '100%',
    backgroundColor: '#000',
  },
  postImage: {
    width: '100%',
    height: 260,
  },
  videoPlayerCard: {
    position: 'relative',
    width: '100%',
    height: 260,
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  playButtonIcon: {
    fontSize: 22,
    color: '#fff',
    marginLeft: 3,
  },
  reelBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reelBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  actionText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  likedText: {
    color: '#ef4444',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 4,
  },
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    lineHeight: 34,
    fontWeight: '300',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  composerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  modalCloseText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalPostBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modalPostBtnDisabled: {
    opacity: 0.5,
  },
  modalPostBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  composerScroll: {
    maxHeight: 520,
  },
  composerIdentityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  composerIdentityBannerAnon: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  bannerEmoji: {
    fontSize: 22,
  },
  bannerCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bannerTitleAnon: {
    color: colors.anonPurple,
  },
  bannerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  composerInput: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
    minHeight: 90,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 14,
  },
  mediaPreviewCard: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  previewImage: {
    width: '100%',
    height: 180,
  },
  previewBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
  },
  removeMediaBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  removeMediaText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  mediaPickerSection: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 20,
  },
  mediaPickerTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  mediaSubLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  presetPill: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
  },
  presetPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetPillVideo: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
  },
  presetPillVideoActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  presetPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  customUrlInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },

  // Comments Sheet Styles
  commentsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '75%',
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  commentsSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  commentsList: {
    paddingVertical: 12,
    paddingBottom: 20,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  commentAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  commentContentCol: {
    flex: 1,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthorName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  commentBodyText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  emptyComments: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyCommentsIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyCommentsText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  addCommentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 8,
  },
  commentAnonToggle: {
    alignItems: 'center',
  },
  anonCommentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  anonCommentBtnActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderWidth: 1,
    borderColor: colors.anonPurple,
  },
  anonCommentIcon: {
    fontSize: 14,
  },
  anonCommentLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 14,
  },
  commentSubmitBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  commentSubmitBtnDisabled: {
    opacity: 0.4,
  },
  commentSubmitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
  },
  headerPostIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  headerPostText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  videoPreviewBox: {
    backgroundColor: '#1e1e2d',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  videoPreviewEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  videoPreviewTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  videoPreviewSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  previewActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  changeMediaBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeMediaText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '700',
  },
  instaMediaSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 16,
  },
  instaMediaHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  instaMediaSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  instaTilesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  instaTileCard: {
    flex: 1,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    position: 'relative',
  },
  instaTileCardVideo: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  instaTilePlusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instaTilePlusBadgeVideo: {
    backgroundColor: '#ef4444',
  },
  instaTilePlusIcon: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 14,
  },
  instaTileEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  instaTileTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  instaTileSub: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  dragHandleArea: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#475569',
  },
  notificationsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '70%',
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    marginBottom: 6,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 12,
  },
  notifIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  notifTime: {
    color: colors.textMuted,
    fontSize: 10,
  },
  notifSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  imageWrapper: {
    width: '100%',
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webVideoWrapper: {
    width: '100%',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropControlSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cropSectionTitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  cropPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  cropPill: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cropPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cropPillText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  cropPillTextActive: {
    color: '#ffffff',
  },
  fitModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  fitBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  fitBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
  },
  fitBtnText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  fitBtnTextActive: {
    color: '#34d399',
    fontWeight: '800',
  },
  adjustCropBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  adjustCropText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
  },
  dragHandleHint: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
  commentsCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsCloseIcon: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  notificationCardRead: {
    opacity: 0.7,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  notifIconCircleRead: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  notifTitleRead: {
    color: colors.textSecondary,
  },
  notifTapPill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  notifTapPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },

  // Dedicated Crop Studio Modal Styles
  cropStudioModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cropStudioSafeArea: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  cropStudioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0a0f1d',
  },
  cropStudioTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  cropCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cropCancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  cropApplyBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  cropApplyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  cropPreviewViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#05070f',
  },
  cropFrameBox: {
    width: '100%',
    maxHeight: '100%',
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  cropFrameAuto: {
    maxHeight: 460,
  },
  cropFrame1x1: {
    aspectRatio: 1,
    maxHeight: 380,
  },
  cropFrame4x5: {
    aspectRatio: 4 / 5,
    maxHeight: 440,
  },
  cropFrame16x9: {
    aspectRatio: 16 / 9,
    maxHeight: 280,
  },
  cropTargetImage: {
    width: '100%',
    height: '100%',
  },
  gridOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  cropStudioBottomControls: {
    backgroundColor: '#0a0f1d',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    padding: 18,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
  },
  cropRatioLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  cropStudioRatioRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  cropStudioRatioBtn: {
    flex: 1,
    backgroundColor: '#131b2e',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cropStudioRatioBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cropStudioRatioIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  cropStudioRatioText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  cropStudioRatioTextActive: {
    color: '#ffffff',
  },
  cropFitToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cropFitChoiceBtn: {
    flex: 1,
    backgroundColor: '#131b2e',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cropFitChoiceBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
  },
  cropFitChoiceText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  cropFitChoiceTextActive: {
    color: '#34d399',
    fontWeight: '800',
  },
});
