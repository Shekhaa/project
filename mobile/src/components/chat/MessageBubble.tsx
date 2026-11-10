import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Message } from '../../services/chatService';
import { ExternalLink, Heart, MessageCircle, Play } from 'lucide-react-native';
import { MediaGrid } from '../media/MediaGrid';
import { DocumentCard } from '../media/DocumentCard';
import { AudioPlayerPill, splitMediaAttachments } from '../media/VoiceNotePlayer';
import { UserAvatar } from '../common/UserAvatar';
import { getFullMediaUrl } from '../../config/api';

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

const VideoPlayerPill: React.FC<{ url: string; fileName: string; isMe: boolean }> = ({ url, fileName, isMe }) => {
  const { colors, isDark } = useTheme();
  const fullUrl = getFullMediaUrl(url);
  if (Platform.OS === 'web') {
    return (
      <View style={{ borderRadius: 10, overflow: 'hidden', marginVertical: 4, maxWidth: 280, backgroundColor: '#000' }}>
        <video
          src={fullUrl}
          controls
          playsInline
          style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', borderRadius: 10 }}
        />
        {fileName && (
          <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.75)' : '#94a3b8', paddingHorizontal: 8, paddingVertical: 4 }}>
            🎬 {fileName}
          </Text>
        )}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[
        styles.videoFallbackPill,
        {
          backgroundColor: isMe
            ? 'rgba(255, 255, 255, 0.14)'
            : isDark
            ? 'rgba(94, 106, 210, 0.12)'
            : 'rgba(79, 70, 229, 0.08)',
          borderColor: isMe ? 'rgba(255, 255, 255, 0.25)' : colors.cardBorder,
        },
      ]}
      onPress={() => Linking.openURL(fullUrl)}
    >
      <Play size={16} color={isMe ? '#ffffff' : colors.primary} />
      <Text style={[styles.videoFallbackText, { color: isMe ? '#ffffff' : colors.bubbleThemText }]}>
        🎬 {fileName || 'Watch Video'}
      </Text>
    </TouchableOpacity>
  );
};

export const parseAnonMessage = (text: string): { isAnon: boolean; mascot: string; messageBody: string } => {
  if (!text || !text.startsWith('[ANON_MSG:')) return { isAnon: false, mascot: '', messageBody: text };
  const endIdx = text.indexOf(']');
  if (endIdx === -1) return { isAnon: false, mascot: '', messageBody: text };
  const mascot = text.substring(10, endIdx).trim();
  const messageBody = text.substring(endIdx + 1).trim();
  return { isAnon: true, mascot, messageBody };
};

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
  } catch {
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
  const { colors, isDark } = useTheme();
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

  const isFailed = Boolean(isMe && (message as any).status === 'failed');
  const isSending = Boolean(isMe && (message as any).status === 'sending');

  const { audioAttachments, videoAttachments, imageAttachments, docAttachments } =
    splitMediaAttachments(message.attachments, message.attachment, message.created_at);
  const hasMedia =
    imageAttachments.length > 0 ||
    docAttachments.length > 0 ||
    audioAttachments.length > 0 ||
    videoAttachments.length > 0 ||
    Boolean(cardData);

  const anonInfo = parseAnonMessage(cleanText);
  const displayText = anonInfo.isAnon ? anonInfo.messageBody : cleanText;

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
      {!isMe && isGroup && (
        <TouchableOpacity
          disabled={!message.sender || anonInfo.isAnon}
          onPress={() => message.sender && !anonInfo.isAnon && onSenderPress?.(message.sender)}
          activeOpacity={0.7}
          style={{ alignSelf: 'flex-end', marginBottom: 4, marginRight: 6 }}
        >
          <UserAvatar
            uri={!anonInfo.isAnon ? message.sender_avatar : undefined}
            name={message.sender_name || 'Student'}
            size={28}
            isAnonymous={anonInfo.isAnon}
          />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[
          styles.bubble,
          isMe
            ? {
                backgroundColor: colors.bubbleMe,
                borderWidth: 1,
                borderColor: isFailed
                  ? 'rgba(239, 68, 68, 0.7)'
                  : isDark
                  ? 'rgba(94, 106, 210, 0.35)'
                  : colors.primary,
                borderBottomRightRadius: 4,
              }
            : {
                backgroundColor: colors.bubbleThem,
                borderBottomLeftRadius: 4,
                borderWidth: 1,
                borderColor: colors.bubbleThemBorder,
              },
          hasMedia && styles.bubbleWithMedia,
        ]}
        delayLongPress={450}
        onPress={
          isFailed
            ? () => (onPress || onLongPress)?.(message)
            : onPress
            ? () => onPress(message)
            : undefined
        }
        onLongPress={() => (onLongPress ? onLongPress(message) : onPress?.(message))}
        activeOpacity={0.92}
      >
        {anonInfo.isAnon && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: isMe ? '#e9d5ff' : '#9333ea' }}>
              🎭 {anonInfo.mascot} • Green Verified Student
            </Text>
          </View>
        )}

        {!isMe && isGroup && !anonInfo.isAnon && message.sender_name && (
          <TouchableOpacity
            disabled={!message.sender}
            onPress={() => message.sender && onSenderPress?.(message.sender)}
            activeOpacity={0.7}
          >
            <Text style={[styles.senderHeader, { color: colors.primary }]}>{message.sender_name}</Text>
          </TouchableOpacity>
        )}

        {imageAttachments.length > 0 && (
          <View style={{ marginBottom: displayText ? 6 : 2 }}>
            <MediaGrid images={imageAttachments} />
          </View>
        )}

        {videoAttachments.length > 0 && (
          <View style={{ marginBottom: displayText ? 6 : 2, gap: 4 }}>
            {videoAttachments.map((vid, idx) => (
              <VideoPlayerPill key={vid.id || idx} url={vid.file_url} fileName={vid.file_name} isMe={isMe} />
            ))}
          </View>
        )}

        {docAttachments.length > 0 && (
          <View style={{ marginBottom: displayText ? 6 : 2, gap: 4 }}>
            {docAttachments.map((doc, idx) => (
              <DocumentCard key={doc.id || idx} attachment={doc} />
            ))}
          </View>
        )}

        {audioAttachments.length > 0 && (
          <View style={{ marginBottom: displayText ? 6 : 2, gap: 6 }}>
            {audioAttachments.map((aud, idx) => (
              <AudioPlayerPill
                key={aud.id || idx}
                url={aud.file_url}
                fileName={aud.file_name}
                caption={aud.caption}
                isMe={isMe}
              />
            ))}
          </View>
        )}

        {displayText ? (
          <Text style={[styles.bubbleText, { color: isMe ? colors.bubbleMeText : colors.bubbleThemText }]}>
            {displayText}
          </Text>
        ) : null}

        {cardData && (
          <TouchableOpacity
            style={[
              styles.postCard,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
            onPress={() => onPostCardPress && onPostCardPress(cardData)}
            activeOpacity={0.9}
          >
            <View style={styles.postCardHeader}>
              <UserAvatar name={cardData.author_name} size={24} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.postCardAuthor, { color: colors.textPrimary }]} numberOfLines={1}>
                  {cardData.author_name}
                </Text>
                {cardData.community_name && (
                  <Text style={[styles.postCardComm, { color: colors.textMuted }]} numberOfLines={1}>
                    🎓 {cardData.community_name}
                  </Text>
                )}
              </View>
              <ExternalLink size={14} color={colors.primary} />
            </View>

            {cardData.media_type === 'IMAGE' && cardData.media_url ? (
              <Image
                source={{ uri: cardData.media_url }}
                style={styles.postCardThumb}
                resizeMode="cover"
              />
            ) : null}

            {cardData.content ? (
              <Text style={[styles.postCardSnippet, { color: colors.textSecondary }]} numberOfLines={2}>
                {cardData.content}
              </Text>
            ) : null}

            <View style={[styles.postCardFooter, { borderTopColor: colors.cardBorder }]}>
              <View style={styles.postCardStats}>
                <Heart size={12} color="#f43f5e" fill="#f43f5e" />
                <Text style={[styles.postCardStatText, { color: colors.textMuted }]}>
                  {cardData.likes_count || 0}
                </Text>
                <MessageCircle size={12} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                <Text style={[styles.postCardStatText, { color: colors.textMuted }]}>
                  {cardData.comments_count || 0}
                </Text>
              </View>
              <Text style={[styles.postCardCta, { color: colors.primary }]}>View Post ↗</Text>
            </View>
          </TouchableOpacity>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: isMe ? 'flex-end' : 'flex-start',
            marginTop: 3,
            gap: 5,
          }}
        >
          <Text
            style={[
              styles.timeText,
              {
                color: isMe
                  ? isDark
                    ? 'rgba(247, 248, 248, 0.65)'
                    : 'rgba(255, 255, 255, 0.8)'
                  : colors.textMuted,
              },
            ]}
          >
            {formatTime(message.created_at)}
          </Text>
          {isSending && (
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>⏱️</Text>
          )}
          {isFailed && (
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fca5a5' }}>
              ⚠️ Failed · Tap
            </Text>
          )}
        </View>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  groupAvatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bubbleWithMedia: {
    minWidth: 215,
    maxWidth: '85%',
  },
  senderHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  bubbleText: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  timeText: {
    fontSize: 10,
  },
  postCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 6,
    marginBottom: 2,
    minWidth: 210,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postCardAvatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  postCardAuthor: {
    fontSize: 12,
    fontWeight: '700',
  },
  postCardComm: {
    fontSize: 10,
  },
  postCardThumb: {
    width: '100%',
    height: 110,
    borderRadius: 6,
    marginBottom: 6,
  },
  postCardSnippet: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  postCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 6,
    marginTop: 2,
  },
  postCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postCardStatText: {
    fontSize: 10,
  },
  postCardCta: {
    fontSize: 11,
    fontWeight: '700',
  },
  videoFallbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 180,
    maxWidth: 260,
  },
  videoFallbackText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
});
