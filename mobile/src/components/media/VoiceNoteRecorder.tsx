import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Trash2, Send, Check, X, Mic } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { StagedAttachment } from './AttachmentPickerModal';
import { AudioPlayerPill, formatAudioDuration, pauseAllActiveVoiceNotes } from './VoiceNotePlayer';

export interface RecordedVoiceNote extends StagedAttachment {
  displayName: string;
  durationSeconds: number;
}

const DEFAULT_LEVELS = Array.from({ length: 16 }, () => 0.18);

interface UseVoiceRecorderOptions {
  onFallbackNative?: () => void;
}

export const useVoiceRecorder = (options?: UseVoiceRecorderOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>(DEFAULT_LEVELS);

  const mediaRecorderRef = useRef<any>(null);
  const audioStreamRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);
  const recordTimerRef = useRef<any>(null);
  const analyserIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const stopLockRef = useRef<boolean>(false);

  const cleanupResources = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (analyserIntervalRef.current) {
      clearInterval(analyserIntervalRef.current);
      analyserIntervalRef.current = null;
    }
    if (audioStreamRef.current) {
      try {
        audioStreamRef.current.getTracks().forEach((t: any) => t.stop());
      } catch {}
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close?.();
      } catch {}
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.onstop = null;
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch {}
        mediaRecorderRef.current = null;
      }
      cleanupResources();
    };
  }, [cleanupResources]);

  const startRecording = useCallback(async (startOpts?: { suppressAlert?: boolean }) => {
    if (isRecording || stopLockRef.current) return false;

    if (
      Platform.OS !== 'web' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === 'undefined' ||
      !(window as any).MediaRecorder
    ) {
      if (options?.onFallbackNative) {
        options.onFallbackNative();
      } else if (!startOpts?.suppressAlert) {
        Alert.alert(
          'Voice Recording Unavailable',
          'Live microphone recording is supported in the browser. Use Attach Audio Note on native devices.'
        );
      }
      return false;
    }

    try {
      pauseAllActiveVoiceNotes();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      stopLockRef.current = false;

      let mimeType = 'audio/webm';
      const MR = (window as any).MediaRecorder;
      if (MR && typeof MR.isTypeSupported === 'function') {
        if (MR.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MR.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MR.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MR.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      // Live microphone waveform sampling via Web Audio AnalyserNode
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          audioContextRef.current = ctx;

          const dataArr = new Uint8Array(analyser.frequencyBinCount);
          analyserIntervalRef.current = setInterval(() => {
            analyser.getByteFrequencyData(dataArr);
            let sum = 0;
            for (let i = 0; i < Math.min(dataArr.length, 16); i++) {
              sum += dataArr[i];
            }
            const avg = sum / Math.min(dataArr.length, 16);
            const normalized = Math.max(0.16, Math.min(1, avg / 110));
            setLiveLevels((prev) => [...prev.slice(1), normalized]);
          }, 85);
        }
      } catch {
        // Gentle fallback animation if Web Audio API is blocked
        analyserIntervalRef.current = setInterval(() => {
          const rand = 0.25 + Math.random() * 0.65;
          setLiveLevels((prev) => [...prev.slice(1), rand]);
        }, 120);
      }

      startTimeRef.current = Date.now();
      recorder.start(100);
      setIsRecording(true);
      setIsFinalizing(false);
      setRecordSeconds(0);
      setLiveLevels(DEFAULT_LEVELS);

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 250);

      return true;
    } catch {
      cleanupResources();
      if (!startOpts?.suppressAlert) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('Please allow microphone access in your browser to record voice notes.');
        } else {
          Alert.alert('Microphone Access Needed', 'Please allow microphone access to record voice notes.');
        }
      }
      return false;
    }
  }, [isRecording, cleanupResources, options]);

  const stopRecording = useCallback(async (): Promise<RecordedVoiceNote | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || stopLockRef.current) return null;

    // Atomic lock prevents any duplicate trigger from double clicks or fast touches
    stopLockRef.current = true;
    mediaRecorderRef.current = null;
    setIsFinalizing(true);

    const elapsedSeconds = Math.max(
      1,
      Math.round((Date.now() - (startTimeRef.current || Date.now())) / 1000)
    );

    return new Promise((resolve) => {
      let settled = false;
      const finishResolve = (note: RecordedVoiceNote | null) => {
        if (settled) return;
        settled = true;
        cleanupResources();
        audioChunksRef.current = [];
        setIsRecording(false);
        setIsFinalizing(false);
        setRecordSeconds(0);
        setLiveLevels(DEFAULT_LEVELS);
        stopLockRef.current = false;
        resolve(note);
      };

      recorder.onstop = () => {
        try {
          const actualMime = recorder.mimeType || 'audio/webm';
          const ext = actualMime.includes('mp4')
            ? 'mp4'
            : actualMime.includes('ogg')
            ? 'ogg'
            : 'webm';
          const cleanMime = actualMime.split(';')[0] || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: cleanMime });

          if (!audioBlob || audioBlob.size === 0) {
            finishResolve(null);
            return;
          }

          const ts = Date.now();
          const fileName = `voice_note_${elapsedSeconds}s_${ts}.${ext}`;
          const audioUrl = URL.createObjectURL(audioBlob);
          const audioFile = new File([audioBlob], fileName, { type: cleanMime });

          const voiceNote: RecordedVoiceNote = {
            id: `temp_voice_${ts}`,
            uri: audioUrl,
            name: fileName,
            displayName: `Voice Note (${formatAudioDuration(elapsedSeconds)})`,
            durationSeconds: elapsedSeconds,
            size: audioBlob.size,
            sizeFormatted: `${Math.max(0.1, audioBlob.size / 1024).toFixed(1)} KB`,
            type: 'AUDIO',
            extension: ext,
            file: audioFile,
            mimeType: cleanMime,
          };
          finishResolve(voiceNote);
        } catch {
          finishResolve(null);
        }
      };

      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          finishResolve(null);
        }
      } catch {
        finishResolve(null);
      }
    });
  }, [cleanupResources]);

  const cancelRecording = useCallback(() => {
    stopLockRef.current = true;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      try {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {}
    }
    cleanupResources();
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsFinalizing(false);
    setRecordSeconds(0);
    setLiveLevels(DEFAULT_LEVELS);
    stopLockRef.current = false;
  }, [cleanupResources]);

  return {
    isRecording,
    isFinalizing,
    recordSeconds,
    liveLevels,
    startRecording,
    stopRecording,
    cancelRecording,
  };
};

interface VoiceRecordingBarProps {
  recordSeconds: number;
  liveLevels: number[];
  isFinalizing?: boolean;
  onCancel: () => void;
  onSend?: () => void;
  onAttachToDraft?: () => void;
  attachLabel?: string;
}

export const VoiceRecordingBar: React.FC<VoiceRecordingBarProps> = ({
  recordSeconds,
  liveLevels,
  isFinalizing = false,
  onCancel,
  onSend,
  onAttachToDraft,
  attachLabel,
}) => {
  const { colors, isDark } = useTheme();
  const [dotBright, setDotBright] = useState(true);
  const resolvedAttachLabel = attachLabel !== undefined ? attachLabel : 'Attach';

  useEffect(() => {
    const t = setInterval(() => setDotBright((d) => !d), 520);
    return () => clearInterval(t);
  }, []);

  return (
    <View
      style={[
        styles.barContainer,
        {
          backgroundColor: isDark ? '#141516' : '#f8fafc',
          borderColor: isDark ? 'rgba(94, 106, 210, 0.36)' : 'rgba(79, 70, 229, 0.28)',
        },
      ]}
    >
      <TouchableOpacity
        onPress={onCancel}
        disabled={isFinalizing}
        activeOpacity={0.75}
        style={[
          styles.trashBtn,
          {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(239, 68, 68, 0.1)',
          },
        ]}
        accessibilityLabel="Discard voice note"
      >
        <Trash2 size={16} color="#ef4444" />
      </TouchableOpacity>

      <View style={styles.waveWrapper}>
        <View style={styles.timerBadge}>
          <View
            style={[
              styles.liveDot,
              {
                backgroundColor: '#ef4444',
                opacity: dotBright ? 1 : 0.35,
              },
            ]}
          />
          <Text style={[styles.timerText, { color: colors.textPrimary }]}>
            {formatAudioDuration(recordSeconds)}
          </Text>
        </View>

        <View style={styles.liveBarsRow}>
          {liveLevels.map((lvl, idx) => (
            <View
              key={idx}
              style={[
                styles.liveBar,
                {
                  height: Math.max(4, Math.round(4 + lvl * 18)),
                  backgroundColor: lvl > 0.35 ? colors.primary : isDark ? '#34343a' : '#cbd5e1',
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.actionsRow}>
        {onAttachToDraft && (
          <TouchableOpacity
            onPress={onAttachToDraft}
            disabled={isFinalizing}
            activeOpacity={0.8}
            style={[
              styles.attachDraftBtn,
              {
                backgroundColor: isDark ? '#1f2022' : '#e2e8f0',
                borderColor: colors.cardBorder,
              },
            ]}
            accessibilityLabel="Stop and attach voice note so you can also type"
          >
            <Check size={14} color={colors.textPrimary} />
            {resolvedAttachLabel ? (
              <Text style={[styles.attachDraftText, { color: colors.textPrimary }]}>
                {resolvedAttachLabel}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}

        {onSend && (
          <TouchableOpacity
            onPress={onSend}
            disabled={isFinalizing}
            activeOpacity={0.85}
            style={[
              styles.sendCircleBtn,
              { backgroundColor: colors.primary },
              isFinalizing && { opacity: 0.6 },
            ]}
            accessibilityLabel="Send voice note"
          >
            {isFinalizing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Send size={15} color="#ffffff" />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

interface VoiceNoteDraftCardProps {
  voiceNote: RecordedVoiceNote;
  onRemove: () => void;
  compact?: boolean;
}

export const VoiceNoteDraftCard: React.FC<VoiceNoteDraftCardProps> = ({
  voiceNote,
  onRemove,
  compact = false,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.draftCard,
        compact && styles.draftCardCompact,
        {
          backgroundColor: isDark ? '#141516' : '#f8fafc',
          borderColor: isDark ? 'rgba(94, 106, 210, 0.32)' : 'rgba(79, 70, 229, 0.24)',
        },
      ]}
    >
      <View style={styles.draftHeaderRow}>
        <View style={styles.draftLabelGroup}>
          <Mic size={13} color={colors.primary} />
          <Text style={[styles.draftLabel, { color: colors.primary }]}>
            Voice Note Attached ({formatAudioDuration(voiceNote.durationSeconds)})
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.draftRemoveBtn, { backgroundColor: isDark ? '#23252a' : '#e2e8f0' }]}
          accessibilityLabel="Remove attached voice note"
        >
          <X size={13} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <AudioPlayerPill
        url={voiceNote.uri}
        fileName={voiceNote.name}
        durationHintSeconds={voiceNote.durationSeconds}
        variant="preview"
        compact={compact}
        borderless
      />
    </View>
  );
};

const styles = StyleSheet.create({
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    width: '100%',
  },
  trashBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  timerText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  liveBarsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 22,
    gap: 2,
    overflow: 'hidden',
  },
  liveBar: {
    flex: 1,
    maxWidth: 3,
    minWidth: 2,
    borderRadius: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  attachDraftText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sendCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  draftCardCompact: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
    marginBottom: 8,
  },
  draftHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  draftLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  draftLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  draftRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
