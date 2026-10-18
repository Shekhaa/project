import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import { chatService, Conversation, Message } from '../services/chatService';
import { api } from '../config/api';
import { MessageBubble, SharedPostCardData } from '../components/chat/MessageBubble';
import { SharedPostViewerModal } from '../components/chat/SharedPostViewerModal';
import { DirectorySearchModal } from '../components/chat/DirectorySearchModal';
import { EphemeralGroupModal } from '../components/chat/EphemeralGroupModal';
import {
  Search,
  Plus,
  Flame,
  ArrowLeft,
  Trash2,
  Send,
  X,
  MessageSquare,
  Users,
  Copy,
} from 'lucide-react-native';

interface ChatScreenProps {
  currentUser?: any;
  initialConversation?: Conversation | null;
  onClearInitialConversation?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  currentUser,
  initialConversation,
  onClearInitialConversation,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Search in Inbox
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryResults, setDirectoryResults] = useState<any[]>([]);
  const [searchingDirectory, setSearchingDirectory] = useState(false);

  // Modals
  const [directoryModalVisible, setDirectoryModalVisible] = useState(false);
  const [ephemeralModalVisible, setEphemeralModalVisible] = useState(false);
  const [selectedPostCard, setSelectedPostCard] = useState<SharedPostCardData | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // Initial load & Polling
  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (initialConversation) {
      setActiveConv(initialConversation);
      if (onClearInitialConversation) onClearInitialConversation();
    }
  }, [initialConversation]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
      const pollTimer = setInterval(() => {
        loadMessages(activeConv.id, true);
      }, 3500);
      return () => clearInterval(pollTimer);
    }
  }, [activeConv]);

  // Live Campus Directory search when typing in inbox search
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timer = setTimeout(async () => {
        try {
          setSearchingDirectory(true);
          const res = await api.get(`/authentication/users/search/?q=${encodeURIComponent(searchQuery.trim())}`);
          setDirectoryResults(res.data.results || res.data || []);
        } catch (e) {
        } finally {
          setSearchingDirectory(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setDirectoryResults([]);
    }
  }, [searchQuery]);

  const loadInbox = async () => {
    try {
      setLoadingInbox(true);
      const data = await chatService.getInbox();
      setConversations(data);
    } catch (e) {
      console.log('Error loading inbox', e);
    } finally {
      setLoadingInbox(false);
    }
  };

  const loadMessages = async (convId: string, isSilent = false) => {
    try {
      if (!isSilent) setLoadingMessages(true);
      const msgs = await chatService.getMessages(convId);
      setMessages(msgs);
    } catch (e) {
      console.log('Error loading messages', e);
    } finally {
      if (!isSilent) setLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeConv || !inputMessage.trim() || sending) return;
    const textToSend = inputMessage.trim();
    setInputMessage('');

    try {
      setSending(true);
      const sent = await chatService.sendMessage(activeConv.id, textToSend);
      setMessages((prev) => [...prev, sent]);
    } catch (e) {
      Alert.alert('Error', 'Could not deliver message.');
      setInputMessage(textToSend);
    } finally {
      setSending(false);
    }
  };

  const handleStartDirectChat = async (user: any) => {
    try {
      setDirectoryModalVisible(false);
      setSearchQuery('');
      setDirectoryResults([]);
      const conv = await chatService.startDirectChat(user.email || user.username || String(user.id));
      await loadInbox();
      setActiveConv(conv);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not start conversation.');
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteConversation(convId);
              if (activeConv?.id === convId) {
                setActiveConv(null);
              }
              setConversations((prev) => prev.filter((c) => c.id !== convId));
            } catch (e) {
              Alert.alert('Error', 'Could not delete conversation.');
            }
          },
        },
      ]
    );
  };

  const handleUnsendMessage = async (msg: Message) => {
    setActionMessage(null);
    try {
      await chatService.unsendMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not unsend message.');
    }
  };

  const handleDeleteForMe = async (msg: Message) => {
    setActionMessage(null);
    try {
      await chatService.deleteMessageForMe(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e) {
      Alert.alert('Error', 'Could not remove message.');
    }
  };

  const handleCopyMessage = (msg: Message) => {
    setActionMessage(null);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(msg.text);
    }
    Alert.alert('Copied', 'Message text copied to clipboard.');
  };

  const getFilteredConversations = () => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.name || c.recipient?.full_name || c.recipient?.email || '';
      return name.toLowerCase().includes(q);
    });
  };

  // ================= ROOM VIEW =================
  if (activeConv) {
    const roomTitle =
      activeConv.name ||
      activeConv.recipient?.full_name ||
      activeConv.recipient?.email?.split('@')[0] ||
      'Campus Chat';

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.roomContainer}
      >
        {/* Room Header */}
        <View style={styles.roomHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setActiveConv(null);
              loadInbox();
            }}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.roomAvatar}>
            <Text style={styles.roomAvatarText}>{roomTitle.charAt(0).toUpperCase()}</Text>
          </View>

          <View style={styles.roomMeta}>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {roomTitle}
            </Text>
            <Text style={styles.roomSubtitle}>
              {activeConv.is_ephemeral
                ? `🔥 Self-destructing (${activeConv.duration || 24}h)`
                : activeConv.is_group
                ? '👥 Campus Group'
                : '💬 Direct Message'}
            </Text>
          </View>

          {/* Delete chat button (Calling buttons removed!) */}
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => handleDeleteConversation(activeConv.id)}
          >
            <Trash2 size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* Message List */}
        {loadingMessages ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const isMe =
                currentUser &&
                (item.sender === currentUser.id ||
                  item.sender_email?.toLowerCase() === currentUser.email?.toLowerCase());

              return (
                <MessageBubble
                  message={item}
                  isMe={isMe}
                  isGroup={activeConv.is_group}
                  onPress={(m) => setActionMessage(m)}
                  onPostCardPress={(card) => setSelectedPostCard(card)}
                />
              );
            }}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Bottom Message Input Bar */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.textSecondary}
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Shared Post Viewer Modal */}
        <SharedPostViewerModal
          cardData={selectedPostCard}
          onClose={() => setSelectedPostCard(null)}
        />

        {/* Action Sheet Modal for Message */}
        {actionMessage && (
          <Modal transparent animationType="fade" visible={!!actionMessage} onRequestClose={() => setActionMessage(null)}>
            <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setActionMessage(null)}>
              <View style={styles.actionSheet}>
                {currentUser &&
                  (actionMessage.sender === currentUser.id ||
                    actionMessage.sender_email?.toLowerCase() === currentUser.email?.toLowerCase()) && (
                    <TouchableOpacity
                      style={styles.actionSheetItem}
                      onPress={() => handleUnsendMessage(actionMessage)}
                    >
                      <Trash2 size={18} color="#ef4444" />
                      <Text style={[styles.actionSheetText, { color: '#ef4444' }]}>Unsend for Everyone</Text>
                    </TouchableOpacity>
                  )}

                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => handleDeleteForMe(actionMessage)}
                >
                  <Trash2 size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Delete for Me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => handleCopyMessage(actionMessage)}
                >
                  <Copy size={18} color={colors.textSecondary} />
                  <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Copy Text</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </KeyboardAvoidingView>
    );
  }

  // ================= INBOX VIEW =================
  const filteredConvs = getFilteredConversations();

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.inboxHeader}>
        <Text style={styles.inboxTitle}>Campus Messages</Text>
        <View style={styles.headerBtnGroup}>
          <TouchableOpacity
            style={styles.ephemeralPill}
            onPress={() => setEphemeralModalVisible(true)}
            activeOpacity={0.8}
          >
            <Flame size={15} color="#fff" />
            <Text style={styles.ephemeralPillText}>Ephemeral</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => setDirectoryModalVisible(true)}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBar}>
        <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats or find classmates..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Live Campus Directory search section */}
      {searchQuery.trim().length >= 2 && (
        <View style={styles.directorySection}>
          <Text style={styles.sectionHeader}>🎓 Campus Directory Results</Text>
          {searchingDirectory ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 10 }} />
          ) : directoryResults.length === 0 ? (
            <Text style={styles.noResultsText}>No students matching "{searchQuery}"</Text>
          ) : (
            <FlatList
              data={directoryResults}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.directoryRow}
                  onPress={() => handleStartDirectChat(item)}
                >
                  <View style={styles.directoryAvatar}>
                    <Text style={styles.directoryAvatarText}>
                      {(item.full_name || item.email).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.directoryName}>{item.full_name || item.email}</Text>
                    <Text style={styles.directoryEmail}>{item.email}</Text>
                  </View>
                  <Text style={styles.startChatLink}>Chat 💬</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Active Conversations List */}
      {loadingInbox ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredConvs.length === 0 ? (
        <View style={styles.centerBox}>
          <MessageSquare size={40} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>
            Start a direct message with a batchmate or launch an ephemeral group!
          </Text>
          <TouchableOpacity
            style={styles.startChatCta}
            onPress={() => setDirectoryModalVisible(true)}
          >
            <Text style={styles.startChatCtaText}>Find Classmates</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConvs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const name =
              item.name ||
              item.recipient?.full_name ||
              item.recipient?.email?.split('@')[0] ||
              'Campus Student';

            return (
              <TouchableOpacity
                style={styles.convCard}
                onPress={() => setActiveConv(item)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.convAvatar,
                    item.is_ephemeral && styles.convAvatarEphemeral,
                  ]}
                >
                  <Text style={styles.convAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>

                <View style={styles.convBody}>
                  <View style={styles.convTopRow}>
                    <Text style={styles.convName} numberOfLines={1}>
                      {item.is_ephemeral ? `🔥 ${name}` : name}
                    </Text>
                    {item.last_message?.created_at && (
                      <Text style={styles.convTime}>
                        {new Date(item.last_message.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    )}
                  </View>

                  <View style={styles.convBottomRow}>
                    <Text style={styles.lastMsg} numberOfLines={1}>
                      {item.last_message?.text
                        ? item.last_message.text.includes('[CAMPUS_POST_CARD:')
                          ? '📎 Shared a post'
                          : item.last_message.text
                        : 'No messages yet'}
                    </Text>
                    {item.unread_count && item.unread_count > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.trashBtn}
                  onPress={() => handleDeleteConversation(item.id)}
                >
                  <Trash2 size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.convList}
        />
      )}

      {/* Directory Search Modal */}
      <DirectorySearchModal
        visible={directoryModalVisible}
        onClose={() => setDirectoryModalVisible(false)}
        onSelectUser={handleStartDirectChat}
      />

      {/* Ephemeral Group Modal */}
      <EphemeralGroupModal
        visible={ephemeralModalVisible}
        onClose={() => setEphemeralModalVisible(false)}
        onGroupCreated={(conv) => {
          loadInbox();
          setActiveConv(conv);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.surface,
  },
  inboxTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ephemeralPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ea580c',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
  },
  ephemeralPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  newChatBtn: {
    backgroundColor: colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  directorySection: {
    backgroundColor: colors.surface,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    maxHeight: 200,
  },
  sectionHeader: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  noResultsText: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingVertical: 6,
  },
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  directoryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  directoryAvatarText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
  },
  directoryName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  directoryEmail: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  startChatLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  convList: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  convAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  convAvatarEphemeral: {
    backgroundColor: '#7c2d12',
  },
  convAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  convBody: {
    flex: 1,
  },
  convTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convName: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  convTime: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  convBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  lastMsg: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  trashBtn: {
    padding: 6,
    marginLeft: 8,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  startChatCta: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  startChatCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  roomContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  roomAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  roomAvatarText: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '700',
  },
  roomMeta: {
    flex: 1,
  },
  roomTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  roomSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  headerActionBtn: {
    padding: 8,
  },
  messagesList: {
    paddingVertical: 12,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 90,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheet: {
    width: '80%',
    maxWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 8,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    gap: 12,
  },
  actionSheetText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
