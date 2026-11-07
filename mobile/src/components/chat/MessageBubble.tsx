import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { Message, AttachmentItem } from '../../services/chatService';
import { ExternalLink, Heart, MessageCircle, Play, Pause, Mic, Volume2 } from 'lucide-react-native';
import { MediaGrid } from '../media/MediaGrid';
import { DocumentCard } from '../media/DocumentCard';
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

const AudioPlayerPill: React.FC<{ url: string; fileName: string; isMe: boolean }> = ({ url, fileName, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<any>(null);

  const togglePlay = () => {
    const fullUrl = getFullMediaUrl(url);
    if (Platform.OS === 'web' && typeof Audio !== 'undefined') {
      if (!audioRef.current) {
        audioRef.current = new Audio(fullUrl);
        audioRef.current.onended = () => setIsPlaying(false);
        audioRef.current.onerror = () => setIsPlaying(false);
      }
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    } else {
      Linking.openURL(fullUrl).catch(() => {
        Alert.alert('Cannot Play Audio', 'Could not open audio file.');
      });
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
    };
  }, []);

  return (
    <TouchableOpacity
      style={[styles.audioPill, isMe ? styles.audioPillMe : styles.audioPillThem]}
      onPress={togglePlay}
      activeOpacity={0.8}
    >
      <View style={[styles.playBtnCircle, isMe ? styles.playBtnCircleMe : styles.playBtnCircleThem]}>
        {isPlaying ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" style={{ marginLeft: 2 }} />}
      </View>
      <View style={styles.audioMetaCol}>
        <View style={styles.waveformRow}>
          {[40, 75, 55, 95, 60, 80, 45, 90, 65, 85, 50, 70, 60, 85, 40].map((h, i) => (
            <View
              key={i}
              style={[
                styles.waveformBar,
                { height: (h * 16) / 100 },
                isPlaying
                  ? { backgroundColor: isMe ? '#ffffff' : '#6366f1' }
                  : { backgroundColor: isMe ? 'rgba(255,255,255,0.45)' : 'rgba(99,102,241,0.35)' },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.audioNameText, isMe ? styles.audioNameMe : styles.audioNameThem]} numberOfLines={1}>
          {isPlaying ? 'Playing Voice Note...' : fileName || 'Audio Note • Tap to play'}
        </Text>
      </View>
    </TouchableOpacity>
  );
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
  const audioAttachments = allAttachments.filter(
    (a) => a.file_type === 'AUDIO' || a.file_extension?.match(/^(mp3|wav|m4a|aac|ogg)$/i)
  );
  const imageAttachments = allAttachments.filter((a) => a.file_type === 'IMAGE' && !audioAttachments.includes(a));
  const docAttachments = allAttachments.filter((a) => a.file_type === 'DOCUMENT' && !audioAttachments.includes(a));
  const hasMedia = imageAttachments.length > 0 || docAttachments.length > 0 || audioAttachments.length > 0 || Boolean(cardData);

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

        {/* Voice / Audio Notes */}
        {audioAttachments.length > 0 && (
          <View style={{ marginBottom: cleanText ? 6 : 2, gap: 4 }}>
            {audioAttachments.map((aud, idx) => (
              <AudioPlayerPill key={aud.id || idx} url={aud.file_url} fileName={aud.file_name} isMe={isMe} />
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
  audioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 200,
    maxWidth: 260,
  },
  audioPillMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  audioPillThem: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  playBtnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playBtnCircleMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  playBtnCircleThem: {
    backgroundColor: '#6366f1',
  },
  audioMetaCol: {
    flex: 1,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    marginBottom: 4,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  },
  audioNameText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  audioNameMe: {
    color: '#ffffff',
  },
  audioNameThem: {
    color: colors.textPrimary,
  },
});
