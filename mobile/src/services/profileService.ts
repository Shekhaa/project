import { api } from '../config/api';

export interface CompleteProfilePayload {
  full_name?: string;
  username: string;
  gender: string;
  college: number;
  course: number;
  branch: number;
  academic_year: number;
  section: number;
  admission_number: string;
  bio?: string;
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
    anonymous_enabled?: boolean;
  }) {
    const res = await api.patch('/profile/edit/', data);
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
