import React, { useState, useEffect, useRef } from 'react';
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

interface ChatScreenProps {
  initialConversation?: Conversation | null;
  onClearInitialConversation?: () => void;
  onStartCall?: (receiverId: number, receiverName: string, callType: 'AUDIO' | 'VIDEO') => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  initialConversation,
  onClearInitialConversation,
  onStartCall,
}) => {
  // Inbox State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  // Active Chat Room State
  const [activeConv, setActiveConv] = useState<Conversation | null>(initialConversation || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialConversation) {
      setActiveConv(initialConversation);
      if (onClearInitialConversation) {
        onClearInitialConversation();
      }
    }
  }, [initialConversation]);

  // Ephemeral Group Modal State
  const [ephemeralModalVisible, setEphemeralModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [purposeTag, setPurposeTag] = useState('Trip');
  const [duration, setDuration] = useState<'10_MIN' | '1_HOUR' | '12_HOURS' | '24_HOURS'>('24_HOURS');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Start Direct Chat Modal State
  const [directModalVisible, setDirectModalVisible] = useState(false);
  const [targetStudent, setTargetStudent] = useState('');
  const [startingChat, setStartingChat] = useState(false);

  // Load Inbox
  const loadInbox = async () => {
    try {
      const data = await chatService.getInbox();
      setConversations(data);
    } catch (e) {
      console.log('Error loading inbox', e);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadInbox().finally(() => setLoading(false));
  }, []);

  // When active conversation opens, load messages & start polling
  useEffect(() => {
    if (!activeConv) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    loadMessages(activeConv.id);

    // Auto-poll messages every 3 seconds for real-time live chat feel
    pollIntervalRef.current = setInterval(() => {
      loadMessages(activeConv.id, true);
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeConv]);

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
    } catch (e: any) {
      Alert.alert('Send Failed', e.response?.data?.error || 'Message could not be delivered.');
    } finally {
      setSending(false);
    }
  };

  // Start 1-to-1 Chat
  const handleStartDirectChat = async () => {
    if (!targetStudent.trim()) {
      Alert.alert('Error', 'Please enter a student username or college email.');
      return;
    }

    setStartingChat(true);
    try {
      const conv = await chatService.startDirectChat(targetStudent.trim());
      setDirectModalVisible(false);
      setTargetStudent('');
      await loadInbox();
      setActiveConv(conv);
    } catch (e: any) {
      Alert.alert('User Not Found', e.response?.data?.error || 'Could not find student.');
    } finally {
      setStartingChat(false);
    }
  };

  // Create Ephemeral Group
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
        duration: duration,
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

  const getConvTitle = (item: Conversation) => {
    if (item.name) return item.name;
    if (item.recipient) {
      return item.recipient.full_name || item.recipient.username || item.recipient.email;
    }
    return 'Campus Chat';
  };

  // If a chat conversation is active, render the Chat Room View!
  if (activeConv) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.chatRoomContainer}
      >
        {/* Chat Room Top Bar */}
        <View style={styles.roomHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setActiveConv(null);
              loadInbox();
            }}
          >
            <Text style={styles.backBtnText}>‹ Back</Text>
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
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => {
            const isMe = item.sender_name !== activeConv.recipient?.full_name;
            return (
              <View
                style={[
                  styles.messageBubbleWrapper,
                  isMe ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
                ]}
              >
                {!isMe && (
                  <Text style={styles.senderHeaderName}>{item.sender_name}</Text>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    isMe ? styles.bubbleRight : styles.bubbleLeft,
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

  // Otherwise, render the Main Chat Inbox!
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>Direct Chats & Temporary Hangouts</Text>
        </View>

        <View style={styles.headerButtonsRow}>
          <TouchableOpacity
            style={styles.directBtn}
            onPress={() => setDirectModalVisible(true)}
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

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatCard}
              onPress={() => setActiveConv(item)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.is_ephemeral ? '🔥' : item.is_group ? '👥' : '💬'}
                </Text>
              </View>

              <View style={styles.chatInfo}>
                <View style={styles.chatHeaderRow}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {getConvTitle(item)}
                  </Text>
                  {item.is_ephemeral ? (
                    <View style={styles.ephemeralBadge}>
                      <Text style={styles.ephemeralBadgeText}>
                        ⏳ {item.duration?.replace('_', ' ') || 'TEMP'}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.lastMsg} numberOfLines={1}>
                  {item.last_message?.text || 'Tap to open chat...'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyInbox}>
              <Text style={styles.emptyInboxIcon}>📬</Text>
              <Text style={styles.emptyInboxTitle}>No Active Chats Yet</Text>
              <Text style={styles.emptyInboxSubtitle}>
                Tap "+ Chat" to message a batchmate, or create a "🔥 Temp" hangout group!
              </Text>
            </View>
          }
        />
      )}

      {/* Modal: Start Direct Chat */}
      <Modal visible={directModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>💬 Start Direct Chat</Text>
            <Text style={styles.modalSubtitle}>
              Enter any student's username or college email
            </Text>

            <Text style={styles.label}>Student Username or Email</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. aarav_cse or student@geu.ac.in"
              placeholderTextColor={colors.textMuted}
              value={targetStudent}
              onChangeText={setTargetStudent}
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setDirectModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtnPrimary}
                onPress={handleStartDirectChat}
                disabled={startingChat}
              >
                {startingChat ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Open Chat</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Create Ephemeral Group */}
      <Modal visible={ephemeralModalVisible} animationType="slide" transparent>
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
                  onPress={() => setDuration(d.value as any)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    gap: 8,
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
  listContent: {
    padding: 16,
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
  lastMsg: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
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

  // Active Chat Room Styles
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    marginRight: 12,
  },
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
  senderHeaderName: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
    marginLeft: 6,
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

  // Modals
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
});
