import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { colors } from '../../theme/colors';
import { Message, AttachmentItem } from '../../services/chatService';
import { ExternalLink, Heart, MessageCircle } from 'lucide-react-native';
import { MediaGrid } from '../media/MediaGrid';
import { DocumentCard } from '../media/DocumentCard';

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
  onPress?: (msg: Message) => void;
  onLongPress?: (msg: Message) => void;
  onPostCardPress?: (cardData: SharedPostCardData) => void;
  onSenderPress?: (senderId: number) => void;
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
  onLongPress,
  onPostCardPress,
  onSenderPress,
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

  const attachments = message.attachments || [];
  const legacyAttachment = message.attachment ? [{
    id: 'legacy',
    file_url: message.attachment,
    download_url: message.attachment,
    file_name: 'Attachment',
    file_type: (message.attachment.startsWith('data:image/') || message.attachment.match(/\.(jpg|jpeg|png|webp|gif)/i)) ? ('IMAGE' as const) : ('DOCUMENT' as const),
    file_extension: message.attachment.split('.').pop() || '',
    mime_type: '',
    file_size: 0,
    file_size_formatted: '',
    created_at: message.created_at,
  }] : [];

  const allAttachments = [...attachments, ...legacyAttachment];
  const imageAttachments = allAttachments.filter((a) => a.file_type === 'IMAGE');
  const docAttachments = allAttachments.filter((a) => a.file_type === 'DOCUMENT');
  const hasMedia = imageAttachments.length > 0 || docAttachments.length > 0 || Boolean(cardData);

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
      {/* Group Sender Avatar on Left */}
      {!isMe && isGroup && (
        <TouchableOpacity
          disabled={!message.sender}
          onPress={() => message.sender && onSenderPress?.(message.sender)}
          activeOpacity={0.7}
          style={styles.groupAvatar}
        >
          <Text style={styles.groupAvatarText}>{senderInitial}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          hasMedia && styles.bubbleWithMedia,
        ]}
        delayLongPress={450}
        onLongPress={() => onLongPress ? onLongPress(message) : onPress && onPress(message)}
        activeOpacity={0.92}
      >
        {/* Group Sender Name Header */}
        {!isMe && isGroup && message.sender_name && (
          <TouchableOpacity
            disabled={!message.sender}
            onPress={() => message.sender && onSenderPress?.(message.sender)}
            activeOpacity={0.7}
          >
            <Text style={styles.senderHeader}>{message.sender_name}</Text>
          </TouchableOpacity>
        )}

        {/* Media Images Grid */}
        {imageAttachments.length > 0 && (
          <View style={{ marginBottom: cleanText ? 6 : 2 }}>
            <MediaGrid images={imageAttachments} />
          </View>
        )}

        {/* Academic Documents */}
        {docAttachments.length > 0 && (
          <View style={{ marginBottom: cleanText ? 6 : 2, gap: 4 }}>
            {docAttachments.map((doc, idx) => (
              <DocumentCard key={doc.id || idx} attachment={doc} />
            ))}
          </View>
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
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  groupAvatarText: {
    color: colors.textSecondary,
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
  bubbleWithMedia: {
    width: 260,
    maxWidth: '85%',
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.35)',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: colors.bubbleThem,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.bubbleThemBorder,
  },
  senderHeader: {
    color: colors.primaryHover,
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  bubbleText: {
    color: colors.textPrimary,
    fontSize: 14.5,
    lineHeight: 20,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeMe: {
    color: 'rgba(247, 248, 248, 0.65)',
  },
  timeThem: {
    color: colors.textMuted,
  },
  postCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postCardAvatarText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  postCardAuthor: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  postCardComm: {
    color: colors.textMuted,
    fontSize: 10,
  },
  postCardThumb: {
    width: '100%',
    height: 110,
    borderRadius: 6,
    marginBottom: 6,
  },
  postCardSnippet: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  postCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 6,
    marginTop: 2,
  },
  postCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postCardStatText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  postCardCta: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});
