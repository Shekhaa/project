import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  Linking,
  Animated,
  PanResponder,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Message } from '../../services/chatService';
import { ExternalLink, Heart, MessageCircle, Play, CornerDownRight, Share2 } from 'lucide-react-native';
import { MediaGrid } from '../media/MediaGrid';
import { DocumentCard } from '../media/DocumentCard';
import { AudioPlayerPill, splitMediaAttachments } from '../media/VoiceNotePlayer';
import { CustomVideoPlayer } from '../media/CustomVideoPlayer';
import { UserAvatar } from '../common/UserAvatar';
import { getFullMediaUrl } from '../../config/api';

export interface SharedPostCardData {
  id: number | string;
  kind?: 'POST' | 'LOST_FOUND';
  author_name: string;
  author_avatar?: string;
  community_name?: string;
  content: string;
  media_type?: string;
  media_url?: string;
  media_urls?: string[];
  video_url?: string;
  attachments?: any[];
  likes_count?: number;
  comments_count?: number;
  location?: string;
  item_type?: 'LOST' | 'FOUND';
  is_deleted?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  isGroup?: boolean;
  onPress?: (msg: Message) => void;
  onLongPress?: (msg: Message) => void;
  onPostCardPress?: (cardData: SharedPostCardData) => void;
  onSenderPress?: (senderId: number) => void;
  onSwipeReply?: (msg: Message) => void;
  onForward?: (msg: Message) => void;
}

const VideoPlayerPill: React.FC<{ url: string; fileName: string; isMe: boolean }> = ({ url, fileName, isMe }) => {
  return (
    <View style={{ borderRadius: 10, overflow: 'hidden', marginVertical: 4, width: 260, maxWidth: '100%', backgroundColor: '#000' }}>
      <CustomVideoPlayer url={url} maxHeight={220} borderRadius={10} />
      {fileName ? (
        <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.75)' : '#94a3b8', paddingHorizontal: 8, paddingVertical: 4 }} numberOfLines={1}>
          🎬 {fileName}
        </Text>
      ) : null}
    </View>
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
  onSwipeReply,
  onForward,
}) => {
  const { colors, isDark } = useTheme();
  const { cleanText, cardData } = parseSharedPostCard(message.text);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const swipeReplyRef = useRef(onSwipeReply);
  swipeReplyRef.current = onSwipeReply;
  const messageRef = useRef(message);
  messageRef.current = message;

  const swipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Boolean(swipeReplyRef.current) &&
        gesture.dx < -14 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          swipeTranslateX.setValue(Math.max(gesture.dx, -58));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -36 && swipeReplyRef.current) {
          swipeReplyRef.current(messageRef.current);
        }
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          bounciness: 6,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          bounciness: 6,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

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
  const replyPreview = message.reply_to_preview;

  return (
    <View style={{ position: 'relative', justifyContent: 'center' }}>
      {Boolean(onSwipeReply) && (
        <Animated.View
          style={{
            position: 'absolute',
            right: 16,
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            opacity: swipeTranslateX.interpolate({
              inputRange: [-45, -12, 0],
              outputRange: [1, 0.4, 0],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                scale: swipeTranslateX.interpolate({
                  inputRange: [-50, -10, 0],
                  outputRange: [1, 0.7, 0.4],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
          pointerEvents="none"
        >
          <CornerDownRight size={14} color={colors.primary} />
        </Animated.View>
      )}

      <Animated.View
        {...(onSwipeReply ? swipePanResponder.panHandlers : {})}
        style={[
          styles.row,
          isMe ? styles.rowMe : styles.rowThem,
          { transform: [{ translateX: swipeTranslateX }] },
        ]}
      >
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

        {/* Quoted Reply Preview Card */}
        {replyPreview && (
          <View
            style={[
              styles.replyQuoteBox,
              {
                backgroundColor: isMe ? 'rgba(255,255,255,0.14)' : colors.surfaceLight,
                borderLeftColor: isMe ? '#ffffff' : colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.replyQuoteSender,
                { color: isMe ? '#ffffff' : colors.primary },
              ]}
              numberOfLines={1}
            >
              {replyPreview.sender_name}
            </Text>
            <Text
              style={[
                styles.replyQuoteText,
                { color: isMe ? 'rgba(255,255,255,0.85)' : colors.textSecondary },
              ]}
              numberOfLines={2}
            >
              {replyPreview.text}
            </Text>
          </View>
        )}

        {imageAttachments.length > 0 && (
          <View style={{ marginBottom: displayText ? 6 : 2, position: 'relative' }}>
            <MediaGrid images={imageAttachments} />
            {onForward && (
              <TouchableOpacity
                onPress={() => onForward(message)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                accessibilityLabel="Forward image"
              >
                <Share2 size={13} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {videoAttachments.length > 0 && (
          <View style={{ marginBottom: displayText ? 6 : 2, gap: 4, position: 'relative' }}>
            {videoAttachments.map((vid, idx) => (
              <VideoPlayerPill key={vid.id || idx} url={vid.file_url} fileName={vid.file_name} isMe={isMe} />
            ))}
            {onForward && (
              <TouchableOpacity
                onPress={() => onForward(message)}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 20,
                }}
                accessibilityLabel="Forward video"
              >
                <Share2 size={13} color="#ffffff" />
              </TouchableOpacity>
            )}
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
              cardData.is_deleted && { opacity: 0.75 },
            ]}
            onPress={() => onPostCardPress && onPostCardPress(cardData)}
            activeOpacity={0.9}
          >
            {cardData.is_deleted ? (
              // Small unobtrusive tombstone when attachment/post was deleted by owner
              <Text
                style={{
                  fontSize: 11,
                  fontStyle: 'italic',
                  color: colors.textMuted,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                Message unavailable · deleted by user
              </Text>
            ) : cardData.kind === 'LOST_FOUND' ? (
              // Lost & Found Notice Postcard
              <>
                <View style={styles.postCardHeader}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor:
                        cardData.item_type === 'LOST'
                          ? 'rgba(239, 68, 68, 0.18)'
                          : 'rgba(34, 197, 94, 0.18)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color: cardData.item_type === 'LOST' ? '#ef4444' : '#22c55e',
                      }}
                    >
                      {cardData.item_type === 'LOST' ? '🔍 LOST ITEM' : '📦 FOUND ITEM'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.postCardAuthor,
                      { color: colors.textPrimary, flex: 1, marginLeft: 6 },
                    ]}
                    numberOfLines={1}
                  >
                    by {cardData.author_name}
                  </Text>
                  <ExternalLink size={14} color={colors.primary} />
                </View>

                {cardData.media_url ? (
                  <Image
                    source={{ uri: getFullMediaUrl(cardData.media_url) }}
                    style={styles.postCardThumb}
                    resizeMode="cover"
                  />
                ) : null}

                {cardData.content ? (
                  <Text
                    style={[styles.postCardSnippet, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {cardData.content}
                  </Text>
                ) : null}

                <View style={[styles.postCardFooter, { borderTopColor: colors.cardBorder }]}>
                  <Text
                    style={[styles.postCardStatText, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    📍 {cardData.location || 'Campus'}
                  </Text>
                  <Text style={[styles.postCardCta, { color: colors.primary }]}>
                    View Photo ↗
                  </Text>
                </View>
              </>
            ) : (
              // Regular Campus Post / Confession Postcard
              <>
                <View style={styles.postCardHeader}>
                  <UserAvatar
                    name={cardData.author_name}
                    size={24}
                    uri={cardData.author_avatar}
                  />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text
                      style={[styles.postCardAuthor, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {cardData.author_name}
                    </Text>
                    {cardData.community_name && (
                      <Text
                        style={[styles.postCardComm, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        🎓 {cardData.community_name}
                      </Text>
                    )}
                  </View>
                  <ExternalLink size={14} color={colors.primary} />
                </View>

                {/* Video thumbnail with play badge or image */}
                {cardData.video_url || cardData.media_type === 'VIDEO' ? (
                  <View
                    style={[
                      styles.postCardThumb,
                      {
                        backgroundColor: '#000000',
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        borderWidth: 1.5,
                        borderColor: '#ffffff',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Play
                        size={20}
                        color="#ffffff"
                        fill="#ffffff"
                        style={{ marginLeft: 2 }}
                      />
                    </View>
                    <Text
                      style={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        fontSize: 10,
                        fontWeight: '700',
                        color: '#ffffff',
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      🎬 Video
                    </Text>
                  </View>
                ) : cardData.media_url ? (
                  <View style={{ position: 'relative' }}>
                    <Image
                      source={{ uri: getFullMediaUrl(cardData.media_url) }}
                      style={styles.postCardThumb}
                      resizeMode="cover"
                    />
                    {cardData.media_urls && cardData.media_urls.length > 1 && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          borderRadius: 10,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{ fontSize: 10, fontWeight: '700', color: '#ffffff' }}
                        >
                          1/{cardData.media_urls.length} 📷
                        </Text>
                      </View>
                    )}
                  </View>
                ) : null}

                {cardData.content ? (
                  <Text
                    style={[styles.postCardSnippet, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {cardData.content}
                  </Text>
                ) : null}

                <View style={[styles.postCardFooter, { borderTopColor: colors.cardBorder }]}>
                  <View style={styles.postCardStats}>
                    <Heart size={12} color="#f43f5e" fill="#f43f5e" />
                    <Text style={[styles.postCardStatText, { color: colors.textMuted }]}>
                      {cardData.likes_count || 0}
                    </Text>
                    <MessageCircle
                      size={12}
                      color={colors.textSecondary}
                      style={{ marginLeft: 6 }}
                    />
                    <Text style={[styles.postCardStatText, { color: colors.textMuted }]}>
                      {cardData.comments_count || 0}
                    </Text>
                  </View>
                  <Text style={[styles.postCardCta, { color: colors.primary }]}>
                    View Post & Comments ↗
                  </Text>
                </View>
              </>
            )}
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
          {isMe && !isSending && !isFailed && (
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: message.is_read
                  ? '#38bdf8'
                  : isDark
                  ? 'rgba(247, 248, 248, 0.55)'
                  : 'rgba(255, 255, 255, 0.72)',
              }}
            >
              {message.is_read ? '✓✓ Seen' : '✓ Sent'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  replyQuoteBox: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 1,
  },
  replyQuoteText: {
    fontSize: 12,
    lineHeight: 16,
  },
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
    height: 92,
    borderRadius: 6,
    marginBottom: 4,
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
