import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { colors } from '../../theme/colors';
import { Message } from '../../services/chatService';
import { ExternalLink, Heart, MessageCircle } from 'lucide-react-native';

export interface SharedPostCardData {
  id: number;
  author_name: string;
  community_name?: string;
  content: string;
  media_type?: string;
  media_url?: string;
  likes_count?: number;
  comments_count?: number;
}

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  isGroup?: boolean;
  onPress: (msg: Message) => void;
  onPostCardPress?: (cardData: SharedPostCardData) => void;
}

export const parseSharedPostCard = (text: string): { cleanText: string; cardData: SharedPostCardData | null } => {
  if (!text) return { cleanText: '', cardData: null };
  const marker = '[CAMPUS_POST_CARD:';
  const startIndex = text.indexOf(marker);
  if (startIndex === -1) return { cleanText: text, cardData: null };

  const endIndex = text.lastIndexOf(']');
  if (endIndex === -1 || endIndex <= startIndex) return { cleanText: text, cardData: null };

  const jsonStr = text.substring(startIndex + marker.length, endIndex);
  const cleanText = text.substring(0, startIndex).trim();

  try {
    const cardData = JSON.parse(jsonStr) as SharedPostCardData;
    return { cleanText, cardData };
  } catch (e) {
    return { cleanText: text, cardData: null };
  }
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  isGroup,
  onPress,
  onPostCardPress,
}) => {
  const { cleanText, cardData } = parseSharedPostCard(message.text);

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const senderInitial = (message.sender_name || 'S').charAt(0).toUpperCase();

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
      {/* Group Sender Avatar on Left */}
      {!isMe && isGroup && (
        <View style={styles.groupAvatar}>
          <Text style={styles.groupAvatarText}>{senderInitial}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
        onPress={() => onPress(message)}
        onLongPress={() => onPress(message)}
        activeOpacity={0.85}
      >
        {/* Group Sender Name Header */}
        {!isMe && isGroup && message.sender_name && (
          <Text style={styles.senderHeader}>{message.sender_name}</Text>
        )}

        {/* Text Message */}
        {cleanText ? <Text style={styles.bubbleText}>{cleanText}</Text> : null}

        {/* Interactive Shared Post Card */}
        {cardData && (
          <TouchableOpacity
            style={styles.postCard}
            onPress={() => onPostCardPress && onPostCardPress(cardData)}
            activeOpacity={0.9}
          >
            <View style={styles.postCardHeader}>
              <View style={styles.postCardAvatar}>
                <Text style={styles.postCardAvatarText}>
                  {cardData.author_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postCardAuthor} numberOfLines={1}>
                  {cardData.author_name}
                </Text>
                {cardData.community_name && (
                  <Text style={styles.postCardComm} numberOfLines={1}>
                    🎓 {cardData.community_name}
                  </Text>
                )}
              </View>
              <ExternalLink size={14} color="#38bdf8" />
            </View>

            {/* Thumbnail if Image */}
            {cardData.media_type === 'IMAGE' && cardData.media_url ? (
              <Image
                source={{ uri: cardData.media_url }}
                style={styles.postCardThumb}
                resizeMode="cover"
              />
            ) : null}

            {cardData.content ? (
              <Text style={styles.postCardSnippet} numberOfLines={2}>
                {cardData.content}
              </Text>
            ) : null}

            <View style={styles.postCardFooter}>
              <View style={styles.postCardStats}>
                <Heart size={12} color="#f43f5e" fill="#f43f5e" />
                <Text style={styles.postCardStatText}>{cardData.likes_count || 0}</Text>
                <MessageCircle size={12} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                <Text style={styles.postCardStatText}>{cardData.comments_count || 0}</Text>
              </View>
              <Text style={styles.postCardCta}>View Post ↗</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Message Footer (Time) */}
        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem]}>
          {formatTime(message.created_at)}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  rowMe: {
    justifyContent: 'flex-end',
  },
  rowThem: {
    justifyContent: 'flex-start',
  },
  groupAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  groupAvatarText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bubbleMe: {
    backgroundColor: '#1d4ed8',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  senderHeader: {
    color: '#38bdf8',
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  bubbleText: {
    color: '#f8fafc',
    fontSize: 14.5,
    lineHeight: 20,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeMe: {
    color: '#bfdbfe',
  },
  timeThem: {
    color: '#94a3b8',
  },
  postCard: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
    padding: 10,
    marginTop: 6,
    marginBottom: 2,
    minWidth: 220,
  },
  postCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  postCardAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postCardAvatarText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  postCardAuthor: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  postCardComm: {
    color: '#38bdf8',
    fontSize: 10,
  },
  postCardThumb: {
    width: '100%',
    height: 110,
    borderRadius: 6,
    marginBottom: 6,
  },
  postCardSnippet: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  postCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 6,
    marginTop: 2,
  },
  postCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postCardStatText: {
    color: '#94a3b8',
    fontSize: 10,
  },
  postCardCta: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
});
