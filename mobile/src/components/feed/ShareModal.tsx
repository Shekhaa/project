import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share as NativeShare,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { Post } from '../../services/postService';
import { chatService, Conversation } from '../../services/chatService';
import { authService } from '../../services/authService';
import { UserAvatar } from '../common/UserAvatar';
import { showCrossPlatformAlert } from '../../utils/mediaUtils';
import { X, Share2, Check, Search, User } from 'lucide-react-native';

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
  const { colors: themeColors, isDark } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryStudents, setDirectoryStudents] = useState<any[]>([]);
  const [searchingDirectory, setSearchingDirectory] = useState(false);

  // Slide-down gesture to dismiss (matching CommentsModal)
  const slideAnim = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.2,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) slideAnim.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.55) {
          Animated.timing(slideAnim, {
            toValue: 500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            slideAnim.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            bounciness: 6,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      loadInbox();
      setSearchQuery('');
      setDirectoryStudents([]);
    } else {
      setSentMap({});
      setSendingTo(null);
      setSearchQuery('');
      setDirectoryStudents([]);
    }
  }, [visible]);

  // Live campus directory search matching chat search functionality
  useEffect(() => {
    let isMounted = true;
    const trimmed = searchQuery.trim();

    if (trimmed.length >= 2) {
      setSearchingDirectory(true);
      const timer = setTimeout(async () => {
        try {
          const res: any = await authService.searchStudents(trimmed);
          if (isMounted) {
            const list = Array.isArray(res) ? res : res?.results || [];
            setDirectoryStudents(list);
          }
        } catch (e) {
          if (isMounted) setDirectoryStudents([]);
        } finally {
          if (isMounted) setSearchingDirectory(false);
        }
      }, 250);

      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    } else {
      setDirectoryStudents([]);
      setSearchingDirectory(false);
    }
  }, [searchQuery]);

  const loadInbox = async () => {
    try {
      setLoading(true);
      const data = await chatService.getInbox();
      setConversations(data.results || (Array.isArray(data) ? data : []));
    } catch (e) {
      console.log('Error loading inbox for share', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNativeShare = async () => {
    if (!post) return;
    try {
      const authorText = post.author_name || (post as any).mascot || 'Anonymous Peer';
      await NativeShare.share({
        title: 'Vike Post',
        message: `Check out this post on Vike by ${authorText}:\n"${post.content}"\n\nShared via Vike`,
      });
    } catch (e) {
      console.log('Share error', e);
    }
  };

  const buildPostCardPayload = () => {
    if (!post) return null;

    // Check if anonymous confession or standard post
    const isConfession =
      (post as any).is_confession ||
      (post as any).kind === 'CONFESSION' ||
      (post as any).mascot !== undefined;

    const authorDisplay =
      (post as any).mascot || post.author_name || 'Anonymous Student';

    // Extract video and media attachments for rich postcard rendering in chat
    const videoAttachment = (post.attachments || []).find(
      (a) => a.file_type === 'VIDEO' || a.mime_type?.startsWith('video/')
    );
    const videoUrl = videoAttachment
      ? videoAttachment.file_url
      : post.media_type === 'VIDEO'
      ? post.media_url
      : undefined;

    const imageAttachments = (post.attachments || []).filter(
      (a) => a.file_type === 'IMAGE' || a.mime_type?.startsWith('image/')
    );
    const mediaUrls =
      imageAttachments.length > 0
        ? imageAttachments.map((a) => a.file_url)
        : post.images && post.images.length > 0
        ? post.images.map((img) => img.image_url)
        : post.media_url
        ? [post.media_url]
        : [];

    const cardPayload = {
      kind: isConfession ? 'CONFESSION' : 'POST',
      id: post.id,
      author_name: authorDisplay,
      author_avatar: isConfession ? undefined : post.author_avatar,
      community_name: post.community_name,
      content: post.content,
      media_type: videoUrl ? 'VIDEO' : mediaUrls.length > 0 ? 'IMAGE' : post.media_type,
      media_url: videoUrl || (mediaUrls.length > 0 ? mediaUrls[0] : post.media_url),
      media_urls: mediaUrls,
      video_url: videoUrl,
      attachments: post.attachments || [],
      likes_count: post.likes_count,
      comments_count: post.comments_count,
    };

    return {
      cardPayload,
      shareMessage: `Check out this campus ${isConfession ? 'confession' : 'post'} by ${authorDisplay}:\n"${post.content.slice(0, 80)}..."\n[CAMPUS_POST_CARD:${JSON.stringify(cardPayload)}]`,
    };
  };

  const handleSendToChat = async (conv: Conversation) => {
    if (!post) return;
    try {
      setSendingTo(conv.id);
      const built = buildPostCardPayload();
      if (!built) return;

      await chatService.sendMessage(conv.id, built.shareMessage);
      setSentMap((prev) => ({ ...prev, [conv.id]: true }));
    } catch {
      showCrossPlatformAlert('Send Failed', 'Could not share post to this conversation.');
    } finally {
      setSendingTo(null);
    }
  };

  const handleSendToStudent = async (student: any) => {
    if (!post) return;
    const studentKey = `student_${student.id}`;
    try {
      setSendingTo(studentKey);
      const res: any = await chatService.startDirectChat(student.id);
      const convId = res?.id || res?.conversation_id || (typeof res === 'string' ? res : null);
      if (!convId) {
        throw new Error('Could not open conversation thread.');
      }

      const built = buildPostCardPayload();
      if (!built) return;

      await chatService.sendMessage(convId, built.shareMessage);
      setSentMap((prev) => ({ ...prev, [studentKey]: true, [convId]: true }));
    } catch {
      showCrossPlatformAlert('Send Failed', 'Could not share to this student.');
    } finally {
      setSendingTo(null);
    }
  };

  // Filter existing conversations based on search
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.name || c.recipient?.full_name || c.recipient?.email || '').toLowerCase();
    const username = (c.recipient?.username || '').toLowerCase();
    return name.includes(q) || username.includes(q);
  });

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const isSent = !!sentMap[item.id];
    const isSending = sendingTo === item.id;
    const name = item.name || item.recipient?.full_name || item.recipient?.email?.split('@')[0] || 'Campus Chat';

    return (
      <View style={[styles.convRow, { borderBottomColor: themeColors.hairline }]}>
        <UserAvatar
          uri={!item.is_group ? item.recipient?.avatar || item.recipient?.profile_picture : undefined}
          name={name}
          size={36}
          style={{ marginRight: 12 }}
        />

        <View style={styles.convInfo}>
          <Text style={[styles.convName, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.convSub, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {item.is_group ? '👥 Campus Group' : '💬 Direct Message'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.sendPill,
            { backgroundColor: themeColors.primary },
            isSent && styles.sendPillSuccess,
          ]}
          onPress={() => !isSent && handleSendToChat(item)}
          disabled={isSent || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={themeColors.onPrimary} />
          ) : isSent ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Check size={14} color="#fff" />
              <Text style={styles.sendPillText}>Sent</Text>
            </View>
          ) : (
            <Text style={[styles.sendPillText, { color: themeColors.onPrimary }]}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderStudentItem = (student: any) => {
    const studentKey = `student_${student.id}`;
    const isSent = !!sentMap[studentKey];
    const isSending = sendingTo === studentKey;
    const name = student.full_name || student.username || student.email?.split('@')[0] || 'Student';

    return (
      <View key={studentKey} style={[styles.convRow, { borderBottomColor: themeColors.hairline }]}>
        <UserAvatar
          uri={student.avatar || student.profile_picture}
          name={name}
          size={36}
          style={{ marginRight: 12 }}
        />

        <View style={styles.convInfo}>
          <Text style={[styles.convName, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.convSub, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {student.college_name || (student.course ? `${student.course}` : 'Campus Student')}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.sendPill,
            { backgroundColor: themeColors.primary },
            isSent && styles.sendPillSuccess,
          ]}
          onPress={() => !isSent && handleSendToStudent(student)}
          disabled={isSent || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={themeColors.onPrimary} />
          ) : isSent ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Check size={14} color="#fff" />
              <Text style={styles.sendPillText}>Sent</Text>
            </View>
          ) : (
            <Text style={[styles.sendPillText, { color: themeColors.onPrimary }]}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType={Platform.OS === 'web' ? 'none' : 'slide'} transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: themeColors.modalOverlay }]}>
        <TouchableOpacity style={styles.dismissOverlay} onPress={onClose} activeOpacity={1} />

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.cardBorder,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={{ width: '100%' }}>
            <View style={[styles.dragHandle, { backgroundColor: themeColors.hairline }]} />

            <View style={[styles.header, { borderBottomColor: themeColors.cardBorder }]}>
              <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Share Post</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Search Bar */}
          <View style={[styles.searchBar, { backgroundColor: themeColors.surfaceLight, borderColor: themeColors.cardBorder }]}>
            <Search size={16} color={themeColors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.textPrimary }]}
              placeholder="Search chats or campus students..."
              placeholderTextColor={themeColors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={themeColors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Native Share button */}
          <TouchableOpacity
            style={[
              styles.nativeShareBtn,
              { backgroundColor: themeColors.surfaceLight, borderColor: themeColors.cardBorder },
            ]}
            onPress={handleNativeShare}
          >
            <Share2 size={16} color={themeColors.primary} />
            <Text style={[styles.nativeShareText, { color: themeColors.textPrimary }]}>
              Share via other apps...
            </Text>
          </TouchableOpacity>

          {/* Content List */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              renderItem={renderConversationItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <>
                  {/* Live Campus Directory Search Results */}
                  {searchQuery.trim().length >= 2 && (
                    <View style={styles.sectionContainer}>
                      <View style={styles.sectionHeader}>
                        <User size={13} color={themeColors.primary} style={{ marginRight: 5 }} />
                        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                          Campus Students
                        </Text>
                        {searchingDirectory && (
                          <ActivityIndicator size="small" color={themeColors.primary} style={{ marginLeft: 8 }} />
                        )}
                      </View>
                      {directoryStudents.length > 0 ? (
                        directoryStudents.map(renderStudentItem)
                      ) : !searchingDirectory ? (
                        <Text style={[styles.emptySubText, { color: themeColors.textMuted }]}>
                          No students found matching "{searchQuery}".
                        </Text>
                      ) : null}
                    </View>
                  )}

                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                      {searchQuery.trim().length > 0 ? 'Matching Chats' : 'Recent Chats'}
                    </Text>
                  </View>
                </>
              }
              ListEmptyComponent={
                filteredConversations.length === 0 && searchQuery.trim().length === 0 ? (
                  <View style={styles.centerBox}>
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                      No recent chats found.
                    </Text>
                  </View>
                ) : filteredConversations.length === 0 && searchQuery.trim().length > 0 && directoryStudents.length === 0 && !searchingDirectory ? (
                  <View style={styles.centerBox}>
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                      No chats matching "{searchQuery}".
                    </Text>
                  </View>
                ) : null
              }
            />
          )}
        </Animated.View>
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
    height: '75%',
    maxHeight: 560,
  },
  dragHandle: {
    width: 36,
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
    paddingVertical: 10,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  nativeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  nativeShareText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionContainer: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptySubText: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  listContent: {
    paddingBottom: 24,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  convInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  convName: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  convSub: {
    fontSize: 11.5,
  },
  sendPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  sendPillSuccess: {
    backgroundColor: '#10b981',
  },
  sendPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  centerBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
});
