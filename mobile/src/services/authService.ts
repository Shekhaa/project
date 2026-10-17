import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../config/api';

export interface User {
  id: number;
  email: string;
  full_name?: string;
  is_verified_student: boolean;
  profile_completed: boolean;
  verification_tier?: 'FULLY_VERIFIED' | 'SEMI_VERIFIED' | 'UNVERIFIED';
  badge_label?: string;
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
  // 1-Tap Microsoft Entra SSO
  async loginWithMicrosoft(accessToken: string) {
    const res = await api.post('/authentication/microsoft/', { access_token: accessToken });
    await this.saveSession(res.data.access, res.data.refresh, res.data.user);
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

  // Instant Student Discovery Search (Instagram / TikTok style fuzzy discovery)
  async searchStudents(query: string = '') {
    const res = await api.get(`/authentication/users/search/?q=${encodeURIComponent(query)}`);
    return res.data.results || [];
  },
};

