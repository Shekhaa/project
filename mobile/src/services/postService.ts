import { api } from '../config/api';

export interface Post {
  id: number;
  content: string;
  media_type?: 'TEXT' | 'IMAGE' | 'VIDEO';
  media_url?: string;
  is_anonymous: boolean;
  author_name: string;
  author_username?: string;
  author_avatar?: string;
  author_verification_tier?: 'FULLY_VERIFIED' | 'SEMI_VERIFIED' | 'UNVERIFIED';
  author_badge_label?: string;
  anonymous_alias?: string;
  community_name: string;
  community_slug?: string;
  likes_count: number;
  comments_count: number;
  has_liked: boolean;
  is_edited?: boolean;
  created_at: string;
}

export interface Comment {
  id: number;
  post: number;
  parent?: number | null;
  text: string;
  is_anonymous: boolean;
  author_name: string;
  author_username?: string;
  author_avatar?: string;
  replies_count: number;
  created_at: string;
}

export const postService = {
  // Feed for enrolled communities
  async getFeed(communityId?: number): Promise<Post[]> {
    const params = communityId ? { community: communityId } : {};
    const res = await api.get('/posts/feed/', { params });
    return res.data.results || res.data;
  },

  // Create post (Public or Zero-Leak Anonymous, with optional image/video media)
  async createPost(data: {
    community: number;
    content: string;
    is_anonymous?: boolean;
    media_type?: 'TEXT' | 'IMAGE' | 'VIDEO';
    media_url?: string;
  }) {
    const res = await api.post('/posts/create/', data);
    return res.data;
  },

  // Like / Unlike (Returns synced has_liked and exact likes_count)
  async toggleLike(postId: number): Promise<{ liked: boolean; has_liked: boolean; likes_count: number }> {
    const res = await api.post(`/posts/${postId}/like/`);
    return res.data;
  },

  // List Comments on a post
  async getComments(postId: number): Promise<Comment[]> {
    const res = await api.get(`/posts/${postId}/comments/`);
    return res.data.results || res.data;
  },

  // Add Comment or Reply
  async addComment(
    postId: number,
    text: string,
    isAnonymous: boolean = false,
    parentId?: number
  ): Promise<Comment> {
    const res = await api.post(`/posts/${postId}/comments/`, {
      text,
      is_anonymous: isAnonymous,
      parent_id: parentId || null,
    });
    return res.data;
  },

  // Delete a post (Author or Admin)
  async deletePost(postId: number): Promise<{ message: string; id: number }> {
    const res = await api.delete(`/posts/${postId}/delete/`);
    return res.data;
  },

  // Archive a post (Author or Admin)
  async archivePost(postId: number): Promise<{ message: string; id: number }> {
    const res = await api.post(`/posts/${postId}/archive/`);
    return res.data;
  },
};
