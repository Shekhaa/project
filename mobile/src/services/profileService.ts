import { api } from '../config/api';

export interface CompleteProfilePayload {
  full_name?: string;
  username: string;
  gender: string;
  show_gender?: boolean;
  phone_number?: string;
  college?: number;
  course?: number;
  course_name?: string;
  branch?: number;
  branch_name?: string;
  academic_year?: number;
  section?: number;
  admission_number?: string;
  bio?: string;
}

export interface PublicProfile {
  id: number;
  email: string;
  full_name: string;
  username: string;
  avatar?: string;
  bio?: string;
  admission_number?: string;
  gender?: string;
  show_gender?: boolean;
  college_name: string;
  college_short_name: string;
  branch_name: string;
  course_name: string;
  academic_year_name: string;
  is_verified: boolean;
  verification_tier: string;
  badge_label?: string;
  is_private_account: boolean;
  messaging_preference: 'EVERYONE' | 'FOLLOWING' | 'CONNECTIONS_ONLY' | 'NOBODY';
  connection_status: 'NOT_CONNECTED' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'CONNECTED' | 'DECLINED' | 'BLOCKED' | 'SELF';
  follow_status: 'NOT_FOLLOWING' | 'REQUEST_SENT' | 'FOLLOWING' | 'SELF';
  is_blocked: boolean;
  can_view_content: boolean;
  followers_count: number;
  following_count: number;
  connections_count: number;
  posts_count: number;
  credibility_score: number;
  has_endorsed: boolean;
}

export interface ConnectionItem {
  id: number;
  status: string;
  status_label: string;
  initiated_by: number;
  other_user: {
    id: number;
    full_name: string;
    username: string;
    email: string;
    college_name: string;
    branch_name: string;
    avatar?: string;
    is_verified: boolean;
  };
  created_at: string;
}

export interface FollowItem {
  id: number;
  status: string;
  status_label: string;
  user: {
    id: number;
    full_name: string;
    username: string;
    email: string;
    college_name: string;
    avatar?: string;
    is_verified: boolean;
  };
  created_at: string;
}

export const profileService = {
  // Fetch courses, branches, years, sections for a detected college
  async getCollegeDetails(collegeId: number) {
    const res = await api.get(`/colleges/${collegeId}/`);
    return res.data;
  },

  // Complete Onboarding & Auto-enroll in 3 Communities
  async completeProfile(payload: CompleteProfilePayload) {
    const res = await api.post('/profile/complete/', payload);
    return res.data;
  },

  // Get My Profile
  async getMyProfile() {
    const res = await api.get('/profile/me/');
    return res.data;
  },

  // Edit My Profile Details
  async updateProfile(data: {
    full_name?: string;
    username?: string;
    bio?: string;
    gender?: string;
    show_gender?: boolean;
    anonymous_enabled?: boolean;
    is_private_account?: boolean;
    messaging_preference?: string;
    profile_picture_base64?: string;
    caption?: string;
  }) {
    const res = await api.patch('/profile/edit/', data);
    return res.data;
  },

  // Get Public Student Profile with Relationship Badges
  async getPublicProfile(userId: number): Promise<PublicProfile> {
    const res = await api.get(`/profile/${userId}/`);
    return res.data;
  },

  // Update Privacy Settings
  async updatePrivacySettings(data: { is_private_account?: boolean; messaging_preference?: string }) {
    const res = await api.patch('/profile/settings/privacy/', data);
    return res.data;
  },

  // Send LinkedIn-style Connection Request
  async sendConnectionRequest(userId: number): Promise<{ status: string; message: string; connection_id?: number }> {
    const res = await api.post('/profile/connections/request/', { user_id: userId });
    return res.data;
  },

  // Respond to Connection Request (ACCEPT, DECLINE, BLOCK)
  async respondConnection(userId: number, action: 'ACCEPT' | 'DECLINE' | 'BLOCK'): Promise<{ status: string; message: string }> {
    const res = await api.post(`/profile/connections/${userId}/respond/`, { action });
    return res.data;
  },

  // Remove Connection or Cancel Request
  async removeConnection(userId: number): Promise<{ status: string; message: string }> {
    const res = await api.delete(`/profile/connections/${userId}/`);
    return res.data;
  },

  // List Connections (tabs: 'connected', 'received', 'sent')
  async getConnections(tab: 'connected' | 'received' | 'sent' = 'connected'): Promise<{ tab: string; count: number; results: ConnectionItem[] }> {
    const res = await api.get('/profile/connections/', { params: { tab } });
    return res.data;
  },

  // Follow User (Instagram style: immediate if public, request if private)
  async followUser(userId: number): Promise<{ follow_status: string; message: string; is_private?: boolean }> {
    const res = await api.post(`/profile/follow/${userId}/`);
    return res.data;
  },

  // Credibility Endorsement (+1 upvote / toggle)
  async endorseStudent(userId: number): Promise<{ endorsed: boolean; credibility_score: number; message: string }> {
    const res = await api.post(`/profile/${userId}/endorse/`);
    return res.data;
  },

  // Unfollow User
  async unfollowUser(userId: number): Promise<{ follow_status: string; message: string }> {
    const res = await api.post(`/profile/unfollow/${userId}/`);
    return res.data;
  },

  // Pending Follow Requests
  async getFollowRequests(): Promise<{ count: number; results: FollowItem[] }> {
    const res = await api.get('/profile/follow/requests/');
    return res.data;
  },

  // Respond to Follow Request (ACCEPT, REJECT)
  async respondFollowRequest(requestId: number, action: 'ACCEPT' | 'REJECT'): Promise<{ status: string; message: string }> {
    const res = await api.post(`/profile/follow/requests/${requestId}/respond/`, { action });
    return res.data;
  },

  // List Followers
  async getFollowers(userId: number): Promise<{ count: number; results: FollowItem[] }> {
    const res = await api.get(`/profile/${userId}/followers/`);
    return res.data;
  },

  // List Following
  async getFollowing(userId: number): Promise<{ count: number; results: FollowItem[] }> {
    const res = await api.get(`/profile/${userId}/following/`);
    return res.data;
  },

  // Block Student
  async blockUser(userId: number): Promise<{ is_blocked: boolean; message: string }> {
    const res = await api.post(`/profile/block/${userId}/`);
    return res.data;
  },

  // Unblock Student
  async unblockUser(userId: number): Promise<{ is_blocked: boolean; message: string }> {
    const res = await api.post(`/profile/unblock/${userId}/`);
    return res.data;
  },

  // Fetch Blocked Students List
  async getBlockedUsers(): Promise<{ count: number; results: any[] }> {
    const res = await api.get('/profile/blocked/');
    return res.data;
  },

  // Scan Physical College ID Card via OCR & Anti-Fraud
  async scanIdCard(imageBase64: string) {
    const res = await api.post('/profile/scan-id-card/', { image_base64: imageBase64 });
    return res.data;
  },

  // Blind-Testing Admin: Fetch list of all registered students with ID cards
  async getAdminAuditStudents() {
    const res = await api.get('/profile/admin/id-cards/');
    return res.data;
  },

  // Blind-Testing Admin: Approve or Flag account as Fake
  async auditUserAction(userId: number, action: 'APPROVE' | 'FLAG_FAKE' | 'RESET', reason?: string) {
    const res = await api.post('/profile/admin/audit-user/', {
      user_id: userId,
      action,
      reason,
    });
    return res.data;
  },
};

