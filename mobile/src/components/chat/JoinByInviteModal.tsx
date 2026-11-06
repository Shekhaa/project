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
import { useTheme } from '../../theme/ThemeContext';
import { communityService } from '../../services/communityService';
import { chatService } from '../../services/chatService';
import { Link2, Users, X, ArrowRight } from 'lucide-react-native';

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
  const { colors, isDark } = useTheme();
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
    const segments = trimmed.split('/');
    const code = segments[segments.length - 1];
    return { code, type: 'COMMUNITY' };
  };

  const handleLookup = async () => {
    if (!inputText.trim()) return;
    const { code, type } = extractCodeAndType(inputText);
    if (!code) {
      Alert.alert('Invalid Link', 'Please enter a valid invite link or code.');
      return;
    }

    setCleanCode(code);
    setPreviewType(type);
    setLoadingPreview(true);
    setPreview(null);

    try {
      if (type === 'COMMUNITY') {
        const data = await communityService.previewInvite(code);
        setPreview(data);
      } else {
        const data = await chatService.previewInvite(code);
        setPreview(data);
      }
    } catch (e: any) {
      Alert.alert('Not Found', e.response?.data?.error || 'Invalid or expired invite link.');
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
      <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <TouchableOpacity
            onPress={() => {
              onClose();
              resetState();
            }}
            style={styles.closeBtn}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(94, 106, 210, 0.2)' : 'rgba(79, 70, 229, 0.12)' }]}>
            <Link2 size={24} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>Join via Invite Link</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Paste an invite link or code to join a campus community or group chat.
          </Text>

          {/* Input field */}
          <View style={[styles.inputRow, { backgroundColor: isDark ? '#141516' : '#f1f5f9', borderColor: colors.cardBorder }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Paste invite link or code..."
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={(t) => {
                setInputText(t);
                setPreview(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.lookupBtn,
                { backgroundColor: colors.primary },
                (!inputText.trim() || loadingPreview) && styles.lookupBtnDisabled,
              ]}
              onPress={handleLookup}
              disabled={!inputText.trim() || loadingPreview}
            >
              {loadingPreview ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ArrowRight size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Preview result */}
          {preview && (
            <View
              style={[
                styles.previewCard,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={styles.previewHeader}>
                <View style={[styles.groupAvatar, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0', borderColor: colors.cardBorder }]}>
                  <Text style={[styles.groupAvatarText, { color: colors.primary }]}>
                    {(preview.name || 'G')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupMeta}>
                  <Text style={[styles.groupName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {preview.name}
                  </Text>
                  <Text style={[styles.groupType, { color: colors.primary }]}>
                    {previewType === 'COMMUNITY'
                      ? `${preview.community_type} Community`
                      : preview.is_ephemeral
                      ? `Temporary Group (${preview.duration})`
                      : 'Campus Group Chat'}
                  </Text>
                </View>
              </View>

              {preview.description ? (
                <Text style={[styles.groupDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {preview.description}
                </Text>
              ) : null}

              <View style={styles.statsRow}>
                <Users size={14} color={colors.textMuted} />
                <Text style={[styles.statsText, { color: colors.textMuted }]}>
                  {preview.members_count || 1} members
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.joinBtn, { backgroundColor: colors.primary }]}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 18,
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    width: '100%',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 12,
  },
  lookupBtn: {
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
    borderRadius: 14,
    padding: 16,
    width: '100%',
    borderWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  groupAvatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  groupMeta: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
  },
  groupType: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  groupDesc: {
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
    fontSize: 12,
  },
  joinBtn: {
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
