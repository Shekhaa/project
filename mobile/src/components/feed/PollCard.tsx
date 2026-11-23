import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { BarChart2, CheckCircle2, Lock } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Poll, PollOption, postService } from '../../services/postService';

interface PollCardProps {
  poll: Poll;
  postId: number;
  canVote?: boolean;
  onRequireAuth?: () => void;
  onRequireVerify?: (reason?: string) => void;
  onPollUpdated?: (updatedPoll: Poll) => void;
}

export const PollCard: React.FC<PollCardProps> = ({
  poll: initialPoll,
  postId,
  canVote = true,
  onRequireAuth,
  onRequireVerify,
  onPollUpdated,
}) => {
  const { colors, isDark } = useTheme();
  const [poll, setPoll] = useState<Poll>(initialPoll);
  const [submittingOptionId, setSubmittingOptionId] = useState<number | null>(null);

  // Sync if parent updates poll
  React.useEffect(() => {
    setPoll(initialPoll);
  }, [initialPoll]);

  const handleVote = async (option: PollOption) => {
    if (poll.is_closed) return;

    if (!canVote) {
      onRequireVerify?.('Verify your student ID or enter an invite code to vote in campus polls.');
      return;
    }

    if (poll.user_voted_option_id === option.id) {
      return; // Already voted for this option
    }

    setSubmittingOptionId(option.id);

    // Optimistic UI update for instant feel
    const prevPoll = { ...poll };
    const prevOptionId = poll.user_voted_option_id;
    const isNewVote = !poll.has_voted;
    const newTotal = isNewVote ? poll.total_votes + 1 : poll.total_votes;

    const optimisticOptions = poll.options.map((opt) => {
      let count = opt.votes_count;
      if (opt.id === option.id) count += 1;
      else if (opt.id === prevOptionId && count > 0) count -= 1;
      const pct = newTotal > 0 ? Math.round((count / newTotal) * 1000) / 10 : 0;
      return { ...opt, votes_count: count, percentage: pct };
    });

    const optimisticPoll: Poll = {
      ...poll,
      total_votes: newTotal,
      has_voted: true,
      user_voted_option_id: option.id,
      options: optimisticOptions,
    };
    setPoll(optimisticPoll);

    try {
      const updated = await postService.votePoll(postId, option.id);
      setPoll(updated);
      onPollUpdated?.(updated);
    } catch (err: any) {
      // Rollback on error
      setPoll(prevPoll);
      if (err?.response?.status === 401) {
        onRequireAuth?.();
      } else if (err?.response?.status === 403) {
        onRequireVerify?.(err?.response?.data?.error || 'Campus verification required to vote.');
      }
    } finally {
      setSubmittingOptionId(null);
    }
  };

  const showPercentages = poll.has_voted || poll.is_closed;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.surfaceLight,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      {/* Poll Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.12)' },
            ]}
          >
            <BarChart2 size={15} color={colors.primary} />
          </View>
          <Text style={[styles.questionText, { color: colors.textPrimary }]}>
            {poll.question}
          </Text>
        </View>
        {poll.is_closed && (
          <View style={[styles.closedBadge, { backgroundColor: colors.surfaceLight }]}>
            <Lock size={12} color={colors.textMuted} />
            <Text style={[styles.closedText, { color: colors.textMuted }]}>Closed</Text>
          </View>
        )}
      </View>

      {/* Options List */}
      <View style={styles.optionsList}>
        {poll.options.map((option) => {
          const isSelected = poll.user_voted_option_id === option.id;
          const isPendingThis = submittingOptionId === option.id;
          const pct = option.percentage || 0;

          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={poll.is_closed ? 1 : 0.78}
              onPress={() => handleVote(option)}
              disabled={poll.is_closed || isPendingThis}
              style={[
                styles.optionButton,
                {
                  backgroundColor: isDark ? '#121214' : colors.card,
                  borderColor: isSelected ? colors.primary : colors.cardBorder,
                  borderWidth: isSelected ? 1.5 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              {/* Animated / Fill Bar when votes exist */}
              {showPercentages && (
                <View
                  style={[
                    styles.fillBar,
                    {
                      width: `${Math.max(0, Math.min(100, pct))}%`,
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(99, 102, 241, 0.30)'
                          : 'rgba(99, 102, 241, 0.20)'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(0, 0, 0, 0.05)',
                    },
                  ]}
                />
              )}

              {/* Option Row Content */}
              <View style={styles.optionContent}>
                <View style={styles.optionTextWrap}>
                  {isSelected && (
                    <CheckCircle2
                      size={15}
                      color={colors.primary}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: isSelected ? colors.primary : colors.textPrimary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {option.text}
                  </Text>
                </View>

                {/* Percentage or Spinner */}
                <View style={styles.optionMetaWrap}>
                  {isPendingThis ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : showPercentages ? (
                    <Text
                      style={[
                        styles.percentText,
                        {
                          color: isSelected ? colors.primary : colors.textSecondary,
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                    >
                      {pct.toFixed(0)}%
                    </Text>
                  ) : (
                    <View
                      style={[
                        styles.radioCircle,
                        {
                          borderColor: colors.cardBorder,
                          backgroundColor: 'transparent',
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer: Vote Count & State */}
      <View style={styles.footer}>
        <Text style={[styles.voteCountText, { color: colors.textMuted }]}>
          {poll.total_votes} vote{poll.total_votes === 1 ? '' : 's'}
          {poll.has_voted ? ' • Vote recorded' : ' • Tap an option to vote'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  closedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  closedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  optionsList: {
    gap: 8,
  },
  optionButton: {
    position: 'relative',
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fillBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 2,
  },
  optionTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  optionLabel: {
    fontSize: 13.5,
  },
  optionMetaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 38,
  },
  percentText: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  footer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voteCountText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
});
