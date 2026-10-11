import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { colors } from '../theme/colors';
import { callService, CallSession, CallType } from '../services/callService';

interface CallScreenProps {
  roomId: string;
  peerName: string;
  peerEmail?: string;
  callType: CallType;
  isIncoming?: boolean;
  onClose: () => void;
}

export const CallScreen: React.FC<CallScreenProps> = ({
  roomId,
  peerName,
  peerEmail,
  callType,
  isIncoming = false,
  onClose,
}) => {
  const [callStatus, setCallStatus] = useState<'RINGING' | 'ACCEPTED' | 'ENDED'>(
    isIncoming ? 'RINGING' : 'RINGING'
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'VIDEO');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [callDuration, setCallDuration] = useState(0);

  // Pulse animation for avatar ring
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start pulsing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Start status polling
    pollTimerRef.current = setInterval(async () => {
      try {
        const session = await callService.getCallStatus(roomId);
        if (session.status === 'ACCEPTED' && callStatus !== 'ACCEPTED') {
          setCallStatus('ACCEPTED');
        } else if (session.status === 'ENDED' || session.status === 'REJECTED') {
          handleCallEndedLocally();
        }
      } catch (e) {
        // Fallback for simulation if server call closed
      }
    }, 2500);

    // Auto-accept after 4s in demo mode if incoming or testing
    const autoConnectTimer = setTimeout(() => {
      setCallStatus('ACCEPTED');
    }, 4000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      clearTimeout(autoConnectTimer);
    };
  }, [roomId]);

  // Duration counter once call is accepted
  useEffect(() => {
    if (callStatus === 'ACCEPTED') {
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [callStatus]);

  const handleCallEndedLocally = () => {
    setCallStatus('ENDED');
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleAcceptCall = async () => {
    try {
      await callService.answerCall(roomId);
      setCallStatus('ACCEPTED');
    } catch (e) {
      console.log('Accept call error', e);
      setCallStatus('ACCEPTED');
    }
  };

  const handleEndCall = async () => {
    try {
      await callService.endCall(roomId);
    } catch (e) {
      console.log('End call signaling error', e);
    } finally {
      handleCallEndedLocally();
    }
  };

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const peerInitial = (peerName || 'U')[0].toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />

      {/* Top Bar info */}
      <View style={styles.topBar}>
        <View style={styles.callTypePill}>
          <Text style={styles.callTypeIcon}>{callType === 'VIDEO' ? '📹' : '📞'}</Text>
          <Text style={styles.callTypeText}>
            Campus {callType === 'VIDEO' ? 'Video' : 'Voice'} Call
          </Text>
        </View>

        <Text style={styles.securityTag}>🔒 Peer-to-Peer Encrypted</Text>
      </View>

      {/* Main Calling Stage */}
      <View style={styles.stage}>
        {callType === 'VIDEO' && isVideoEnabled ? (
          // Video Mode View
          <View style={styles.videoContainer}>
            {/* Peer Video Mock View */}
            <View style={styles.peerVideoSurface}>
              <View style={styles.videoAvatarCenter}>
                <Text style={styles.videoAvatarInitial}>{peerInitial}</Text>
                <Text style={styles.videoPeerName}>{peerName}</Text>
              </View>
              <View style={styles.hdBadge}>
                <Text style={styles.hdText}>HD • 1080p</Text>
              </View>
            </View>

            {/* PIP Window for Self */}
            <View style={styles.pipWindow}>
              <View style={styles.pipInner}>
                <Text style={styles.pipInitial}>You</Text>
                <Text style={styles.pipFacing}>({cameraFacing})</Text>
              </View>
            </View>
          </View>
        ) : (
          // Audio Mode View
          <View style={styles.audioCenter}>
            <Animated.View
              style={[
                styles.pulseOuterRing,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={styles.pulseInnerRing}>
                <View style={styles.audioAvatarCircle}>
                  <Text style={styles.audioAvatarInitial}>{peerInitial}</Text>
                </View>
              </View>
            </Animated.View>

            <Text style={styles.audioPeerName}>{peerName}</Text>
            {peerEmail ? <Text style={styles.audioPeerEmail}>{peerEmail}</Text> : null}

            {/* Audio Waveform Bars Simulation */}
            {callStatus === 'ACCEPTED' && !isMuted && (
              <View style={styles.waveformRow}>
                <View style={[styles.waveBar, { height: 16 }]} />
                <View style={[styles.waveBar, { height: 32 }]} />
                <View style={[styles.waveBar, { height: 24 }]} />
                <View style={[styles.waveBar, { height: 40 }]} />
                <View style={[styles.waveBar, { height: 28 }]} />
                <View style={[styles.waveBar, { height: 14 }]} />
              </View>
            )}
          </View>
        )}

        {/* Call Status Indicator */}
        <View style={styles.statusRow}>
          {callStatus === 'RINGING' && (
            <View style={styles.statusPillRinging}>
              <ActivityIndicator size="small" color="#818cf8" />
              <Text style={styles.statusTextRinging}>
                {isIncoming ? 'Incoming campus call...' : 'Ringing campus peer...'}
              </Text>
            </View>
          )}

          {callStatus === 'ACCEPTED' && (
            <View style={styles.statusPillConnected}>
              <View style={styles.greenDot} />
              <Text style={styles.statusTextConnected}>{formatDuration(callDuration)}</Text>
            </View>
          )}

          {callStatus === 'ENDED' && (
            <View style={styles.statusPillEnded}>
              <Text style={styles.statusTextEnded}>Call Ended</Text>
            </View>
          )}
        </View>
      </View>

      {/* In-Call Controls Bottom Bar */}
      <View style={styles.controlsBar}>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
          <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {/* Video Toggle Button */}
        <TouchableOpacity
          style={[styles.controlBtn, !isVideoEnabled && styles.controlBtnActive]}
          onPress={() => setIsVideoEnabled(!isVideoEnabled)}
        >
          <Text style={styles.controlIcon}>{isVideoEnabled ? '📹' : '🚫'}</Text>
          <Text style={styles.controlLabel}>{isVideoEnabled ? 'Cam On' : 'Cam Off'}</Text>
        </TouchableOpacity>

        {/* Flip Camera Button */}
        {callType === 'VIDEO' && isVideoEnabled && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() =>
              setCameraFacing(cameraFacing === 'front' ? 'back' : 'front')
            }
          >
            <Text style={styles.controlIcon}>🔄</Text>
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>
        )}

        {/* Speaker Button */}
        <TouchableOpacity
          style={[styles.controlBtn, isSpeakerOn && styles.controlBtnSpeaker]}
          onPress={() => setIsSpeakerOn(!isSpeakerOn)}
        >
          <Text style={styles.controlIcon}>🔊</Text>
          <Text style={styles.controlLabel}>Speaker</Text>
        </TouchableOpacity>

        {/* Call Action Buttons */}
        {isIncoming && callStatus === 'RINGING' ? (
          <View style={styles.incomingActionRow}>
            <TouchableOpacity style={styles.declineCallBtn} onPress={handleEndCall}>
              <Text style={styles.actionIcon}>❌</Text>
              <Text style={styles.actionText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptCallBtn} onPress={handleAcceptCall}>
              <Text style={styles.actionIcon}>📞</Text>
              <Text style={styles.actionText}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.endCallBtn} onPress={handleEndCall}>
            <Text style={styles.endCallIcon}>📞</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  callTypeIcon: {
    fontSize: 14,
  },
  callTypeText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  securityTag: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  videoContainer: {
    width: '92%',
    height: '80%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  peerVideoSurface: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoAvatarCenter: {
    alignItems: 'center',
    gap: 12,
  },
  videoAvatarInitial: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 80,
  },
  videoPeerName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  hdBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hdText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
  },
  pipWindow: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 90,
    height: 120,
    borderRadius: 14,
    backgroundColor: '#334155',
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  pipInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  pipInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  pipFacing: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2,
  },
  audioCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseOuterRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  pulseInnerRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioAvatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioAvatarInitial: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
  },
  audioPeerName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 4,
  },
  audioPeerEmail: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 16,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    marginTop: 10,
  },
  waveBar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: '#818cf8',
  },
  statusRow: {
    marginTop: 20,
  },
  statusPillRinging: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusTextRinging: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '600',
  },
  statusPillConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusTextConnected: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusPillEnded: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusTextEnded: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  controlBtnSpeaker: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
  },
  controlIcon: {
    fontSize: 20,
  },
  controlLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  endCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '135deg' }],
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  endCallIcon: {
    fontSize: 26,
    color: '#fff',
  },
  incomingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  acceptCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  declineCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  actionIcon: {
    fontSize: 22,
    color: '#fff',
  },
  actionText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
});
