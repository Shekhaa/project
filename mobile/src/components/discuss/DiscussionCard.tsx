import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Discussion } from '../../services/communityService';
import { ArrowBigUp, MessageSquare, Paperclip, CheckCircle, Pin } from 'lucide-react-native';
import { colors } from '../../theme/colors';

interface DiscussionCardProps {
  discussion: Discussion;
  onPress: (discussion: Discussion) => void;
  onVote: (discussion: Discussion) => void;
}

export const DiscussionCard: React.FC<DiscussionCardProps> = ({
  discussion,
  onPress,
  onVote,
}) => {
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
      style={styles.card}
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

          <View style={[styles.typeBadge, { backgroundColor: `${badgeColor}1c`, borderColor: `${badgeColor}55` }]}>
            <Text style={[styles.typeBadgeText, { color: badgeColor }]}>
              {discussion.discussion_type === 'QUESTION' ? '❓ Question' : discussion.discussion_type}
            </Text>
          </View>

          {discussion.is_solved && (
            <View style={styles.solvedBadge}>
              <CheckCircle size={11} color="#10b981" />
              <Text style={styles.solvedBadgeText}>SOLVED</Text>
            </View>
          )}
        </View>

        <Text style={styles.timeAgo}>{formatTimeAgo(discussion.created_at)}</Text>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {discussion.title}
      </Text>

      {/* Snippet */}
      {discussion.content ? (
        <Text style={styles.contentSnippet} numberOfLines={2}>
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
          <Text style={styles.acceptedAnswerContent} numberOfLines={2}>
            {discussion.accepted_answer_snippet.content}
          </Text>
        </View>
      )}

      {/* Footer Info: Author, Attachments, Upvotes & Replies */}
      <View style={styles.footerRow}>
        <View style={styles.authorGroup}>
          <View style={styles.authorAvatar}>
            <Text style={styles.authorAvatarText}>{authorInitial}</Text>
          </View>
          <Text style={styles.authorName} numberOfLines={1}>
            {discussion.author_name}
          </Text>
        </View>

        <View style={styles.actionsGroup}>
          {hasAttachments && (
            <View style={styles.statItem}>
              <Paperclip size={13} color="#94a3b8" />
              <Text style={styles.statText}>{discussion.attachments?.length}</Text>
            </View>
          )}

          <View style={styles.statItem}>
            <MessageSquare size={13} color="#94a3b8" />
            <Text style={styles.statText}>{discussion.replies_count || 0}</Text>
          </View>

          {/* Upvote Button */}
          <TouchableOpacity
            style={[styles.voteBtn, discussion.user_has_voted && styles.voteBtnActive]}
            onPress={() => onVote(discussion)}
            activeOpacity={0.7}
          >
            <ArrowBigUp
              size={15}
              color={discussion.user_has_voted ? '#38bdf8' : '#94a3b8'}
              fill={discussion.user_has_voted ? '#38bdf8' : 'none'}
            />
            <Text style={[styles.voteCount, discussion.user_has_voted && styles.voteCountActive]}>
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
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    color: '#64748b',
    fontSize: 11,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: 6,
  },
  contentSnippet: {
    fontSize: 12.5,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 10,
  },
  acceptedAnswerBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  acceptedAnswerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  acceptedAnswerLabel: {
    color: '#10b981',
    fontSize: 10.5,
    fontWeight: '700',
  },
  acceptedAnswerContent: {
    color: '#cbd5e1',
    fontSize: 11.5,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  authorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  authorAvatarText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  authorName: {
    color: '#cbd5e1',
    fontSize: 11.5,
    fontWeight: '500',
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
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  voteBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  voteCount: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  voteCountActive: {
    color: '#38bdf8',
  },
});
