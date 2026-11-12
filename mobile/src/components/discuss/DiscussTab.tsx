import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Community, Discussion, communityService } from '../../services/communityService';
import { DiscussionFeed } from './DiscussionFeed';
import { DiscussionComposer } from './DiscussionComposer';
import { DiscussionDetail } from './DiscussionDetail';

interface DiscussTabProps {
  community: Community;
  currentUser?: any;
  canParticipate?: boolean;
  onRequireVerify?: (reason?: string) => void;
  onOpenProfile?: (userId: number) => void;
}

export const DiscussTab: React.FC<DiscussTabProps> = ({
  community,
  currentUser,
  canParticipate = true,
  onRequireVerify,
  onOpenProfile,
}) => {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'QUESTION' | 'RESOURCE' | 'GENERAL' | 'SOLVED'>('ALL');
  const [sort, setSort] = useState<'latest' | 'upvoted' | 'popular' | 'unanswered'>('latest');

  // Modals
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerAutoVoice, setComposerAutoVoice] = useState(false);
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
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID or enter an invite code to upvote discussions.');
      return;
    }
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
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.response?.data?.code === 'CAMPUS_VERIFICATION_REQUIRED') {
        onRequireVerify?.(e.response?.data?.error || 'Campus verification required to upvote discussions.');
      } else {
        console.log('Error voting on discussion', e);
      }
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
        onOpenComposer={() => {
          if (!canParticipate) {
            onRequireVerify?.('Verify your campus ID or enter an invite code to start a discussion.');
            return;
          }
          setComposerAutoVoice(false);
          setComposerVisible(true);
        }}
        onOpenVoiceComposer={() => {
          if (!canParticipate) {
            onRequireVerify?.('Verify your campus ID or enter an invite code to post a voice discussion.');
            return;
          }
          setComposerAutoVoice(true);
          setComposerVisible(true);
        }}
        onSelectDiscussion={(d) => setSelectedDiscussion(d)}
        onVoteDiscussion={handleVote}
        onRefresh={fetchDiscussions}
        onOpenProfile={onOpenProfile}
      />

      {/* Composer Modal */}
      <DiscussionComposer
        visible={composerVisible}
        autoStartVoice={composerAutoVoice}
        onClose={() => {
          setComposerVisible(false);
          setComposerAutoVoice(false);
        }}
        onSubmit={handleCreateDiscussion}
        onRequireVerify={onRequireVerify}
      />

      {/* Discussion Detail & Replies Modal */}
      {selectedDiscussion && (
        <DiscussionDetail
          visible={!!selectedDiscussion}
          discussion={selectedDiscussion}
          communitySlug={community.slug}
          currentUser={currentUser}
          canParticipate={canParticipate}
          onRequireVerify={onRequireVerify}
          onClose={() => setSelectedDiscussion(null)}
          onVote={handleVote}
          onOpenProfile={onOpenProfile}
          onDeleteDiscussion={(id) => {
            setDiscussions((prev) => prev.filter((d) => d.id !== id));
            setSelectedDiscussion(null);
          }}
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
