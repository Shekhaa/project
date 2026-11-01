import { api } from '../config/api';
import { AttachmentItem } from './chatService';

export interface Community {
  id: number;
  name: string;
  slug: string;
  community_type: 'COLLEGE' | 'COURSE' | 'BRANCH' | 'YEAR' | 'SECTION' | 'CLUB' | 'CUSTOM';
  description?: string;
  image?: string;
  is_private?: boolean;
  is_system_managed?: boolean;
  total_members: number;
  is_joined?: boolean;
  user_role?: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
  latest_discussion?: {
    id: string;
    title: string;
    type: string;
    author_name: string;
    time_ago: string;
  };
  latest_chat_preview?: {
    sender_name: string;
    text: string;
    time: string;
  };
}

export interface DiscussionReply {
  id: string;
  discussion: string;
  author: number;
  author_name: string;
  author_avatar?: string | null;
  parent_reply?: string | null;
  content: string;
  upvotes_count: number;
  user_has_voted: boolean;
  is_accepted: boolean;
  children?: DiscussionReply[];
  created_at: string;
  updated_at: string;
}

export interface Discussion {
  id: string;
  community: number;
  community_name: string;
  community_slug: string;
  author: number;
  author_name: string;
  author_avatar?: string | null;
  title: string;
  content: string;
  discussion_type: 'GENERAL' | 'QUESTION' | 'RESOURCE' | 'ANNOUNCEMENT';
  tags: string;
  is_pinned: boolean;
  is_solved: boolean;
  accepted_answer?: string | null;
  accepted_answer_snippet?: {
    id: string;
    author_name: string;
    content: string;
  } | null;
  views_count: number;
  upvotes_count: number;
  replies_count: number;
  user_has_voted: boolean;
  attachments?: AttachmentItem[];
  replies?: DiscussionReply[];
  created_at: string;
  updated_at: string;
}

export interface CommunityMemberItem {
  id: number;
  user: {
    id: number;
    full_name: string;
    email: string;
    avatar?: string | null;
    course_branch?: string;
  };
  role: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
  joined_at: string;
}

export interface CommunityReportPayload {
  target_type: 'MESSAGE' | 'DISCUSSION' | 'REPLY' | 'MEMBER' | 'COMMUNITY';
  target_id: string;
  reason: 'SPAM' | 'HARASSMENT' | 'ABUSIVE' | 'INAPPROPRIATE' | 'FAKE_INFO' | 'IMPERSONATION' | 'OTHER';
  description?: string;
}

export const communityService = {
  // Returns enrolled communities
  async getMyCommunities(): Promise<Community[]> {
    const res = await api.get('/communities/me/');
    const results = res.data.results || res.data;
    return results.map((item: any) => {
      if (item && item.community) {
        return {
          ...item.community,
          user_role: item.role || item.community.user_role,
        };
      }
      return item;
    });
  },

  // Discover all campus communities
  async getAllCommunities(type?: string, q?: string): Promise<Community[]> {
    const params: any = {};
    if (type && type !== 'ALL') params.type = type;
    if (q) params.q = q;
    const res = await api.get('/communities/', { params });
    return res.data.results || res.data;
  },

  // Get Community Detail
  async getCommunityDetail(slug: string): Promise<Community> {
    const res = await api.get(`/communities/${slug}/`);
    return res.data;
  },

  // Create Custom Community (Reddit/WhatsApp style)
  async createCustomCommunity(data: { name: string; description: string; is_private?: boolean }) {
    const res = await api.post('/communities/create/', data);
    return res.data;
  },

  // Toggle join/leave
  async toggleJoin(slug: string) {
    const res = await api.post(`/communities/${slug}/toggle-join/`);
    return res.data;
  },

  // Open or retrieve dedicated group chat for this community
  async openCommunityChat(slug: string) {
    const res = await api.post(`/communities/${slug}/chat/`);
    return res.data;
  },

  // ==========================================
  // DISCUSSIONS API
  // ==========================================
  async getDiscussions(
    slug: string,
    params?: { type?: string; status?: string; sort?: string; q?: string }
  ): Promise<Discussion[]> {
    const res = await api.get(`/communities/${slug}/discussions/`, { params });
    return res.data.results || res.data;
  },

  async createDiscussion(
    slug: string,
    data: {
      title: string;
      content: string;
      discussion_type?: string;
      tags?: string;
      attachment_ids?: string[];
    }
  ): Promise<Discussion> {
    const res = await api.post(`/communities/${slug}/discussions/`, data);
    return res.data;
  },

  async getDiscussionDetail(slug: string, id: string): Promise<Discussion> {
    const res = await api.get(`/communities/${slug}/discussions/${id}/`);
    return res.data;
  },

  async deleteDiscussion(slug: string, id: string) {
    const res = await api.delete(`/communities/${slug}/discussions/${id}/`);
    return res.data;
  },

  async togglePinDiscussion(slug: string, id: string) {
    const res = await api.post(`/communities/${slug}/discussions/${id}/pin/`);
    return res.data;
  },

  async toggleSolveDiscussion(slug: string, id: string) {
    const res = await api.post(`/communities/${slug}/discussions/${id}/solve/`);
    return res.data;
  },

  async voteDiscussion(slug: string, id: string, replyId?: string) {
    const res = await api.post(`/communities/${slug}/discussions/${id}/vote/`, {
      reply_id: replyId,
    });
    return res.data;
  },

  async createReply(slug: string, discussionId: string, content: string, parentReplyId?: string): Promise<DiscussionReply> {
    const res = await api.post(`/communities/${slug}/discussions/${discussionId}/replies/`, {
      content,
      parent_reply_id: parentReplyId,
    });
    return res.data;
  },

  async deleteReply(slug: string, discussionId: string, replyId: string) {
    const res = await api.delete(`/communities/${slug}/discussions/${discussionId}/replies/${replyId}/`);
    return res.data;
  },

  async markAcceptedAnswer(slug: string, discussionId: string, replyId: string) {
    const res = await api.post(`/communities/${slug}/discussions/${discussionId}/replies/${replyId}/accept/`);
    return res.data;
  },

  // ==========================================
  // MEMBERS & ROLES API
  // ==========================================
  async getMembers(slug: string, query?: string, role?: string): Promise<CommunityMemberItem[]> {
    const params: any = {};
    if (query) params.q = query;
    if (role) params.role = role;
    const res = await api.get(`/communities/${slug}/members/`, { params });
    return res.data.results || res.data;
  },

  async addMember(slug: string, studentId: number, role: string = 'MEMBER') {
    const res = await api.post(`/communities/${slug}/members/`, {
      student_id: studentId,
      role,
    });
    return res.data;
  },

  async addMembers(slug: string, studentIds: number[], role: string = 'MEMBER') {
    const res = await api.post(`/communities/${slug}/members/`, {
      student_ids: studentIds,
      role,
    });
    return res.data;
  },

  async getInviteLink(slug: string): Promise<{ invite_code: string; invite_url: string; community_name: string }> {
    const res = await api.get(`/communities/${slug}/invite-link/`);
    return res.data;
  },

  async resetInviteLink(slug: string): Promise<{ invite_code: string; invite_url: string; community_name: string }> {
    const res = await api.post(`/communities/${slug}/invite-link/`, { action: 'reset' });
    return res.data;
  },

  async previewInvite(inviteCode: string) {
    const res = await api.get(`/communities/invite/${inviteCode}/`);
    return res.data;
  },

  async joinByInvite(inviteCode: string) {
    const res = await api.post(`/communities/invite/${inviteCode}/`);
    return res.data;
  },

  async updateMemberRole(slug: string, memberId: number, role: string) {
    const res = await api.patch(`/communities/${slug}/members/${memberId}/`, { role });
    return res.data;
  },

  async removeMember(slug: string, memberId: number) {
    const res = await api.delete(`/communities/${slug}/members/${memberId}/`);
    return res.data;
  },

  // ==========================================
  // REPORTING & MODERATION API
  // ==========================================
  async submitReport(slug: string, data: CommunityReportPayload) {
    const res = await api.post(`/communities/${slug}/reports/`, data);
    return res.data;
  },
};
