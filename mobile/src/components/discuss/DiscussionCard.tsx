import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Discussion } from '../../services/communityService';
import { ArrowBigUp, MessageSquare, Paperclip, CheckCircle, Pin } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

interface DiscussionCardProps {
  discussion: Discussion;
  onPress: (discussion: Discussion) => void;
  onVote: (discussion: Discussion) => void;
  onAuthorPress?: (authorId: number) => void;
}

export const DiscussionCard: React.FC<DiscussionCardProps> = ({
  discussion,
  onPress,
  onVote,
  onAuthorPress,
}) => {
  const { colors, isDark } = useTheme();

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'QUESTION':
        return '#10b981';
      case 'RESOURCE':
        return '#f59e0b';
      case 'ANNOUNCEMENT':
        return '#8b5cf6';
      default:
        return '#3b82f6';
    }
  };

  const badgeColor = getTypeBadgeColor(discussion.discussion_type);
  const authorInitial = (discussion.author_name || 'S').trim()[0]?.toUpperCase() || 'S';
  const hasAttachments = discussion.attachments && discussion.attachments.length > 0;

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

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.cardBorder,
        },
      ]}
      onPress={() => onPress(discussion)}
      activeOpacity={0.88}
    >
      {/* Header Row: Badges & Pinned */}
      <View style={styles.headerRow}>
        <View style={styles.badgeGroup}>
          {discussion.is_pinned && (
            <View style={styles.pinnedBadge}>
              <Pin size={11} color="#f59e0b" />
              <Text style={styles.pinnedBadgeText}>PINNED</Text>
            </View>
          )}

          <View style={[styles.typeBadge, { backgroundColor: `${badgeColor}18`, borderColor: `${badgeColor}44` }]}>
            <Text style={[styles.typeBadgeText, { color: badgeColor }]}>
              {discussion.discussion_type === 'QUESTION' ? 'Question' : discussion.discussion_type}
            </Text>
          </View>

          {discussion.is_solved && (
            <View style={styles.solvedBadge}>
              <CheckCircle size={11} color="#10b981" />
              <Text style={styles.solvedBadgeText}>SOLVED</Text>
            </View>
          )}
        </View>

        <Text style={[styles.timeAgo, { color: colors.textMuted }]}>{formatTimeAgo(discussion.created_at)}</Text>
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {discussion.title}
      </Text>

      {/* Snippet */}
      {discussion.content ? (
        <Text style={[styles.contentSnippet, { color: colors.textSecondary }]} numberOfLines={2}>
          {discussion.content}
        </Text>
      ) : null}

      {/* Accepted Answer Preview */}
      {discussion.accepted_answer_snippet && (
        <View style={styles.acceptedAnswerBox}>
          <View style={styles.acceptedAnswerHeader}>
            <CheckCircle size={12} color="#10b981" />
            <Text style={styles.acceptedAnswerLabel}>
              Accepted Solution by {discussion.accepted_answer_snippet.author_name}
            </Text>
          </View>
          <Text style={[styles.acceptedAnswerContent, { color: colors.textPrimary }]} numberOfLines={2}>
            {discussion.accepted_answer_snippet.content}
          </Text>
        </View>
      )}

      {/* Footer Info: Author, Attachments, Upvotes & Replies */}
      <View style={[styles.footerRow, { borderTopColor: colors.hairline }]}>
        <TouchableOpacity
          disabled={!discussion.author}
          onPress={() => discussion.author && onAuthorPress?.(discussion.author)}
          activeOpacity={0.7}
          style={styles.authorGroup}
        >
          <View
            style={[
              styles.authorAvatar,
              {
                backgroundColor: colors.surfaceLight,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.authorAvatarText, { color: colors.primary }]}>{authorInitial}</Text>
          </View>
          <Text style={[styles.authorName, { color: colors.textSecondary }]} numberOfLines={1}>
            {discussion.author_name}
          </Text>
        </TouchableOpacity>

        <View style={styles.actionsGroup}>
          {hasAttachments && (
            <View style={styles.statItem}>
              <Paperclip size={13} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>{discussion.attachments?.length}</Text>
            </View>
          )}

          <View style={styles.statItem}>
            <MessageSquare size={13} color={colors.textMuted} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{discussion.replies_count || 0}</Text>
          </View>

          {/* Upvote Button */}
          <TouchableOpacity
            style={[
              styles.voteBtn,
              {
                backgroundColor: colors.surfaceLight,
                borderColor: colors.cardBorder,
              },
              discussion.user_has_voted && {
                backgroundColor: isDark ? 'rgba(94, 106, 210, 0.25)' : 'rgba(79, 70, 229, 0.12)',
                borderColor: colors.primary,
              },
            ]}
            onPress={() => onVote(discussion)}
            activeOpacity={0.7}
          >
            <ArrowBigUp
              size={15}
              color={discussion.user_has_voted ? colors.primary : colors.textMuted}
              fill={discussion.user_has_voted ? colors.primary : 'none'}
            />
            <Text
              style={[
                styles.voteCount,
                { color: discussion.user_has_voted ? colors.primary : colors.textSecondary },
              ]}
            >
              {discussion.upvotes_count || 0}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pinnedBadgeText: {
    color: '#f59e0b',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  solvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  solvedBadgeText: {
    color: '#10b981',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  timeAgo: {
    fontSize: 11,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 6,
  },
  contentSnippet: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  acceptedAnswerBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  acceptedAnswerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  acceptedAnswerLabel: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  acceptedAnswerContent: {
    fontSize: 12,
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  authorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  authorAvatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  voteCount: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
