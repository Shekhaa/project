import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Conversation, Message, AttachmentItem } from '../../services/chatService';
import { parseSharedPostCard, SharedPostCardData } from './MessageBubble';
import { UserAvatar } from '../common/UserAvatar';
import { getFullMediaUrl } from '../../config/api';
import {
  X,
  Users,
  FileText,
  Mic,
  Image as ImageIcon,
  ExternalLink,
  MessageSquare,
  Link2,
  UserPlus,
  ShieldCheck,
  FileDown,
  Layers,
} from 'lucide-react-native';

export interface GroupDetailsModalProps {
  visible: boolean;
  conversation: Conversation | null;
  messages: Message[];
  currentUser?: any;
  onClose: () => void;
  onAddMembersPress?: () => void;
  onInviteLinkPress?: () => void;
  onPostCardPress?: (cardData: SharedPostCardData) => void;
  onJumpToMessage?: (messageId: string) => void;
}

type MediaFilter = 'ALL' | 'DOCS' | 'AUDIO' | 'POSTCARD' | 'PHOTOS';

export const GroupDetailsModal: React.FC<GroupDetailsModalProps> = ({
  visible,
  conversation,
  messages,
  currentUser,
  onClose,
  onAddMembersPress,
  onInviteLinkPress,
  onPostCardPress,
  onJumpToMessage,
}) => {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'MEMBERS' | 'MEDIA'>('MEDIA');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('ALL');

  if (!conversation) return null;

  const roomTitle =
    conversation.name ||
    conversation.recipient?.full_name ||
    conversation.recipient?.email?.split('@')[0] ||
    'Campus Group';

  // Extract all media, documents, audios, and shared postcards from messages
  const extractedMedia = useMemo(() => {
    const items: Array<{
      id: string;
      messageId: string;
      type: 'DOC' | 'AUDIO' | 'POSTCARD' | 'PHOTO';
      title: string;
      subtitle: string;
      senderName: string;
      createdAt: string;
      fileUrl?: string;
      downloadUrl?: string;
      fileSizeFormatted?: string;
      cardData?: SharedPostCardData;
      thumbnailUrl?: string;
    }> = [];

    messages.forEach((msg) => {
      // 1. Check Shared Postcard in text
      const { cardData } = parseSharedPostCard(msg.text);
      if (cardData) {
        items.push({
          id: `postcard_${msg.id}`,
          messageId: String(msg.id),
          type: 'POSTCARD',
          title: cardData.content ? cardData.content.substring(0, 70) + '...' : 'Shared Campus Postcard',
          subtitle: cardData.community_name ? `From #${cardData.community_name}` : 'Campus Feed',
          senderName: msg.sender_name || 'Classmate',
          createdAt: msg.created_at,
          cardData,
          thumbnailUrl: cardData.media_url ? getFullMediaUrl(cardData.media_url) : undefined,
        });
      }

      // 2. Check attachments
      if (msg.attachments && Array.isArray(msg.attachments)) {
        msg.attachments.forEach((att: AttachmentItem, idx: number) => {
          const fileName = att.file_name || 'Attachment';
          const lowerName = fileName.toLowerCase();
          const mime = (att.mime_type || '').toLowerCase();

          const isAudio =
            att.file_type === 'AUDIO' ||
            mime.includes('audio') ||
            lowerName.endsWith('.webm') ||
            lowerName.endsWith('.mp3') ||
            lowerName.endsWith('.m4a') ||
            lowerName.endsWith('.wav');

          const isDoc =
            att.file_type === 'DOCUMENT' ||
            mime.includes('pdf') ||
            mime.includes('word') ||
            mime.includes('text') ||
            lowerName.endsWith('.pdf') ||
            lowerName.endsWith('.docx') ||
            lowerName.endsWith('.doc') ||
            lowerName.endsWith('.txt') ||
            lowerName.endsWith('.pptx');

          const isPhoto =
            att.file_type === 'IMAGE' ||
            mime.includes('image') ||
            lowerName.endsWith('.jpg') ||
            lowerName.endsWith('.jpeg') ||
            lowerName.endsWith('.png') ||
            lowerName.endsWith('.webp');

          if (isAudio) {
            items.push({
              id: `${msg.id}_att_${idx}`,
              messageId: String(msg.id),
              type: 'AUDIO',
              title: att.caption || fileName || 'Voice Note',
              subtitle: 'Audio Note / Voice Recording',
              senderName: msg.sender_name || 'Classmate',
              createdAt: msg.created_at,
              fileUrl: getFullMediaUrl(att.file_url),
              downloadUrl: getFullMediaUrl(att.download_url || att.file_url),
              fileSizeFormatted: att.file_size_formatted || '',
            });
          } else if (isDoc) {
            items.push({
              id: `${msg.id}_att_${idx}`,
              messageId: String(msg.id),
              type: 'DOC',
              title: fileName,
              subtitle: att.file_size_formatted || 'Document / Study Note',
              senderName: msg.sender_name || 'Classmate',
              createdAt: msg.created_at,
              fileUrl: getFullMediaUrl(att.file_url),
              downloadUrl: getFullMediaUrl(att.download_url || att.file_url),
              fileSizeFormatted: att.file_size_formatted || '',
            });
          } else if (isPhoto) {
            items.push({
              id: `${msg.id}_att_${idx}`,
              messageId: String(msg.id),
              type: 'PHOTO',
              title: fileName || 'Shared Image',
              subtitle: att.file_size_formatted || 'Image',
              senderName: msg.sender_name || 'Classmate',
              createdAt: msg.created_at,
              fileUrl: getFullMediaUrl(att.file_url),
              thumbnailUrl: getFullMediaUrl(att.file_url),
            });
          }
        });
      }
    });

    return items;
  }, [messages]);

  // Filter items by active pill
  const filteredMedia = useMemo(() => {
    if (mediaFilter === 'ALL') return extractedMedia;
    if (mediaFilter === 'DOCS') return extractedMedia.filter((i) => i.type === 'DOC');
    if (mediaFilter === 'AUDIO') return extractedMedia.filter((i) => i.type === 'AUDIO');
    if (mediaFilter === 'POSTCARD') return extractedMedia.filter((i) => i.type === 'POSTCARD');
    if (mediaFilter === 'PHOTOS') return extractedMedia.filter((i) => i.type === 'PHOTO');
    return extractedMedia;
  }, [extractedMedia, mediaFilter]);

  const handleOpenItem = (item: (typeof extractedMedia)[0]) => {
    if (item.type === 'POSTCARD' && item.cardData) {
      onClose();
      onPostCardPress?.(item.cardData);
    } else if (item.fileUrl) {
      if (Platform.OS === 'web') {
        window.open(item.fileUrl, '_blank');
      } else {
        Linking.openURL(item.fileUrl);
      }
    }
  };

  const handleJump = (messageId: string) => {
    onClose();
    onJumpToMessage?.(messageId);
  };

  const membersList = conversation.members || [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Navbar */}
        <View style={[styles.navbar, { borderBottomColor: colors.cardBorder, backgroundColor: colors.surface }]}>
          <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Group Info & Shared Media</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Hero Header */}
          <View style={[styles.heroCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <UserAvatar
              name={roomTitle}
              size={64}
              borderWidth={2}
              borderColor={colors.primary}
              backgroundColor={isDark ? 'rgba(94, 106, 210, 0.2)' : 'rgba(94, 106, 210, 0.12)'}
              textColor={colors.primary}
            />
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{roomTitle}</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              {conversation.is_ephemeral
                ? `⏱️ Self-destructing group (${conversation.duration || '24h'})`
                : conversation.is_group
                ? `Campus Group • ${membersList.length > 0 ? `${membersList.length} members` : 'Active Network'}`
                : 'Direct Conversation'}
            </Text>

            {/* Group Action Buttons */}
            {conversation.is_group && (
              <View style={styles.actionRow}>
                {onAddMembersPress && (
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                    onPress={() => {
                      onClose();
                      onAddMembersPress();
                    }}
                  >
                    <UserPlus size={14} color={colors.primary} />
                    <Text style={[styles.actionPillText, { color: colors.textPrimary }]}>Add Members</Text>
                  </TouchableOpacity>
                )}

                {onInviteLinkPress && (
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                    onPress={() => {
                      onClose();
                      onInviteLinkPress();
                    }}
                  >
                    <Link2 size={14} color={colors.primary} />
                    <Text style={[styles.actionPillText, { color: colors.textPrimary }]}>Invite Link</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Tab Selector */}
          <View style={[styles.tabBar, { borderBottomColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'MEDIA' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab('MEDIA')}
            >
              <FileText size={15} color={activeTab === 'MEDIA' ? colors.primary : colors.textMuted} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === 'MEDIA' ? colors.primary : colors.textMuted },
                  activeTab === 'MEDIA' && styles.tabLabelActive,
                ]}
              >
                Shared Media & Notes ({extractedMedia.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'MEMBERS' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab('MEMBERS')}
            >
              <Users size={15} color={activeTab === 'MEMBERS' ? colors.primary : colors.textMuted} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === 'MEMBERS' ? colors.primary : colors.textMuted },
                  activeTab === 'MEMBERS' && styles.tabLabelActive,
                ]}
              >
                Members ({membersList.length || (conversation.recipient ? 2 : 1)})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ========================================================= */}
          {/* TAB 1: SHARED MEDIA & NOTES                               */}
          {/* ========================================================= */}
          {activeTab === 'MEDIA' && (
            <View style={styles.tabContent}>
              {/* Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
                {(
                  [
                    { key: 'ALL', label: `All (${extractedMedia.length})` },
                    { key: 'DOCS', label: `📄 PDFs & Docs (${extractedMedia.filter((i) => i.type === 'DOC').length})` },
                    { key: 'AUDIO', label: `🎙️ Voice Notes (${extractedMedia.filter((i) => i.type === 'AUDIO').length})` },
                    { key: 'POSTCARD', label: `📌 Postcards (${extractedMedia.filter((i) => i.type === 'POSTCARD').length})` },
                    { key: 'PHOTOS', label: `🖼️ Photos (${extractedMedia.filter((i) => i.type === 'PHOTO').length})` },
                  ] as const
                ).map((pill) => (
                  <TouchableOpacity
                    key={pill.key}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: mediaFilter === pill.key ? colors.primary : colors.surfaceLight,
                        borderColor: mediaFilter === pill.key ? colors.primary : colors.cardBorder,
                      },
                    ]}
                    onPress={() => setMediaFilter(pill.key)}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        { color: mediaFilter === pill.key ? colors.onPrimary : colors.textSecondary },
                      ]}
                    >
                      {pill.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {filteredMedia.length === 0 ? (
                <View style={[styles.emptyBox, { borderColor: colors.cardBorder }]}>
                  <Layers size={32} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No shared items yet</Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                    Share PDFs, study notes, voice notes, or campus postcards in this chat to quickly access them here.
                  </Text>
                </View>
              ) : (
                <View style={styles.mediaList}>
                  {filteredMedia.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.mediaCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                    >
                      {/* Icon / Thumbnail Box */}
                      <TouchableOpacity onPress={() => handleOpenItem(item)} activeOpacity={0.8}>
                        {item.thumbnailUrl ? (
                          <Image source={{ uri: item.thumbnailUrl }} style={styles.mediaThumb} resizeMode="cover" />
                        ) : (
                          <View
                            style={[
                              styles.iconBox,
                              {
                                backgroundColor:
                                  item.type === 'DOC'
                                    ? 'rgba(239, 68, 68, 0.12)'
                                    : item.type === 'AUDIO'
                                    ? 'rgba(34, 197, 94, 0.12)'
                                    : 'rgba(94, 106, 210, 0.12)',
                              },
                            ]}
                          >
                            {item.type === 'DOC' ? (
                              <FileText size={20} color="#ef4444" />
                            ) : item.type === 'AUDIO' ? (
                              <Mic size={20} color="#22c55e" />
                            ) : item.type === 'POSTCARD' ? (
                              <Layers size={20} color={colors.primary} />
                            ) : (
                              <ImageIcon size={20} color={colors.primary} />
                            )}
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Content Info */}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TouchableOpacity onPress={() => handleOpenItem(item)} activeOpacity={0.7}>
                          <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={[styles.itemSub, { color: colors.textMuted }]} numberOfLines={1}>
                            {item.subtitle} • {item.senderName}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Action Buttons: Open & Jump to Chat */}
                      <View style={styles.itemActionGroup}>
                        <TouchableOpacity
                          style={[styles.itemMiniBtn, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                          onPress={() => handleOpenItem(item)}
                          accessibilityLabel="Open item"
                        >
                          <ExternalLink size={13} color={colors.primary} />
                          <Text style={[styles.itemMiniBtnText, { color: colors.primary }]}>Open</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.itemMiniBtn, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                          onPress={() => handleJump(item.messageId)}
                          accessibilityLabel="Jump to message in chat"
                        >
                          <MessageSquare size={13} color={colors.textSecondary} />
                          <Text style={[styles.itemMiniBtnText, { color: colors.textSecondary }]}>In Chat</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ========================================================= */}
          {/* TAB 2: MEMBERS LIST                                       */}
          {/* ========================================================= */}
          {activeTab === 'MEMBERS' && (
            <View style={styles.tabContent}>
              {membersList.length > 0 ? (
                <View style={styles.membersList}>
                  {membersList.map((m: any, idx: number) => {
                    const user = m.user || m;
                    const isMe = currentUser && (user.id === currentUser.id || user.email === currentUser.email);
                    const name = user.full_name || user.username || user.email?.split('@')[0] || `Student #${idx + 1}`;

                    return (
                      <View
                        key={idx}
                        style={[styles.memberRow, { borderBottomColor: colors.cardBorder, backgroundColor: colors.surfaceLight }]}
                      >
                        <UserAvatar
                          uri={user.avatar || user.profile_picture}
                          name={name}
                          size={40}
                          borderWidth={1}
                          borderColor={colors.cardBorder}
                          backgroundColor={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                          textColor={colors.textPrimary}
                        />

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                              {name} {isMe ? '(You)' : ''}
                            </Text>
                            {m.is_admin && (
                              <View style={styles.adminBadge}>
                                <ShieldCheck size={10} color="#22c55e" />
                                <Text style={styles.adminBadgeText}>Admin</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.memberEmail, { color: colors.textMuted }]} numberOfLines={1}>
                            {user.email || 'Verified Campus Student'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : conversation.recipient ? (
                <View style={styles.membersList}>
                  {/* Direct 1-on-1 participant */}
                  <View style={[styles.memberRow, { borderBottomColor: colors.cardBorder, backgroundColor: colors.surfaceLight }]}>
                    <UserAvatar
                      uri={conversation.recipient.avatar || conversation.recipient.profile_picture}
                      name={conversation.recipient.full_name}
                      size={40}
                      borderWidth={1}
                      borderColor={colors.cardBorder}
                      backgroundColor={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                      textColor={colors.textPrimary}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                        {conversation.recipient.full_name}
                      </Text>
                      <Text style={[styles.memberEmail, { color: colors.textMuted }]}>
                        {conversation.recipient.email || 'Verified Classmate'}
                      </Text>
                    </View>
                  </View>

                  {/* You */}
                  <View style={[styles.memberRow, { borderBottomColor: colors.cardBorder, backgroundColor: colors.surfaceLight }]}>
                    <UserAvatar
                      name={currentUser?.full_name || 'You'}
                      size={40}
                      borderWidth={1}
                      borderColor={colors.cardBorder}
                      backgroundColor={colors.primary}
                      textColor="#ffffff"
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                        {currentUser?.full_name || 'You'} (You)
                      </Text>
                      <Text style={[styles.memberEmail, { color: colors.textMuted }]}>
                        {currentUser?.email || 'Logged In Account'}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={[styles.emptyBox, { borderColor: colors.cardBorder }]}>
                  <Users size={32} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Active Group Chat</Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                    Members in this campus group can participate and exchange notes.
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  navTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabContent: {
    marginTop: 4,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  mediaList: {
    gap: 10,
    marginTop: 6,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  itemActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemMiniBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  membersList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: 11,
    marginTop: 2,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
  },
  adminBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#22c55e',
  },
});
