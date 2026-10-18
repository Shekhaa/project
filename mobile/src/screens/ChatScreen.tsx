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
  Image,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { colors } from '../theme/colors';
import { chatService, Conversation, Message } from '../services/chatService';
import { postService, Post, Comment } from '../services/postService';
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
  admission_number?: string;
  college_name?: string;
  branch_name?: string;
  verified?: boolean;
}

export interface SharedPostCardData {
  type: 'POST_CARD';
  postId: number;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  content: string;
  mediaType?: 'TEXT' | 'IMAGE' | 'VIDEO';
  mediaUrl?: string;
  likesCount?: number;
  commentsCount?: number;
  communityName?: string;
}

export const parseSharedPostCard = (text: string): SharedPostCardData | null => {
  if (!text) return null;
  const match = text.match(/\[CAMPUS_POST_CARD:(.*?)\]/);
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      return JSON.parse(decoded);
    } catch (e) {
      try {
        return JSON.parse(match[1]);
      } catch (err) {}
    }
  }

  // Fallback for older plaintext shares
  if (text.includes('Check out this campus post by')) {
    const lines = text.split('\n');
    const authorLine = lines.find((l) => l.includes('Check out this campus post by')) || '';
    const authorName = authorLine
      .replace('Check out this campus post by', '')
      .replace(':', '')
      .trim() || 'Campus Student';
    const quoteMatch = text.match(/"([^"]+)"/);
    const content = quoteMatch ? quoteMatch[1] : 'Campus media story';
    return {
      type: 'POST_CARD',
      postId: 0,
      authorName,
      content,
      mediaType: text.includes('[Photo Attached]') ? 'IMAGE' : text.includes('[Video Reel]') ? 'VIDEO' : 'TEXT',
    };
  }

  return null;
};

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
  const [directoryUsers, setDirectoryUsers] = useState<SearchUser[]>([]);
  const [searchingDirectory, setSearchingDirectory] = useState(false);
  const directoryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Active Chat Room State ────────────────────────────────────────────────
  const [activeConv, setActiveConv] = useState<Conversation | null>(initialConversation || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList<Message>>(null);

  // ── Shared Post Viewer Modal State ─────────────────────────────────────────
  const [viewingPost, setViewingPost] = useState<Post | null>(null);
  const [viewingPostLoading, setViewingPostLoading] = useState(false);
  const [postComments, setPostComments] = useState<Comment[]>([]);
  const [loadingPostComments, setLoadingPostComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

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

    if (directModalVisible) {
      userSearchDebounceRef.current = setTimeout(() => {
        searchUsers(userQuery.trim());
      }, 250);
    }

    return () => {
      if (userSearchDebounceRef.current) clearTimeout(userSearchDebounceRef.current);
    };
  }, [userQuery, directModalVisible]);

  // Debounced global student search for main inbox search bar
  useEffect(() => {
    const q = inboxSearch.trim();
    if (!q) {
      setDirectoryUsers([]);
      setSearchingDirectory(false);
      return;
    }

    if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);

    setSearchingDirectory(true);
    directoryDebounceRef.current = setTimeout(async () => {
      try {
        const response = await api.get<any>(`/authentication/users/search/?q=${encodeURIComponent(q)}`);
        const data = response.data;
        const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        const currentUserId = currentUser?.id;
        const filtered = list.filter((u: any) => u.id !== currentUserId);
        setDirectoryUsers(filtered);
      } catch (e) {
        console.log('Error searching campus directory in inbox', e);
        setDirectoryUsers([]);
      } finally {
        setSearchingDirectory(false);
      }
    }, 200);

    return () => {
      if (directoryDebounceRef.current) clearTimeout(directoryDebounceRef.current);
    };
  }, [inboxSearch, currentUser?.id]);

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

  /** Client-side fuzzy filter of conversations by name, username, email, or message. */
  const filteredConversations = inboxSearch.trim()
    ? conversations.filter((c) => {
        const query = inboxSearch.toLowerCase();
        const title = getConvTitle(c).toLowerCase();
        const email = c.recipient?.email?.toLowerCase() ?? '';
        const username = c.recipient?.username?.toLowerCase() ?? '';
        const lastMsg = c.last_message?.text?.toLowerCase() ?? '';
        return (
          title.includes(query) ||
          email.includes(query) ||
          username.includes(query) ||
          lastMsg.includes(query)
        );
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
      // Fallback: If network fails, match locally from existing conversations
      const localMatches: SearchUser[] = [];
      const queryLower = q.toLowerCase();
      conversations.forEach((c) => {
        if (c.recipient) {
          const name = c.recipient.full_name || '';
          const mail = c.recipient.email || '';
          const uname = c.recipient.username || '';
          if (
            !queryLower ||
            name.toLowerCase().includes(queryLower) ||
            mail.toLowerCase().includes(queryLower) ||
            uname.toLowerCase().includes(queryLower)
          ) {
            if (!localMatches.some((m) => m.id === c.recipient!.id)) {
              localMatches.push({
                id: c.recipient.id,
                full_name: name || uname || mail.split('@')[0],
                email: mail,
                username: uname,
              });
            }
          }
        }
      });
      setUserResults(localMatches);
    } finally {
      setSearchingUsers(false);
    }
  };

  /** Start a 1-to-1 chat with a search result user (by email or id). */
  const handleSelectSearchUser = async (user: SearchUser) => {
    setStartingChat(true);
    try {
      const identifier = user.email || String(user.id);
      const conv = await chatService.startDirectChat(identifier);
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

  /** Start a direct chat from the main inbox campus directory */
  const handleStartChatWithUser = async (user: SearchUser) => {
    setStartingChat(true);
    try {
      const identifier = user.email || String(user.id);
      const conv = await chatService.startDirectChat(identifier);
      setInboxSearch('');
      setDirectoryUsers([]);
      await loadInbox();
      setActiveConv(conv);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not start chat with student.');
    } finally {
      setStartingChat(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Shared Post Interactive Viewer Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleOpenSharedPost = async (cardData: SharedPostCardData) => {
    if (cardData.postId > 0) {
      setViewingPostLoading(true);
      try {
        const fullPost = await postService.getPost(cardData.postId);
        setViewingPost(fullPost);
        loadPostComments(cardData.postId);
      } catch (e) {
        setViewingPost({
          id: cardData.postId,
          content: cardData.content,
          media_type: cardData.mediaType || 'TEXT',
          media_url: cardData.mediaUrl,
          is_anonymous: false,
          author_name: cardData.authorName,
          author_username: cardData.authorUsername,
          author_avatar: cardData.authorAvatar,
          community_name: cardData.communityName || 'Campus Feed',
          likes_count: cardData.likesCount || 0,
          comments_count: cardData.commentsCount || 0,
          has_liked: false,
          created_at: new Date().toISOString(),
        });
        loadPostComments(cardData.postId);
      } finally {
        setViewingPostLoading(false);
      }
    } else {
      setViewingPost({
        id: 0,
        content: cardData.content,
        media_type: cardData.mediaType || 'TEXT',
        media_url: cardData.mediaUrl,
        is_anonymous: false,
        author_name: cardData.authorName,
        community_name: 'Campus Feed',
        likes_count: 0,
        comments_count: 0,
        has_liked: false,
        created_at: new Date().toISOString(),
      });
    }
  };

  const loadPostComments = async (postId: number) => {
    if (!postId) return;
    setLoadingPostComments(true);
    try {
      const data = await postService.getComments(postId);
      setPostComments(data);
    } catch (e) {
      console.log('Error loading post comments in chat', e);
    } finally {
      setLoadingPostComments(false);
    }
  };

  const handleToggleLikePost = async () => {
    if (!viewingPost || !viewingPost.id) return;
    const nextLiked = !viewingPost.has_liked;
    setViewingPost({
      ...viewingPost,
      has_liked: nextLiked,
      likes_count: Math.max(0, viewingPost.likes_count + (nextLiked ? 1 : -1)),
    });
    try {
      const res = await postService.toggleLike(viewingPost.id);
      setViewingPost((prev) => (prev ? { ...prev, has_liked: res.has_liked, likes_count: res.likes_count } : null));
    } catch (e) {}
  };

  const handleAddPostComment = async () => {
    if (!viewingPost || !viewingPost.id || !newCommentText.trim() || postingComment) return;
    const txt = newCommentText.trim();
    setNewCommentText('');
    setPostingComment(true);
    try {
      const comment = await postService.addComment(viewingPost.id, txt, false);
      setPostComments((prev) => [comment, ...prev]);
      setViewingPost((prev) => (prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : null));
    } catch (e: any) {
      Alert.alert('Comment Failed', e.response?.data?.error || 'Could not post comment.');
    } finally {
      setPostingComment(false);
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
  // Conversation Deletion Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleDeleteConversationFromInbox = (conv: Conversation) => {
    const name = getConvTitle(conv);
    Alert.alert(
      `Delete Chat with ${name}? 🗑️`,
      'This will remove this conversation from your inbox and clear message history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Chat',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteConversation(conv.id, true);
              setConversations((prev) => prev.filter((c) => c.id !== conv.id));
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not delete chat.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteActiveConversation = () => {
    if (!activeConv) return;
    const name = getConvTitle(activeConv);
    Alert.alert(
      'Delete Entire Chat? 🗑️',
      `Delete chat with ${name}? All messages and conversation will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Messages Only',
          onPress: async () => {
            try {
              await chatService.clearChatHistory(activeConv.id);
              setMessages([]);
              Alert.alert('Cleared 🧹', 'All messages in this chat cleared.');
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not clear messages.');
            }
          },
        },
        {
          text: 'Delete Entire Chat',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteConversation(activeConv.id, true);
              setActiveConv(null);
              await loadInbox();
              Alert.alert('Deleted 🗑️', `Conversation with ${name} deleted.`);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Could not delete chat.');
            }
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Message Options (Unsend vs Delete for Me)
  // ─────────────────────────────────────────────────────────────────────────

  const handleMessagePress = (msg: Message, isMe: boolean) => {
    const options: any[] = [];

    if (isMe) {
      options.push({
        text: '↩️ Unsend (Delete for Everyone)',
        style: 'destructive',
        onPress: () => handleUnsendMessage(msg),
      });
    }

    options.push({
      text: '🗑️ Delete for Me',
      style: 'destructive',
      onPress: () => handleDeleteForMe(msg),
    });

    if (msg.text) {
      options.push({
        text: '📋 Copy Text',
        onPress: () => handleCopyMessageText(msg.text),
      });
    }

    options.push({
      text: 'Cancel',
      style: 'cancel',
    });

    const snippet = msg.text
      ? `"${msg.text.slice(0, 60)}${msg.text.length > 60 ? '...' : ''}"`
      : 'Select action';

    Alert.alert(
      isMe ? 'Your Message' : (msg.sender_name || 'Message'),
      snippet,
      options
    );
  };

  const handleUnsendMessage = (msg: Message) => {
    Alert.alert(
      'Unsend Message? ↩️',
      'This will delete this message for everyone in the chat. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsend',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.unsendMessage(msg.id);
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            } catch (e: any) {
              Alert.alert('Unsend Failed', e.response?.data?.error || 'Could not unsend message.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteForMe = async (msg: Message) => {
    try {
      await chatService.deleteMessageForMe(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e: any) {
      Alert.alert('Delete Failed', e.response?.data?.error || 'Could not delete message for you.');
    }
  };

  const handleCopyMessageText = async (text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      Alert.alert('Copied 📋', 'Message text copied to clipboard.');
    } else {
      Alert.alert('Copied 📋', 'Message text copied.');
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
            onPress={async () => {
              if (messages.length === 0 && !activeConv.is_group && !activeConv.is_ephemeral) {
                try {
                  await chatService.deleteConversation(activeConv.id, true);
                } catch (e) {}
              }
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

          {/* Room Header Action Buttons */}
          <View style={styles.roomCallActions}>
            {!activeConv.is_group && activeConv.recipient && onStartCall && (
              <>
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
              </>
            )}

            {/* Delete Chat Button inside Chat Header */}
            <TouchableOpacity
              style={styles.roomDeleteBtn}
              onPress={handleDeleteActiveConversation}
              activeOpacity={0.8}
            >
              <Text style={styles.roomDeleteIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
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
            const sharedCard = parseSharedPostCard(item.text);

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

                {sharedCard ? (
                  /* Interactive Campus Post Card Bubble */
                  <TouchableOpacity
                    style={[
                      styles.sharedPostCard,
                      isMe ? styles.sharedPostCardRight : styles.sharedPostCardLeft,
                      !isMe && { marginLeft: 32 },
                    ]}
                    activeOpacity={0.88}
                    onPress={() => handleOpenSharedPost(sharedCard)}
                  >
                    <View style={styles.sharedPostCardHeader}>
                      <View style={styles.sharedPostTagBadge}>
                        <Text style={styles.sharedPostTagText}>🎓 Campus Post</Text>
                      </View>
                      <Text style={styles.sharedPostAuthor} numberOfLines={1}>
                        {sharedCard.authorName}
                      </Text>
                    </View>

                    {sharedCard.mediaUrl ? (
                      <View style={styles.sharedPostMediaContainer}>
                        <Image
                          source={{ uri: sharedCard.mediaUrl }}
                          style={styles.sharedPostImage}
                          resizeMode="cover"
                        />
                        {sharedCard.mediaType === 'VIDEO' && (
                          <View style={styles.sharedPostVideoPill}>
                            <Text style={styles.sharedPostVideoPillText}>▶ Video Reel</Text>
                          </View>
                        )}
                      </View>
                    ) : null}

                    {sharedCard.content ? (
                      <Text style={styles.sharedPostContentText} numberOfLines={3}>
                        "{sharedCard.content}"
                      </Text>
                    ) : null}

                    <View style={styles.sharedPostFooter}>
                      <View style={styles.sharedPostStats}>
                        <Text style={styles.sharedPostStatsText}>
                          ❤️ {sharedCard.likesCount ?? 0}
                        </Text>
                        <Text style={styles.sharedPostStatsText}>
                          💬 {sharedCard.commentsCount ?? 0}
                        </Text>
                      </View>
                      <View style={styles.sharedPostCtaBtn}>
                        <Text style={styles.sharedPostCtaText}>View Post ↗</Text>
                      </View>
                    </View>

                    <View style={styles.bubbleBottomRow}>
                      <Text style={[styles.messageTime, isMe && styles.messageTimeRight]}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleMessagePress(item, isMe)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[styles.bubbleActionHint, isMe && styles.bubbleActionHintRight]}>
                          •••
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.messageBubble,
                      isMe ? styles.bubbleRight : styles.bubbleLeft,
                      !isMe && { marginLeft: 32 }, // indent to align under avatar
                    ]}
                    activeOpacity={0.85}
                    onPress={() => handleMessagePress(item, isMe)}
                    onLongPress={() => handleMessagePress(item, isMe)}
                  >
                    <Text style={[styles.messageText, isMe && styles.messageTextRight]}>
                      {item.text}
                    </Text>
                    <View style={styles.bubbleBottomRow}>
                      <Text style={[styles.messageTime, isMe && styles.messageTimeRight]}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <Text style={[styles.bubbleActionHint, isMe && styles.bubbleActionHintRight]}>
                        •••
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
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

        {/* ── Modal: Campus Post Interactive Viewer ───────────────────── */}
        <Modal
          visible={viewingPost !== null || viewingPostLoading}
          animationType="slide"
          transparent
          onRequestClose={() => setViewingPost(null)}
        >
          <View style={styles.postViewerBackdrop}>
            <SafeAreaView style={styles.postViewerModal}>
              {/* Header */}
              <View style={styles.postViewerHeader}>
                <TouchableOpacity
                  style={styles.postViewerBackBtn}
                  onPress={() => setViewingPost(null)}
                >
                  <Text style={styles.postViewerBackArrow}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.postViewerHeaderTitle}>Campus Post 🎓</Text>
                <View style={{ width: 36 }} />
              </View>

              {viewingPostLoading ? (
                <View style={styles.postViewerLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.postViewerLoadingText}>Loading Campus Post...</Text>
                </View>
              ) : viewingPost ? (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Author row */}
                  <View style={styles.postViewerAuthorRow}>
                    <View
                      style={[
                        styles.postViewerAvatar,
                        { backgroundColor: avatarColor(viewingPost.author_name || 'Student') },
                      ]}
                    >
                      <Text style={styles.postViewerAvatarText}>
                        {initial(viewingPost.author_name || 'Student')}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.postViewerAuthorName}>
                        {viewingPost.author_name}
                      </Text>
                      <Text style={styles.postViewerSub}>
                        {viewingPost.community_name || 'Campus Connect'}
                      </Text>
                    </View>
                  </View>

                  {/* Content */}
                  {viewingPost.content ? (
                    <Text style={styles.postViewerContentText}>
                      {viewingPost.content}
                    </Text>
                  ) : null}

                  {/* Media */}
                  {viewingPost.media_url ? (
                    <View style={styles.postViewerMediaWrapper}>
                      <Image
                        source={{ uri: viewingPost.media_url }}
                        style={styles.postViewerImage}
                        resizeMode="contain"
                      />
                    </View>
                  ) : null}

                  {/* Engagement Bar */}
                  <View style={styles.postViewerEngageBar}>
                    <TouchableOpacity
                      style={[
                        styles.postViewerLikeBtn,
                        viewingPost.has_liked && styles.postViewerLikeBtnActive,
                      ]}
                      onPress={handleToggleLikePost}
                    >
                      <Text style={styles.postViewerLikeIcon}>
                        {viewingPost.has_liked ? '❤️' : '🤍'}
                      </Text>
                      <Text
                        style={[
                          styles.postViewerLikeCount,
                          viewingPost.has_liked && styles.postViewerLikeCountActive,
                        ]}
                      >
                        {viewingPost.likes_count ?? 0} Likes
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.postViewerCommentsCountCol}>
                      <Text style={styles.postViewerCommentsCountText}>
                        💬 {viewingPost.comments_count ?? postComments.length} Comments
                      </Text>
                    </View>
                  </View>

                  {/* Comments Section */}
                  <Text style={styles.postViewerCommentsHeader}>Discussion & Comments</Text>

                  {loadingPostComments ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
                  ) : postComments.length === 0 ? (
                    <Text style={styles.postViewerNoComments}>
                      No comments yet. Be the first batchmate to chime in!
                    </Text>
                  ) : (
                    postComments.map((c) => (
                      <View key={c.id} style={styles.postViewerCommentRow}>
                        <View
                          style={[
                            styles.postViewerCommentAvatar,
                            { backgroundColor: avatarColor(c.author_name || 'U') },
                          ]}
                        >
                          <Text style={styles.postViewerCommentAvatarText}>
                            {initial(c.author_name || 'U')}
                          </Text>
                        </View>
                        <View style={styles.postViewerCommentBubble}>
                          <Text style={styles.postViewerCommentAuthor}>{c.author_name}</Text>
                          <Text style={styles.postViewerCommentText}>{c.text}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              ) : null}

              {/* Comment Input Bar */}
              {viewingPost && viewingPost.id > 0 && (
                <View style={styles.postViewerInputBar}>
                  <TextInput
                    style={styles.postViewerCommentInput}
                    placeholder="Chime in with a comment..."
                    placeholderTextColor={colors.textMuted}
                    value={newCommentText}
                    onChangeText={setNewCommentText}
                  />
                  <TouchableOpacity
                    style={[
                      styles.postViewerCommentSendBtn,
                      (!newCommentText.trim() || postingComment) && { opacity: 0.5 },
                    ]}
                    onPress={handleAddPostComment}
                    disabled={!newCommentText.trim() || postingComment}
                  >
                    {postingComment ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.postViewerCommentSendText}>Post</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </SafeAreaView>
          </View>
        </Modal>
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
          placeholder="Search chats by name, batchmate, or message..."
          placeholderTextColor={colors.textMuted}
          value={inboxSearch}
          onChangeText={setInboxSearch}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        {inboxSearch ? (
          <TouchableOpacity onPress={() => setInboxSearch('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Conversation List / Unified Search ────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : inboxSearch.trim() ? (
        <ScrollView
          style={styles.unifiedSearchScroll}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Section 1: Active Conversations matching query */}
          {filteredConversations.length > 0 && (
            <View style={styles.searchSectionBlock}>
              <Text style={styles.searchSectionTitle}>
                💬 ACTIVE CHATS ({filteredConversations.length})
              </Text>
              {filteredConversations.map((item) => {
                const unread = (item.unread_count ?? 0) > 0;
                const lastTime = formatCardTime(item.last_message?.created_at ?? item.updated_at);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.chatCard}
                    onPress={() => setActiveConv(item)}
                    onLongPress={() => handleDeleteConversationFromInbox(item)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {item.is_ephemeral ? '🔥' : item.is_group ? '👥' : '💬'}
                      </Text>
                    </View>
                    <View style={styles.chatInfo}>
                      <View style={styles.chatHeaderRow}>
                        <Text
                          style={[styles.chatTitle, unread && styles.chatTitleUnread]}
                          numberOfLines={1}
                        >
                          {getConvTitle(item)}
                        </Text>
                        <View style={styles.chatMeta}>
                          {lastTime ? <Text style={styles.chatTime}>{lastTime}</Text> : null}
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
                        <View style={styles.chatActionsRow}>
                          {unread && (
                            <View style={styles.unreadBadge}>
                              <Text style={styles.unreadBadgeText}>
                                {(item.unread_count ?? 0) > 99 ? '99+' : item.unread_count}
                              </Text>
                            </View>
                          )}
                          <TouchableOpacity
                            style={styles.cardDeleteBtn}
                            onPress={() => handleDeleteConversationFromInbox(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.cardDeleteIcon}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Section 2: Global Campus Directory / Batchmates */}
          <View style={styles.searchSectionBlock}>
            <View style={styles.searchSectionHeaderRow}>
              <Text style={styles.searchSectionTitle}>
                🎓 CAMPUS DIRECTORY ({directoryUsers.length})
              </Text>
              {searchingDirectory && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>

            {directoryUsers.map((user) => {
              const userInitial = initial(user.full_name || user.email);
              const avatarBg = avatarColor(user.full_name || user.email);
              return (
                <TouchableOpacity
                  key={user.id}
                  style={styles.directoryUserCard}
                  onPress={() => handleStartChatWithUser(user)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.directoryAvatar, { backgroundColor: avatarBg }]}>
                    <Text style={styles.directoryAvatarText}>{userInitial}</Text>
                  </View>
                  <View style={styles.directoryInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.directoryName} numberOfLines={1}>
                        {user.full_name}
                      </Text>
                      {user.verified && (
                        <Text style={{ fontSize: 13 }}>✅</Text>
                      )}
                    </View>
                    <Text style={styles.directorySub} numberOfLines={1}>
                      @{user.username || user.email?.split('@')[0]}
                      {user.branch_name ? ` • ${user.branch_name}` : ''}
                    </Text>
                  </View>
                  <View style={styles.directoryActionPill}>
                    <Text style={styles.directoryActionText}>Chat 💬</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Empty state if both empty and not searching */}
          {filteredConversations.length === 0 && directoryUsers.length === 0 && !searchingDirectory && (
            <View style={styles.emptyInbox}>
              <Text style={styles.emptyInboxIcon}>🔍</Text>
              <Text style={styles.emptyInboxTitle}>
                No students or chats found for "{inboxSearch}"
              </Text>
              <Text style={styles.emptyInboxSubtitle}>
                Try searching by full name, admission number, branch, or email.
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const unread = (item.unread_count ?? 0) > 0;
            const lastTime = formatCardTime(item.last_message?.created_at ?? item.updated_at);

            return (
              <TouchableOpacity
                style={styles.chatCard}
                onPress={() => setActiveConv(item)}
                onLongPress={() => handleDeleteConversationFromInbox(item)}
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

                    <View style={styles.chatActionsRow}>
                      {unread && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {(item.unread_count ?? 0) > 99 ? '99+' : item.unread_count}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.cardDeleteBtn}
                        onPress={() => handleDeleteConversationFromInbox(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.cardDeleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
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
                placeholder="Search by name, roll no, or email..."
                placeholderTextColor={colors.textMuted}
                value={userQuery}
                onChangeText={setUserQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {userQuery ? (
                <TouchableOpacity onPress={() => setUserQuery('')} style={styles.clearSearchBtn}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              ) : null}
              {searchingUsers && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
              )}
            </View>

            {/* Suggested / Results Header */}
            {userResults.length > 0 && (
              <Text style={styles.suggestedHeader}>
                {userQuery.trim() ? `Search Results (${userResults.length})` : 'Suggested Campus Students 🎓'}
              </Text>
            )}

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
  suggestedHeader: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearSearchBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: 'bold',
  },

  // ── Unified Search in Inbox ─────────────────────────────────────────────
  unifiedSearchScroll: {
    flex: 1,
  },
  searchSectionBlock: {
    marginBottom: 20,
  },
  searchSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  searchSectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  directoryUserCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  directoryAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  directoryAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  directoryInfo: {
    flex: 1,
  },
  directoryName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  directorySub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  directoryActionPill: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginLeft: 8,
  },
  directoryActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Interactive Shared Post Card Bubble ──────────────────────────────────
  sharedPostCard: {
    borderRadius: 16,
    padding: 12,
    width: 270,
    borderWidth: 1,
  },
  sharedPostCardRight: {
    backgroundColor: '#1e293b',
    borderColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  sharedPostCardLeft: {
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 4,
  },
  sharedPostCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sharedPostTagBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  sharedPostTagText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sharedPostAuthor: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  sharedPostMediaContainer: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    marginBottom: 8,
    position: 'relative',
  },
  sharedPostImage: {
    width: '100%',
    height: '100%',
  },
  sharedPostVideoPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  sharedPostVideoPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  sharedPostContentText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  sharedPostFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sharedPostStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sharedPostStatsText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sharedPostCtaBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  sharedPostCtaText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Post Viewer Modal ────────────────────────────────────────────────────
  postViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  postViewerModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  postViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  postViewerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  postViewerBackArrow: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  postViewerHeaderTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  postViewerLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  postViewerLoadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  postViewerAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  postViewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  postViewerAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  postViewerAuthorName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  postViewerSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  postViewerContentText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  postViewerMediaWrapper: {
    width: '100%',
    height: 280,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#070a13',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  postViewerImage: {
    width: '100%',
    height: '100%',
  },
  postViewerEngageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 16,
  },
  postViewerLikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  postViewerLikeBtnActive: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  postViewerLikeIcon: {
    fontSize: 16,
  },
  postViewerLikeCount: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  postViewerLikeCountActive: {
    color: '#ef4444',
  },
  postViewerCommentsCountCol: {
    paddingHorizontal: 8,
  },
  postViewerCommentsCountText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  postViewerCommentsHeader: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  postViewerNoComments: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginVertical: 10,
  },
  postViewerCommentRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 10,
  },
  postViewerCommentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postViewerCommentAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  postViewerCommentBubble: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  postViewerCommentAuthor: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  postViewerCommentText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  postViewerInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  postViewerCommentInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  postViewerCommentSendBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginLeft: 8,
  },
  postViewerCommentSendText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // ── Conversation & Message Action Styles ─────────────────────────────────
  roomDeleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginLeft: 4,
  },
  roomDeleteIcon: {
    fontSize: 16,
  },
  bubbleBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  bubbleActionHint: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    opacity: 0.7,
  },
  bubbleActionHintRight: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  chatActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardDeleteBtn: {
    padding: 4,
    opacity: 0.75,
  },
  cardDeleteIcon: {
    fontSize: 14,
  },
});
