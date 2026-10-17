import React, { useState, useEffect } from 'react';
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
import { communityService, Community } from '../services/communityService';
import { chatService, Message } from '../services/chatService';

interface CommunitiesScreenProps {
  currentUser?: any;
  onOpenCommunityChat?: (conversation: any) => void;
}

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({ currentUser, onOpenCommunityChat }) => {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [openingChatSlug, setOpeningChatSlug] = useState<string | null>(null);

  // In-Screen Community Hub Chat State (Completely separate from personal 1-to-1 chats)
  const [activeCommunityChat, setActiveCommunityChat] = useState<{
    conv: any;
    community: Community;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  // Custom community creation form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadCommunities = async () => {
    setLoading(true);
    try {
      const data = await communityService.getMyCommunities();
      setCommunities(data);
    } catch (e) {
      console.log('Error loading communities', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommunities();
  }, []);

  // Poll messages every 2.5 seconds when Hub Chat is active
  useEffect(() => {
    if (!activeCommunityChat) return;

    let isMounted = true;
    const fetchChatMessages = async (silent = false) => {
      if (!silent) setChatLoading(true);
      try {
        const msgs = await chatService.getMessages(activeCommunityChat.conv.id);
        if (isMounted) setMessages(msgs);
      } catch (e) {
        if (!silent) console.log('Error fetching hub messages', e);
      } finally {
        if (!silent && isMounted) setChatLoading(false);
      }
    };

    fetchChatMessages(false);
    const interval = setInterval(() => fetchChatMessages(true), 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCommunityChat]);

  const handleSendHubMessage = async () => {
    if (!messageText.trim() || !activeCommunityChat || sendingMessage) return;

    const textToSend = messageText.trim();
    setMessageText('');
    setSendingMessage(true);

    try {
      const newMsg = await chatService.sendMessage(activeCommunityChat.conv.id, textToSend);
      setMessages((prev) => [...prev, newMsg]);
    } catch (e: any) {
      Alert.alert('Send Failed', e.response?.data?.error || 'Message could not be delivered.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCreateCustom = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Please enter a club or group name.');
      return;
    }

    setCreating(true);
    try {
      await communityService.createCustomCommunity({
        name: newTitle.trim(),
        description: newDesc.trim(),
        is_private: false,
      });
      setModalVisible(false);
      setNewTitle('');
      setNewDesc('');
      await loadCommunities();
      Alert.alert('Created!', 'Your custom campus community is now live!');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create community.');
    } finally {
      setCreating(false);
    }
  };

  const coreCommunities = communities.filter((c) =>
    ['COLLEGE', 'COURSE', 'SECTION'].includes(c.community_type)
  );

  const customCommunities = communities.filter(
    (c) => c.community_type === 'CUSTOM'
  );

  const handleOpenChat = async (item: Community) => {
    setOpeningChatSlug(item.slug);
    try {
      const conv = await communityService.openCommunityChat(item.slug);
      // Dedicated Hub Chat stays inside the Hubs tab!
      setActiveCommunityChat({
        conv,
        community: item,
      });
      if (onOpenCommunityChat) {
        onOpenCommunityChat(conv);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not open community chat.');
    } finally {
      setOpeningChatSlug(null);
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'COLLEGE':
        return '#3b82f6';
      case 'COURSE':
        return '#10b981';
      case 'SECTION':
        return '#f59e0b';
      default:
        return '#8b5cf6';
    }
  };

  // 1. ACTIVE HUB CHAT VIEW (Dedicated to Hubs, WhatsApp-style bubbles)
  if (activeCommunityChat) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Hub Chat Header */}
        <View style={styles.chatRoomHeader}>
          <TouchableOpacity
            style={styles.chatBackBtn}
            onPress={() => setActiveCommunityChat(null)}
          >
            <Text style={styles.chatBackBtnText}>←</Text>
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatRoomTitle} numberOfLines={1}>
              {activeCommunityChat.community.name}
            </Text>
            <View style={styles.chatHeaderBadgeRow}>
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: getBadgeColor(activeCommunityChat.community.community_type) },
                ]}
              >
                <Text style={styles.typeBadgeText}>
                  {activeCommunityChat.community.community_type}
                </Text>
              </View>
              <Text style={styles.chatRoomSubtitle}>
                👥 {activeCommunityChat.community.total_members} members • Campus Hub
              </Text>
            </View>
          </View>
        </View>

        {/* Message Stream */}
        {chatLoading && messages.length === 0 ? (
          <View style={styles.chatLoadingCenter}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.chatLoadingText}>Loading hub conversations...</Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatMessagesContent}
            renderItem={({ item }) => {
              const isMe = currentUser
                ? item.sender === currentUser.id ||
                  (item.sender_email && currentUser.email && item.sender_email.toLowerCase() === currentUser.email.toLowerCase())
                : false;

              const senderName = item.sender_name || 'Campus Student';
              const initialLetter = senderName.trim()[0]?.toUpperCase() || '?';

              return (
                <View
                  style={[
                    styles.messageBubbleWrapper,
                    isMe ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
                  ]}
                >
                  {/* Sender Name & Initials Avatar on others' messages */}
                  {!isMe && (
                    <View style={styles.senderHeaderRow}>
                      <View style={styles.senderAvatarMini}>
                        <Text style={styles.senderAvatarMiniText}>{initialLetter}</Text>
                      </View>
                      <Text style={styles.senderHeaderName}>{senderName}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      isMe ? styles.bubbleRight : styles.bubbleLeft,
                      !isMe && { marginLeft: 28 },
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
                <Text style={styles.emptyMessagesIcon}>🏛️</Text>
                <Text style={styles.emptyMessagesTitle}>
                  Welcome to {activeCommunityChat.community.name}!
                </Text>
                <Text style={styles.emptyMessagesText}>
                  This is the official campus discussion channel. Say hello to your batchmates!
                </Text>
              </View>
            }
          />
        )}

        {/* Hub Chat Input Bar */}
        <View style={styles.chatInputBar}>
          <TextInput
            style={styles.chatInput}
            placeholder={`Message ${activeCommunityChat.community.name}...`}
            placeholderTextColor={colors.textMuted}
            value={messageText}
            onChangeText={setMessageText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
            onPress={handleSendHubMessage}
            disabled={!messageText.trim() || sendingMessage}
          >
            {sendingMessage ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // 2. MAIN COMMUNITIES HUB DIRECTORY
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Communities</Text>
          <Text style={styles.headerSubtitle}>Core Academic Hubs & Student Clubs</Text>
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.createBtnText}>+ Create Club</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[
            { type: 'HEADER_CORE', title: '🏛️ YOUR 3 MANDATORY CORE HUBS' },
            ...coreCommunities,
            { type: 'HEADER_CUSTOM', title: '🎮 STUDENT CLUBS & CUSTOM COMMUNITIES' },
            ...customCommunities,
          ]}
          keyExtractor={(item: any, idx) => item.id?.toString() || idx.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: any) => {
            if (item.type === 'HEADER_CORE' || item.type === 'HEADER_CUSTOM') {
              return <Text style={styles.sectionHeader}>{item.title}</Text>;
            }

            return (
              <View style={styles.communityCard}>
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: getBadgeColor(item.community_type) },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>{item.community_type}</Text>
                  </View>
                  <Text style={styles.memberCount}>👥 {item.total_members} members</Text>
                </View>

                <Text style={styles.communityName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.communityDesc}>{item.description}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.chatActionBtn}
                  onPress={() => handleOpenChat(item)}
                  disabled={openingChatSlug === item.slug}
                >
                  {openingChatSlug === item.slug ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.chatActionIcon}>💬</Text>
                      <Text style={styles.chatActionText}>Open Hub Chat</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Modal: Create Custom Community */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Campus Community</Text>
            <Text style={styles.modalSubtitle}>
              Start a gaming squad, project group, or hobby club
            </Text>

            <Text style={styles.label}>Community / Club Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. GEU Esports & Valorant Club"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.descInput]}
              placeholder="What is this group about?"
              placeholderTextColor={colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleCreateCustom}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Create Community</Text>
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
  createBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 10,
  },
  communityCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  memberCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  communityName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  communityDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  chatActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  chatActionIcon: {
    fontSize: 14,
  },
  chatActionText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '700',
  },

  // Dedicated Hub Chat Room Styles
  chatRoomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  chatBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.card,
    marginRight: 12,
  },
  chatBackBtnText: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatRoomTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  chatHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 8,
  },
  chatRoomSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chatLoadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  chatLoadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chatMessagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubbleWrapper: {
    marginVertical: 4,
    maxWidth: '82%',
  },
  bubbleWrapperRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleWrapperLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  senderAvatarMini: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarMiniText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  senderHeaderName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8', // WhatsApp-style distinct bright sender name
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleRight: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleLeft: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  messageText: {
    fontSize: 14,
    color: '#f8fafc',
    lineHeight: 20,
  },
  messageTextRight: {
    color: '#ffffff',
  },
  messageTime: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeRight: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 30,
  },
  emptyMessagesIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyMessagesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyMessagesText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 18,
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
  descInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
