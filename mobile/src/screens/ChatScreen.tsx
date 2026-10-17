import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { chatService, Conversation, Message } from '../services/chatService';
import { api } from '../config/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatScreenProps {
  currentUser?: any;
  initialConversation?: Conversation | null;
  onClearInitialConversation?: () => void;
  onStartCall?: (receiverId: number, receiverName: string, callType: 'AUDIO' | 'VIDEO') => void;
}

interface SearchUser {
  id: number;
  full_name: string;
  email: string;
  username?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns 'HH:MM' for today's messages, or day abbreviation ('Mon') for older ones. */
const formatCardTime = (isoString?: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { weekday: 'short' });
};

/** Returns a colour deterministically based on a string (for avatar circles). */
const avatarColor = (name: string): string => {
  const palette = [
    '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
};

const initial = (name: string): string => (name ? name.trim()[0].toUpperCase() : '?');

const getConvTitle = (item: Conversation): string => {
  if (item.name) return item.name;
  if (item.recipient) {
    return item.recipient.full_name || item.recipient.username || item.recipient.email;
  }
  return 'Campus Chat';
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const ChatScreen: React.FC<ChatScreenProps> = ({
  currentUser,
  initialConversation,
  onClearInitialConversation,
  onStartCall,
}) => {
  // ── Inbox State ──────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');

  // ── Active Chat Room State ────────────────────────────────────────────────
  const [activeConv, setActiveConv] = useState<Conversation | null>(initialConversation || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList<Message>>(null);

  // ── Ephemeral Group Modal State ───────────────────────────────────────────
  const [ephemeralModalVisible, setEphemeralModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [purposeTag, setPurposeTag] = useState('Trip');
  const [duration, setDuration] = useState<'10_MIN' | '1_HOUR' | '12_HOURS' | '24_HOURS'>('24_HOURS');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── Direct Chat Modal State ───────────────────────────────────────────────
  const [directModalVisible, setDirectModalVisible] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const userSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (initialConversation) {
      setActiveConv(initialConversation);
      onClearInitialConversation?.();
    }
  }, [initialConversation]);

  useEffect(() => {
    setLoading(true);
    loadInbox().finally(() => setLoading(false));
  }, []);

  // Poll messages when a conversation is open
  useEffect(() => {
    if (!activeConv) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    loadMessages(activeConv.id);

    pollIntervalRef.current = setInterval(() => {
      loadMessages(activeConv.id, true);
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeConv]);

  // Debounced user search inside Direct Chat modal
  useEffect(() => {
    if (userSearchDebounceRef.current) clearTimeout(userSearchDebounceRef.current);

    if (!userQuery.trim()) {
      setUserResults([]);
      return;
    }

    userSearchDebounceRef.current = setTimeout(() => {
      searchUsers(userQuery.trim());
    }, 300);

    return () => {
      if (userSearchDebounceRef.current) clearTimeout(userSearchDebounceRef.current);
    };
  }, [userQuery]);

  // ─────────────────────────────────────────────────────────────────────────
  // Inbox
  // ─────────────────────────────────────────────────────────────────────────

  const loadInbox = async () => {
    try {
      const data = await chatService.getInbox();
      setConversations(data);
    } catch (e) {
      console.log('Error loading inbox', e);
    }
  };

  /** Client-side fuzzy filter of conversations by name/email. */
  const filteredConversations = inboxSearch.trim()
    ? conversations.filter((c) => {
        const query = inboxSearch.toLowerCase();
        const title = getConvTitle(c).toLowerCase();
        const email = c.recipient?.email?.toLowerCase() ?? '';
        return title.includes(query) || email.includes(query);
      })
    : conversations;

  // ─────────────────────────────────────────────────────────────────────────
  // Messages
  // ─────────────────────────────────────────────────────────────────────────

  const loadMessages = async (convId: string, isSilent = false) => {
    try {
      const msgs = await chatService.getMessages(convId);
      setMessages(msgs);
    } catch (e) {
      if (!isSilent) console.log('Error fetching messages', e);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeConv || sending) return;

    const textToSend = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const newMsg = await chatService.sendMessage(activeConv.id, textToSend);
      setMessages((prev) => [...prev, newMsg]);
      // Scroll to bottom
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert('Send Failed', e.response?.data?.error || 'Message could not be delivered.');
    } finally {
      setSending(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // User search (Direct Chat modal)
  // ─────────────────────────────────────────────────────────────────────────

  const searchUsers = async (q: string) => {
    setSearchingUsers(true);
    try {
      const response = await api.get<any>(`/authentication/users/search/?q=${encodeURIComponent(q)}`);
      const data = response.data;
      if (data && Array.isArray(data.results)) {
        setUserResults(data.results);
      } else if (Array.isArray(data)) {
        setUserResults(data);
      } else {
        setUserResults([]);
      }
    } catch (e) {
      console.log('User search error', e);
      setUserResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  /** Start a 1-to-1 chat with a search result user (by email as identifier). */
  const handleSelectSearchUser = async (user: SearchUser) => {
    setStartingChat(true);
    try {
      const conv = await chatService.startDirectChat(user.email);
      setDirectModalVisible(false);
      setUserQuery('');
      setUserResults([]);
      await loadInbox();
      setActiveConv(conv);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not start chat.');
    } finally {
      setStartingChat(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Ephemeral Group
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateEphemeral = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group title.');
      return;
    }

    setCreatingGroup(true);
    try {
      const conv = await chatService.createEphemeralGroup({
        name: groupName.trim(),
        purpose_tag: purposeTag,
        duration,
      });
      setEphemeralModalVisible(false);
      setGroupName('');
      await loadInbox();
      setActiveConv(conv);
      Alert.alert(
        'Temporary Hangout Created! 🔥',
        `This group will automatically self-destruct in ${duration.replace('_', ' ').toLowerCase()}.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Active Chat Room
  // ─────────────────────────────────────────────────────────────────────────

  if (activeConv) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.chatRoomContainer}
      >
        {/* Chat Room Top Bar */}
        <View style={styles.roomHeader}>
          {/* ← Back Button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setActiveConv(null);
              loadInbox();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <View style={styles.roomHeaderTitleCol}>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {getConvTitle(activeConv)}
            </Text>
            {activeConv.is_ephemeral && (
              <Text style={styles.roomSubtitle}>
                🔥 Self-destructs after {activeConv.duration?.replace('_', ' ')}
              </Text>
            )}
          </View>

          {/* Call buttons for direct chats */}
          {!activeConv.is_group && activeConv.recipient && onStartCall && (
            <View style={styles.roomCallActions}>
              <TouchableOpacity
                style={styles.roomCallBtn}
                onPress={() =>
                  onStartCall(
                    activeConv.recipient!.id,
                    activeConv.recipient!.full_name || activeConv.recipient!.username || 'Student',
                    'AUDIO'
                  )
                }
              >
                <Text style={styles.roomCallIcon}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.roomCallBtn}
                onPress={() =>
                  onStartCall(
                    activeConv.recipient!.id,
                    activeConv.recipient!.full_name || activeConv.recipient!.username || 'Student',
                    'VIDEO'
                  )
                }
              >
                <Text style={styles.roomCallIcon}>📹</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Message Bubble List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe: boolean = currentUser
              ? item.sender === currentUser.id ||
                (item.sender_email?.toLowerCase() === currentUser.email?.toLowerCase())
              : false;

            const senderName = item.sender_name || 'Campus Student';
            const senderInitial = initial(senderName);
            const senderAvatarBg = avatarColor(senderName);

            return (
              <View
                style={[
                  styles.messageBubbleWrapper,
                  isMe ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
                ]}
              >
                {!isMe && (
                  <View style={styles.senderRow}>
                    {/* Colored initials avatar */}
                    <View style={[styles.senderAvatar, { backgroundColor: senderAvatarBg }]}>
                      <Text style={styles.senderAvatarText}>{senderInitial}</Text>
                    </View>
                    <Text style={styles.senderHeaderName}>{senderName}</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    isMe ? styles.bubbleRight : styles.bubbleLeft,
                    !isMe && { marginLeft: 32 }, // indent to align under avatar
                  ]}
                >
                  <Text style={[styles.messageText, isMe && styles.messageTextRight]}>
                    {item.text}
                  </Text>
                  <Text style={[styles.messageTime, isMe && styles.messageTimeRight]}>
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesIcon}>💬</Text>
              <Text style={styles.emptyMessagesText}>
                No messages yet. Say hello to start the chat!
              </Text>
            </View>
          }
        />

        {/* Chat Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            value={messageText}
            onChangeText={setMessageText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Main Chat Inbox
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>Direct Chats & Temporary Hangouts</Text>
        </View>

        <View style={styles.headerButtonsRow}>
          {/* Notification Bell */}
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => Alert.alert('Notifications', 'Coming soon! 🔔')}
          >
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.directBtn}
            onPress={() => {
              setUserQuery('');
              setUserResults([]);
              setDirectModalVisible(true);
            }}
          >
            <Text style={styles.directBtnText}>+ Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ephemeralBtn}
            onPress={() => setEphemeralModalVisible(true)}
          >
            <Text style={styles.ephemeralBtnText}>🔥 Temp</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Instagram-style Search Bar ─────────────────────────────────── */}
      <View style={styles.searchBarWrapper}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchBar}
          placeholder="Search chats..."
          placeholderTextColor={colors.textMuted}
          value={inboxSearch}
          onChangeText={setInboxSearch}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>

      {/* ── Conversation List ───────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const unread = (item.unread_count ?? 0) > 0;
            const lastTime = formatCardTime(item.last_message?.created_at ?? item.updated_at);

            return (
              <TouchableOpacity
                style={styles.chatCard}
                onPress={() => setActiveConv(item)}
                activeOpacity={0.75}
              >
                {/* Avatar */}
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.is_ephemeral ? '🔥' : item.is_group ? '👥' : '💬'}
                  </Text>
                </View>

                {/* Info */}
                <View style={styles.chatInfo}>
                  <View style={styles.chatHeaderRow}>
                    <Text
                      style={[styles.chatTitle, unread && styles.chatTitleUnread]}
                      numberOfLines={1}
                    >
                      {getConvTitle(item)}
                    </Text>

                    <View style={styles.chatMeta}>
                      {lastTime ? (
                        <Text style={styles.chatTime}>{lastTime}</Text>
                      ) : null}

                      {item.is_ephemeral && (
                        <View style={styles.ephemeralBadge}>
                          <Text style={styles.ephemeralBadgeText}>
                            ⏳ {item.duration?.replace('_', ' ') || 'TEMP'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.chatBottomRow}>
                    <Text
                      style={[styles.lastMsg, unread && styles.lastMsgUnread]}
                      numberOfLines={1}
                    >
                      {item.last_message?.text || 'Tap to open chat...'}
                    </Text>

                    {/* Unread count badge */}
                    {unread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {(item.unread_count ?? 0) > 99 ? '99+' : item.unread_count}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyInbox}>
              <Text style={styles.emptyInboxIcon}>{inboxSearch ? '🔎' : '📬'}</Text>
              <Text style={styles.emptyInboxTitle}>
                {inboxSearch ? 'No chats found' : 'No Active Chats Yet'}
              </Text>
              <Text style={styles.emptyInboxSubtitle}>
                {inboxSearch
                  ? `No conversations match "${inboxSearch}"`
                  : 'Tap "+ Chat" to message a batchmate, or create a "🔥 Temp" hangout group!'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Modal: Start Direct Chat (with live user search) ──────────── */}
      <Modal
        visible={directModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDirectModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>💬 Start Direct Chat</Text>
            <Text style={styles.modalSubtitle}>
              Search by name or email to find a batchmate
            </Text>

            {/* Live search input */}
            <View style={styles.userSearchWrapper}>
              <Text style={styles.userSearchIcon}>🔍</Text>
              <TextInput
                style={styles.userSearchInput}
                placeholder="Search by name or email..."
                placeholderTextColor={colors.textMuted}
                value={userQuery}
                onChangeText={setUserQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchingUsers && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
              )}
            </View>

            {/* User search results list */}
            {userResults.length > 0 && (
              <FlatList
                data={userResults}
                keyExtractor={(u) => String(u.id)}
                style={styles.userResultsList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: user }) => (
                  <TouchableOpacity
                    style={styles.userResultRow}
                    onPress={() => handleSelectSearchUser(user)}
                    disabled={startingChat}
                  >
                    <View style={[styles.userResultAvatar, { backgroundColor: avatarColor(user.full_name || user.email) }]}>
                      <Text style={styles.userResultAvatarText}>
                        {initial(user.full_name || user.email)}
                      </Text>
                    </View>
                    <View style={styles.userResultInfo}>
                      <Text style={styles.userResultName}>{user.full_name}</Text>
                      <Text style={styles.userResultEmail}>{user.email}</Text>
                    </View>
                    {startingChat ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.userResultAction}>→</Text>
                    )}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.userResultSeparator} />}
              />
            )}

            {/* Empty state when typed but no results */}
            {userQuery.trim().length > 0 && !searchingUsers && userResults.length === 0 && (
              <View style={styles.userSearchEmpty}>
                <Text style={styles.userSearchEmptyText}>No students found for "{userQuery}"</Text>
              </View>
            )}

            {/* Cancel button */}
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 16 }]}
              onPress={() => {
                setDirectModalVisible(false);
                setUserQuery('');
                setUserResults([]);
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Create Ephemeral Group ─────────────────────────────── */}
      <Modal
        visible={ephemeralModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEphemeralModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🔥 Create Self-Destructing Group</Text>
            <Text style={styles.modalSubtitle}>
              Auto-deletes from everyone's inbox when time expires. Zero clutter!
            </Text>

            <Text style={styles.label}>Group Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rishikesh Weekend Trip, Exam Prep"
              placeholderTextColor={colors.textMuted}
              value={groupName}
              onChangeText={setGroupName}
            />

            <Text style={styles.label}>Purpose Tag</Text>
            <View style={styles.tagRow}>
              {['Trip', 'Hangout', 'Project', 'Party', 'Sports'].map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.tagBtn, purposeTag === tag && styles.tagBtnActive]}
                  onPress={() => setPurposeTag(tag)}
                >
                  <Text style={[styles.tagText, purposeTag === tag && styles.tagTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Self-Destruct Timer</Text>
            <View style={styles.durationRow}>
              {[
                { label: '10 Mins', value: '10_MIN' },
                { label: '1 Hour', value: '1_HOUR' },
                { label: '12 Hours', value: '12_HOURS' },
                { label: '24 Hours', value: '24_HOURS' },
              ].map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.durationBtn, duration === d.value && styles.durationBtnActive]}
                  onPress={() => setDuration(d.value as typeof duration)}
                >
                  <Text style={[styles.durationText, duration === d.value && styles.durationTextActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEphemeralModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleCreateEphemeral}
                disabled={creatingGroup}
              >
                {creatingGroup ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Start Temp Group</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  bellIcon: {
    fontSize: 16,
  },
  directBtn: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  directBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  ephemeralBtn: {
    backgroundColor: '#7c2d12',
    borderWidth: 1,
    borderColor: colors.ephemeralFire,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  ephemeralBtnText: {
    color: '#fed7aa',
    fontWeight: '700',
    fontSize: 12,
  },

  // ── Search Bar ───────────────────────────────────────────────────────────
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchBar: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0, // keep height consistent on Android
  },

  // ── Chat List ────────────────────────────────────────────────────────────
  listContent: {
    padding: 16,
    paddingTop: 12,
  },
  chatCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  chatTitleUnread: {
    fontWeight: '800',
    color: '#fff',
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatTime: {
    color: colors.textMuted,
    fontSize: 11,
    marginLeft: 6,
  },
  ephemeralBadge: {
    backgroundColor: '#431407',
    borderWidth: 1,
    borderColor: colors.ephemeralFire,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  ephemeralBadgeText: {
    color: '#fb923c',
    fontSize: 10,
    fontWeight: '700',
  },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  lastMsg: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  lastMsgUnread: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#ef4444',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyInbox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 30,
  },
  emptyInboxIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  emptyInboxTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyInboxSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // ── Active Chat Room ─────────────────────────────────────────────────────
  chatRoomContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  backArrow: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  // Keep legacy name so nothing else breaks
  backBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  roomHeaderTitleCol: {
    flex: 1,
  },
  roomTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  roomSubtitle: {
    color: '#fb923c',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  roomCallActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomCallBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  roomCallIcon: {
    fontSize: 16,
  },

  // ── Message Bubbles ──────────────────────────────────────────────────────
  messagesList: {
    padding: 16,
    paddingBottom: 16,
  },
  messageBubbleWrapper: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  bubbleWrapperRight: {
    alignSelf: 'flex-end',
  },
  bubbleWrapperLeft: {
    alignSelf: 'flex-start',
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  senderAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  senderHeaderName: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  messageBubble: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleRight: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleLeft: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextRight: {
    color: '#fff',
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  messageTimeRight: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  emptyMessagesIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyMessagesText: {
    color: colors.textMuted,
    fontSize: 13,
  },

  // ── Input Bar ────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 15,
    maxHeight: 90,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // ── Modals ───────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 18,
    lineHeight: 18,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },

  // Live user search (Direct Chat modal)
  userSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  userSearchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  userSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
  },
  userResultsList: {
    maxHeight: 260,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 4,
    backgroundColor: colors.card,
  },
  userResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  userResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userResultAvatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  userResultInfo: {
    flex: 1,
  },
  userResultName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  userResultEmail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  userResultAction: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  userResultSeparator: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginHorizontal: 14,
  },
  userSearchEmpty: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  userSearchEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },

  // Ephemeral group form
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tagBtn: {
    backgroundColor: colors.card,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tagBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#1e3a8a',
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#fff',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  durationBtn: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  durationBtnActive: {
    borderColor: colors.ephemeralFire,
    backgroundColor: '#431407',
  },
  durationText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  durationTextActive: {
    color: '#fdba74',
    fontWeight: '700',
  },

  // Modal action buttons
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#ea580c',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  confirmBtnPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '700',
  },

  // Keep for legacy compat
  surfaceLight: {
    backgroundColor: colors.surfaceLight,
  },
});
