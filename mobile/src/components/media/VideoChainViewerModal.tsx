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
  ChevronDown,
  ChevronUp,
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
import { UserAvatar } from '../common/UserAvatar';

let ExpoVideo: any = null;
let ResizeMode: any = { CONTAIN: 'contain', COVER: 'cover' };
try {
  const av = require('expo-av');
  ExpoVideo = av.Video;
  if (av.ResizeMode) ResizeMode = av.ResizeMode;
} catch {}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const formatTime = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
};

export const VideoChainViewerModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [videos, setVideos] = useState<VideoChainItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);

  // Low-fade subtle feedback for Play/Pause and Skip
  const [centerFeedback, setCenterFeedback] = useState<'PLAY' | 'PAUSE' | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const skipAnim = useRef(new Animated.Value(0)).current;

  const videoRef = useRef<any>(null);
  const nativeVideoRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const tapTimerRef = useRef<any>(null);

  useEffect(() => {
    videoFeedManager.registerOpenListener((idx, feedVideos) => {
      setVideos(feedVideos);
      setCurrentIndex(Math.max(0, Math.min(idx, feedVideos.length - 1)));
      setVisible(true);
      setIsPlaying(true);
      setCurrentTime(0);
    });

    return () => {
      videoFeedManager.unregisterOpenListener();
    };
  }, []);

  const currentVideo = videos[currentIndex];
  const fullUrl = currentVideo ? getFullMediaUrl(currentVideo.videoUrl) : '';

  // Trigger low-fade center indicator that gently fades out without blocking video quality
  const showCenterFeedback = (type: 'PLAY' | 'PAUSE') => {
    setCenterFeedback(type);
    fadeAnim.setValue(0.85);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 650,
      useNativeDriver: true,
    }).start(() => setCenterFeedback(null));
  };

  const showSkipFeedback = (text: string) => {
    setSkipFeedback(text);
    skipAnim.setValue(0.9);
    Animated.timing(skipAnim, {
      toValue: 0,
      duration: 700,
      useNativeDriver: true,
    }).start(() => setSkipFeedback(null));
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
        nativeVideoRef.current.pauseAsync?.();
        setIsPlaying(false);
        showCenterFeedback('PAUSE');
      } else {
        nativeVideoRef.current.playAsync?.();
        setIsPlaying(true);
        showCenterFeedback('PLAY');
      }
    }
  };

  const handleSkip = (seconds: number) => {
    const target = Math.max(0, Math.min(duration, currentTime + seconds));
    if (Platform.OS === 'web') {
      if (videoRef.current) {
        videoRef.current.currentTime = target;
        setCurrentTime(target);
      }
    } else {
      nativeVideoRef.current?.setPositionAsync?.(target * 1000);
      setCurrentTime(target);
    }
    showSkipFeedback(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
  };

  const handleNextVideo = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      // Loop back or close
      setCurrentIndex(0);
      setCurrentTime(0);
    }
  };

  const handleClose = () => {
    if (Platform.OS === 'web' && videoRef.current) {
      videoRef.current.pause();
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.pauseAsync?.();
    }
    setIsPlaying(false);
    setVisible(false);
  };

  // Screen Tap Handler: Single Tap = Play/Pause, Double Tap = Skip 10s
  const handleScreenPress = (e: any) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      lastTapRef.current = 0;

      // Determine click location for left/right double tap skip
      const clickX = e?.nativeEvent?.locationX ?? SCREEN_WIDTH / 2;
      if (clickX < SCREEN_WIDTH * 0.4) {
        handleSkip(-10);
      } else if (clickX > SCREEN_WIDTH * 0.6) {
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

  // Keyboard & Wheel controls for desktop web
  const lastWheelTime = useRef<number>(0);
  const handleWheel = (e: any) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 500) return;
    if (e.deltaY > 25) {
      lastWheelTime.current = now;
      handleNextVideo();
    } else if (e.deltaY < -25) {
      lastWheelTime.current = now;
      handleClose();
    }
  };

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        handleNextVideo();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        handlePrevVideo();
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
  }, [visible, currentIndex, videos.length, isPlaying]);

  // PanResponder for vertical dragging:
  // Upper drag (dy < -30) -> Closes viewer!
  // Down slide (dy > 30) -> Goes to next video in chain!
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -30 || gestureState.vy < -0.3) {
          // Upper drag: Close
          handleClose();
        } else if (gestureState.dy > 30 || gestureState.vy > 0.3) {
          // Down slide: Next video in chain
          handleNextVideo();
        }
      },
    })
  ).current;

  if (!visible || !currentVideo) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container} {...panResponder.panHandlers} onWheel={handleWheel as any}>
        {/* Fullscreen Video Player Layer */}
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
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
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
                setCurrentTime((status.positionMillis || 0) / 1000);
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

        {/* Minimalist Low-Fade Play/Pause Icon (No heavy black circle!) */}
        {centerFeedback && (
          <Animated.View style={[styles.lowFadeCenterBox, { opacity: fadeAnim }]} pointerEvents="none">
            {centerFeedback === 'PAUSE' ? (
              <Pause size={48} color="rgba(255, 255, 255, 0.85)" fill="rgba(255, 255, 255, 0.85)" />
            ) : (
              <Play size={48} color="rgba(255, 255, 255, 0.85)" fill="rgba(255, 255, 255, 0.85)" style={{ marginLeft: 4 }} />
            )}
          </Animated.View>
        )}

        {/* Minimalist Low-Fade Skip 10s Feedback (Soft text glow, no dark circle!) */}
        {skipFeedback && (
          <Animated.View style={[styles.lowFadeSkipBox, { opacity: skipAnim }]} pointerEvents="none">
            <Text style={styles.lowFadeSkipText}>{skipFeedback}</Text>
          </Animated.View>
        )}

        {/* Top Header: Back, Video Counter, Mute Toggle */}
        <View style={styles.topHeaderBar} pointerEvents="box-none">
          <TouchableOpacity style={styles.glassBtn} onPress={handleClose} activeOpacity={0.7}>
            <ArrowLeft size={20} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              Video {currentIndex + 1} of {videos.length}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.glassBtn}
            onPress={() => setIsMuted((prev) => !prev)}
            activeOpacity={0.7}
          >
            {isMuted ? <VolumeX size={19} color="#ffffff" /> : <Volume2 size={19} color="#ffffff" />}
          </TouchableOpacity>
        </View>

        {/* Upper Drag & Down Slide Gesture Guidance Hints */}
        <View style={styles.gestureHintsRow} pointerEvents="none">
          <View style={styles.gestureHintItem}>
            <ChevronUp size={14} color="rgba(255, 255, 255, 0.5)" />
            <Text style={styles.gestureHintText}>Slide Up: Close</Text>
          </View>
          <View style={styles.gestureHintItem}>
            <ChevronDown size={14} color="rgba(255, 255, 255, 0.5)" />
            <Text style={styles.gestureHintText}>Slide Down: Next Video</Text>
          </View>
        </View>

        {/* Bottom Post Metadata & Actions Overlay */}
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.bottomMetaLeft} pointerEvents="box-none">
            {/* Author Row */}
            <View style={styles.authorRow}>
              <UserAvatar
                uri={currentVideo.authorAvatar}
                name={currentVideo.authorName || 'Campus User'}
                size={34}
                style={{ marginRight: 8 }}
              />
              <View>
                <Text style={styles.authorName} numberOfLines={1}>
                  {currentVideo.authorName || 'Campus Peer'}
                </Text>
                {currentVideo.communityName && (
                  <Text style={styles.communityTag}>c/{currentVideo.communityName}</Text>
                )}
              </View>
            </View>

            {/* Post Caption */}
            {currentVideo.content ? (
              <Text style={styles.captionText} numberOfLines={3} ellipsizeMode="tail">
                {currentVideo.content}
              </Text>
            ) : null}
          </View>

          {/* Quick Floating Action Right Column (Like, Comment, Next) */}
          <View style={styles.actionColumn} pointerEvents="box-none">
            <TouchableOpacity style={styles.actionColBtn} activeOpacity={0.75}>
              <Heart size={24} color="#ffffff" />
              <Text style={styles.actionColLabel}>
                {currentVideo.likesCount !== undefined ? currentVideo.likesCount : 'Like'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionColBtn} activeOpacity={0.75}>
              <MessageCircle size={24} color="#ffffff" />
              <Text style={styles.actionColLabel}>
                {currentVideo.commentsCount !== undefined ? currentVideo.commentsCount : 'Chat'}
              </Text>
            </TouchableOpacity>

            {/* Next Video Button */}
            <TouchableOpacity style={styles.nextVideoBtn} onPress={handleNextVideo} activeOpacity={0.8}>
              <ChevronDown size={20} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Scrubbing Progress Timeline */}
        <View style={styles.scrubberBar} pointerEvents="none">
          <View style={[styles.scrubberFill, { width: `${progressPercent}%` }]} />
          <View style={styles.timeBadgeRow}>
            <Text style={styles.timeText}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Text>
          </View>
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
    backgroundColor: 'transparent', // NO dark solid circle!
  },
  lowFadeSkipBox: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    zIndex: 25,
  },
  lowFadeSkipText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topHeaderBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  gestureHintsRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 92 : 68,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 16,
    zIndex: 25,
  },
  gestureHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  gestureHintText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontWeight: '600',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  bottomMetaLeft: {
    flex: 1,
    marginRight: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  communityTag: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  captionText: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionColumn: {
    alignItems: 'center',
    gap: 14,
    marginBottom: 4,
  },
  actionColBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionColLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  nextVideoBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    elevation: 4,
  },
  scrubberBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 35,
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  timeBadgeRow: {
    position: 'absolute',
    bottom: 8,
    right: 16,
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
