import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Play, Pause, Mic } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { AttachmentItem } from '../../services/chatService';
import { getFullMediaUrl } from '../../config/api';

// Global single-active audio coordinator so playing a new voice note pauses any previous one
let activePauseHandler: (() => void) | null = null;

export const pauseAllActiveVoiceNotes = () => {
  if (activePauseHandler) {
    try {
      activePauseHandler();
    } catch {}
    activePauseHandler = null;
  }
};

const registerActiveAudio = (pauseFn: () => void) => {
  if (activePauseHandler && activePauseHandler !== pauseFn) {
    try {
      activePauseHandler();
    } catch {}
  }
  activePauseHandler = pauseFn;
};

const unregisterActiveAudio = (pauseFn: () => void) => {
  if (activePauseHandler === pauseFn) {
    activePauseHandler = null;
  }
};

/**
 * Classifies and deduplicates attachments across Chat Messages, Discussions, and Replies.
 * Crucial fix: legacy `message.attachment` is ONLY used when `attachments` is empty so
 * messages with unified MediaAttachment records never render duplicate audio pills/media.
 */
export const splitMediaAttachments = (
  attachments?: AttachmentItem[] | null,
  legacyAttachment?: string | null,
  createdAt?: string
) => {
  const unified = Array.isArray(attachments) ? attachments : [];

  const legacyList: AttachmentItem[] =
    unified.length === 0 && legacyAttachment
      ? [
          (() => {
            const rawExt = (legacyAttachment.split('?')[0].split('.').pop() || '').toLowerCase();
            let inferredType: AttachmentItem['file_type'] = 'DOCUMENT';
            let mimeType = '';
            if (legacyAttachment.startsWith('data:image/') || /^(jpg|jpeg|png|webp|gif)$/i.test(rawExt)) {
              inferredType = 'IMAGE';
            } else if (/^(mp3|wav|m4a|aac|ogg|opus|webm)$/i.test(rawExt)) {
              inferredType = 'AUDIO';
              mimeType = rawExt === 'webm' ? 'audio/webm' : 'audio/mpeg';
            } else if (/^(mp4|mov|mkv|avi|m4v)$/i.test(rawExt)) {
              inferredType = 'VIDEO' as any;
              mimeType = 'video/mp4';
            }
            return {
              id: 'legacy',
              file_url: legacyAttachment,
              download_url: legacyAttachment,
              file_name: legacyAttachment.split('/').pop()?.split('?')[0] || 'Attachment',
              file_type: inferredType,
              file_extension: rawExt,
              mime_type: mimeType,
              file_size: 0,
              file_size_formatted: '',
              created_at: createdAt || '',
            };
          })(),
        ]
      : [];

  // Deduplicate by id or normalized URL so the same media never renders twice
  const seenKeys = new Set<string>();
  const allAttachments: AttachmentItem[] = [];
  for (const item of [...unified, ...legacyList]) {
    if (!item) continue;
    const key = item.id && item.id !== 'legacy' ? `id:${item.id}` : `url:${item.file_url || item.download_url}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    allAttachments.push(item);
  }

  const audioAttachments = allAttachments.filter((a) => {
    const typeUpper = (a.file_type || '').toUpperCase();
    const mimeLower = (a.mime_type || '').toLowerCase();
    const extLower = (a.file_extension || '').toLowerCase();
    const nameLower = (a.file_name || '').toLowerCase();
    const urlLower = (a.file_url || '').split('?')[0].toLowerCase();

    if (typeUpper === 'AUDIO') return true;
    if (mimeLower.startsWith('audio/')) return true;
    if (nameLower.includes('voice_note')) return true;
    if (/^(mp3|wav|m4a|aac|ogg|opus)$/.test(extLower)) return true;
    if (extLower === 'webm' && !mimeLower.startsWith('video/')) return true;
    if (/\.(mp3|wav|m4a|aac|ogg|opus)$/.test(urlLower)) return true;
    return false;
  });

  const audioSet = new Set(audioAttachments);

  const videoAttachments = allAttachments.filter((a) => {
    if (audioSet.has(a)) return false;
    const typeUpper = (a.file_type || '').toUpperCase();
    const mimeLower = (a.mime_type || '').toLowerCase();
    const extLower = (a.file_extension || '').toLowerCase();
    return (
      typeUpper === 'VIDEO' ||
      mimeLower.startsWith('video/') ||
      /^(mp4|mov|mkv|avi|m4v)$/.test(extLower) ||
      (extLower === 'webm' && mimeLower.startsWith('video/'))
    );
  });

  const videoSet = new Set(videoAttachments);

  const imageAttachments = allAttachments.filter(
    (a) => !audioSet.has(a) && !videoSet.has(a) && (a.file_type || '').toUpperCase() === 'IMAGE'
  );
  const docAttachments = allAttachments.filter(
    (a) => !audioSet.has(a) && !videoSet.has(a) && (a.file_type || '').toUpperCase() !== 'IMAGE'
  );

  return {
    allAttachments,
    audioAttachments,
    videoAttachments,
    imageAttachments,
    docAttachments,
  };
};

export const formatAudioDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const parseHintedDuration = (fileName?: string, caption?: string): number => {
  if (caption) {
    const capMatch = caption.match(/^(\d+):(\d{2})$/);
    if (capMatch) {
      return parseInt(capMatch[1], 10) * 60 + parseInt(capMatch[2], 10);
    }
  }
  if (!fileName) return 0;
  // Matches `voice_note_14s_...`
  const secMatch = fileName.match(/voice_note_(\d+)s_/i);
  if (secMatch) {
    return parseInt(secMatch[1], 10) || 0;
  }
  // Matches `Voice Note (0:14)`
  const parenMatch = fileName.match(/\((\d+):(\d{2})\)/);
  if (parenMatch) {
    return parseInt(parenMatch[1], 10) * 60 + parseInt(parenMatch[2], 10);
  }
  return 0;
};

const buildWaveformBars = (seedStr: string, count: number): number[] => {
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = Math.imul(hash ^ (i + 13), 1664525) + 1013904223;
    const rand = Math.abs(hash % 100) / 100;
    // Envelope creates a pleasing Instagram-like organic speech contour
    const envelope = 0.55 + 0.45 * Math.sin((i / (count - 1)) * Math.PI);
    const height = Math.round(7 + rand * 16 * envelope);
    bars.push(Math.max(6, Math.min(24, height)));
  }
  return bars;
};

export interface AudioPlayerPillProps {
  url: string;
  fileName?: string;
  caption?: string;
  durationHintSeconds?: number;
  isMe?: boolean;
  variant?: 'bubbleMe' | 'bubbleThem' | 'card' | 'preview';
  compact?: boolean;
  borderless?: boolean;
}

const SPEED_STEPS = [1, 1.5, 2] as const;

export const AudioPlayerPill: React.FC<AudioPlayerPillProps> = ({
  url,
  fileName,
  caption,
  durationHintSeconds,
  isMe = false,
  variant,
  compact = false,
  borderless = false,
}) => {
  const { colors, isDark } = useTheme();
  const fullUrl = getFullMediaUrl(url);
  const resolvedVariant = variant || (isMe ? 'bubbleMe' : 'bubbleThem');
  const isBubbleMe = resolvedVariant === 'bubbleMe';

  const hintedDuration = useMemo(
    () => durationHintSeconds || parseHintedDuration(fileName, caption),
    [durationHintSeconds, fileName, caption]
  );

  const barCount = compact ? 20 : 28;
  const waveformBars = useMemo(
    () => buildWaveformBars(`${fileName || ''}_${url}`, barCount),
    [fileName, url, barCount]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAudioError, setHasAudioError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(hintedDuration);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durationRef = useRef<number>(hintedDuration);

  const speed = SPEED_STEPS[speedIndex];

  const syncDuration = (nextDur: number) => {
    if (Number.isFinite(nextDur) && !Number.isNaN(nextDur) && nextDur > 0) {
      durationRef.current = nextDur;
      setDuration(nextDur);
    }
  };

  // Stable identity across renders so unregisterActiveAudio always cleans up on unmount
  const pauseHandlerRef = useRef<() => void>(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
    setIsPlaying(false);
  });
  const stablePauseRef = useRef<() => void>(() => pauseHandlerRef.current());

  useEffect(() => {
    setDuration((prev) => {
      const next = prev > 0 ? prev : hintedDuration;
      durationRef.current = next;
      return next;
    });
  }, [hintedDuration]);

  useEffect(() => {
    setHasAudioError(false);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsLoading(false);
    const stablePause = stablePauseRef.current;
    return () => {
      unregisterActiveAudio(stablePause);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = '';
        } catch {}
        audioRef.current = null;
      }
    };
  }, [fullUrl]);

  const ensureAudioElement = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !fullUrl) return null;
    if (audioRef.current && audioRef.current.src === fullUrl) {
      return audioRef.current;
    }

    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }

    const audio = new window.Audio(fullUrl);
    audio.preload = 'metadata';
    audio.playbackRate = speed;

    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && !Number.isNaN(audio.duration) && audio.duration > 0) {
        syncDuration(audio.duration);
      } else if (hintedDuration > 0 && durationRef.current <= 0) {
        syncDuration(hintedDuration);
      }
    });

    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration) && !Number.isNaN(audio.duration) && audio.duration > 0) {
        syncDuration(audio.duration);
      }
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime || 0);
      if (
        (!durationRef.current || !Number.isFinite(durationRef.current)) &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        syncDuration(audio.duration);
      }
    });

    audio.addEventListener('playing', () => {
      setHasAudioError(false);
      setIsLoading(false);
      setIsPlaying(true);
    });

    audio.addEventListener('waiting', () => {
      setIsLoading(true);
    });

    audio.addEventListener('pause', () => {
      setIsPlaying(false);
      setIsLoading(false);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setIsLoading(false);
      setCurrentTime(0);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        syncDuration(audio.duration);
      }
      unregisterActiveAudio(stablePauseRef.current);
    });

    audio.addEventListener('error', () => {
      setIsPlaying(false);
      setIsLoading(false);
      setHasAudioError(true);
      unregisterActiveAudio(stablePauseRef.current);
    });

    audioRef.current = audio;
    return audio;
  };

  const handleTogglePlay = async (e?: any) => {
    e?.stopPropagation?.();
    if (!fullUrl || hasAudioError) return;

    if (Platform.OS !== 'web') {
      Linking.openURL(fullUrl).catch(() => {
        Alert.alert('Cannot Play Voice Note', 'Unable to open this voice note URL.');
      });
      return;
    }

    const audio = ensureAudioElement();
    if (!audio) return;

    if (isPlaying || !audio.paused) {
      audio.pause();
      setIsPlaying(false);
      unregisterActiveAudio(stablePauseRef.current);
      return;
    }

    try {
      registerActiveAudio(stablePauseRef.current);
      setIsLoading(true);
      audio.playbackRate = speed;
      await audio.play();
      setIsPlaying(true);
      setIsLoading(false);
    } catch {
      setIsPlaying(false);
      setIsLoading(false);
      setHasAudioError(true);
      unregisterActiveAudio(stablePauseRef.current);
    }
  };

  const handleCycleSpeed = (e?: any) => {
    e?.stopPropagation?.();
    const nextIdx = (speedIndex + 1) % SPEED_STEPS.length;
    setSpeedIndex(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_STEPS[nextIdx];
    }
  };

  const handleSeek = (e: any) => {
    e?.stopPropagation?.();
    if (Platform.OS !== 'web' || hasAudioError) return;
    const audio = ensureAudioElement();
    if (!audio) return;

    const effectiveDur =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationRef.current;
    if (!effectiveDur || effectiveDur <= 0 || trackWidth <= 0) return;

    const locX = e?.nativeEvent?.locationX ?? e?.nativeEvent?.offsetX ?? 0;
    const ratio = Math.max(0, Math.min(1, locX / trackWidth));
    const targetTime = ratio * effectiveDur;
    try {
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
    } catch {}
  };

  const effectiveDuration = duration > 0 ? duration : hintedDuration;
  const progressRatio =
    effectiveDuration > 0 ? Math.max(0, Math.min(1, currentTime / effectiveDuration)) : 0;
  const activeBars = Math.round(progressRatio * waveformBars.length);

  // Palette anchored on Linear surface & indigo tokens
  const containerStyle = borderless
    ? {
        backgroundColor: 'transparent',
        borderWidth: 0,
        paddingHorizontal: 0,
        paddingVertical: 2,
      }
    : isBubbleMe
    ? {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.16)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.28)',
      }
    : resolvedVariant === 'card' || resolvedVariant === 'preview'
    ? {
        backgroundColor: isDark ? '#141516' : '#f1f5f9',
        borderColor: colors.cardBorder,
      }
    : {
        backgroundColor: isDark ? 'rgba(94, 106, 210, 0.10)' : 'rgba(79, 70, 229, 0.08)',
        borderColor: isDark ? 'rgba(94, 106, 210, 0.28)' : 'rgba(79, 70, 229, 0.22)',
      };

  const playCircleStyle = hasAudioError
    ? { backgroundColor: isDark ? '#23252a' : '#cbd5e1' }
    : isBubbleMe
    ? { backgroundColor: '#ffffff' }
    : { backgroundColor: colors.primary };

  const playIconColor = hasAudioError
    ? colors.textMuted
    : isBubbleMe
    ? isDark
      ? '#282d46'
      : '#4f46e5'
    : '#ffffff';
  const playedBarColor = isBubbleMe ? '#ffffff' : colors.primary;
  const unplayedBarColor = isBubbleMe
    ? 'rgba(255, 255, 255, 0.30)'
    : isDark
    ? 'rgba(208, 214, 224, 0.24)'
    : 'rgba(79, 70, 229, 0.22)';

  const timerColor = hasAudioError
    ? colors.danger
    : isBubbleMe
    ? 'rgba(255, 255, 255, 0.90)'
    : colors.textSecondary;
  const speedBg = isBubbleMe
    ? 'rgba(255, 255, 255, 0.16)'
    : isDark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(15, 23, 42, 0.06)';
  const speedTextColor = isBubbleMe ? '#ffffff' : speed !== 1 ? colors.primary : colors.textSecondary;

  const displayTime = hasAudioError
    ? 'Audio unavailable'
    : isPlaying || currentTime > 0
    ? formatAudioDuration(currentTime)
    : effectiveDuration > 0
    ? formatAudioDuration(effectiveDuration)
    : 'Voice Note';

  return (
    <View
      style={[
        styles.pillContainer,
        compact && styles.pillCompact,
        containerStyle,
      ]}
    >
      <TouchableOpacity
        onPress={handleTogglePlay}
        disabled={hasAudioError}
        activeOpacity={0.8}
        style={[styles.playButton, compact && styles.playButtonCompact, playCircleStyle]}
        accessibilityLabel={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={playIconColor} />
        ) : isPlaying ? (
          <Pause size={compact ? 14 : 15} color={playIconColor} fill={playIconColor} />
        ) : (
          <Play
            size={compact ? 14 : 15}
            color={playIconColor}
            fill={playIconColor}
            style={{ marginLeft: 2 }}
          />
        )}
      </TouchableOpacity>

      <View style={styles.centerColumn}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSeek}
          disabled={hasAudioError}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={styles.waveformTrack}
        >
          {waveformBars.map((barH, idx) => {
            const isPlayed = !hasAudioError && (idx < activeBars || (isPlaying && idx === activeBars));
            return (
              <View
                key={idx}
                style={[
                  styles.waveBar,
                  {
                    height: compact ? Math.max(5, Math.round(barH * 0.78)) : barH,
                    backgroundColor: isPlayed ? playedBarColor : unplayedBarColor,
                  },
                ]}
              />
            );
          })}
        </TouchableOpacity>

        <View style={styles.metaRow}>
          <View style={styles.micBadge}>
            <Mic size={10} color={timerColor} />
            <Text style={[styles.timerText, { color: timerColor }]} numberOfLines={1}>
              {displayTime}
            </Text>
          </View>

          {Platform.OS === 'web' && !hasAudioError && (
            <TouchableOpacity
              onPress={handleCycleSpeed}
              activeOpacity={0.75}
              style={[styles.speedPill, { backgroundColor: speedBg }]}
              accessibilityLabel="Toggle playback speed"
            >
              <Text style={[styles.speedText, { color: speedTextColor }]}>{speed}x</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 196,
    gap: 9,
  },
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 170,
    gap: 8,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  centerColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
  },
  waveformTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 24,
    gap: 2,
  },
  waveBar: {
    flex: 1,
    maxWidth: 3,
    minWidth: 2,
    borderRadius: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  micBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  speedPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  speedText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
