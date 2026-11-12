import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from '../config/api';

export const AZURE_CLIENT_ID =
  (process.env as any)?.EXPO_PUBLIC_AZURE_CLIENT_ID || '3b64e29f-bcab-4aee-9fa2-11bb605f161a';
const MS_OAUTH_MODE_KEY = 'cc_ms_oauth_mode';

export const buildMicrosoftAuthUrl = () => {
  let redirectUri = 'https://jwt.ms';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    redirectUri = `${window.location.origin}/`;
  }
  const scopes = encodeURIComponent('openid profile email');
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${AZURE_CLIENT_ID}&response_type=id_token&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scopes}&response_mode=fragment&nonce=${Date.now()}&prompt=select_account`;
};

export const setMsOAuthMode = async (mode: 'login' | 'link') => {
  try {
    await AsyncStorage.setItem(MS_OAUTH_MODE_KEY, mode);
  } catch {}
};

export const consumeMsOAuthMode = async (): Promise<'login' | 'link' | null> => {
  try {
    const mode = await AsyncStorage.getItem(MS_OAUTH_MODE_KEY);
    await AsyncStorage.removeItem(MS_OAUTH_MODE_KEY);
    return mode === 'link' || mode === 'login' ? mode : null;
  } catch {
    return null;
  }
};

export interface User {
  id: number;
  email: string;
  full_name?: string;
  username?: string;
  phone_number?: string | null;
  avatar?: string | null;
  profile_picture?: string | null;
  is_verified_student: boolean;
  profile_completed: boolean;
  verification_tier?: 'FULLY_VERIFIED' | 'INVITE_VERIFIED' | 'SEMI_VERIFIED' | 'UNVERIFIED';
  verification_method?: string | null;
  can_participate?: boolean;
  badge_label?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
}

export const computeCanParticipate = (user?: Partial<User> | null): boolean => {
  if (!user) return false;
  if (typeof user.can_participate === 'boolean') return user.can_participate;
  return (
    user.verification_tier === 'FULLY_VERIFIED' ||
    user.verification_tier === 'INVITE_VERIFIED' ||
    Boolean(user.is_verified_student) ||
    Boolean(user.is_staff) ||
    Boolean(user.is_superuser)
  );
};

export interface CampusInviteCodeItem {
  id: number;
  code: string;
  batch_label: string;
  college_id: number;
  college_name: string;
  college_short_name: string;
  uses_count: number;
  max_uses: number;
  remaining_uses: number;
  is_active: boolean;
  is_valid: boolean;
  expires_at?: string | null;
  created_at: string;
}

export interface DemoUser {
  id: number;
  email: string;
  full_name: string;
  username: string;
  avatar: string | null;
  course: string;
  branch: string;
  bio: string;
  gender: string;
}

export interface CollegeInfo {
  id: number;
  name: string;
  short_name: string;
}

export const authService = {
  // 1-Tap Microsoft Entra SSO (Direct College Student Verification)
  async loginWithMicrosoft(token: string) {
    const res = await api.post('/authentication/microsoft/', {
      token,
      access_token: token,
      id_token: token,
    });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // Upgrade existing Gmail / Invite / ID-Review account with College Microsoft ID (no duplicate user)
  async linkWithMicrosoft(token: string) {
    const res = await api.post('/authentication/microsoft/link/', {
      token,
      access_token: token,
      id_token: token,
    });
    if (res.data?.access && res.data?.refresh && res.data?.user) {
      await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    } else if (res.data?.user) {
      await this.updateCurrentUser(res.data.user);
    }
    return res.data;
  },

  // Redeem Campus Invite Code to unlock full posting/confessing/chatting
  async redeemInviteCode(code: string) {
    const res = await api.post('/authentication/invite/redeem/', { code: code.trim().toUpperCase() });
    if (res.data?.user) {
      await this.updateCurrentUser(res.data.user);
    }
    return res.data;
  },

  // Fetch user's peer or admin invite codes
  async getMyInviteCodes(): Promise<CampusInviteCodeItem[]> {
    const res = await api.get('/authentication/invite/codes/');
    return res.data?.codes || [];
  },

  // Create peer or staff batch invite code
  async createBatchInviteCode(payload?: {
    college_id?: number;
    batch_label?: string;
    max_uses?: number;
    code?: string;
    expires_days?: number;
  }): Promise<CampusInviteCodeItem> {
    const res = await api.post('/authentication/invite/codes/', payload || {});
    return res.data;
  },

  // Manual Email: Send 6-Digit OTP + 1-Click Magic Link
  async sendEmailOTP(email: string) {
    const res = await api.post('/authentication/email/send-otp/', { email });
    return res.data;
  },

  // Verify 6-digit OTP
  async verifyEmailOTP(email: string, otp: string, password?: string) {
    const res = await api.post('/authentication/email/verify-otp/', { email, otp, password });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // 1-Click Magic Token Verification
  async verifyMagicToken(token: string) {
    const res = await api.post('/authentication/email/magic-login/', { token });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // Direct Credential Login (Email, Username, or Phone Number + Password)
  async loginWithPassword(identifier: string, password: string) {
    const res = await api.post('/authentication/login/', {
      identifier,
      password,
    });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // Frictionless Phone Number Login (Send OTP via WhatsApp or SMS with Geofencing)
  async sendPhoneLoginOTP(
    phoneNumber: string,
    channel: 'WHATSAPP' | 'SMS' = 'WHATSAPP',
    coords?: { latitude?: number; longitude?: number; bypass_geofence?: boolean }
  ) {
    const res = await api.post('/authentication/phone-login/send-otp/', {
      phone_number: phoneNumber,
      channel,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      bypass_geofence: coords?.bypass_geofence,
    });
    return res.data;
  },

  // Frictionless Phone Number Login (Verify OTP)
  async verifyPhoneLoginOTP(phoneNumber: string, otp: string, password?: string) {
    const res = await api.post('/authentication/phone-login/verify-otp/', { phone_number: phoneNumber, otp, password });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // Spotify-Style College ID Card Photo OCR Instant Onboarding & Login
  async loginWithIDCard(imageBase64: string, password?: string) {
    const res = await api.post('/authentication/id-card-login/', { image_base64: imageBase64, password });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // Fetch 12 pre-seeded realistic campus demo users
  async getDemoUsers(): Promise<DemoUser[]> {
    const res = await api.get('/authentication/demo-users/');
    return res.data;
  },

  // 1-Tap Instant Demo Account Login / Switcher
  async devQuickLogin(email: string) {
    const res = await api.post('/authentication/dev-quick-login/', { email });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
    return res.data;
  },

  // Save JWT Session
  async saveSession(access: string, refresh: string, user: User) {
    await AsyncStorage.multiSet([
      ['access_token', access],
      ['refresh_token', refresh],
      ['user_info', JSON.stringify(user)],
    ]);
  },

  // Check stored session
  async getStoredSession() {
    const token = await AsyncStorage.getItem('access_token');
    const userStr = await AsyncStorage.getItem('user_info');
    if (!token || !userStr) return null;
    return {
      token,
      user: JSON.parse(userStr) as User,
    };
  },

  // Refresh or update current user in storage
  async updateCurrentUser(userUpdates: Partial<User>) {
    const session = await this.getStoredSession();
    if (session) {
      const updatedUser = { ...session.user, ...userUpdates };
      await AsyncStorage.setItem('user_info', JSON.stringify(updatedUser));
      return updatedUser;
    }
    return null;
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const res = await api.get('/authentication/me/');
      if (res.data) {
        await AsyncStorage.setItem('user_info', JSON.stringify(res.data));
        return res.data;
      }
    } catch (e) {}
    const session = await this.getStoredSession();
    return session ? session.user : null;
  },

  // Change Password
  async changePassword(oldPassword: string, newPassword: string) {
    const res = await api.post('/authentication/password/change/', {
      old_password: oldPassword,
      new_password: newPassword,
    });
    return res.data;
  },

  // Forgot Password (send OTP)
  async forgotPassword(email: string) {
    const res = await api.post('/authentication/password/forgot/', { email });
    return res.data;
  },

  // Reset Password with OTP
  async resetPassword(email: string, otp: string, newPassword: string) {
    const res = await api.post('/authentication/password/reset/', {
      email,
      otp,
      new_password: newPassword,
    });
    return res.data;
  },

  // Logout
  async logout() {
    try {
      const refresh = await AsyncStorage.getItem('refresh_token');
      if (refresh) {
        await api.post('/authentication/logout/', { refresh });
      }
    } catch (e) {
      console.log('Logout error', e);
    } finally {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_info']);
    }
  },

  // Permanently delete student account & purge all data
  async deleteAccount() {
    try {
      await api.delete('/authentication/delete-account/');
    } catch (e) {
      console.log('Delete account error', e);
    } finally {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_info']);
    }
  },

  // Instant Student Discovery Search (Instagram / TikTok style fuzzy discovery)
  async searchStudents(query: string = '') {
    const res = await api.get(`/authentication/users/search/?q=${encodeURIComponent(query)}`);
    return res.data?.results || (Array.isArray(res.data) ? res.data : []);
  },
};

