import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Film,
  AlertCircle,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { getFullMediaUrl } from '../../config/api';

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
  const { colors, isDark } = useTheme();
  const videoRef = useRef<any>(null);
  const containerRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fullUrl = getFullMediaUrl(url);
  const hideTimerRef = useRef<any>(null);

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
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          scheduleHideControls();
        })
        .catch(() => {
          // If browser blocked unmuted autoplay, try muted
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().then(() => {
              setIsPlaying(true);
              scheduleHideControls();
            }).catch(() => setHasError(true));
          }
        });
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
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Render on Web with custom custom HTML5 video engine
  if (Platform.OS === 'web') {
    return (
      <View
        ref={containerRef}
        style={[
          styles.container,
          {
            aspectRatio: isFullscreen ? undefined : aspectRatio,
            maxHeight: isFullscreen ? '100%' : maxHeight,
            borderRadius: isFullscreen ? 0 : borderRadius,
            backgroundColor: '#000000',
          },
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
          onClick={handleTogglePlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
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

        {/* Big Center Play Button (Shown when paused) */}
        {!isPlaying && !hasError && !buffering && (
          <TouchableOpacity
            style={styles.bigPlayButton}
            onPress={handleTogglePlay}
            activeOpacity={0.85}
            accessibilityLabel="Play video"
          >
            <View style={styles.playIconCircle}>
              <Play size={28} color="#ffffff" fill="#ffffff" style={{ marginLeft: 3 }} />
            </View>
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
                height: '14px',
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
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    backgroundColor: '#ffffff',
                    borderRadius: '2px',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
            </div>

            {/* Controls Row */}
            <View style={styles.controlsRow}>
              {/* Play / Pause Toggle */}
              <TouchableOpacity onPress={handleTogglePlay} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {isPlaying ? (
                  <Pause size={17} color="#ffffff" fill="#ffffff" />
                ) : (
                  <Play size={17} color="#ffffff" fill="#ffffff" />
                )}
              </TouchableOpacity>

              {/* Mute / Unmute Toggle */}
              <TouchableOpacity onPress={handleToggleMute} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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

              <View style={{ flex: 1 }} />

              {/* Fullscreen Button */}
              <TouchableOpacity onPress={handleToggleFullscreen} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {isFullscreen ? (
                  <Minimize2 size={16} color="#ffffff" />
                ) : (
                  <Maximize2 size={16} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Native Mobile Fallback with High-Tech Deck Card
  return (
    <View
      style={[
        styles.container,
        {
          aspectRatio,
          maxHeight,
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
    backdropFilter: 'blur(8px)',
  },
  bottomControlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 16,
    background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.8))',
    zIndex: 15,
  } as any,
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctrlBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
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
});
