import { api } from '../config/api';

export interface Community {
  id: number;
  name: string;
  slug: string;
  community_type: 'COLLEGE' | 'COURSE' | 'SECTION' | 'CUSTOM';
  description?: string;
  total_members: number;
  is_joined?: boolean;
}

export const communityService = {
  // Returns enrolled communities (Default 3: College, Course, Section + Custom)
  async getMyCommunities(): Promise<Community[]> {
    const res = await api.get('/communities/me/');
    const results = res.data.results || res.data;
    return results.map((item: any) => item.community || item);
  },

  // Discover all campus communities
  async getAllCommunities(type?: string): Promise<Community[]> {
    const params = type ? { type } : {};
    const res = await api.get('/communities/', { params });
    return res.data.results || res.data;
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
};
