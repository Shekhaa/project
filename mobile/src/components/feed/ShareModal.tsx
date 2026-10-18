import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share as NativeShare,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { Post } from '../../services/postService';
import { chatService, Conversation } from '../../services/chatService';
import { X, Send, Share2, Check } from 'lucide-react-native';

interface ShareModalProps {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  visible,
  post,
  onClose,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      loadInbox();
    } else {
      setSentMap({});
      setSendingTo(null);
    }
  }, [visible]);

  const loadInbox = async () => {
    try {
      setLoading(true);
      const data = await chatService.getInbox();
      setConversations(data);
    } catch (e) {
      console.log('Error loading inbox for share', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNativeShare = async () => {
    if (!post) return;
    try {
      await NativeShare.share({
        title: 'Campus Connect Post',
        message: `Check out this campus post by ${post.author_name}:\n"${post.content}"\n\nShared via Campus Connect`,
      });
    } catch (e) {
      console.log('Share error', e);
    }
  };

  const handleSendToChat = async (conv: Conversation) => {
    if (!post) return;
    try {
      setSendingTo(conv.id);

      // Create structured CAMPUS_POST_CARD payload
      const cardPayload = {
        id: post.id,
        author_name: post.author_name,
        community_name: post.community_name,
        content: post.content,
        media_type: post.media_type,
        media_url: post.media_url,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
      };

      const shareMessage = `Check out this campus post by ${post.author_name}:\n"${post.content.slice(0, 80)}..."\n[CAMPUS_POST_CARD:${JSON.stringify(cardPayload)}]`;

      await chatService.sendMessage(conv.id, shareMessage);
      setSentMap((prev) => ({ ...prev, [conv.id]: true }));
    } catch (e) {
      Alert.alert('Send Failed', 'Could not share post to this conversation.');
    } finally {
      setSendingTo(null);
    }
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const isSent = !!sentMap[item.id];
    const isSending = sendingTo === item.id;
    const name = item.name || item.recipient?.full_name || item.recipient?.email?.split('@')[0] || 'Campus Chat';

    return (
      <View style={styles.convRow}>
        <View style={styles.convAvatar}>
          <Text style={styles.convAvatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.convInfo}>
          <Text style={styles.convName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.convSub} numberOfLines={1}>
            {item.is_group ? '👥 Campus Group' : '💬 Direct Message'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.sendPill, isSent && styles.sendPillSuccess]}
          onPress={() => !isSent && handleSendToChat(item)}
          disabled={isSent || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : isSent ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Check size={14} color="#fff" />
              <Text style={styles.sendPillText}>Sent</Text>
            </View>
          ) : (
            <Text style={styles.sendPillText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissOverlay} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheetContainer}>
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Share Post</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Native Share button */}
          <TouchableOpacity style={styles.nativeShareBtn} onPress={handleNativeShare}>
            <Share2 size={18} color="#fff" />
            <Text style={styles.nativeShareText}>Share via other apps...</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Send via Campus Connect</Text>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>No recent chats found.</Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={renderConversationItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    height: '65%',
    maxHeight: 520,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  nativeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  nativeShareText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  convAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  convAvatarText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  convInfo: {
    flex: 1,
  },
  convName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  convSub: {
    color: colors.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
  },
  sendPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  sendPillSuccess: {
    backgroundColor: '#10b981',
  },
  sendPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
