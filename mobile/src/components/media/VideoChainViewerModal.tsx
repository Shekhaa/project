import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  PanResponder,
  Animated,
} from 'react-native';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Heart,
  MessageCircle,
  Share2,
  RotateCcw,
  RotateCw,
  Play,
  Pause,
} from 'lucide-react-native';
import { VideoChainItem, videoFeedManager } from '../../services/videoFeedManager';
import { getFullMediaUrl } from '../../config/api';
import { backHandlerRegistry } from '../../services/backHandlerRegistry';
import { UserAvatar } from '../common/UserAvatar';

let ExpoVideo: any = null;
let ResizeMode: any = { CONTAIN: 'contain', COVER: 'cover' };
try {
  const av = require('expo-av');
  ExpoVideo = av.Video;
  if (av.ResizeMode) ResizeMode = av.ResizeMode;
} catch {}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const formatTime = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
};

interface VideoChainViewerModalProps {
  onToggleLike?: (postId: number) => void;
  onOpenComments?: (post: any) => void;
  onOpenShare?: (post: any) => void;
  onOpenProfile?: (userId: number) => void;
  temporarilyHidden?: boolean;
}

export const VideoChainViewerModal: React.FC<VideoChainViewerModalProps> = ({
  onToggleLike,
  onOpenComments,
  onOpenShare,
  onOpenProfile,
  temporarilyHidden = false,
}) => {
  const [visible, setVisible] = useState(false);
  const [videos, setVideos] = useState<VideoChainItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);

  // Optimistic like tracking keyed by postId/item id
  const [likedOverrides, setLikedOverrides] = useState<Record<string, { liked: boolean; count: number }>>({});

  // Low-fade subtle feedback for Play/Pause and Skip
  const [centerFeedback, setCenterFeedback] = useState<'PLAY' | 'PAUSE' | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const skipAnim = useRef(new Animated.Value(0)).current;

  const videoRef = useRef<any>(null);
  const nativeVideoRef = useRef<any>(null);
  const scrubberWidthRef = useRef<number>(SCREEN_WIDTH - 32);
  const isDraggingScrubberRef = useRef<boolean>(false);
  const pointerStartYRef = useRef<number | null>(null);
  const pointerDraggedRef = useRef<boolean>(false);
  const lastTapRef = useRef<number>(0);
  const tapTimerRef = useRef<any>(null);

  useEffect(() => {
    videoFeedManager.registerOpenListener((idx, feedVideos) => {
      setVideos(feedVideos);
      setCurrentIndex(Math.max(0, Math.min(idx, feedVideos.length - 1)));
      setVisible(true);
      setIsPlaying(true);
      setCurrentTime(0);
      setLikedOverrides({});
    });

    return () => {
      videoFeedManager.unregisterOpenListener();
    };
  }, []);

  // Register hardware back button on phone to return to Feed/Home
  useEffect(() => {
    if (visible && !temporarilyHidden) {
      backHandlerRegistry.push('VideoChainViewerModal', () => {
        handleClose();
        return true;
      });
      return () => backHandlerRegistry.pop('VideoChainViewerModal');
    }
  }, [visible, temporarilyHidden]);

  const currentVideo = videos[currentIndex];
  const fullUrl = currentVideo ? getFullMediaUrl(currentVideo.videoUrl) : '';

  const showCenterFeedback = (type: 'PLAY' | 'PAUSE') => {
    setCenterFeedback(type);
    fadeAnim.setValue(0.85);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => setCenterFeedback(null));
  };

  const showSkipFeedback = (text: string) => {
    setSkipFeedback(text);
    skipAnim.setValue(0.9);
    Animated.timing(skipAnim, {
      toValue: 0,
      duration: 650,
      useNativeDriver: true,
    }).start(() => setSkipFeedback(null));
  };

  const pausePlayback = () => {
    if (Platform.OS === 'web' && videoRef.current) {
      videoRef.current.pause();
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.pauseAsync?.().catch(() => {});
    }
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (Platform.OS === 'web') {
      if (!videoRef.current) return;
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
        showCenterFeedback('PLAY');
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
        showCenterFeedback('PAUSE');
      }
    } else {
      if (!nativeVideoRef.current) return;
      if (isPlaying) {
        nativeVideoRef.current.pauseAsync?.().catch(() => {});
        setIsPlaying(false);
        showCenterFeedback('PAUSE');
      } else {
        nativeVideoRef.current.playAsync?.().catch(() => {});
        setIsPlaying(true);
        showCenterFeedback('PLAY');
      }
    }
  };

  const handleSeekToSeconds = (targetSec: number) => {
    const dur = duration > 0 ? duration : (videoRef.current?.duration || 0);
    const clamped = Math.max(0, Math.min(dur > 0 ? dur : 999999, targetSec));
    if (Platform.OS === 'web' && videoRef.current) {
      videoRef.current.currentTime = clamped;
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.setPositionAsync?.(clamped * 1000).catch(() => {});
    }
    setCurrentTime(clamped);
  };

  const handleSkip = (secs: number) => {
    const cur = Platform.OS === 'web' && videoRef.current ? videoRef.current.currentTime : currentTime;
    handleSeekToSeconds(cur + secs);
    showSkipFeedback(secs > 0 ? '+10s' : '-10s');
  };

  // Slide DOWN -> Next video
  const handleNextVideo = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  };

  // Slide UP -> Previous (old) video; if on first video, do nothing
  const handlePrevVideo = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setCurrentTime(0);
      setIsPlaying(true);
    }
  };

  const handleClose = () => {
    pausePlayback();
    setVisible(false);
  };

  // Screen Tap Handler: Single Tap = Play/Pause, Double Tap Left/Right = -10s / +10s across 9:16 video
  const handleScreenPress = (e: any) => {
    if (isDraggingScrubberRef.current || pointerDraggedRef.current) {
      pointerDraggedRef.current = false;
      return;
    }
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 260;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      lastTapRef.current = 0;

      const clickX = e?.nativeEvent?.locationX ?? e?.nativeEvent?.offsetX ?? SCREEN_WIDTH / 2;
      const surfaceW = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : SCREEN_WIDTH;
      if (clickX < surfaceW * 0.42) {
        handleSkip(-10);
      } else if (clickX > surfaceW * 0.58) {
        handleSkip(10);
      } else {
        handleTogglePlay();
      }
    } else {
      lastTapRef.current = now;
      tapTimerRef.current = setTimeout(() => {
        handleTogglePlay();
        tapTimerRef.current = null;
      }, DOUBLE_TAP_DELAY);
    }
  };

  // Desktop Web Wheel & Keyboard Controls:
  // Down (deltaY > 0 / ArrowDown) -> Next Video
  // Up (deltaY < 0 / ArrowUp) -> Old/Previous Video (no-op if first)
  // Escape -> Close to Feed
  const lastWheelTime = useRef<number>(0);
  const handleWheel = (e: any) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 480) return;
    if (e.deltaY > 25) {
      lastWheelTime.current = now;
      handleNextVideo();
    } else if (e.deltaY < -25) {
      lastWheelTime.current = now;
      handlePrevVideo();
    }
  };

  useEffect(() => {
    if (!visible || temporarilyHidden) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        handleNextVideo();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        handlePrevVideo();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSkip(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkip(10);
      } else if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, temporarilyHidden, currentIndex, videos.length, isPlaying, duration, currentTime]);

  // PanResponder for vertical swiping:
  // Slide DOWN (dy > 30) -> Next video
  // Slide UP (dy < -30) -> Previous (old) video; if first, does nothing
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return !isDraggingScrubberRef.current && Math.abs(gestureState.dy) > 12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.3;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 30 || gestureState.vy > 0.3) {
          handleNextVideo();
        } else if (gestureState.dy < -30 || gestureState.vy < -0.3) {
          handlePrevVideo();
        }
      },
    })
  ).current;

  // Draggable Scrubber PanResponder (Native + Touch)
  const scrubberPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        isDraggingScrubberRef.current = true;
        const x = e.nativeEvent.locationX ?? 0;
        const w = scrubberWidthRef.current || 1;
        const pct = Math.max(0, Math.min(1, x / w));
        if (duration > 0) handleSeekToSeconds(pct * duration);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX ?? 0;
        const w = scrubberWidthRef.current || 1;
        const pct = Math.max(0, Math.min(1, x / w));
        if (duration > 0) handleSeekToSeconds(pct * duration);
      },
      onPanResponderRelease: () => {
        setTimeout(() => {
          isDraggingScrubberRef.current = false;
        }, 60);
      },
      onPanResponderTerminate: () => {
        isDraggingScrubberRef.current = false;
      },
    })
  ).current;

  // Web pointer drag for smooth scrubber seeking
  const handleWebScrub = (e: any) => {
    e?.stopPropagation?.();
    if (!duration) return;
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      handleSeekToSeconds(pct * duration);
    } catch {}
  };

  if (!visible || temporarilyHidden || !currentVideo) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Live like state
  const itemKey = String(currentVideo.postId || currentVideo.id);
  const override = likedOverrides[itemKey];
  const isLiked = override ? override.liked : Boolean(currentVideo.isLiked);
  const likesCount = override ? override.count : (currentVideo.likesCount ?? 0);
  const commentsCount = currentVideo.commentsCount ?? 0;

  const handlePressLike = () => {
    if (!currentVideo.postId) return;
    const nextLiked = !isLiked;
    const nextCount = Math.max(0, likesCount + (nextLiked ? 1 : -1));
    setLikedOverrides((prev) => ({
      ...prev,
      [itemKey]: { liked: nextLiked, count: nextCount },
    }));
    onToggleLike?.(currentVideo.postId);
  };

  const handlePressComment = () => {
    if (!currentVideo.post) return;
    pausePlayback();
    onOpenComments?.(currentVideo.post);
  };

  const handlePressShare = () => {
    if (!currentVideo.post) return;
    pausePlayback();
    onOpenShare?.(currentVideo.post);
  };

  const handlePressProfile = () => {
    if (currentVideo.isAnonymous || !currentVideo.authorId) return;
    pausePlayback();
    onOpenProfile?.(currentVideo.authorId);
  };

  const handlePointerStart = (e: any) => {
    if (isDraggingScrubberRef.current) return;
    const y = e?.clientY ?? e?.nativeEvent?.pageY ?? e?.touches?.[0]?.clientY;
    if (typeof y === 'number') {
      pointerStartYRef.current = y;
      pointerDraggedRef.current = false;
    }
  };

  const handlePointerEnd = (e: any) => {
    if (pointerStartYRef.current === null || isDraggingScrubberRef.current) return;
    const endY = e?.clientY ?? e?.nativeEvent?.pageY ?? e?.changedTouches?.[0]?.clientY;
    if (typeof endY === 'number') {
      const dy = endY - pointerStartYRef.current;
      if (dy > 40) {
        pointerDraggedRef.current = true;
        handleNextVideo();
      } else if (dy < -40) {
        pointerDraggedRef.current = true;
        handlePrevVideo();
      }
    }
    pointerStartYRef.current = null;
  };

  return (
    <Modal
      visible={visible && !temporarilyHidden}
      transparent={false}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View
        style={styles.container}
        {...panResponder.panHandlers}
        onWheel={handleWheel as any}
        onPointerDown={handlePointerStart as any}
        onPointerUp={handlePointerEnd as any}
      >
        {/* Fullscreen 9:16 Video Player Layer */}
        {Platform.OS === 'web' ? (
          <video
            ref={videoRef}
            src={fullUrl}
            playsInline
            autoPlay
            loop
            muted={isMuted}
            controls={false}
            onClick={handleScreenPress}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000000',
              display: 'block',
              cursor: 'pointer',
            }}
            onTimeUpdate={() => {
              if (videoRef.current && !isDraggingScrubberRef.current) {
                setCurrentTime(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration || 0);
            }}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onEnded={handleNextVideo}
          />
        ) : ExpoVideo ? (
          <TouchableOpacity activeOpacity={1} onPress={handleScreenPress} style={StyleSheet.absoluteFill}>
            <ExpoVideo
              ref={nativeVideoRef}
              source={{ uri: fullUrl }}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isPlaying}
              isLooping
              isMuted={isMuted}
              style={StyleSheet.absoluteFill}
              onPlaybackStatusUpdate={(status: any) => {
                if (!status.isLoaded) return;
                setIsPlaying(status.isPlaying);
                if (!isDraggingScrubberRef.current) {
                  setCurrentTime((status.positionMillis || 0) / 1000);
                }
                setDuration((status.durationMillis || 0) / 1000);
                setBuffering(status.isBuffering);
                if (status.didJustFinish) handleNextVideo();
              }}
            />
          </TouchableOpacity>
        ) : null}

        {/* Buffering Indicator */}
        {buffering && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}

        {/* Minimalist Low-Fade Play/Pause Icon */}
        {centerFeedback && (
          <Animated.View style={[styles.lowFadeCenterBox, { opacity: fadeAnim }]} pointerEvents="none">
            {centerFeedback === 'PAUSE' ? (
              <Pause size={46} color="rgba(255, 255, 255, 0.85)" fill="rgba(255, 255, 255, 0.85)" />
            ) : (
              <Play size={46} color="rgba(255, 255, 255, 0.85)" fill="rgba(255, 255, 255, 0.85)" style={{ marginLeft: 4 }} />
            )}
          </Animated.View>
        )}

        {/* Minimalist Low-Fade Skip 10s Feedback */}
        {skipFeedback && (
          <Animated.View style={[styles.lowFadeSkipBox, { opacity: skipAnim }]} pointerEvents="none">
            <Text style={styles.lowFadeSkipText}>{skipFeedback}</Text>
          </Animated.View>
        )}

        {/* Clean Top Header: Back Button + Mute Toggle (No video count or swipe hint clutter) */}
        <View style={styles.topHeaderBar} pointerEvents="box-none">
          <TouchableOpacity style={styles.glassBtn} onPress={handleClose} activeOpacity={0.7} accessibilityLabel="Back to feed">
            <ArrowLeft size={20} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.glassBtn}
            onPress={() => setIsMuted((prev) => !prev)}
            activeOpacity={0.7}
            accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={19} color="#ffffff" /> : <Volume2 size={19} color="#ffffff" />}
          </TouchableOpacity>
        </View>

        {/* Bottom Overlay: Author Profile (Clickable) + Caption + Interactive Likes/Comments */}
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.bottomMetaLeft} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.authorRow}
              onPress={handlePressProfile}
              disabled={Boolean(currentVideo.isAnonymous || !currentVideo.authorId)}
              activeOpacity={0.75}
            >
              <UserAvatar
                uri={currentVideo.authorAvatar}
                name={currentVideo.authorName || 'Campus User'}
                size={36}
                isAnonymous={currentVideo.isAnonymous}
                style={{ marginRight: 10 }}
              />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.authorName} numberOfLines={1}>
                  {currentVideo.authorName || 'Campus Peer'}
                </Text>
                {currentVideo.communityName ? (
                  <Text style={styles.communityTag}>c/{currentVideo.communityName}</Text>
                ) : null}
              </View>
            </TouchableOpacity>

            {currentVideo.content ? (
              <Text style={styles.captionText} numberOfLines={3} ellipsizeMode="tail">
                {currentVideo.content}
              </Text>
            ) : null}
          </View>

          {/* Right Action Column: Real Like & Real Comment (No lower-right down button) */}
          <View style={styles.actionColumn} pointerEvents="box-none">
            <TouchableOpacity style={styles.actionColBtn} onPress={handlePressLike} activeOpacity={0.75}>
              <Heart
                size={26}
                color={isLiked ? '#ef4444' : '#ffffff'}
                fill={isLiked ? '#ef4444' : 'transparent'}
              />
              <Text style={[styles.actionColLabel, isLiked && { color: '#ef4444' }]}>
                {likesCount}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionColBtn} onPress={handlePressComment} activeOpacity={0.75}>
              <MessageCircle size={26} color="#ffffff" />
              <Text style={styles.actionColLabel}>{commentsCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionColBtn} onPress={handlePressShare} activeOpacity={0.75}>
              <Share2 size={24} color="#ffffff" />
              <Text style={styles.actionColLabel}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Scrubbing Controls: Larger Draggable Seek Bar + 10s Skip + Time */}
        <View style={styles.scrubberSection} pointerEvents="box-none">
          <View style={styles.scrubberTopRow}>
            <TouchableOpacity style={styles.miniCtrlBtn} onPress={handleTogglePlay} activeOpacity={0.75}>
              {isPlaying ? (
                <Pause size={16} color="#ffffff" fill="#ffffff" />
              ) : (
                <Play size={16} color="#ffffff" fill="#ffffff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.miniSkipBtn} onPress={() => handleSkip(-10)} activeOpacity={0.75}>
              <RotateCcw size={14} color="#ffffff" />
              <Text style={styles.miniSkipText}>10s</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.miniSkipBtn} onPress={() => handleSkip(10)} activeOpacity={0.75}>
              <RotateCw size={14} color="#ffffff" />
              <Text style={styles.miniSkipText}>10s</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <Text style={styles.timeText}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Text>
          </View>

          {/* Larger Interactive Draggable Progress Bar */}
          {Platform.OS === 'web' ? (
            <div
              onMouseDown={(e) => {
                isDraggingScrubberRef.current = true;
                handleWebScrub(e);
              }}
              onMouseMove={(e) => {
                if (e.buttons === 1) handleWebScrub(e);
              }}
              onMouseUp={() => {
                setTimeout(() => {
                  isDraggingScrubberRef.current = false;
                }, 50);
              }}
              onClick={handleWebScrub}
              style={{
                width: '100%',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.28)',
                  borderRadius: '3px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    backgroundColor: '#ffffff',
                    borderRadius: '3px',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      right: '-7px',
                      top: '-5px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 0 8px rgba(0,0,0,0.65)',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <View
              style={styles.nativeScrubberHitArea}
              onLayout={(e) => {
                scrubberWidthRef.current = e.nativeEvent.layout.width;
              }}
              {...scrubberPanResponder.panHandlers}
            >
              <View style={styles.nativeScrubberTrack}>
                <View style={[styles.nativeScrubberFill, { width: `${progressPercent}%` }]}>
                  <View style={styles.nativeScrubberThumb} />
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lowFadeCenterBox: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  lowFadeSkipBox: {
    position: 'absolute',
    alignSelf: 'center',
    top: '44%',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 25,
  },
  lowFadeSkipText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topHeaderBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 18,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 68,
    left: 16,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 25,
  },
  bottomMetaLeft: {
    flex: 1,
    paddingRight: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  communityTag: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  captionText: {
    color: 'rgba(255, 255, 255, 0.94)',
    fontSize: 13.5,
    lineHeight: 19,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionColumn: {
    alignItems: 'center',
    gap: 18,
    paddingBottom: 6,
  },
  actionColBtn: {
    alignItems: 'center',
    gap: 4,
  },
  actionColLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  scrubberSection: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 20 : 10,
    left: 16,
    right: 16,
    zIndex: 35,
  },
  scrubberTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  miniCtrlBtn: {
    padding: 4,
  },
  miniSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  miniSkipText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  nativeScrubberHitArea: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
  },
  nativeScrubberTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 3,
    overflow: 'visible',
  },
  nativeScrubberFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 3,
    position: 'relative',
  },
  nativeScrubberThumb: {
    position: 'absolute',
    right: -8,
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
});
