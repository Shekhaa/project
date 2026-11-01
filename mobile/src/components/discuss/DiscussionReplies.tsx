import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DiscussionReply } from '../../services/communityService';
import { ArrowBigUp, Check, CornerDownRight } from 'lucide-react-native';

interface DiscussionRepliesProps {
  replies: DiscussionReply[];
  currentUserId?: number;
  isQuestionAuthor?: boolean;
  isSolved?: boolean;
  onVoteReply: (reply: DiscussionReply) => void;
  onAcceptReply?: (reply: DiscussionReply) => void;
  onReplyToReply: (reply: DiscussionReply) => void;
}

export const DiscussionReplies: React.FC<DiscussionRepliesProps> = ({
  replies,
  isQuestionAuthor,
  isSolved,
  onVoteReply,
  onAcceptReply,
  onReplyToReply,
}) => {
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

  const renderReplyItem = (item: DiscussionReply, isNested = false) => {
    const initial = (item.author_name || 'S').trim()[0]?.toUpperCase() || 'S';

    return (
      <View
        key={item.id}
        style={[
          styles.replyCard,
          isNested && styles.nestedReplyCard,
          item.is_accepted && styles.acceptedReplyCard,
        ]}
      >
        {/* Author Header */}
        <View style={styles.replyHeader}>
          <View style={styles.authorRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View>
              <Text style={styles.authorName}>{item.author_name}</Text>
              <Text style={styles.replyTime}>{formatTimeAgo(item.created_at)}</Text>
            </View>
          </View>

          {/* Accepted Solution Badge */}
          {item.is_accepted && (
            <View style={styles.acceptedBadge}>
              <Check size={12} color="#10b981" />
              <Text style={styles.acceptedBadgeText}>ACCEPTED SOLUTION</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <Text style={styles.replyContent}>
          {item.content.split(/(@[a-zA-Z0-9_\.]+(?=\s|$|[.,!?]))/g).map((part, idx) => {
            if (part.startsWith('@')) {
              return (
                <Text key={idx} style={styles.mentionHighlight}>
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
            style={[styles.voteBtn, item.user_has_voted && styles.voteBtnActive]}
            onPress={() => onVoteReply(item)}
            activeOpacity={0.7}
          >
            <ArrowBigUp
              size={14}
              color={item.user_has_voted ? '#38bdf8' : '#94a3b8'}
              fill={item.user_has_voted ? '#38bdf8' : 'none'}
            />
            <Text style={[styles.voteCount, item.user_has_voted && styles.voteCountActive]}>
              {item.upvotes_count || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.replyActionBtn}
            onPress={() => onReplyToReply(item)}
            activeOpacity={0.7}
          >
            <CornerDownRight size={13} color="#94a3b8" />
            <Text style={styles.replyActionText}>Reply</Text>
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

        {/* Nested Child Replies */}
        {item.children && item.children.length > 0 && (
          <View style={styles.childrenContainer}>
            {item.children.map((child) => renderReplyItem(child, true))}
          </View>
        )}
      </View>
    );
  };

  return <View style={styles.container}>{replies.map((r) => renderReplyItem(r))}</View>;
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginTop: 8,
  },
  replyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  nestedReplyCard: {
    backgroundColor: '#131e33',
    marginLeft: 14,
    marginTop: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#38bdf8',
  },
  acceptedReplyCard: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
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
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  authorName: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '600',
  },
  replyTime: {
    color: '#64748b',
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
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  mentionHighlight: {
    color: '#38bdf8',
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
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  voteBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  voteCount: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  voteCountActive: {
    color: '#38bdf8',
  },
  replyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  replyActionText: {
    color: '#94a3b8',
    fontSize: 11.5,
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
});
