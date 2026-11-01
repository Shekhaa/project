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
import { colors } from '../../theme/colors';
import { Search, Plus, X } from 'lucide-react-native';

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
  onSelectDiscussion: (d: Discussion) => void;
  onVoteDiscussion: (d: Discussion) => void;
  onRefresh: () => void;
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
  onSelectDiscussion,
  onVoteDiscussion,
  onRefresh,
}) => {
  return (
    <View style={styles.container}>
      {/* Top Search & Ask Bar */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchBox}>
          <Search size={14} color="#64748b" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search questions, notes, topics..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={14} color="#64748b" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity style={styles.askBtn} onPress={onOpenComposer} activeOpacity={0.85}>
          <Plus size={15} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.askBtnText}>Ask / Discuss</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {(
            [
              { key: 'ALL', label: 'All' },
              { key: 'QUESTION', label: '❓ Questions' },
              { key: 'RESOURCE', label: '📚 Resources' },
              { key: 'GENERAL', label: '💬 General' },
              { key: 'SOLVED', label: '✓ Solved' },
            ] as const
          ).map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sort Bar */}
      <View style={styles.sortBar}>
        {(
          [
            { key: 'latest', label: 'Latest' },
            { key: 'upvoted', label: 'Most Upvoted' },
            { key: 'popular', label: 'Popular' },
            { key: 'unanswered', label: 'Unanswered' },
          ] as const
        ).map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortPill, sort === s.key && styles.sortPillActive]}
            onPress={() => setSort(s.key)}
          >
            <Text style={[styles.sortPillText, sort === s.key && styles.sortPillTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Discussions Stream */}
      {loading && discussions.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading community discussions...</Text>
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
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💡</Text>
              <Text style={styles.emptyTitle}>No discussions found</Text>
              <Text style={styles.emptySubtitle}>
                Got a doubt about syllabus, exams, or projects? Be the first to start a discussion!
              </Text>
              <TouchableOpacity style={styles.emptyActionBtn} onPress={onOpenComposer}>
                <Text style={styles.emptyActionText}>Start a Discussion</Text>
              </TouchableOpacity>
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
    backgroundColor: colors.background,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12.5,
    padding: 0,
  },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
  },
  askBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  filterChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  filterChipText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sortPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  sortPillActive: {
    backgroundColor: '#1e293b',
  },
  sortPillText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  sortPillTextActive: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 12,
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
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyActionBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyActionText: {
    color: '#38bdf8',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
