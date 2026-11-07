import { api } from '../config/api';
import { AttachmentItem } from './chatService';

export interface Post {
  id: number;
  author?: number;
  is_author?: boolean;
  visibility?: 'GLOBAL' | 'COLLEGE' | 'FOLLOWERS' | 'CONNECTIONS' | 'COMMUNITY' | 'ONLY_ME';
  community?: number | null;
  community_name?: string;
  community_slug?: string;
  author_college_name?: string;
  content: string;
  media_type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  media_url?: string;
  document?: string;
  document_name?: string;
  document_size?: string;
  attachments?: AttachmentItem[];
  is_anonymous: boolean;
  author_name: string;
  author_username?: string;
  author_avatar?: string;
  author_verification_tier?: 'FULLY_VERIFIED' | 'SEMI_VERIFIED' | 'UNVERIFIED';
  author_badge_label?: string;
  anonymous_alias?: string;
  likes_count: number;
  comments_count: number;
  has_liked: boolean;
  is_edited?: boolean;
  created_at: string;
}

export interface LockedPostResponse {
  detail: string;
  is_private: boolean;
  post_id?: number;
  visibility?: string;
  author?: {
    id: number;
    full_name: string;
    username: string;
    avatar?: string;
    college_name: string;
    branch_name: string;
    is_verified: boolean;
    is_private_account: boolean;
    connection_status: string;
    follow_status: string;
  };
}

export interface Comment {
  id: number;
  author?: number;
  post: number;
  parent?: number | null;
  text: string;
  is_anonymous: boolean;
  author_name: string;
  author_username?: string;
  author_avatar?: string;
  replies_count: number;
  replies?: Comment[];
  created_at: string;
}

export interface PaginatedPosts {
  results: Post[];
  next: string | null;
  count: number;
}

export const postService = {
  // Feed for enrolled communities with page pagination and scope support
  async getFeed(
    options?: { communityId?: number; scope?: 'GLOBAL' | 'COLLEGE' | 'FOLLOWING' | 'CONNECTIONS' | 'COMMUNITY' | 'MEDIA' | 'RESOURCES' } | number,
    page: number = 1
  ): Promise<PaginatedPosts> {
    const params: any = { page };
    if (typeof options === 'number') {
      params.community = options;
    } else if (options) {
      if (options.communityId) params.community = options.communityId;
      if (options.scope) params.scope = options.scope;
    }
    const res = await api.get('/posts/feed/', { params });
    if (res.data && res.data.results) {
      return {
        results: res.data.results,
        next: res.data.next || null,
        count: res.data.count || res.data.results.length,
      };
    }
    return {
      results: Array.isArray(res.data) ? res.data : [],
      next: null,
      count: Array.isArray(res.data) ? res.data.length : 0,
    };
  },

  // Fetch posts by a specific user (handles privacy checks on backend)
  async getUserPosts(userId: number, page: number = 1): Promise<PaginatedPosts> {
    const res = await api.get(`/posts/user/${userId}/`, { params: { page } });
    if (res.data && res.data.results) {
      return {
        results: res.data.results,
        next: res.data.next || null,
        count: res.data.count || res.data.results.length,
      };
    }
    return {
      results: Array.isArray(res.data) ? res.data : [],
      next: null,
      count: Array.isArray(res.data) ? res.data.length : 0,
    };
  },

  // Get single post by ID
  async getPost(postId: number): Promise<Post> {
    const res = await api.get(`/posts/${postId}/`);
    return res.data;
  },

  // Create post (Public or Zero-Leak Anonymous, with optional image/video/document media)
  async createPost(data: FormData | {
    community: number;
    content: string;
    is_anonymous?: boolean;
    media_type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    media_url?: string;
    document_name?: string;
    document_size?: string;
  }) {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    const res = await api.post('/posts/create/', data, isFormData ? {
      headers: { 'Content-Type': 'multipart/form-data' }
    } : undefined);
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
