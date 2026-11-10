import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { X, Check, ShieldAlert, MessageSquare, Search, ShieldCheck } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { chatService, MessageRequestItem, Conversation } from '../../services/chatService';
import { UserAvatar } from '../common/UserAvatar';
import { showCrossPlatformAlert } from '../../utils/mediaUtils';

interface MessageRequestsModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onRequestCountChanged?: (newCount: number) => void;
}

export const MessageRequestsModal: React.FC<MessageRequestsModalProps> = ({
  visible,
  onClose,
  onOpenConversation,
  onRequestCountChanged,
}) => {
  const { colors: themeColors } = useTheme();
  const [requests, setRequests] = useState<MessageRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (visible) {
      loadRequests();
    }
  }, [visible]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await chatService.getMessageRequests();
      setRequests(res.results || []);
      if (onRequestCountChanged) {
        onRequestCountChanged(res.count || 0);
      }
    } catch (e: any) {
      console.log('Error loading message requests', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (req: MessageRequestItem) => {
    try {
      setProcessingId(req.id);
      const res = await chatService.acceptMessageRequest(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (onRequestCountChanged) {
        onRequestCountChanged(Math.max(0, requests.length - 1));
      }
      onClose();
      if (res.conversation) {
        onOpenConversation(res.conversation);
      }
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not accept message request.');
    } finally {
      setProcessingId(null);
    }
  };

  const executeDecline = async (req: MessageRequestItem) => {
    try {
      setProcessingId(req.id);
      await chatService.declineMessageRequest(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (onRequestCountChanged) {
        onRequestCountChanged(Math.max(0, requests.length - 1));
      }
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not decline request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (req: MessageRequestItem) => {
    const promptMsg = `Decline request from ${req.sender.full_name}? The sender won't know you declined.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`Decline Message Request\n\n${promptMsg}`)) {
        await executeDecline(req);
      }
      return;
    }

    Alert.alert('Decline Message Request', promptMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          executeDecline(req);
        },
      },
    ]);
  };

  const executeBlock = async (req: MessageRequestItem) => {
    try {
      setProcessingId(req.id);
      await chatService.blockMessageRequest(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (onRequestCountChanged) {
        onRequestCountChanged(Math.max(0, requests.length - 1));
      }
      showCrossPlatformAlert('User Blocked', `${req.sender.full_name} has been blocked.`);
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not block user.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBlock = async (req: MessageRequestItem) => {
    const promptMsg = `Are you sure you want to block ${req.sender.full_name}? They will not be able to message you or see your posts.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`Block Student\n\n${promptMsg}`)) {
        await executeBlock(req);
      }
      return;
    }

    Alert.alert('Block Student', promptMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          executeBlock(req);
        },
      },
    ]);
  };

  const filteredRequests = requests.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.sender.full_name.toLowerCase().includes(q) ||
      r.sender.username.toLowerCase().includes(q) ||
      r.initial_message.toLowerCase().includes(q)
    );
  });

  const renderItem = ({ item }: { item: MessageRequestItem }) => {
    const isBusy = processingId === item.id;

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: themeColors.surfaceLight, borderColor: themeColors.hairline },
        ]}
      >
        <View style={styles.cardTop}>
          <UserAvatar
            uri={item.sender.avatar}
            name={item.sender.full_name}
            size={44}
            style={{ marginRight: 12 }}
          />

          <View style={styles.infoCol}>
            <View style={styles.nameRow}>
              <Text style={[styles.senderName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                {item.sender.full_name}
              </Text>
              {item.sender.is_verified && (
                <ShieldCheck size={14} color="#38bdf8" style={{ marginLeft: 4 }} />
              )}
            </View>

            <Text style={[styles.subMeta, { color: themeColors.textSecondary }]} numberOfLines={1}>
              @{item.sender.username || 'student'} • {item.sender.college_name || 'Campus'}
            </Text>
          </View>
        </View>

        {/* Message Request Note - safe teaser without leaking prematurely */}
        <View
          style={[
            styles.messageBox,
            { backgroundColor: themeColors.surface, borderLeftColor: themeColors.primary },
          ]}
        >
          <Text style={[styles.messageRequestBadge, { color: themeColors.textPrimary }]}>
            ✉️ Sent you a message request
          </Text>
          <Text style={[styles.messageRequestHint, { color: themeColors.textSecondary }]}>
            Accept to unlock conversation, reveal initial message and reply.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.btn, styles.acceptBtn, { backgroundColor: themeColors.primary }]}
            onPress={() => handleAccept(item)}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Check size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.acceptBtnText}>Accept</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btn,
              styles.declineBtn,
              { backgroundColor: themeColors.surface, borderColor: themeColors.hairline },
            ]}
            onPress={() => handleDecline(item)}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            <Text style={[styles.declineBtnText, { color: themeColors.textSecondary }]}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btn,
              styles.blockBtn,
              { backgroundColor: themeColors.surface, borderColor: themeColors.hairline },
            ]}
            onPress={() => handleBlock(item)}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            <ShieldAlert size={14} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: themeColors.modalOverlay }]}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.cardBorder }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.title, { color: themeColors.textPrimary }]}>Message Requests</Text>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                Messages from students who aren't mutual connections
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: themeColors.surfaceLight, borderColor: themeColors.hairline },
              ]}
            >
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          {requests.length > 3 && (
            <View
              style={[
                styles.searchBar,
                { backgroundColor: themeColors.surfaceLight, borderColor: themeColors.hairline },
              ]}
            >
              <Search size={15} color={themeColors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.textPrimary }]}
                placeholder="Search requests..."
                placeholderTextColor={themeColors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          )}

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                Loading requests...
              </Text>
            </View>
          ) : filteredRequests.length === 0 ? (
            <View style={styles.centerBox}>
              <MessageSquare size={44} color={themeColors.textMuted} />
              <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>
                No Pending Requests
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.textMuted }]}>
                When someone who isn't connected messages you, their request appears here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredRequests}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  infoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  senderName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
  },
  subMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  messageBox: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  messageRequestBadge: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageRequestHint: {
    color: '#94a3b8',
    fontSize: 11.5,
    lineHeight: 16,
  },
  messageText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  acceptBtn: {
    flex: 2,
    backgroundColor: colors.primary,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  declineBtn: {
    flex: 1.5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  declineBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  blockBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 10,
  },
});
