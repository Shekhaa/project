import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { communityService } from '../../services/communityService';
import { chatService } from '../../services/chatService';
import { Link2, Users, X, ArrowRight, CheckCircle2 } from 'lucide-react-native';

interface JoinByInviteModalProps {
  visible: boolean;
  onClose: () => void;
  onJoinedCommunity?: (slug: string) => void;
  onJoinedChat?: (conversation: any) => void;
}

export const JoinByInviteModal: React.FC<JoinByInviteModalProps> = ({
  visible,
  onClose,
  onJoinedCommunity,
  onJoinedChat,
}) => {
  const [inputText, setInputText] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [previewType, setPreviewType] = useState<'COMMUNITY' | 'CHAT'>('COMMUNITY');
  const [cleanCode, setCleanCode] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);

  const resetState = () => {
    setInputText('');
    setPreview(null);
    setCleanCode('');
    setLoadingPreview(false);
    setJoining(false);
  };

  const extractCodeAndType = (raw: string): { code: string; type: 'COMMUNITY' | 'CHAT' } => {
    const trimmed = raw.trim();
    if (trimmed.includes('/invite/g/') || trimmed.startsWith('g_')) {
      const parts = trimmed.split('/invite/g/');
      return { code: parts[parts.length - 1].replace(/\/$/, ''), type: 'CHAT' };
    }
    if (trimmed.includes('/invite/c/') || trimmed.startsWith('c_')) {
      const parts = trimmed.split('/invite/c/');
      return { code: parts[parts.length - 1].replace(/\/$/, ''), type: 'COMMUNITY' };
    }
    // Default fallback: if has slashes, get last segment
    const segments = trimmed.split('/');
    const code = segments[segments.length - 1];
    return { code, type: 'COMMUNITY' };
  };

  const handleLookup = async () => {
    if (!inputText.trim()) return;
    const { code, type } = extractCodeAndType(inputText);
    setCleanCode(code);
    setPreviewType(type);

    try {
      setLoadingPreview(true);
      if (type === 'COMMUNITY') {
        try {
          const res = await communityService.previewInvite(code);
          setPreview(res);
          return;
        } catch {
          // try chat if community failed
          const res = await chatService.previewInvite(code);
          setPreview(res);
          setPreviewType('CHAT');
          return;
        }
      } else {
        try {
          const res = await chatService.previewInvite(code);
          setPreview(res);
          return;
        } catch {
          const res = await communityService.previewInvite(code);
          setPreview(res);
          setPreviewType('COMMUNITY');
          return;
        }
      }
    } catch (e: any) {
      Alert.alert('Invalid Link', 'This invite link is invalid, expired, or has been reset.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleJoin = async () => {
    if (!cleanCode || joining) return;
    try {
      setJoining(true);
      if (previewType === 'COMMUNITY') {
        const res = await communityService.joinByInvite(cleanCode);
        onClose();
        resetState();
        Alert.alert('Joined! 🎉', `Welcome to ${res.community?.name || 'the community'}!`);
        if (onJoinedCommunity && res.community?.slug) {
          onJoinedCommunity(res.community.slug);
        }
      } else {
        const res = await chatService.joinByInvite(cleanCode);
        onClose();
        resetState();
        Alert.alert('Joined! 🎉', `You are now a member of ${res.conversation?.name || 'the group'}!`);
        if (onJoinedChat && res.conversation) {
          onJoinedChat(res.conversation);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not join group.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        onClose();
        resetState();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => {
              onClose();
              resetState();
            }}
            style={styles.closeBtn}
          >
            <X size={18} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Link2 size={24} color="#38bdf8" />
          </View>

          <Text style={styles.title}>Join via Invite Link</Text>
          <Text style={styles.subtitle}>
            Paste an invite link or code to join a campus community or group chat.
          </Text>

          {/* Input field */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Paste invite link or code..."
              placeholderTextColor="#64748b"
              value={inputText}
              onChangeText={(t) => {
                setInputText(t);
                setPreview(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.lookupBtn, (!inputText.trim() || loadingPreview) && styles.lookupBtnDisabled]}
              onPress={handleLookup}
              disabled={!inputText.trim() || loadingPreview}
            >
              {loadingPreview ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ArrowRight size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Group Preview Card */}
          {preview && (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View style={styles.groupAvatar}>
                  <Text style={styles.groupAvatarText}>
                    {(preview.name || 'G')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupMeta}>
                  <Text style={styles.groupName} numberOfLines={1}>
                    {preview.name}
                  </Text>
                  <Text style={styles.groupType}>
                    {previewType === 'COMMUNITY'
                      ? `${preview.community_type} Community`
                      : preview.is_ephemeral
                      ? `Temporary Group (${preview.duration})`
                      : 'Campus Group Chat'}
                  </Text>
                </View>
              </View>

              {preview.description ? (
                <Text style={styles.groupDesc} numberOfLines={2}>
                  {preview.description}
                </Text>
              ) : null}

              <View style={styles.statsRow}>
                <Users size={14} color="#94a3b8" />
                <Text style={styles.statsText}>{preview.members_count || 1} members</Text>
              </View>

              <TouchableOpacity
                style={styles.joinBtn}
                onPress={handleJoin}
                disabled={joining}
                activeOpacity={0.8}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.joinBtnText}>
                    {preview.is_already_member ? 'Open Group Chat' : 'Join Group'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    width: '100%',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 12,
  },
  lookupBtn: {
    backgroundColor: colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  lookupBtnDisabled: {
    opacity: 0.4,
  },
  previewCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#475569',
  },
  groupAvatarText: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '700',
  },
  groupMeta: {
    flex: 1,
  },
  groupName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  groupType: {
    color: '#38bdf8',
    fontSize: 12,
    marginTop: 2,
  },
  groupDesc: {
    color: '#cbd5e1',
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  statsText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
