import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  Share,
} from 'react-native';
import { colors } from '../../theme/colors';
import { communityService } from '../../services/communityService';
import { chatService } from '../../services/chatService';
import { Link2, Copy, Share2, RotateCcw, X, Check, Users } from 'lucide-react-native';

interface InviteLinkModalProps {
  visible: boolean;
  title: string;
  type: 'COMMUNITY' | 'CHAT';
  targetIdOrSlug: string;
  canReset?: boolean;
  onClose: () => void;
}

export const InviteLinkModal: React.FC<InviteLinkModalProps> = ({
  visible,
  title,
  type,
  targetIdOrSlug,
  canReset = true,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible || !targetIdOrSlug) return;
    loadInviteLink();
  }, [visible, targetIdOrSlug]);

  const loadInviteLink = async () => {
    try {
      setLoading(true);
      if (type === 'COMMUNITY') {
        const data = await communityService.getInviteLink(targetIdOrSlug);
        setInviteUrl(data.invite_url);
        setInviteCode(data.invite_code);
      } else {
        const data = await chatService.getInviteLink(targetIdOrSlug);
        setInviteUrl(data.invite_url);
        setInviteCode(data.invite_code);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not load invite link.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteUrl) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    Alert.alert('Copied! 📋', 'Group invite link copied to clipboard.');
  };

  const handleShareLink = async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: `Join our group "${title}" on Campus Connect:\n${inviteUrl}`,
        url: inviteUrl,
        title: `Join ${title} on Campus Connect`,
      });
    } catch {
      // share canceled or failed silently
    }
  };

  const handleResetLink = () => {
    Alert.alert(
      'Reset Invite Link?',
      'Anyone who tries to use the previous link will no longer be able to join the group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Link',
          style: 'destructive',
          onPress: async () => {
            try {
              setResetting(true);
              if (type === 'COMMUNITY') {
                const data = await communityService.resetInviteLink(targetIdOrSlug);
                setInviteUrl(data.invite_url);
                setInviteCode(data.invite_code);
              } else {
                const data = await chatService.resetInviteLink(targetIdOrSlug);
                setInviteUrl(data.invite_url);
                setInviteCode(data.invite_code);
              }
              Alert.alert('Link Reset 🔄', 'A new invite link has been generated.');
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not reset link.');
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Close Button */}
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={18} color="#94a3b8" />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View style={styles.iconCircle}>
            <Link2 size={24} color="#38bdf8" />
          </View>

          {/* Heading */}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle}>
            Anyone with this link can join this {type === 'COMMUNITY' ? 'community' : 'group chat'} on Campus Connect.
          </Text>

          {/* Link Container */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={1}>
                {inviteUrl || `campusconnect.edu/invite/${inviteCode}`}
              </Text>
              <TouchableOpacity onPress={handleCopyLink} style={styles.inlineCopyBtn}>
                {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} color="#38bdf8" />}
              </TouchableOpacity>
            </View>
          )}

          {/* Instagram-style Action Items */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionRow} onPress={handleCopyLink} activeOpacity={0.7}>
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                {copied ? <Check size={18} color="#10b981" /> : <Copy size={18} color="#38bdf8" />}
              </View>
              <Text style={styles.actionText}>{copied ? 'Link Copied!' : 'Copy link'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={handleShareLink} activeOpacity={0.7}>
              <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Share2 size={18} color="#10b981" />
              </View>
              <Text style={styles.actionText}>Share link</Text>
            </TouchableOpacity>

            {canReset && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleResetLink}
                disabled={resetting}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  {resetting ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                  ) : (
                    <RotateCcw size={18} color="#ef4444" />
                  )}
                </View>
                <Text style={[styles.actionText, { color: '#ef4444' }]}>Reset link</Text>
              </TouchableOpacity>
            )}
          </View>
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
  loadingBox: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginBottom: 20,
  },
  linkText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  inlineCopyBtn: {
    padding: 4,
  },
  actionsContainer: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
