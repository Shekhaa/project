import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Linking,
  Animated,
} from 'react-native';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Film,
  AlertCircle,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { getFullMediaUrl } from '../../config/api';
import { activeVideoManager } from '../../services/activeVideoManager';
import { videoFeedManager } from '../../services/videoFeedManager';

let ExpoVideo: any = null;
let ResizeMode: any = { CONTAIN: 'contain', COVER: 'cover', STRETCH: 'stretch' };
try {
  const av = require('expo-av');
  ExpoVideo = av.Video;
  if (av.ResizeMode) ResizeMode = av.ResizeMode;
} catch {}

interface CustomVideoPlayerProps {
  url: string;
  poster?: string;
  aspectRatio?: number;
  maxHeight?: number;
  autoPlay?: boolean;
  loop?: boolean;
  borderRadius?: number;
  onEnded?: () => void;
}

const formatTime = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
};

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  url,
  poster,
  aspectRatio = 16 / 9,
  maxHeight = 440,
  autoPlay = false,
  loop = false,
  borderRadius = 12,
  onEnded,
}) => {
  const { colors } = useTheme();
  const videoRef = useRef<any>(null);
  const nativeVideoRef = useRef<any>(null);
  const containerRef = useRef<any>(null);
  const playerId = useRef(`vid_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`).current;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [detectedRatio, setDetectedRatio] = useState<number | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);

  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<any>(null);
  const [fadeIndicator, setFadeIndicator] = useState<'PLAY' | 'PAUSE' | null>(null);
  const fadeIndicatorAnim = useRef(new Animated.Value(0)).current;

  const triggerFadeIndicator = (type: 'PLAY' | 'PAUSE') => {
    setFadeIndicator(type);
    fadeIndicatorAnim.setValue(0.85);
    Animated.timing(fadeIndicatorAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => setFadeIndicator(null));
  };

  const handleOpenFullscreenChain = (e?: any) => {
    e?.stopPropagation?.();
    if (Platform.OS === 'web' && videoRef.current) {
      videoRef.current.pause();
    } else if (nativeVideoRef.current) {
      nativeVideoRef.current.pauseAsync?.().catch(() => {});
    }
    setIsPlaying(false);
    videoFeedManager.openChain(fullUrl);
  };

  const fullUrl = getFullMediaUrl(url);
  const hideTimerRef = useRef<any>(null);
  const feedbackTimerRef = useRef<any>(null);

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
      }
    }, 2800);
  }, [isPlaying]);

  const showControlsTemporarily = () => {
    setControlsVisible(true);
    scheduleHideControls();
  };

  const handleTogglePlay = (e?: any) => {
    e?.stopPropagation?.();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      activeVideoManager.pause(playerId);
      setControlsVisible(true);
      triggerFadeIndicator('PAUSE');
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      activeVideoManager.play(playerId, () => {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      });
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          triggerFadeIndicator('PLAY');
          scheduleHideControls();
        })
        .catch(() => {
          // If browser blocked unmuted autoplay, try muted
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current
              .play()
              .then(() => {
                setIsPlaying(true);
                triggerFadeIndicator('PLAY');
                scheduleHideControls();
              })
              .catch(() => setHasError(true));
          }
        });
    }
  };

  const handleVideoPress = (e?: any) => {
    e?.stopPropagation?.();
    const now = Date.now();
    const DOUBLE_TAP_GAP = 280;

    if (now - lastTapRef.current < DOUBLE_TAP_GAP) {
      // Double tap -> Open full video chain
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      handleOpenFullscreenChain(e);
    } else {
      lastTapRef.current = now;
      singleTapTimerRef.current = setTimeout(() => {
        handleTogglePlay();
        singleTapTimerRef.current = null;
      }, DOUBLE_TAP_GAP);
    }
  };

  const handleToggleMute = (e?: any) => {
    e?.stopPropagation?.();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    showControlsTemporarily();
  };

  // Skip ±10 seconds forward or backward with visual feedback badge
  const handleSkip = (seconds: number, e?: any) => {
    e?.stopPropagation?.();
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime || currentTime;
    const dur = duration || videoRef.current.duration || 0;
    const target = Math.max(0, Math.min(dur > 0 ? dur : 999999, cur + seconds));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    showControlsTemporarily();

    setSkipFeedback(seconds > 0 ? '+10s' : '-10s');
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setSkipFeedback(null), 700);
  };

  const handleSeek = (e: any) => {
    e?.stopPropagation?.();
    if (!videoRef.current || !duration) return;
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const targetTime = Math.max(0, Math.min(duration, (clickX / width) * duration));
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      showControlsTemporarily();
    } catch {}
  };

  const handleToggleFullscreen = (e?: any) => {
    e?.stopPropagation?.();
    if (Platform.OS !== 'web') return;
    try {
      const elem = containerRef.current;
      if (!elem) return;
      if (!document.fullscreenElement) {
        elem.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
      } else {
        document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
      }
    } catch {}
  };

  const handleRetry = () => {
    setHasError(false);
    setBuffering(true);
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Keyboard shortcuts for Web
  const handleKeyDown = (e: any) => {
    if (Platform.OS !== 'web') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleSkip(-10);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleSkip(10);
    } else if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      handleTogglePlay();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      handleToggleMute();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      handleToggleFullscreen();
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      if (typeof document !== 'undefined') {
        setIsFullscreen(!!document.fullscreenElement);
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', onFullscreenChange);
      return () => {
        document.removeEventListener('fullscreenchange', onFullscreenChange);
      };
    }
  }, []);

  useEffect(() => {
    return () => {
      activeVideoManager.unregister(playerId);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [playerId]);

  // Auto-pause when video is scrolled out of viewport (guarantees zero background/multi video playback)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    const elem = containerRef.current;
    if (!elem) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.25) {
            if (videoRef.current && !videoRef.current.paused) {
              videoRef.current.pause();
              setIsPlaying(false);
              activeVideoManager.pause(playerId);
            }
          }
        }
      },
      { threshold: [0, 0.25] }
    );

    observer.observe(elem);
    return () => observer.disconnect();
  }, [playerId]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  // Natural 9:16 vertical detection: clamps between 9:16 (0.5625) and 16:9 (1.777)
  const effectiveRatio = detectedRatio || aspectRatio;
  const isPortraitVideo = effectiveRatio < 0.85;
  const effectiveMaxHeight = isFullscreen ? '100%' : isPortraitVideo ? 560 : maxHeight;

  // Render on Web with custom custom HTML5 video engine
  if (Platform.OS === 'web') {
    return (
      <View
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={[
          styles.container,
          {
            aspectRatio: isFullscreen ? undefined : effectiveRatio,
            maxHeight: effectiveMaxHeight,
            borderRadius: isFullscreen ? 0 : borderRadius,
            backgroundColor: '#000000',
            outline: 'none',
          } as any,
        ]}
        onMouseEnter={() => setControlsVisible(true)}
        onMouseLeave={() => isPlaying && setControlsVisible(false)}
        onTouchStart={showControlsTemporarily}
      >
        <video
          ref={videoRef}
          src={fullUrl}
          poster={poster}
          playsInline
          loop={loop}
          autoPlay={autoPlay}
          muted={isMuted}
          controls={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            backgroundColor: '#000000',
            cursor: 'pointer',
          }}
          onClick={handleVideoPress}
          onPlay={() => {
            setIsPlaying(true);
            activeVideoManager.play(playerId, () => {
              if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
                setIsPlaying(false);
              }
            });
          }}
          onPause={() => {
            setIsPlaying(false);
            activeVideoManager.pause(playerId);
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              const dur = videoRef.current.duration || 0;
              setDuration(dur);
              const vw = videoRef.current.videoWidth;
              const vh = videoRef.current.videoHeight;
              if (vw > 0 && vh > 0) {
                const rawRatio = vw / vh;
                // Allow vertical reels (down to 9:16 = 0.5625) and landscape (up to 16:9 = 1.777)
                const clamped = Math.max(9 / 16, Math.min(16 / 9, rawRatio));
                setDetectedRatio(clamped);
              }
            }
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onError={() => {
            setBuffering(false);
            setHasError(true);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setControlsVisible(true);
            onEnded?.();
          }}
        />

        {/* Buffering Indicator */}
        {buffering && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}

        {/* Fast-Forward / Rewind Visual Splash Badge (low fade, no dark disc) */}
        {skipFeedback && (
          <View style={styles.skipFeedbackBadge} pointerEvents="none">
            <Text style={styles.skipFeedbackText}>{skipFeedback}</Text>
          </View>
        )}

        {/* Error Fallback with Retry */}
        {hasError && (
          <View style={styles.errorOverlay}>
            <AlertCircle size={32} color="#ef4444" style={{ marginBottom: 8 }} />
            <Text style={styles.errorText}>Video failed to play</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
              <RotateCcw size={14} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Subtle low-fade indicator on tap (fades away smoothly, preserving video clarity) */}
        {fadeIndicator && (
          <Animated.View
            pointerEvents="none"
            style={[styles.lowFadeIndicatorBox, { opacity: fadeIndicatorAnim }]}
          >
            {fadeIndicator === 'PAUSE' ? (
              <Pause size={30} color="rgba(255, 255, 255, 0.9)" fill="rgba(255, 255, 255, 0.9)" />
            ) : (
              <Play size={30} color="rgba(255, 255, 255, 0.9)" fill="rgba(255, 255, 255, 0.9)" style={{ marginLeft: 3 }} />
            )}
          </Animated.View>
        )}

        {/* Low-fade resting play button when paused (no ugly big black circle) */}
        {!isPlaying && !fadeIndicator && !buffering && !hasError && (
          <TouchableOpacity
            style={styles.lowFadeRestingPlayBtn}
            onPress={handleTogglePlay}
            activeOpacity={0.8}
            accessibilityLabel="Play video"
          >
            <Play size={22} color="rgba(255, 255, 255, 0.9)" fill="rgba(255, 255, 255, 0.9)" style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        )}

        {/* Bottom Controls Bar */}
        {controlsVisible && !hasError && (
          <View style={styles.bottomControlsBar}>
            {/* Scrubber Progress Bar */}
            <div
              onClick={handleSeek}
              style={{
                width: '100%',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                marginBottom: '4px',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  borderRadius: '2px',
                  position: 'relative',
                  overflow: 'visible',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    backgroundColor: '#ffffff',
                    borderRadius: '2px',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      right: '-5px',
                      top: '-4px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 0 6px rgba(0, 0, 0, 0.5)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Controls Row */}
            <View style={styles.controlsRow}>
              {/* Play / Pause Toggle */}
              <TouchableOpacity onPress={handleTogglePlay} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                {isPlaying ? (
                  <Pause size={17} color="#ffffff" fill="#ffffff" />
                ) : (
                  <Play size={17} color="#ffffff" fill="#ffffff" />
                )}
              </TouchableOpacity>

              {/* Rewind -10s */}
              <TouchableOpacity
                onPress={(e) => handleSkip(-10, e)}
                style={styles.skipBtn}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                accessibilityLabel="Rewind 10 seconds"
              >
                <RotateCcw size={15} color="#ffffff" />
                <Text style={styles.skipBtnText}>10s</Text>
              </TouchableOpacity>

              {/* Forward +10s */}
              <TouchableOpacity
                onPress={(e) => handleSkip(10, e)}
                style={styles.skipBtn}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                accessibilityLabel="Forward 10 seconds"
              >
                <RotateCw size={15} color="#ffffff" />
                <Text style={styles.skipBtnText}>10s</Text>
              </TouchableOpacity>

              {/* Mute / Unmute Toggle */}
              <TouchableOpacity onPress={handleToggleMute} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                {isMuted ? (
                  <VolumeX size={17} color="#ffffff" />
                ) : (
                  <Volume2 size={17} color="#ffffff" />
                )}
              </TouchableOpacity>

              {/* Time display: 0:14 / 1:20 */}
              <Text style={styles.timeText}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Native Mobile Hardware-Accelerated Video Player (Twitter/Instagram Inline Feed Experience)
  if (ExpoVideo) {
    const handleTogglePlayNative = async (e?: any) => {
      e?.stopPropagation?.();
      if (!nativeVideoRef.current) return;
      if (isPlaying) {
        await nativeVideoRef.current.pauseAsync().catch(() => {});
        setIsPlaying(false);
        activeVideoManager.pause(playerId);
        setControlsVisible(true);
        triggerFadeIndicator('PAUSE');
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      } else {
        activeVideoManager.play(playerId, () => {
          if (nativeVideoRef.current) {
            nativeVideoRef.current.pauseAsync().catch(() => {});
            setIsPlaying(false);
          }
        });
        await nativeVideoRef.current.playAsync().catch(() => setHasError(true));
        setIsPlaying(true);
        triggerFadeIndicator('PLAY');
        scheduleHideControls();
      }
    };

    const handleVideoPressNative = (e?: any) => {
      e?.stopPropagation?.();
      const now = Date.now();
      const DOUBLE_TAP_GAP = 280;

      if (now - lastTapRef.current < DOUBLE_TAP_GAP) {
        // Double tap -> Open full video chain viewer
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = 0;
        handleOpenFullscreenChain(e);
      } else {
        lastTapRef.current = now;
        singleTapTimerRef.current = setTimeout(() => {
          handleTogglePlayNative();
          singleTapTimerRef.current = null;
        }, DOUBLE_TAP_GAP);
      }
    };

    const handleToggleMuteNative = async (e?: any) => {
      e?.stopPropagation?.();
      if (!nativeVideoRef.current) return;
      const nextMuted = !isMuted;
      await nativeVideoRef.current.setIsMutedAsync(nextMuted).catch(() => {});
      setIsMuted(nextMuted);
      showControlsTemporarily();
    };

    const handleSkipNative = async (seconds: number, e?: any) => {
      e?.stopPropagation?.();
      if (!nativeVideoRef.current) return;
      const cur = currentTime || 0;
      const dur = duration || 999999;
      const targetSec = Math.max(0, Math.min(dur, cur + seconds));
      await nativeVideoRef.current.setPositionAsync(targetSec * 1000).catch(() => {});
      setCurrentTime(targetSec);
      showControlsTemporarily();
      setSkipFeedback(seconds > 0 ? '+10s' : '-10s');
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setSkipFeedback(null), 700);
    };

    const handleSeekNative = async (e: any) => {
      e?.stopPropagation?.();
      if (!nativeVideoRef.current || !duration) return;
      const locationX = e.nativeEvent?.locationX || 0;
      const pct = Math.max(0, Math.min(1, locationX / 300));
      const targetTime = pct * duration;
      await nativeVideoRef.current.setPositionAsync(targetTime * 1000).catch(() => {});
      setCurrentTime(targetTime);
      showControlsTemporarily();
    };

    const handleToggleFullscreenNative = async (e?: any) => {
      e?.stopPropagation?.();
      handleOpenFullscreenChain(e);
    };

    const handleRetryNative = async () => {
      setHasError(false);
      setBuffering(true);
      if (nativeVideoRef.current) {
        await nativeVideoRef.current.replayAsync().catch(() => {});
      }
    };

    return (
      <View
        ref={containerRef}
        style={[
          styles.container,
          {
            aspectRatio: isFullscreen ? undefined : effectiveRatio,
            maxHeight: effectiveMaxHeight,
            borderRadius: isFullscreen ? 0 : borderRadius,
            backgroundColor: '#000000',
          },
        ]}
      >
        <ExpoVideo
          ref={nativeVideoRef}
          source={{ uri: fullUrl }}
          posterSource={poster ? { uri: poster } : undefined}
          usePoster={Boolean(poster)}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={loop}
          isMuted={isMuted}
          shouldPlay={isPlaying}
          onPlaybackStatusUpdate={(status: any) => {
            if (!status || !status.isLoaded) {
              if (status?.error) setHasError(true);
              return;
            }
            setIsPlaying(status.isPlaying);
            setBuffering(status.isBuffering);
            if (status.durationMillis && status.durationMillis > 0) {
              setDuration(status.durationMillis / 1000);
            }
            if (typeof status.positionMillis === 'number') {
              setCurrentTime(status.positionMillis / 1000);
            }
            if (status.didJustFinish) {
              setIsPlaying(false);
              setControlsVisible(true);
              onEnded?.();
            }
          }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Tap video surface: single tap = toggle play/pause, double tap = open full video chain */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleVideoPressNative}
        />

        {/* Buffering Indicator */}
        {buffering && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}

        {/* Fast-Forward / Rewind Visual Splash Badge (low fade, no dark disc) */}
        {skipFeedback && (
          <View style={styles.skipFeedbackBadge} pointerEvents="none">
            <Text style={styles.skipFeedbackText}>{skipFeedback}</Text>
          </View>
        )}

        {/* Error Fallback with Retry */}
        {hasError && (
          <View style={styles.errorOverlay}>
            <AlertCircle size={32} color="#ef4444" style={{ marginBottom: 8 }} />
            <Text style={styles.errorText}>Video failed to play</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetryNative} activeOpacity={0.8}>
              <RotateCcw size={14} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Subtle low-fade indicator on tap (fades away smoothly, preserving video clarity) */}
        {fadeIndicator && (
          <Animated.View
            pointerEvents="none"
            style={[styles.lowFadeIndicatorBox, { opacity: fadeIndicatorAnim }]}
          >
            {fadeIndicator === 'PAUSE' ? (
              <Pause size={30} color="rgba(255, 255, 255, 0.9)" fill="rgba(255, 255, 255, 0.9)" />
            ) : (
              <Play size={30} color="rgba(255, 255, 255, 0.9)" fill="rgba(255, 255, 255, 0.9)" style={{ marginLeft: 3 }} />
            )}
          </Animated.View>
        )}

        {/* Low-fade resting play button when paused (no ugly big black circle) */}
        {!isPlaying && !fadeIndicator && !buffering && !hasError && (
          <TouchableOpacity
            style={styles.lowFadeRestingPlayBtn}
            onPress={handleTogglePlayNative}
            activeOpacity={0.8}
            accessibilityLabel="Play video"
          >
            <Play size={22} color="rgba(255, 255, 255, 0.9)" fill="rgba(255, 255, 255, 0.9)" style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        )}

        {/* Bottom Controls Bar */}
        {controlsVisible && !hasError && (
          <View style={styles.nativeBottomControlsBar}>
            {/* Scrubber Progress Bar */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleSeekNative}
              style={styles.nativeScrubberTrack}
            >
              <View style={styles.nativeScrubberBg}>
                <View
                  style={[
                    styles.nativeScrubberFill,
                    { width: `${progressPercent}%`, backgroundColor: colors.primary || '#6366F1' },
                  ]}
                >
                  <View style={styles.nativeScrubberThumb} />
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.controlsRow}>
              {/* Play / Pause small button */}
              <TouchableOpacity onPress={handleTogglePlayNative} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {isPlaying ? (
                  <Pause size={17} color="#ffffff" fill="#ffffff" />
                ) : (
                  <Play size={17} color="#ffffff" fill="#ffffff" />
                )}
              </TouchableOpacity>

              {/* Mute / Unmute Button */}
              <TouchableOpacity onPress={handleToggleMuteNative} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                {isMuted ? (
                  <VolumeX size={17} color="#ffffff" />
                ) : (
                  <Volume2 size={17} color="#ffffff" />
                )}
              </TouchableOpacity>

              {/* Time display: 0:14 / 1:20 */}
              <Text style={styles.timeText}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Native Mobile Fallback with High-Tech Deck Card (if expo-av not linked)
  return (
    <View
      style={[
        styles.container,
        {
          aspectRatio: effectiveRatio,
          maxHeight: effectiveMaxHeight,
          borderRadius,
          backgroundColor: '#090d16',
          borderColor: colors.cardBorder,
          borderWidth: 1,
        },
      ]}
    >
      <View style={styles.nativeVideoHero}>
        <Film size={36} color={colors.primary} style={{ marginBottom: 10 }} />
        <Text style={[styles.nativeTitle, { color: colors.textPrimary }]}>Campus Video Attachment</Text>
        <Text style={[styles.nativeSub, { color: colors.textMuted }]}>
          Tap below to play in native full-screen player
        </Text>
        <TouchableOpacity
          style={[styles.nativePlayBtn, { backgroundColor: colors.primary }]}
          onPress={() => Linking.openURL(fullUrl)}
          activeOpacity={0.85}
        >
          <Play size={18} color={colors.onPrimary} fill={colors.onPrimary} style={{ marginRight: 8 }} />
          <Text style={[styles.nativePlayBtnText, { color: colors.onPrimary }]}>Play Video</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 10,
  },
  skipFeedbackBadge: {
    position: 'absolute',
    top: '44%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    zIndex: 12,
  },
  skipFeedbackText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  lowFadeIndicatorBox: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 14,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}),
  } as any,
  lowFadeRestingPlayBtn: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)' } : {}),
  } as any,
  screenLevelOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    zIndex: 8,
  },
  screenSkipBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(6px)',
  } as any,
  screenSkipText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    marginTop: -2,
    fontVariant: ['tabular-nums'],
  },
  screenCenterPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(8px)',
  } as any,
  bigPlayButton: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  playIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}),
  } as any,
  bottomControlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 16,
    background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.85))',
    zIndex: 15,
  } as any,
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctrlBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  skipBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
    marginLeft: 2,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 20,
    zIndex: 20,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#404040',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  nativeVideoHero: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  nativeTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  nativeSub: {
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  nativePlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  nativePlayBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  nativeBottomControlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 15,
  },
  nativeScrubberTrack: {
    width: '100%',
    height: 18,
    justifyContent: 'center',
    marginBottom: 4,
  },
  nativeScrubberBg: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  nativeScrubberFill: {
    height: '100%',
    borderRadius: 2,
    position: 'relative',
  },
  nativeScrubberThumb: {
    position: 'absolute',
    right: -5,
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
});
