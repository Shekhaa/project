import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AtSign, CheckCircle2, X } from 'lucide-react-native';
import { authService } from '../../services/authService';
import { useTheme } from '../../theme/ThemeContext';
import { UserAvatar } from './UserAvatar';

export interface ActiveMentionMatch {
  start: number;
  end: number;
  query: string;
}

export interface MentionCandidate {
  id: number;
  username?: string;
  full_name?: string;
  email?: string;
  avatar?: string | null;
  profile_picture?: string | null;
  college_name?: string;
  branch_name?: string;
  course_branch?: string;
  verified?: boolean;
  is_verified?: boolean;
  is_verified_student?: boolean;
  verification_tier?: string;
}

/**
 * Extracts an active `@query` right before the cursor (or end of text).
 * Triggers as soon as `@` is typed (even with empty query `""`) so students
 * immediately see directory suggestions just like Chat's Search Directory.
 */
export const extractActiveMention = (
  text: string,
  cursorPos?: number
): ActiveMentionMatch | null => {
  if (!text) return null;
  const end =
    typeof cursorPos === 'number' && cursorPos >= 0
      ? Math.min(cursorPos, text.length)
      : text.length;
  const beforeCursor = text.slice(0, end);
  const match = beforeCursor.match(/(?:^|[\s(\[{.,!?])@([a-zA-Z0-9_.-]{0,32})$/);
  if (!match) return null;
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex < 0) return null;
  return {
    start: atIndex,
    end,
    query: match[1] || '',
  };
};

/**
 * Replaces the active `@query` token with `@username ` and returns the updated
 * string plus the exact next cursor index.
 */
export const applyMentionSelection = (
  text: string,
  mention: ActiveMentionMatch,
  rawUsername: string
): { nextText: string; nextCursor: number } => {
  const cleanUsername = (rawUsername || '').replace(/^@+/, '').trim();
  const after = text.slice(mention.end);
  const needsTrailingSpace = !after.startsWith(' ') && !after.startsWith('\n');
  const inserted = `@${cleanUsername}${needsTrailingSpace ? ' ' : ''}`;
  const nextText = `${text.slice(0, mention.start)}${inserted}${after}`;
  const nextCursor = mention.start + inserted.length;
  return { nextText, nextCursor };
};

interface MentionSuggestionsBarProps {
  query: string | null;
  onSelect: (user: MentionCandidate & { username: string }) => void;
  onClose?: () => void;
  prioritizedUsers?: MentionCandidate[];
  maxHeight?: number;
}

const EMPTY_PRIORITIZED_USERS: MentionCandidate[] = [];

export const MentionSuggestionsBar: React.FC<MentionSuggestionsBarProps> = ({
  query,
  onSelect,
  onClose,
  prioritizedUsers = EMPTY_PRIORITIZED_USERS,
  maxHeight = 220,
}) => {
  const { colors } = useTheme();
  const [results, setResults] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  const prioritizedUsersRef = useRef<MentionCandidate[]>(prioritizedUsers);
  prioritizedUsersRef.current = prioritizedUsers;
  const prioritizedKey = prioritizedUsers
    .map((u) => `${u.id}:${u.username || ''}`)
    .join('|');

  useEffect(() => {
    if (query === null) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const trimmedQuery = query.trim();
    const normalizedQuery = trimmedQuery.toLowerCase();

    const mergeCandidates = (remote: MentionCandidate[]): MentionCandidate[] => {
      const indexByKey = new Map<string, number>();
      const merged: MentionCandidate[] = [];

      const pushCandidate = (candidate: MentionCandidate) => {
        const uname = (
          candidate.username ||
          (candidate.email ? candidate.email.split('@')[0] : '') ||
          ''
        )
          .replace(/^@+/, '')
          .trim();
        if (!uname) return;
        const key = `${candidate.id}:${uname.toLowerCase()}`;
        const existingIdx = indexByKey.get(key);
        if (existingIdx !== undefined) {
          const prev = merged[existingIdx];
          merged[existingIdx] = {
            ...prev,
            full_name: prev.full_name || candidate.full_name,
            email: prev.email || candidate.email,
            avatar: prev.avatar || candidate.avatar || candidate.profile_picture,
            profile_picture:
              prev.profile_picture || candidate.profile_picture || candidate.avatar,
            college_name: prev.college_name || candidate.college_name,
            branch_name: prev.branch_name || candidate.branch_name,
            course_branch: prev.course_branch || candidate.course_branch,
            verified: Boolean(prev.verified || candidate.verified),
            is_verified: Boolean(prev.is_verified || candidate.is_verified),
            is_verified_student: Boolean(
              prev.is_verified_student || candidate.is_verified_student
            ),
            verification_tier: prev.verification_tier || candidate.verification_tier,
          };
          return;
        }
        indexByKey.set(key, merged.length);
        merged.push({ ...candidate, username: uname });
      };

      // Include prioritized members (e.g. community members) matching query first
      for (const local of prioritizedUsersRef.current) {
        const haystack = `${local.full_name || ''} ${local.username || ''} ${local.email || ''}`.toLowerCase();
        if (!normalizedQuery || haystack.includes(normalizedQuery)) {
          pushCandidate(local);
        }
      }

      for (const item of remote) {
        pushCandidate(item);
      }

      return merged.slice(0, 30);
    };

    // Show immediate prioritized matches while fetching full directory
    if (prioritizedUsersRef.current.length > 0) {
      setResults(mergeCandidates([]));
    }
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const remote = await authService.searchStudents(trimmedQuery);
        if (!cancelled) {
          setResults(mergeCandidates(Array.isArray(remote) ? remote : []));
        }
      } catch {
        if (!cancelled) {
          setResults(mergeCandidates([]));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, prioritizedKey]);

  if (query === null) return null;

  const listMaxHeight = Math.max(110, maxHeight - 40);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.cardBorder,
          maxHeight,
        },
      ]}
    >
      <View
        style={[
          styles.headerRow,
          {
            borderBottomColor: colors.hairline,
            backgroundColor: colors.surfaceLight,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <AtSign size={13} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {query.trim()
              ? `Students matching "@${query.trim()}"`
              : 'Tag a student (Campus Directory)'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />}
          {onClose && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {results.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {loading
              ? 'Searching campus directory...'
              : query.trim()
              ? `No students found for "@${query.trim()}"`
              : 'Type a name, username, or roll number'}
          </Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={[styles.listScroll, { maxHeight: listMaxHeight }]}
        >
          {results.map((item) => {
            const username =
              (item.username || (item.email ? item.email.split('@')[0] : '') || 'student')
                .replace(/^@+/, '')
                .trim();
            const displayName = item.full_name || username;
            const subtitleParts = [
              `@${username}`,
              item.branch_name || item.course_branch || '',
              item.college_name || '',
            ].filter(Boolean);
            const isVerified =
              Boolean(item.verified || item.is_verified || item.is_verified_student) ||
              item.verification_tier === 'FULLY_VERIFIED';

            return (
              <TouchableOpacity
                key={`${item.id}-${username}`}
                style={[styles.userRow, { borderBottomColor: colors.hairline }]}
                activeOpacity={0.75}
                onPress={() => onSelect({ ...item, username })}
              >
                <UserAvatar
                  uri={item.avatar || item.profile_picture}
                  name={displayName}
                  size={34}
                />
                <View style={styles.userInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.fullName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {isVerified && (
                      <CheckCircle2
                        size={13}
                        color={colors.primary}
                        style={{ marginLeft: 5 }}
                      />
                    )}
                  </View>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                    {subtitleParts.join(' • ')}
                  </Text>
                </View>
                <View style={[styles.tagPill, { backgroundColor: colors.primary + '1A' }]}>
                  <Text style={[styles.tagPillText, { color: colors.primary }]}>Tag</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  listScroll: {
    maxHeight: 180,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullName: {
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12.5,
  },
});
