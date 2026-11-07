import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { DiscussionReply } from '../../services/communityService';
import { ArrowBigUp, Check, CornerDownRight, Trash2, Flag } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

interface DiscussionRepliesProps {
  replies: DiscussionReply[];
  currentUserId?: number;
  isQuestionAuthor?: boolean;
  isSolved?: boolean;
  onVoteReply: (reply: DiscussionReply) => void;
  onAcceptReply?: (reply: DiscussionReply) => void;
  onReplyToReply: (reply: DiscussionReply) => void;
  onDeleteReply?: (reply: DiscussionReply) => void;
  onReportReply?: (reply: DiscussionReply) => void;
  onOpenProfile?: (userId: number) => void;
}

export const DiscussionReplies: React.FC<DiscussionRepliesProps> = ({
  replies,
  currentUserId,
  isQuestionAuthor,
  isSolved,
  onVoteReply,
  onAcceptReply,
  onReplyToReply,
  onDeleteReply,
  onReportReply,
  onOpenProfile,
}) => {
  const { colors, isDark } = useTheme();

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return '';
    }
  };

  const handleDeletePrompt = (item: DiscussionReply) => {
    Alert.alert(
      'Delete Reply',
      'Are you sure you want to delete your reply?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteReply?.(item),
        },
      ]
    );
  };

  const renderReplyItem = (item: DiscussionReply, depth = 0, parentName?: string) => {
    const initial = (item.author_name || 'S').trim()[0]?.toUpperCase() || 'S';
    const isNested = depth > 0;
    const isDeep = depth >= 3;
    // Cap indent to prevent horizontal blowout: depth 1 gets 14px, depth 2 gets 10px, depth >= 3 gets 0px
    const indentMargin = depth === 1 ? 14 : depth === 2 ? 10 : 0;
    const isAuthor = currentUserId && item.author === currentUserId;

    return (
      <View
        key={item.id}
        style={[
          styles.replyCard,
          {
            backgroundColor: isNested
              ? isDark
                ? '#121417'
                : '#f8fafc'
              : colors.surface,
            borderColor: item.is_accepted ? colors.success : colors.cardBorder,
            marginLeft: indentMargin,
            borderLeftWidth: isNested ? (isDeep ? 3 : 2.5) : 1,
            borderLeftColor: item.is_accepted
              ? colors.success
              : isNested
              ? isDark
                ? 'rgba(99, 102, 241, 0.7)'
                : 'rgba(79, 70, 229, 0.6)'
              : colors.cardBorder,
          },
          item.is_accepted && styles.acceptedReplyCard,
        ]}
      >
        {/* Deep thread lineage indicator so context is crystal clear without squeezing width */}
        {isDeep && (
          <View style={styles.deepLineageRow}>
            <CornerDownRight size={11} color={colors.primary} />
            <Text style={[styles.deepLineageText, { color: colors.primary }]}>
              Thread reply {parentName ? `to @${parentName}` : `(Level ${depth + 1})`}
            </Text>
          </View>
        )}

        {/* Author Header */}
        <View style={styles.replyHeader}>
          <TouchableOpacity
            disabled={!item.author}
            onPress={() => item.author && onOpenProfile?.(item.author)}
            activeOpacity={0.7}
            style={styles.authorRow}
          >
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Text style={[styles.avatarText, { color: colors.primary }]}>{initial}</Text>
            </View>
            <View>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>{item.author_name}</Text>
              <Text style={[styles.replyTime, { color: colors.textMuted }]}>{formatTimeAgo(item.created_at)}</Text>
            </View>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Accepted Solution Badge */}
            {item.is_accepted && (
              <View style={styles.acceptedBadge}>
                <Check size={12} color="#10b981" />
                <Text style={styles.acceptedBadgeText}>ACCEPTED SOLUTION</Text>
              </View>
            )}

            {/* Author Delete Option */}
            {isAuthor && onDeleteReply && (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={() => handleDeletePrompt(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Delete reply"
              >
                <Trash2 size={13} color={colors.danger} />
              </TouchableOpacity>
            )}

            {/* Classmate Report Option */}
            {!isAuthor && onReportReply && (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={() => onReportReply(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Report reply"
              >
                <Flag size={12} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content */}
        <Text style={[styles.replyContent, { color: colors.textSecondary }]}>
          {item.content.split(/(@[a-zA-Z0-9_\.]+(?=\s|$|[.,!?]))/g).map((part, idx) => {
            if (part.startsWith('@')) {
              return (
                <Text key={idx} style={[styles.mentionHighlight, { color: colors.primary }]}>
                  {part}
                </Text>
              );
            }
            return <Text key={idx}>{part}</Text>;
          })}
        </Text>

        {/* Actions Bar: Upvote, Reply, Accept */}
        <View style={styles.replyActions}>
          <TouchableOpacity
            style={[
              styles.voteBtn,
              {
                backgroundColor: colors.surfaceLight,
                borderColor: colors.cardBorder,
              },
              item.user_has_voted && {
                backgroundColor: isDark ? 'rgba(94, 106, 210, 0.25)' : 'rgba(79, 70, 229, 0.12)',
                borderColor: colors.primary,
              },
            ]}
            onPress={() => onVoteReply(item)}
            activeOpacity={0.7}
          >
            <ArrowBigUp
              size={14}
              color={item.user_has_voted ? colors.primary : colors.textMuted}
              fill={item.user_has_voted ? colors.primary : 'none'}
            />
            <Text
              style={[
                styles.voteCount,
                { color: item.user_has_voted ? colors.primary : colors.textSecondary },
              ]}
            >
              {item.upvotes_count || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.replyActionBtn}
            onPress={() => onReplyToReply(item)}
            activeOpacity={0.7}
          >
            <CornerDownRight size={13} color={colors.textSecondary} />
            <Text style={[styles.replyActionText, { color: colors.textSecondary }]}>Reply</Text>
          </TouchableOpacity>

          {/* Mark as Accepted (Visible to question author if not yet solved or if toggling) */}
          {isQuestionAuthor && !isSolved && !item.is_accepted && onAcceptReply && (
            <TouchableOpacity
              style={styles.acceptActionBtn}
              onPress={() => onAcceptReply(item)}
              activeOpacity={0.7}
            >
              <Check size={12} color="#10b981" />
              <Text style={styles.acceptActionText}>Accept Answer</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Nested Child Replies (Recursive Tree with controlled indentation) */}
        {item.children && item.children.length > 0 && (
          <View style={styles.childrenContainer}>
            {item.children.map((child) => renderReplyItem(child, depth + 1, item.author_name))}
          </View>
        )}
      </View>
    );
  };

  return <View style={styles.container}>{replies.map((r) => renderReplyItem(r, 0))}</View>;
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginTop: 8,
  },
  replyCard: {
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    marginTop: 6,
  },
  acceptedReplyCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
  },
  replyTime: {
    fontSize: 10,
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  acceptedBadgeText: {
    color: '#10b981',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  replyContent: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 10,
  },
  mentionHighlight: {
    fontWeight: '700',
  },
  replyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  voteCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  replyActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  acceptActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  acceptActionText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  childrenContainer: {
    marginTop: 8,
  },
  deepLineageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    opacity: 0.85,
  },
  deepLineageText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iconActionBtn: {
    padding: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
