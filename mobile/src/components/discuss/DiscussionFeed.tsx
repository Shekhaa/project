import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Discussion } from '../../services/communityService';
import { DiscussionCard } from './DiscussionCard';
import { useTheme } from '../../theme/ThemeContext';
import { Search, Plus, X, Mic } from 'lucide-react-native';

interface DiscussionFeedProps {
  discussions: Discussion[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filter: 'ALL' | 'QUESTION' | 'RESOURCE' | 'GENERAL' | 'SOLVED';
  setFilter: (f: 'ALL' | 'QUESTION' | 'RESOURCE' | 'GENERAL' | 'SOLVED') => void;
  sort: 'latest' | 'upvoted' | 'popular' | 'unanswered';
  setSort: (s: 'latest' | 'upvoted' | 'popular' | 'unanswered') => void;
  onOpenComposer: () => void;
  onOpenVoiceComposer?: () => void;
  onSelectDiscussion: (d: Discussion) => void;
  onVoteDiscussion: (d: Discussion) => void;
  onRefresh: () => void;
  onOpenProfile?: (userId: number) => void;
}

export const DiscussionFeed: React.FC<DiscussionFeedProps> = ({
  discussions,
  loading,
  searchQuery,
  setSearchQuery,
  filter,
  setFilter,
  sort,
  setSort,
  onOpenComposer,
  onOpenVoiceComposer,
  onSelectDiscussion,
  onVoteDiscussion,
  onRefresh,
  onOpenProfile,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Search, Voice & Ask Bar */}
      <View style={[styles.searchBarRow, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isDark ? '#141516' : '#f1f5f9',
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Search size={14} color={colors.textMuted} style={{ marginRight: 5 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search discussions..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[
            styles.voiceBtn,
            {
              backgroundColor: isDark ? '#141516' : '#f1f5f9',
              borderColor: colors.cardBorder,
            },
          ]}
          onPress={onOpenVoiceComposer || onOpenComposer}
          activeOpacity={0.85}
          accessibilityLabel="Post a voice discussion"
        >
          <Mic size={14} color={colors.primary} />
          <Text style={[styles.voiceBtnText, { color: colors.textPrimary }]}>Voice</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.askBtn, { backgroundColor: colors.primary }]}
          onPress={onOpenComposer}
          activeOpacity={0.85}
        >
          <Plus size={14} color="#fff" style={{ marginRight: 3 }} />
          <Text style={styles.askBtnText}>Ask</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips Bar */}
      <View style={[styles.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {(
            [
              { key: 'ALL', label: 'All' },
              { key: 'QUESTION', label: '❓ Questions' },
              { key: 'RESOURCE', label: '📚 Resources' },
              { key: 'GENERAL', label: '💬 General' },
              { key: 'SOLVED', label: '✓ Solved' },
            ] as const
          ).map((item) => {
            const active = filter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active
                      ? isDark
                        ? 'rgba(94, 106, 210, 0.25)'
                        : 'rgba(79, 70, 229, 0.12)'
                      : isDark
                      ? '#141516'
                      : '#f8fafc',
                    borderColor: active ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => setFilter(item.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: active ? colors.primary : colors.textSecondary,
                      fontWeight: active ? '700' : '600',
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort Bar */}
      <View style={[styles.sortBar, { backgroundColor: colors.background }]}>
        {(
          [
            { key: 'latest', label: 'Latest' },
            { key: 'upvoted', label: 'Most Upvoted' },
            { key: 'popular', label: 'Popular' },
            { key: 'unanswered', label: 'Unanswered' },
          ] as const
        ).map((s) => {
          const active = sort === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[
                styles.sortPill,
                active && {
                  backgroundColor: isDark ? '#141516' : '#e2e8f0',
                },
              ]}
              onPress={() => setSort(s.key)}
            >
              <Text
                style={[
                  styles.sortPillText,
                  {
                    color: active ? colors.primary : colors.textMuted,
                    fontWeight: active ? '700' : '600',
                  },
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Discussions Stream */}
      {loading && discussions.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading discussions...</Text>
        </View>
      ) : (
        <FlatList
          data={discussions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={onRefresh}
          refreshing={loading}
          renderItem={({ item }) => (
            <DiscussionCard
              discussion={item}
              onPress={onSelectDiscussion}
              onVote={onVoteDiscussion}
              onAuthorPress={onOpenProfile}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💡</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No discussions found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Got a doubt about syllabus, exams, or projects? Post a question or record a quick voice note!
              </Text>
              <View style={styles.emptyActionRow}>
                <TouchableOpacity
                  style={[
                    styles.emptyActionBtn,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.cardBorder,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    },
                  ]}
                  onPress={onOpenVoiceComposer || onOpenComposer}
                >
                  <Mic size={14} color={colors.primary} />
                  <Text style={[styles.emptyActionText, { color: colors.textPrimary }]}>Voice Note</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.emptyActionBtn,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={onOpenComposer}
                >
                  <Text style={[styles.emptyActionText, { color: '#ffffff' }]}>+ Start Discussion</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    height: 36,
    minWidth: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
    minWidth: 0,
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
  },
  voiceBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 8,
  },
  askBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  sortPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  sortPillText: {
    fontSize: 11.5,
  },
  listContent: {
    padding: 14,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    marginTop: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  emptyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  emptyActionBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
