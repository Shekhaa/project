import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Community, Discussion, communityService } from '../../services/communityService';
import { DiscussionFeed } from './DiscussionFeed';
import { DiscussionComposer } from './DiscussionComposer';
import { DiscussionDetail } from './DiscussionDetail';

interface DiscussTabProps {
  community: Community;
  currentUser?: any;
  onOpenProfile?: (userId: number) => void;
}

export const DiscussTab: React.FC<DiscussTabProps> = ({ community, currentUser, onOpenProfile }) => {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'QUESTION' | 'RESOURCE' | 'GENERAL' | 'SOLVED'>('ALL');
  const [sort, setSort] = useState<'latest' | 'upvoted' | 'popular' | 'unanswered'>('latest');

  // Modals
  const [composerVisible, setComposerVisible] = useState(false);
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null);

  const fetchDiscussions = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { sort };
      if (filter === 'SOLVED') {
        params.status = 'solved';
      } else if (filter !== 'ALL') {
        params.type = filter;
      }
      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }

      const list = await communityService.getDiscussions(community.slug, params);
      setDiscussions(list);
    } catch (e) {
      console.log('Error loading discussions', e);
    } finally {
      setLoading(false);
    }
  }, [community.slug, filter, sort, searchQuery]);

  useEffect(() => {
    fetchDiscussions();
  }, [fetchDiscussions]);

  const handleVote = async (disc: Discussion) => {
    try {
      const res = await communityService.voteDiscussion(community.slug, disc.id);
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === disc.id
            ? { ...d, user_has_voted: res.voted, upvotes_count: res.upvotes_count }
            : d
        )
      );
      if (selectedDiscussion && selectedDiscussion.id === disc.id) {
        setSelectedDiscussion((prev) =>
          prev ? { ...prev, user_has_voted: res.voted, upvotes_count: res.upvotes_count } : null
        );
      }
    } catch (e) {
      console.log('Error voting on discussion', e);
    }
  };

  const handleCreateDiscussion = async (payload: {
    title: string;
    content: string;
    discussion_type: 'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT';
    tags: string;
    attachment_ids: string[];
  }) => {
    const created = await communityService.createDiscussion(community.slug, payload);
    setDiscussions((prev) => [created, ...prev]);
  };

  return (
    <View style={styles.container}>
      {/* Discussion Feed */}
      <DiscussionFeed
        discussions={discussions}
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filter={filter}
        setFilter={setFilter}
        sort={sort}
        setSort={setSort}
        onOpenComposer={() => setComposerVisible(true)}
        onSelectDiscussion={(d) => setSelectedDiscussion(d)}
        onVoteDiscussion={handleVote}
        onRefresh={fetchDiscussions}
        onOpenProfile={onOpenProfile}
      />

      {/* Composer Modal */}
      {composerVisible && (
        <DiscussionComposer
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          onSubmit={handleCreateDiscussion}
        />
      )}

      {/* Discussion Detail & Replies Modal */}
      {selectedDiscussion && (
        <DiscussionDetail
          visible={!!selectedDiscussion}
          discussion={selectedDiscussion}
          communitySlug={community.slug}
          currentUser={currentUser}
          onClose={() => setSelectedDiscussion(null)}
          onVote={handleVote}
          onOpenProfile={onOpenProfile}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
