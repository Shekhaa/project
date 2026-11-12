import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Image,
  Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import {
  authService,
  User,
  DemoUser,
  CampusInviteCodeItem,
  computeCanParticipate,
} from '../services/authService';
import { profileService } from '../services/profileService';
import { postService, Post } from '../services/postService';
import { PostCard } from '../components/feed/PostCard';
import { StudentProfileModal } from '../components/profile/StudentProfileModal';
import { SocialListModal, SocialModalType } from '../components/profile/SocialListModal';
import { UserAvatar } from '../components/common/UserAvatar';
import { processWebImageForUpload, showCrossPlatformAlert } from '../utils/mediaUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ShieldCheck,
  Settings,
  LogOut,
  AlertCircle,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Bookmark,
  UserX,
  Bell,
  BellOff,
  Sliders,
  ChevronRight,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  Square,
  Circle,
  Edit3,
  Camera,
  Upload,
  Copy,
  Ticket,
  Clock,
  Share2,
} from 'lucide-react-native';

interface ProfileData {
  id: number;
  username: string;
  bio: string;
  profile_picture?: string;
  gender: string;
  show_gender?: boolean;
  anonymous_enabled: boolean;
  is_private_account?: boolean;
  messaging_preference?: 'EVERYONE' | 'FOLLOWING' | 'CONNECTIONS_ONLY' | 'NOBODY';
  followers_count?: number;
  following_count?: number;
  connections_count?: number;
  posts_count?: number;
  credibility_score?: number;
  has_endorsed?: boolean;
  admission_number: string;
  college_name: string;
  college_short_name: string;
  course_name: string;
  branch_name: string;
  academic_year_name: string;
  section_name: string;
  verified: boolean;
  created_at: string;
}

interface ProfileScreenProps {
  currentUser: User;
  canParticipate?: boolean;
  onRequireVerify?: (reason?: string) => void;
  onUserSwitched: (newUser: User) => void;
  onLogout: () => void;
  onStartCall?: (receiverId: number, receiverName: string, callType: 'AUDIO' | 'VIDEO') => void;
}

type SettingsSection = 'PROFILE' | 'PASSWORD' | 'PREFERENCES' | 'AUDIT';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  currentUser,
  canParticipate,
  onRequireVerify,
  onUserSwitched,
  onLogout,
  onStartCall,
}) => {
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const effectiveCanParticipate =
    typeof canParticipate === 'boolean' ? canParticipate : computeCanParticipate(currentUser);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [switchingUser, setSwitchingUser] = useState<string | null>(null);
  const [switcherModalVisible, setSwitcherModalVisible] = useState(false);

  // Settings Modal State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>('PROFILE');

  // Social Graph Modals State
  const [socialModalVisible, setSocialModalVisible] = useState(false);
  const [socialModalType, setSocialModalType] = useState<SocialModalType>('followers');
  const [socialModalUserId, setSocialModalUserId] = useState<number>(currentUser.id);

  // Student Profile Modal State
  const [viewingStudentId, setViewingStudentId] = useState<number | null>(null);

  // Privacy & Audience State
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [messagingPreference, setMessagingPreference] = useState<'EVERYONE' | 'FOLLOWING' | 'CONNECTIONS_ONLY' | 'NOBODY'>('EVERYONE');
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);

  // User's own posts state
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Blind-Testing 100-User Audit & Batch Invite State
  const [auditStudents, setAuditStudents] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
  const [pendingReviewsCount, setPendingReviewsCount] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [auditFeedback, setAuditFeedback] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const [batchCodeInput, setBatchCodeInput] = useState('');
  const [batchLabelInput, setBatchLabelInput] = useState('Campus Batch Drop');
  const [batchMaxUsesInput, setBatchMaxUsesInput] = useState('50');
  const [batchColleges, setBatchColleges] = useState<Array<{ id: number; name: string; short_name: string }>>([]);
  const [batchCollegeId, setBatchCollegeId] = useState<number | undefined>(undefined);
  const [creatingBatchCode, setCreatingBatchCode] = useState(false);

  // Student Invite Codes State
  const [inviteCodes, setInviteCodes] = useState<CampusInviteCodeItem[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);

  // Edit Profile State
  const [editFullName, setEditFullName] = useState(currentUser.full_name || '');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editGender, setEditGender] = useState('Male');
  const [editShowGender, setEditShowGender] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editAvatarBase64, setEditAvatarBase64] = useState<string | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);

  // Change Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Forgot / Reset Password State
  const [resetEmail, setResetEmail] = useState(currentUser.email);
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [sendingResetOtp, setSendingResetOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Account Deletion State
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Avatar Shape State (Default 'SQUARE' / 0 Shape)
  const [avatarShape, setAvatarShape] = useState<'SQUARE' | 'CIRCLE'>('SQUARE');

  // Saves, Blocked, Info, Preferences & Notification Modals
  const [savedModalVisible, setSavedModalVisible] = useState(false);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [blockedModalVisible, setBlockedModalVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  const [accountInfoModalVisible, setAccountInfoModalVisible] = useState(false);
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);

  // Notification Controls State
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const [notifLikes, setNotifLikes] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);

  // Initial load for shape & notification settings
  useEffect(() => {
    AsyncStorage.getItem('@campus_avatar_shape')
      .then((val) => {
        if (val === 'CIRCLE' || val === 'SQUARE') {
          setAvatarShape(val);
        } else {
          setAvatarShape('SQUARE');
        }
      })
      .catch(() => {});

    AsyncStorage.getItem('@campus_connect_notifications_blocked')
      .then((val) => {
        setNotificationsBlocked(val === 'true');
      })
      .catch(() => {});

    AsyncStorage.getItem('@campus_notif_likes')
      .then((val) => {
        if (val !== null) setNotifLikes(val === 'true');
      })
      .catch(() => {});

    AsyncStorage.getItem('@campus_notif_comments')
      .then((val) => {
        if (val !== null) setNotifComments(val === 'true');
      })
      .catch(() => {});

    AsyncStorage.getItem('@campus_notif_messages')
      .then((val) => {
        if (val !== null) setNotifMessages(val === 'true');
      })
      .catch(() => {});
  }, []);

  const handleToggleAvatarShape = async (newShape: 'SQUARE' | 'CIRCLE') => {
    setAvatarShape(newShape);
    await AsyncStorage.setItem('@campus_avatar_shape', newShape).catch(() => {});
  };

  const loadSavedPosts = async () => {
    setLoadingSaved(true);
    try {
      const savedJson = await AsyncStorage.getItem('campus_saved_posts');
      const savedIds: number[] = savedJson ? JSON.parse(savedJson) : [];
      if (savedIds.length === 0) {
        setSavedPosts([]);
      } else {
        const fetches = savedIds.map((id) => postService.getPost(id).catch(() => null));
        const results = await Promise.all(fetches);
        const valid = results.filter((p): p is Post => p !== null);
        setSavedPosts(valid);
      }
    } catch (e) {
      console.log('Error loading saved posts', e);
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleRemoveSavedPost = async (postId: number) => {
    try {
      const savedJson = await AsyncStorage.getItem('campus_saved_posts');
      let list: number[] = savedJson ? JSON.parse(savedJson) : [];
      list = list.filter((id) => id !== postId);
      await AsyncStorage.setItem('campus_saved_posts', JSON.stringify(list));
      setSavedPosts((prev) => prev.filter((p) => p.id !== postId));
      showCrossPlatformAlert('Bookmark Removed', 'Post removed from your saved collection.');
    } catch (e) {
      console.log('Error removing saved post', e);
    }
  };

  const loadBlockedList = async () => {
    setLoadingBlocked(true);
    try {
      const data = await profileService.getBlockedUsers();
      setBlockedUsers(data.results || data || []);
    } catch (e) {
      console.log('Error loading blocked users', e);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblock = async (userId: number, name: string) => {
    setUnblockingId(userId);
    try {
      await profileService.unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((u) => (u.user?.id || u.id) !== userId));
      showCrossPlatformAlert('Student Unblocked', `${name} has been unblocked.`);
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.message || 'Could not unblock student.');
    } finally {
      setUnblockingId(null);
    }
  };

  const handleToggleNotificationsBlocked = async (val: boolean) => {
    setNotificationsBlocked(val);
    await AsyncStorage.setItem('@campus_connect_notifications_blocked', val ? 'true' : 'false').catch(() => {});
    showCrossPlatformAlert(
      val ? 'Quiet Campus Mode Active' : 'Notifications Active',
      val
        ? 'All sound and alert notifications have been muted. You can un-mute anytime.'
        : 'You will receive notifications for likes, comments, and direct messages.'
    );
  };

  const handleToggleNotifSub = async (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    await AsyncStorage.setItem(key, val ? 'true' : 'false').catch(() => {});
  };

  const loadInviteCodes = async () => {
    if (!effectiveCanParticipate) {
      setInviteCodes([]);
      return;
    }
    setInviteLoading(true);
    try {
      const codes = await authService.getMyInviteCodes();
      setInviteCodes(codes);
    } catch {
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteCode = async (code: string, collegeShort?: string) => {
    const shareText = `Join me on Campus Connect${collegeShort ? ` (${collegeShort})` : ''}! Use my campus invite code: ${code}`;
    if (Platform.OS === 'web') {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(code);
        }
      } catch {}
      setInviteFeedback({ kind: 'notice', text: `Copied invite code ${code} to clipboard.` });
      return;
    }
    try {
      await Share.share({ message: shareText });
    } catch {
      setInviteFeedback({ kind: 'notice', text: `Share code: ${code}` });
    }
  };

  const handleCreateBatchCode = async () => {
    setAuditFeedback(null);
    setCreatingBatchCode(true);
    try {
      const parsedMax = parseInt(batchMaxUsesInput.trim(), 10);
      const created = await authService.createBatchInviteCode({
        ...(batchCodeInput.trim() ? { code: batchCodeInput.trim().toUpperCase() } : {}),
        batch_label: batchLabelInput.trim() || 'Campus Batch Drop',
        max_uses: Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 50,
        ...(batchCollegeId ? { college_id: batchCollegeId } : {}),
      });
      setBatchCodeInput('');
      setAuditFeedback({
        kind: 'notice',
        text: `Batch code ${created.code} ready (${created.remaining_uses}/${created.max_uses} uses).`,
      });
      await loadInviteCodes();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Could not generate batch invite code.';
      setAuditFeedback({ kind: 'error', text: msg });
      if (Platform.OS !== 'web') {
        Alert.alert('Error', msg);
      }
    } finally {
      setCreatingBatchCode(false);
    }
  };

  const loadAuditList = async () => {
    setAuditLoading(true);
    try {
      const [data, colleges] = await Promise.all([
        profileService.getAdminAuditStudents(),
        batchColleges.length === 0 ? profileService.getColleges().catch(() => []) : Promise.resolve(batchColleges),
      ]);
      setAuditStudents(data.students || []);
      setTotalStudentsCount(data.total_students || 0);
      setPendingReviewsCount(data.pending_reviews || 0);
      setFlaggedCount(data.flagged_accounts || 0);
      if (Array.isArray(colleges) && colleges.length > 0) {
        setBatchColleges(colleges);
        if (!batchCollegeId) {
          const geuCol =
            colleges.find((c: any) => c.short_name === 'GEU' || c.name === 'Graphic Era University') ||
            colleges[0];
          setBatchCollegeId(geuCol.id);
        }
      }
      await loadInviteCodes();
    } catch (e: any) {
      setAuditFeedback({
        kind: 'error',
        text: e?.response?.data?.error || 'Could not load audit queue.',
      });
    } finally {
      setAuditLoading(false);
    }
  };

  const handleAuditAction = async (userId: number, action: 'APPROVE' | 'FLAG_FAKE') => {
    setAuditFeedback(null);
    try {
      const reason = action === 'FLAG_FAKE' ? 'Flagged fake profile during admin campus audit' : undefined;
      const res = await profileService.auditUserAction(userId, action, reason);
      const msg =
        res?.message ||
        (action === 'APPROVE'
          ? 'Account marked as verified student.'
          : 'Account flagged as fake. Student will be restricted from posting.');
      setAuditFeedback({ kind: 'notice', text: msg });
      if (Platform.OS !== 'web') {
        Alert.alert(action === 'APPROVE' ? 'Student Approved' : 'Profile Flagged', msg);
      }
      loadAuditList();
    } catch (e: any) {
      const errMsg = e.response?.data?.error || 'Could not update student status.';
      setAuditFeedback({ kind: 'error', text: errMsg });
      if (Platform.OS !== 'web') {
        Alert.alert('Action Failed', errMsg);
      }
    }
  };

  useEffect(() => {
    loadProfileAndDemoUsers();
  }, [currentUser.id, effectiveCanParticipate]);

  const loadProfileAndDemoUsers = async () => {
    setLoading(true);
    setLoadingPosts(true);
    try {
      const [profileData, users, postsData] = await Promise.all([
        profileService.getMyProfile().catch(() => null),
        authService.getDemoUsers().catch(() => []),
        postService.getUserPosts(currentUser.id, 1).catch(() => ({ results: [], count: 0 })),
      ]);
      setProfile(profileData);
      setDemoUsers(users);
      setUserPosts(postsData.results || []);

      if (profileData) {
        setEditUsername(profileData.username || '');
        setEditBio(profileData.bio || '');
        setEditGender(profileData.gender || 'Male');
        setEditShowGender(profileData.show_gender !== false);
        setIsPrivateAccount(!!profileData.is_private_account);
        setMessagingPreference(profileData.messaging_preference || 'EVERYONE');
      }
      setEditFullName(currentUser.full_name || '');
      loadInviteCodes();
    } catch (e) {
      console.log('Error loading profile data', e);
    } finally {
      setLoading(false);
      setLoadingPosts(false);
    }
  };

  const handleTogglePrivateAccount = async (val: boolean) => {
    setIsPrivateAccount(val);
    try {
      setUpdatingPrivacy(true);
      await profileService.updatePrivacySettings({ is_private_account: val });
      setProfile((prev) => (prev ? { ...prev, is_private_account: val } : null));
      showCrossPlatformAlert(
        val ? 'Private Account Enabled' : 'Public Account Enabled',
        val
          ? 'Only students you approve can follow you and view your posts.'
          : 'Anyone on campus can now follow you and view your posts.'
      );
    } catch (e: any) {
      setIsPrivateAccount(!val);
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not update account privacy.');
    } finally {
      setUpdatingPrivacy(false);
    }
  };

  const handleUpdateMessagingPreference = async (pref: 'EVERYONE' | 'FOLLOWING' | 'CONNECTIONS_ONLY' | 'NOBODY') => {
    setMessagingPreference(pref);
    try {
      setUpdatingPrivacy(true);
      await profileService.updatePrivacySettings({ messaging_preference: pref });
      setProfile((prev) => (prev ? { ...prev, messaging_preference: pref } : null));
      showCrossPlatformAlert('Preference Saved', `Direct message requests updated to: ${pref.replace('_', ' ')}.`);
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not update messaging preference.');
    } finally {
      setUpdatingPrivacy(false);
    }
  };

  const handleSwitchAccount = async (targetEmail: string) => {
    if (targetEmail.toLowerCase() === currentUser.email.toLowerCase()) {
      setSwitcherModalVisible(false);
      return;
    }

    setSwitchingUser(targetEmail);
    try {
      const res = await authService.devQuickLogin(targetEmail);
      setSwitcherModalVisible(false);
      onUserSwitched(res.user);
      showCrossPlatformAlert(
        'Account Switched',
        `Logged in as ${res.user.full_name || res.user.email}. All chats, posts & communities are updated.`
      );
    } catch (e: any) {
      showCrossPlatformAlert('Switch Failed', e.response?.data?.error || 'Could not switch account.');
    } finally {
      setSwitchingUser(null);
    }
  };

  const handlePickPhoto = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const processed = await processWebImageForUpload(file, file.name || 'avatar.jpg', 'STANDARD');
          if (processed.uri && processed.uri.startsWith('data:')) {
            setEditAvatarBase64(processed.uri);
            setEditAvatarPreview(processed.uri);
            return;
          }
        } catch {
          // Fallback to raw FileReader below
        }
        const reader = new FileReader();
        reader.onload = (uploadEvent: any) => {
          const base64Str = uploadEvent.target.result as string;
          setEditAvatarBase64(base64Str);
          setEditAvatarPreview(base64Str);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showCrossPlatformAlert(
          'Permission Needed',
          'Please allow camera roll access to update your profile photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/jpeg';
        const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : null;
        if (dataUrl) {
          setEditAvatarBase64(dataUrl);
          setEditAvatarPreview(asset.uri || dataUrl);
        } else if (asset.uri) {
          setEditAvatarPreview(asset.uri);
        }
      }
    } catch (err: any) {
      showCrossPlatformAlert('Photo Error', err?.message || 'Could not select a profile photo.');
    }
  };

  // Save Profile Details
  const handleSaveProfile = async () => {
    if (!editUsername.trim()) {
      showCrossPlatformAlert('Error', 'Username cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      const payload: any = {
        full_name: editFullName.trim(),
        username: editUsername.trim(),
        bio: editBio.trim(),
        caption: editBio.trim(),
        gender: editGender,
        show_gender: editShowGender,
      };

      if (editAvatarBase64) {
        payload.profile_picture_base64 = editAvatarBase64;
      }

      const res = await profileService.updateProfile(payload);
      const savedPic =
        res.user?.profile_picture ||
        res.profile?.profile_picture ||
        profile?.profile_picture ||
        currentUser.profile_picture;

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              ...res.profile,
              profile_picture: savedPic || prev.profile_picture,
            }
          : res.profile || prev
      );
      setEditAvatarBase64(null);
      setEditAvatarPreview(null);

      onUserSwitched({
        ...currentUser,
        full_name: editFullName.trim() || currentUser.full_name,
        username: res.user?.username || res.profile?.username || editUsername.trim() || currentUser.username,
        profile_picture: savedPic,
        avatar: savedPic,
      });
      showCrossPlatformAlert('Profile Updated', 'Your campus profile details and photo have been updated!');
    } catch (e: any) {
      showCrossPlatformAlert('Update Failed', e.response?.data?.error || 'Could not save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showCrossPlatformAlert('Error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showCrossPlatformAlert('Error', 'New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await authService.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showCrossPlatformAlert('Password Updated', 'Your account password has been changed successfully.');
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // Send Reset Password OTP
  const handleSendResetOtp = async () => {
    if (!resetEmail.includes('@')) {
      showCrossPlatformAlert('Error', 'Please enter a valid college email.');
      return;
    }

    setSendingResetOtp(true);
    try {
      const res = await authService.forgotPassword(resetEmail.trim());
      setResetOtpSent(true);
      showCrossPlatformAlert(
        'Code Sent',
        `A 6-digit password reset code was sent to ${resetEmail}.\n${
          res.dev_otp ? `(Dev Code: ${res.dev_otp})` : ''
        }`
      );
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Failed to send reset code.');
    } finally {
      setSendingResetOtp(false);
    }
  };

  // Reset Password with OTP
  const handleResetPassword = async () => {
    if (!resetOtp || resetOtp.length < 6) {
      showCrossPlatformAlert('Error', 'Please enter the 6-digit OTP code.');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 6) {
      showCrossPlatformAlert('Error', 'New password must be at least 6 characters.');
      return;
    }

    setResettingPassword(true);
    try {
      await authService.resetPassword(resetEmail.trim(), resetOtp.trim(), resetNewPassword.trim());
      setResetOtp('');
      setResetNewPassword('');
      setResetOtpSent(false);
      showCrossPlatformAlert('Password Reset', 'You can now use your new password to sign in.');
    } catch (e: any) {
      showCrossPlatformAlert('Reset Failed', e.response?.data?.error || 'Invalid or expired code.');
    } finally {
      setResettingPassword(false);
    }
  };

  if (loading && !profile) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading campus profile...</Text>
      </View>
    );
  }

  const initials = (currentUser.full_name || currentUser.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const verificationTier =
    currentUser.verification_tier ||
    (profile?.verified ? 'FULLY_VERIFIED' : 'UNVERIFIED');

  const triggerLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out from Campus Connect?') : true;
      if (confirmed) {
        onLogout();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to log out from Campus Connect?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: onLogout },
      ]);
    }
  };

  const triggerDeleteAccount = () => {
    const confirmMessage =
      'Are you sure you want to PERMANENTLY DELETE your student ID & account?\n\nThis will instantly delete your student profile, posts, comments, connections, and verification status. This action CANNOT be undone.';

    const executeDeletion = async () => {
      setDeletingAccount(true);
      try {
        await authService.deleteAccount();
        showCrossPlatformAlert('Account Deleted', 'Your account and profile have been permanently deleted.');
        onLogout();
      } catch (e: any) {
        showCrossPlatformAlert('Deletion Failed', e?.response?.data?.message || 'Failed to delete account. Please try again.');
      } finally {
        setDeletingAccount(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(confirmMessage) : true;
      if (confirmed) {
        executeDeletion();
      }
    } else {
      Alert.alert(
        'Delete Student ID ⚠️',
        confirmMessage,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Permanently Delete', style: 'destructive', onPress: executeDeletion },
        ]
      );
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.scrollContent, { maxWidth: 680, width: '100%', alignSelf: 'center' }]}>
      {/* Top Header Card */}
      <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.heroTopActions}>
          <TouchableOpacity
            style={[styles.editProfileBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setActiveSettingsSection('PROFILE');
              setSettingsModalVisible(true);
            }}
          >
            <Edit3 size={13} color="#ffffff" />
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          {(currentUser.is_staff || currentUser.is_superuser) && (
            <TouchableOpacity
              style={styles.auditIconBtn}
              onPress={() => {
                setActiveSettingsSection('AUDIT');
                setSettingsModalVisible(true);
                loadAuditList();
              }}
            >
              <ShieldCheck size={14} color={colors.primary} />
              <Text style={styles.auditIconText}>Audit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.settingsIconBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setSettingsModalVisible(true)}
          >
            <Settings size={14} color={colors.textSecondary} />
            <Text style={[styles.settingsIconText, { color: colors.textSecondary }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroLogoutBtn}
            onPress={triggerLogout}
          >
            <LogOut size={14} color={colors.danger} />
            <Text style={styles.heroLogoutText}>Sign Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroDeleteBtn}
            onPress={triggerDeleteAccount}
            disabled={deletingAccount}
          >
            <Trash2 size={14} color="#ef4444" />
            <Text style={styles.heroDeleteText}>{deletingAccount ? 'Deleting...' : 'Delete ID'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarRow}>
          <TouchableOpacity
            style={[
              styles.avatarCircle,
              {
                borderRadius: avatarShape === 'SQUARE' ? 0 : 36,
                borderWidth: avatarShape === 'SQUARE' ? 2 : 3,
                borderColor: avatarShape === 'SQUARE' ? colors.primary : colors.cardBorder,
              },
            ]}
            onPress={() => {
              setActiveSettingsSection('PROFILE');
              setSettingsModalVisible(true);
            }}
            activeOpacity={0.8}
            accessibilityLabel="Edit profile and photo"
          >
            <UserAvatar
              uri={profile?.profile_picture || currentUser.profile_picture || currentUser.avatar}
              name={currentUser.full_name || profile?.username || currentUser.email}
              size={avatarShape === 'SQUARE' ? 68 : 66}
              borderRadius={avatarShape === 'SQUARE' ? 0 : 33}
            />
            <View style={[styles.onlineBadge, { borderColor: colors.surface }]} />
            <View style={[styles.shapeBadgePill, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Text style={[styles.shapeBadgeText, { color: colors.primary }]}>
                {avatarShape === 'SQUARE' ? '0' : '○'}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.heroIdentity}>
            <View style={styles.nameBadgeRow}>
              <Text style={[styles.fullName, { color: colors.textPrimary }]}>{currentUser.full_name || 'Campus Student'}</Text>
              {verificationTier === 'FULLY_VERIFIED' ? (
                <View style={styles.verifiedTag}>
                  <ShieldCheck size={12} color="#27a644" />
                  <Text style={styles.verifiedTagText}>OFFICIAL ID</Text>
                </View>
              ) : verificationTier === 'INVITE_VERIFIED' ? (
                <View style={styles.inviteVerifiedTag}>
                  <Ticket size={11} color="#828fff" />
                  <Text style={styles.inviteVerifiedTagText}>INVITE VERIFIED</Text>
                </View>
              ) : verificationTier === 'SEMI_VERIFIED' ? (
                <View style={styles.semiVerifiedTag}>
                  <Clock size={11} color="#f59e0b" />
                  <Text style={styles.semiVerifiedTagText}>ID PENDING</Text>
                </View>
              ) : (
                <View style={styles.unverifiedTag}>
                  <AlertCircle size={11} color={colors.textMuted} />
                  <Text style={[styles.unverifiedTagText, { color: colors.textMuted }]}>READ-ONLY</Text>
                </View>
              )}
            </View>
            <Text style={[styles.handleText, { color: colors.primary }]}>
              @{profile?.username || currentUser.email.split('@')[0]}
            </Text>
            <Text style={[styles.emailText, { color: colors.textMuted }]}>{currentUser.email}</Text>

            {/* 1-Tap Avatar Shape Switcher Pill */}
            <TouchableOpacity
              style={[
                styles.avatarShapeTogglePill,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              ]}
              onPress={() => handleToggleAvatarShape(avatarShape === 'SQUARE' ? 'CIRCLE' : 'SQUARE')}
              activeOpacity={0.7}
            >
              <Text style={[styles.avatarShapeToggleText, { color: colors.textSecondary }]}>
                Avatar Style: <Text style={{ color: colors.primary, fontWeight: '700' }}>{avatarShape === 'SQUARE' ? '⬛ 0 Shape (Square)' : '⚪ Round Circle'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Campus Verification Upgrade Callout */}
        {(verificationTier !== 'FULLY_VERIFIED' || !effectiveCanParticipate) && (
          <View
            style={[
              verificationTier === 'INVITE_VERIFIED' ? styles.inviteUpgradeBanner : styles.semiVerifiedBanner,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  verificationTier === 'INVITE_VERIFIED'
                    ? styles.inviteUpgradeBannerTitle
                    : styles.semiVerifiedBannerTitle,
                ]}
              >
                {verificationTier === 'INVITE_VERIFIED'
                  ? 'Invite Verified — Upgrade to Official ID'
                  : verificationTier === 'SEMI_VERIFIED'
                  ? 'Student ID Under Admin Review'
                  : 'Read-Only Access — Verify to Participate'}
              </Text>
              <Text style={[styles.semiVerifiedBannerSub, { color: colors.textSecondary }]}>
                {verificationTier === 'INVITE_VERIFIED'
                  ? 'Link your @geu/@gehu Microsoft account anytime to upgrade from Campus Invited to Official Verified Student.'
                  : verificationTier === 'SEMI_VERIFIED'
                  ? 'Your uploaded ID card is queued for admin approval. Enter a Batch Invite Code or link Microsoft SSO for instant access.'
                  : 'Personal email accounts browse read-only. Enter a Batch Invite Code, upload your Student ID card, or link Microsoft SSO.'}
              </Text>
            </View>
            {onRequireVerify && (
              <TouchableOpacity
                style={[
                  styles.verifyUpgradeBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() =>
                  onRequireVerify(
                    verificationTier === 'INVITE_VERIFIED'
                      ? 'Link your @geu/@gehu Microsoft ID to upgrade to an Official Verified Student badge.'
                      : 'Verify your Campus ID or redeem an invite code to unlock posting, commenting, and messaging.'
                  )
                }
                activeOpacity={0.85}
              >
                <Text style={styles.verifyUpgradeBtnText}>
                  {verificationTier === 'INVITE_VERIFIED' ? 'Upgrade' : 'Verify ID'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {profile?.bio ? (
          <View style={[styles.bioContainer, { backgroundColor: colors.surfaceLight, borderLeftColor: colors.primary }]}>
            <Text style={[styles.bioText, { color: colors.textSecondary }]}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Social Stats Row: Posts | Followers | Following | Credibility */}
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{profile?.posts_count ?? userPosts.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Posts</Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />

          <TouchableOpacity
            style={styles.statBox}
            onPress={() => {
              setSocialModalType('followers');
              setSocialModalUserId(currentUser.id);
              setSocialModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{profile?.followers_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Followers</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />

          <TouchableOpacity
            style={styles.statBox}
            onPress={() => {
              setSocialModalType('following');
              setSocialModalUserId(currentUser.id);
              setSocialModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{profile?.following_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Following</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />

          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#fbbf24' }]}>⭐ {profile?.credibility_score ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Credibility</Text>
          </View>
        </View>

        {/* Quick Switch Button in Hero - Dev or Staff Only */}
        {(Boolean(__DEV__) || currentUser.is_staff || currentUser.is_superuser) && (
          <TouchableOpacity
            style={[styles.switchButton, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.1)', borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(79, 70, 229, 0.25)' }]}
            onPress={() => setSwitcherModalVisible(true)}
          >
            <Text style={styles.switchButtonIcon}>🔄</Text>
            <Text style={[styles.switchButtonText, { color: colors.primary }]}>Switch Demo Account (12 Students)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Invite Classmates Card (Verified Students & Admins) */}
      {effectiveCanParticipate && (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ticket size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                Invite Classmates
              </Text>
            </View>
            <TouchableOpacity onPress={loadInviteCodes} disabled={inviteLoading}>
              <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>
                {inviteLoading ? 'Refreshing...' : 'Refresh'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.hubDescText, { color: colors.textSecondary, marginTop: 6 }]}>
            Share your campus invite code with trusted batchmates who signed up via Gmail so they can post and chat immediately.
          </Text>

          {inviteFeedback && (
            <View
              style={[
                styles.inlineNoticeBanner,
                {
                  backgroundColor:
                    inviteFeedback.kind === 'error'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : 'rgba(94, 106, 210, 0.12)',
                  borderColor:
                    inviteFeedback.kind === 'error'
                      ? 'rgba(239, 68, 68, 0.35)'
                      : 'rgba(94, 106, 210, 0.35)',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: inviteFeedback.kind === 'error' ? '#ef4444' : colors.primary,
                }}
              >
                {inviteFeedback.text}
              </Text>
            </View>
          )}

          {inviteLoading && inviteCodes.length === 0 ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 10 }} />
          ) : inviteCodes.length === 0 ? (
            <Text style={[styles.subtext, { color: colors.textMuted, marginBottom: 0 }]}>
              Tap Refresh to load your campus invite code.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {inviteCodes.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.inviteCodeRow,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.inviteCodeValue, { color: colors.textPrimary }]}>
                        {item.code}
                      </Text>
                      <Text style={[styles.inviteCodeBadge, { color: colors.primary }]}>
                        {item.college_short_name || 'Campus'}
                      </Text>
                    </View>
                    <Text style={[styles.inviteCodeMeta, { color: colors.textMuted }]}>
                      {item.batch_label || 'Peer Invite'} • {item.uses_count}/{item.max_uses} used
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyCodeBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleCopyInviteCode(item.code, item.college_short_name)}
                    activeOpacity={0.8}
                  >
                    {Platform.OS === 'web' ? (
                      <Copy size={13} color="#ffffff" />
                    ) : (
                      <Share2 size={13} color="#ffffff" />
                    )}
                    <Text style={styles.copyCodeBtnText}>
                      {Platform.OS === 'web' ? 'Copy' : 'Share'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ⚡ Student Hub & Quick Access (My Saves, Blocked IDs, Account Info, Preferences, Notification Controls) */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>⚡ Student Hub & Quick Access</Text>
          <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>Campus Core</Text>
        </View>
        <Text style={[styles.hubDescText, { color: colors.textSecondary }]}>
          Manage your saved bookmarks, blocked accounts, credentials, safety preferences, and notifications.
        </Text>

        <View style={styles.hubGrid}>
          {/* 1. My Saves */}
          <TouchableOpacity
            style={[styles.hubCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => {
              setSavedModalVisible(true);
              loadSavedPosts();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.hubIconBox, { backgroundColor: 'rgba(234, 179, 8, 0.12)' }]}>
              <Bookmark size={20} color="#eab308" />
            </View>
            <View style={styles.hubCardTextCol}>
              <Text style={[styles.hubCardTitle, { color: colors.textPrimary }]}>My Saves</Text>
              <Text style={[styles.hubCardSubtitle, { color: colors.textMuted }]}>Bookmarked posts & study notes</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {/* 2. My Blocked IDs */}
          <TouchableOpacity
            style={[styles.hubCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => {
              setBlockedModalVisible(true);
              loadBlockedList();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.hubIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
              <UserX size={20} color="#ef4444" />
            </View>
            <View style={styles.hubCardTextCol}>
              <Text style={[styles.hubCardTitle, { color: colors.textPrimary }]}>My Blocked IDs</Text>
              <Text style={[styles.hubCardSubtitle, { color: colors.textMuted }]}>Manage muted & blocked students</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {/* 3. My Account Info */}
          <TouchableOpacity
            style={[styles.hubCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setAccountInfoModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.hubIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <ShieldCheck size={20} color="#3b82f6" />
            </View>
            <View style={styles.hubCardTextCol}>
              <Text style={[styles.hubCardTitle, { color: colors.textPrimary }]}>My Account Info</Text>
              <Text style={[styles.hubCardSubtitle, { color: colors.textMuted }]}>College credentials & Roll No.</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {/* 4. My Preferences */}
          <TouchableOpacity
            style={[styles.hubCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setPreferencesModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.hubIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
              <Sliders size={20} color="#a855f7" />
            </View>
            <View style={styles.hubCardTextCol}>
              <Text style={[styles.hubCardTitle, { color: colors.textPrimary }]}>My Preferences</Text>
              <Text style={[styles.hubCardSubtitle, { color: colors.textMuted }]}>Privacy, DMs & Gender visibility</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {/* 5. Notification Controls */}
          <TouchableOpacity
            style={[styles.hubCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setNotifModalVisible(true)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.hubIconBox,
                {
                  backgroundColor: notificationsBlocked
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(16, 185, 129, 0.12)',
                },
              ]}
            >
              {notificationsBlocked ? <BellOff size={20} color="#ef4444" /> : <Bell size={20} color="#10b981" />}
            </View>
            <View style={styles.hubCardTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.hubCardTitle, { color: colors.textPrimary }]}>Notification Settings</Text>
                {notificationsBlocked && (
                  <View style={styles.quietBadge}>
                    <Text style={styles.quietBadgeText}>MUTED</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.hubCardSubtitle, { color: colors.textMuted }]}>
                {notificationsBlocked ? 'All notifications muted' : 'Alerts, sound & push'}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Academic Identity Details */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🏛️ Institutional Enrollment</Text>

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>College</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
            {profile?.college_name || 'Graphic Era University'}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Degree / Course</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{profile?.course_name || 'B.Tech'}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Department / Branch</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
            {profile?.branch_name || 'Computer Science & Engineering'}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Academic Cohort</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
            {profile?.academic_year_name || 'Year 1'} • {profile?.section_name || 'Section A'}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Roll / Admission No.</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
            {profile?.admission_number || 'GEU/24/CS/108'}
          </Text>
        </View>

        {profile?.show_gender !== false && Boolean(profile?.gender) && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Gender</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{profile?.gender}</Text>
            </View>
          </>
        )}
      </View>

      {/* Privacy & Safe Campus Features */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🛡️ Privacy & Campus Shield</Text>

        <View style={styles.privacyFeatureRow}>
          <Text style={styles.privacyIcon}>🎭</Text>
          <View style={styles.privacyCol}>
            <Text style={[styles.privacyHeading, { color: colors.textPrimary }]}>Anonymous Post Shield</Text>
            <Text style={[styles.privacySub, { color: colors.textSecondary }]}>
              Configured with randomized animal mascots. Your identity is mathematically unlinked.
            </Text>
          </View>
          <View style={styles.badgeActive}>
            <Text style={styles.badgeActiveText}>ENABLED</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <View style={styles.privacyFeatureRow}>
          <Text style={styles.privacyIcon}>🔒</Text>
          <View style={styles.privacyCol}>
            <Text style={[styles.privacyHeading, { color: colors.textPrimary }]}>End-to-End Ephemeral Hangouts</Text>
            <Text style={[styles.privacySub, { color: colors.textSecondary }]}>
              Self-destructing temporary rooms auto-expire in 10m to 24h.
            </Text>
          </View>
          <View style={styles.badgeActive}>
            <Text style={styles.badgeActiveText}>ACTIVE</Text>
          </View>
        </View>
      </View>

      {/* My Campus Posts Section */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📝 My Campus Posts</Text>
          <Text style={[styles.sectionBadgeText, { color: colors.textSecondary }]}>{userPosts.length} published</Text>
        </View>

        {loadingPosts ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>Loading your posts...</Text>
          </View>
        ) : userPosts.length === 0 ? (
          <View style={styles.emptyPostsBox}>
            <Text style={{ fontSize: 24, marginBottom: 6 }}>📭</Text>
            <Text style={[styles.emptyPostsTitle, { color: colors.textPrimary }]}>No posts yet</Text>
            <Text style={[styles.emptyPostsSub, { color: colors.textMuted }]}>
              Share updates, class resources, or thoughts on the campus feed.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 10 }}>
            {userPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onLike={async (pid) => {
                  try {
                    const res = await postService.toggleLike(pid);
                    setUserPosts((prev) =>
                      prev.map((p) =>
                        p.id === pid
                          ? { ...p, has_liked: res.has_liked ?? res.liked, likes_count: res.likes_count }
                          : p
                      )
                    );
                  } catch (e) {
                    console.log('Like error', e);
                  }
                }}
                onCommentPress={() => {
                  showCrossPlatformAlert('Post Comments', 'Tap into the Campus Feed tab to view and reply to comments on this post.');
                }}
                onSharePress={(p) => {
                  showCrossPlatformAlert('Share', `Post by ${p.author_name} is published on Campus Connect.`);
                }}
                onDeletePost={async (pid) => {
                  try {
                    await postService.deletePost(pid);
                    setUserPosts((prev) => prev.filter((p) => p.id !== pid));
                    showCrossPlatformAlert('Deleted', 'Post removed.');
                  } catch {
                    showCrossPlatformAlert('Error', 'Could not delete post.');
                  }
                }}
                onArchivePost={async (pid) => {
                  try {
                    await postService.archivePost(pid);
                    setUserPosts((prev) => prev.filter((p) => p.id !== pid));
                    showCrossPlatformAlert('Archived', 'Post archived.');
                  } catch {
                    showCrossPlatformAlert('Error', 'Could not archive post.');
                  }
                }}
              />
            ))}
          </View>
        )}
      </View>

      {/* Testing & Multi-User Switcher Section - Dev/Staff Only */}
      {(Boolean(__DEV__) || currentUser.is_staff || currentUser.is_superuser) && (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.switcherHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>👥 Multi-User Testing Bench</Text>
            <Text style={[styles.switcherCount, { color: colors.textMuted }]}>{demoUsers.length} Students</Text>
          </View>
          <Text style={[styles.switcherDescription, { color: colors.textSecondary }]}>
            Tap any student to instantly switch sessions and test multi-person group chats, direct messaging, posts, and audio/video calling.
          </Text>

          <View style={styles.demoGrid}>
            {demoUsers.map((user) => {
              const isCurrent = user.email.toLowerCase() === currentUser.email.toLowerCase();
              return (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.demoCard,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: isCurrent ? colors.primary : colors.cardBorder,
                    },
                    isCurrent && {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)',
                    },
                  ]}
                  onPress={() => handleSwitchAccount(user.email)}
                  disabled={switchingUser !== null}
                >
                  <View style={{ position: 'relative' }}>
                    <UserAvatar
                      uri={user.avatar || (user as any).profile_picture}
                      name={user.full_name}
                      size={44}
                    />
                    {isCurrent && <View style={[styles.activeCheck, { borderColor: colors.surface }]} />}
                  </View>
                  <View style={styles.demoInfoCol}>
                    <View style={styles.demoNameRow}>
                      <Text style={[styles.demoName, { color: isCurrent ? colors.primary : colors.textPrimary }]}>
                        {user.full_name}
                      </Text>
                      {isCurrent && (
                        <View style={styles.currentPill}>
                          <Text style={styles.currentPillText}>YOU</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.demoMeta, { color: colors.textMuted }]}>
                      {user.course} {user.branch ? `• ${user.branch}` : ''}
                    </Text>
                    <Text style={[styles.demoBio, { color: colors.textSecondary }]} numberOfLines={1}>
                      {user.bio}
                    </Text>
                  </View>

                  {/* Quick Call & View Profile Action Buttons for other users */}
                  {!isCurrent && (
                    <View style={styles.demoCallActions}>
                      <TouchableOpacity
                        style={[styles.quickCallBtn, { backgroundColor: colors.surface }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          setViewingStudentId(user.id);
                        }}
                      >
                        <Text style={styles.quickCallIcon}>👤</Text>
                      </TouchableOpacity>
                      {onStartCall && (
                        <>
                          <TouchableOpacity
                            style={[styles.quickCallBtn, { backgroundColor: colors.surface }]}
                            onPress={(e) => {
                              e.stopPropagation();
                              onStartCall(user.id, user.full_name, 'AUDIO');
                            }}
                          >
                            <Text style={styles.quickCallIcon}>📞</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.quickCallBtn, { backgroundColor: colors.surface }]}
                            onPress={(e) => {
                              e.stopPropagation();
                              onStartCall(user.id, user.full_name, 'VIDEO');
                            }}
                          >
                            <Text style={styles.quickCallIcon}>📹</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Logout Action */}
      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutButtonText}>Log Out from Device</Text>
      </TouchableOpacity>

      {/* ⚙️ Comprehensive Campus Settings Modal */}
      {settingsModalVisible && (
      <Modal
        visible={settingsModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}
        >
          <View style={[styles.settingsSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>⚙️ Campus Settings</Text>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.surfaceLight }]}
                onPress={() => setSettingsModalVisible(false)}
              >
                <Text style={[styles.closeBtnText, { color: colors.textPrimary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Navigation Tabs inside Settings */}
            <View style={[styles.settingsNavRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
              <TouchableOpacity
                style={[
                  styles.settingsNavTab,
                  activeSettingsSection === 'PROFILE' && styles.settingsNavTabActive,
                ]}
                onPress={() => setActiveSettingsSection('PROFILE')}
              >
                <Text
                  style={[
                    styles.settingsNavText,
                    { color: colors.textSecondary },
                    activeSettingsSection === 'PROFILE' && styles.settingsNavTextActive,
                  ]}
                >
                  👤 Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.settingsNavTab,
                  activeSettingsSection === 'PASSWORD' && styles.settingsNavTabActive,
                ]}
                onPress={() => setActiveSettingsSection('PASSWORD')}
              >
                <Text
                  style={[
                    styles.settingsNavText,
                    { color: colors.textSecondary },
                    activeSettingsSection === 'PASSWORD' && styles.settingsNavTextActive,
                  ]}
                >
                  🔒 Password
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.settingsNavTab,
                  activeSettingsSection === 'PREFERENCES' && styles.settingsNavTabActive,
                ]}
                onPress={() => setActiveSettingsSection('PREFERENCES')}
              >
                <Text
                  style={[
                    styles.settingsNavText,
                    { color: colors.textSecondary },
                    activeSettingsSection === 'PREFERENCES' && styles.settingsNavTextActive,
                  ]}
                >
                  🎨 Theme & Safety
                </Text>
              </TouchableOpacity>

              {(currentUser.is_staff || currentUser.is_superuser) && (
                <TouchableOpacity
                  style={[
                    styles.settingsNavTab,
                    activeSettingsSection === 'AUDIT' && styles.settingsNavTabActive,
                  ]}
                  onPress={() => {
                    setActiveSettingsSection('AUDIT');
                    loadAuditList();
                  }}
                >
                  <Text
                    style={[
                      styles.settingsNavText,
                      { color: colors.textSecondary },
                      activeSettingsSection === 'AUDIT' && styles.settingsNavTextActive,
                    ]}
                  >
                    📋 Audit ({totalStudentsCount || 100})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.settingsContentScroll} keyboardShouldPersistTaps="handled">
              {/* SECTION 1: EDIT PROFILE DETAILS */}
              {activeSettingsSection === 'PROFILE' && (
                <View style={styles.settingsSectionBody}>
                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Public Student Details</Text>

                  {/* Profile Picture Upload Section */}
                  <View style={styles.avatarEditContainer}>
                    <TouchableOpacity
                      style={[
                        styles.avatarPreviewBox,
                        {
                          backgroundColor: colors.surfaceLight,
                          borderRadius: avatarShape === 'SQUARE' ? 0 : 38,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={handlePickPhoto}
                      activeOpacity={0.8}
                      accessibilityLabel="Choose profile photo"
                    >
                      <UserAvatar
                        uri={
                          editAvatarPreview ||
                          profile?.profile_picture ||
                          currentUser.profile_picture ||
                          currentUser.avatar
                        }
                        name={currentUser.full_name || profile?.username || currentUser.email}
                        size={72}
                        borderRadius={avatarShape === 'SQUARE' ? 0 : 36}
                      />
                      <View style={styles.avatarUploadOverlay}>
                        <Camera size={14} color="#ffffff" />
                      </View>
                    </TouchableOpacity>

                    <View style={styles.avatarEditInfoCol}>
                      <TouchableOpacity
                        style={[styles.photoUploadBtn, { backgroundColor: colors.primary }]}
                        onPress={handlePickPhoto}
                      >
                        <Upload size={13} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.photoUploadBtnText}>
                          {editAvatarPreview || profile?.profile_picture ? 'Change Photo' : 'Upload Photo'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.shapeSwitchSubBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                        onPress={() => handleToggleAvatarShape(avatarShape === 'SQUARE' ? 'CIRCLE' : 'SQUARE')}
                      >
                        <Text style={[styles.shapeSwitchSubText, { color: colors.textSecondary }]}>
                          Style: <Text style={{ color: colors.primary, fontWeight: '700' }}>{avatarShape === 'SQUARE' ? '0 Shape (Square)' : 'Round Circle'}</Text>
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Full Name</Text>
                  <TextInput
                    style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={editFullName}
                    onChangeText={setEditFullName}
                    placeholder="Your legal name"
                    placeholderTextColor={colors.textMuted}
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Campus Handle (@username)</Text>
                  <TextInput
                    style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={editUsername}
                    onChangeText={setEditUsername}
                    placeholder="e.g. rahul_cse"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
                  <TextInput
                    style={[styles.settingsInput, styles.bioInputArea, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={editBio}
                    onChangeText={setEditBio}
                    placeholder="Tell your college batch about yourself..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Gender</Text>
                  <View style={styles.genderRow}>
                    {['Male', 'Female', 'Other'].map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.genderOption,
                          { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                          editGender === g && styles.genderOptionActive,
                        ]}
                        onPress={() => setEditGender(g)}
                      >
                        <Text
                          style={[
                            styles.genderOptionText,
                            { color: colors.textSecondary },
                            editGender === g && [styles.genderOptionTextActive, { color: colors.primary }],
                          ]}
                        >
                          {g}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={[styles.prefRow, { marginTop: 12, marginBottom: 8 }]}>
                    <View style={styles.prefTextCol}>
                      <Text style={[styles.prefHeading, { color: colors.textPrimary }]}>Hide Gender on Public Profile</Text>
                      <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                        Keep your gender private so it won't be displayed on public cards or student badges.
                      </Text>
                    </View>
                    <Switch
                      value={!editShowGender}
                      onValueChange={(val) => setEditShowGender(!val)}
                      trackColor={{ false: colors.cardBorder, true: colors.primary }}
                      thumbColor="#ffffff"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.saveChangesBtn, { backgroundColor: colors.primary }]}
                    onPress={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveChangesText}>Save Profile Details</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* SECTION 2: PASSWORD MANAGEMENT & RESET */}
              {activeSettingsSection === 'PASSWORD' && (
                <View style={styles.settingsSectionBody}>
                  {/* Change Password */}
                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Change Password</Text>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Current Password</Text>
                  <TextInput
                    style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={oldPassword}
                    onChangeText={setOldPassword}
                    placeholder="Enter current password (if set)"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>New Password (min 6 characters)</Text>
                  <TextInput
                    style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new strong password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Confirm New Password</Text>
                  <TextInput
                    style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />

                  <TouchableOpacity
                    style={[styles.saveChangesBtn, { backgroundColor: colors.primary }]}
                    onPress={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveChangesText}>Update Password</Text>
                    )}
                  </TouchableOpacity>

                  <View style={[styles.settingsDivider, { backgroundColor: colors.cardBorder }]} />

                  {/* Forgot / Reset Password with Email OTP */}
                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Forgot Password? (OTP Reset)</Text>
                  <Text style={[styles.subtext, { color: colors.textMuted }]}>
                    Receive a 6-digit reset code on your college email address.
                  </Text>

                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>College Email</Text>
                  <TextInput
                    style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="e.g. rahul.sharma@geu.ac.in"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />

                  {!resetOtpSent ? (
                    <TouchableOpacity
                      style={styles.secondaryActionBtn}
                      onPress={handleSendResetOtp}
                      disabled={sendingResetOtp}
                    >
                      {sendingResetOtp ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Send Reset Code to Email</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.resetOtpBlock}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>6-Digit Reset Code</Text>
                      <TextInput
                        style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                        value={resetOtp}
                        onChangeText={setResetOtp}
                        placeholder="123456"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={6}
                      />

                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>New Password</Text>
                      <TextInput
                        style={[styles.settingsInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                        value={resetNewPassword}
                        onChangeText={setResetNewPassword}
                        placeholder="Enter new password"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry
                      />

                      <TouchableOpacity
                        style={[styles.saveChangesBtn, { backgroundColor: colors.primary }]}
                        onPress={handleResetPassword}
                        disabled={resettingPassword}
                      >
                        {resettingPassword ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.saveChangesText}>Reset Password Now</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* SECTION 3: SAFETY & PREFERENCES */}
              {activeSettingsSection === 'PREFERENCES' && (
                <View style={styles.settingsSectionBody}>
                  {/* Theme & Appearance */}
                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Appearance & Theme</Text>
                  <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                    Switch between Dark Mode, Studio Light Mode, or adapt automatically to your OS.
                  </Text>

                  <View style={styles.themeSelectorRow}>
                    {(
                      [
                        { mode: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Obsidian' },
                        { mode: 'light' as const, label: 'Light', icon: Sun, desc: 'Daylight' },
                        { mode: 'system' as const, label: 'System', icon: Monitor, desc: 'Auto OS' },
                      ] as const
                    ).map((t) => {
                      const IconComp = t.icon;
                      const isSelected = themeMode === t.mode;
                      return (
                        <TouchableOpacity
                          key={t.mode}
                          style={[
                            styles.themeOptionCard,
                            isSelected && styles.themeOptionCardActive,
                            {
                              backgroundColor: isSelected ? (isDark ? '#1a1c23' : '#eef2ff') : colors.surfaceLight,
                              borderColor: isSelected ? colors.primary : colors.cardBorder,
                            },
                          ]}
                          onPress={() => setThemeMode(t.mode)}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.themeOptionIconCircle,
                              { backgroundColor: isSelected ? colors.primary : colors.surface },
                            ]}
                          >
                            <IconComp size={15} color={isSelected ? '#ffffff' : colors.textSecondary} />
                          </View>
                          <Text
                            style={[
                              styles.themeOptionLabel,
                              { color: isSelected ? colors.primary : colors.textPrimary },
                            ]}
                          >
                            {t.label}
                          </Text>
                          <Text style={[styles.themeOptionDesc, { color: colors.textMuted }]}>
                            {t.desc}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={[styles.settingsDivider, { backgroundColor: colors.cardBorder }]} />

                  {/* Account Privacy Control */}
                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Account Privacy</Text>

                  <View style={styles.prefRow}>
                    <View style={styles.prefTextCol}>
                      <Text style={[styles.prefHeading, { color: colors.textPrimary }]}>Private Account</Text>
                      <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                        When your account is private, only students you approve can follow you and view your posts. Non-followers see a locked profile card.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.privacyToggleBtn,
                        isPrivateAccount ? styles.privacyToggleBtnActive : styles.privacyToggleBtnInactive,
                      ]}
                      onPress={() => handleTogglePrivateAccount(!isPrivateAccount)}
                      disabled={updatingPrivacy}
                    >
                      <Text style={[styles.privacyToggleBtnText, { color: isPrivateAccount ? '#38bdf8' : '#10b981' }]}>
                        {isPrivateAccount ? 'PRIVATE 🔒' : 'PUBLIC 🌐'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.settingsDivider, { backgroundColor: colors.cardBorder }]} />

                  {/* Messaging Preference Control */}
                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Who Can Message You</Text>
                  <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                    Control who can send direct messages or message requests to your primary inbox.
                  </Text>

                  <View style={styles.prefOptionsList}>
                    {[
                      { key: 'EVERYONE', label: 'Everyone on Campus', sub: 'Any student verified at your college' },
                      { key: 'FOLLOWING', label: 'People You Follow', sub: 'Only accounts you follow can DM' },
                      { key: 'CONNECTIONS_ONLY', label: 'Connections Only', sub: 'Only mutual LinkedIn-style connections' },
                      { key: 'NOBODY', label: 'Nobody', sub: 'Turn off incoming direct message requests' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.prefOptionCard,
                          {
                            backgroundColor: messagingPreference === opt.key
                              ? (isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)')
                              : colors.surfaceLight,
                            borderColor: messagingPreference === opt.key ? colors.primary : colors.cardBorder,
                          },
                        ]}
                        onPress={() => handleUpdateMessagingPreference(opt.key as any)}
                        disabled={updatingPrivacy}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.prefOptionLabel,
                              { color: messagingPreference === opt.key ? colors.primary : colors.textPrimary },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={[styles.prefOptionSub, { color: colors.textMuted }]}>{opt.sub}</Text>
                        </View>
                        <View
                          style={[
                            styles.radioCircle,
                            { borderColor: messagingPreference === opt.key ? colors.primary : colors.cardBorder },
                          ]}
                        >
                          {messagingPreference === opt.key && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={[styles.settingsDivider, { backgroundColor: colors.cardBorder }]} />

                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Campus Privacy Shield</Text>

                  <View style={styles.prefRow}>
                    <View style={styles.prefTextCol}>
                      <Text style={[styles.prefHeading, { color: colors.textPrimary }]}>Anonymous Mode</Text>
                      <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                        Allows posting with mascot pseudonyms without exposing your college handle.
                      </Text>
                    </View>
                    <View style={styles.badgeActive}>
                      <Text style={styles.badgeActiveText}>ACTIVE</Text>
                    </View>
                  </View>

                  <View style={[styles.settingsDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.prefRow}>
                    <View style={styles.prefTextCol}>
                      <Text style={[styles.prefHeading, { color: colors.textPrimary }]}>Push Notifications</Text>
                      <Text style={[styles.prefSub, { color: colors.textMuted }]}>
                        Alerts for community mentions, incoming calls, and DMs.
                      </Text>
                    </View>
                    <View style={styles.badgeActive}>
                      <Text style={styles.badgeActiveText}>ENABLED</Text>
                    </View>
                  </View>

                  <View style={[styles.settingsDivider, { backgroundColor: colors.cardBorder }]} />

                  <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>⚠️ Danger Zone</Text>
                  <Text style={[styles.subtext, { color: colors.textMuted }]}>
                    Log out from this device or permanently delete your student account and wipe all profile data.
                  </Text>

                  <TouchableOpacity style={styles.dangerLogoutBtn} onPress={onLogout}>
                    <Text style={styles.dangerLogoutText}>Sign Out from this Device</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dangerDeleteAccountBtn}
                    onPress={() => {
                      setSettingsModalVisible(false);
                      triggerDeleteAccount();
                    }}
                    disabled={deletingAccount}
                  >
                    <Text style={styles.dangerDeleteAccountText}>
                      {deletingAccount ? 'Purging Account...' : '🗑️ Permanently Delete Account & ID'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* SECTION 4: 100-USER BLIND TEST AUDIT QUEUE */}
              {activeSettingsSection === 'AUDIT' && (
                <View style={styles.settingsSectionBody}>
                  <View style={styles.auditHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputGroupTitle, { color: colors.textPrimary }]}>Campus Verification & Audit Shield</Text>
                      <Text style={[styles.auditHeaderSub, { color: colors.textSecondary }]}>
                        Review pending physical student IDs, flag fake profiles, and drop batch invite codes.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.refreshAuditBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                      onPress={loadAuditList}
                      disabled={auditLoading}
                    >
                      <Text style={[styles.refreshAuditText, { color: colors.textPrimary }]}>🔄 Refresh</Text>
                    </TouchableOpacity>
                  </View>

                  {auditFeedback && (
                    <View
                      style={[
                        styles.inlineNoticeBanner,
                        {
                          backgroundColor:
                            auditFeedback.kind === 'error'
                              ? 'rgba(239, 68, 68, 0.12)'
                              : 'rgba(39, 166, 68, 0.12)',
                          borderColor:
                            auditFeedback.kind === 'error'
                              ? 'rgba(239, 68, 68, 0.35)'
                              : 'rgba(39, 166, 68, 0.35)',
                          marginBottom: 12,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: auditFeedback.kind === 'error' ? '#ef4444' : '#27a644',
                        }}
                      >
                        {auditFeedback.text}
                      </Text>
                    </View>
                  )}

                  {/* Metrics Bar */}
                  <View style={styles.auditMetricsRow}>
                    <View style={[styles.auditMetricBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                      <Text style={[styles.auditMetricNum, { color: colors.textPrimary }]}>{totalStudentsCount}</Text>
                      <Text style={[styles.auditMetricLabel, { color: colors.textMuted }]}>STUDENTS</Text>
                    </View>
                    <View style={[styles.auditMetricBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                      <Text style={[styles.auditMetricNum, { color: '#f59e0b' }]}>{pendingReviewsCount}</Text>
                      <Text style={[styles.auditMetricLabel, { color: colors.textMuted }]}>PENDING ID</Text>
                    </View>
                    <View style={[styles.auditMetricBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                      <Text style={[styles.auditMetricNum, { color: '#34d399' }]}>
                        {Math.max(0, totalStudentsCount - flaggedCount - pendingReviewsCount)}
                      </Text>
                      <Text style={[styles.auditMetricLabel, { color: colors.textMuted }]}>VERIFIED</Text>
                    </View>
                    <View style={[styles.auditMetricBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                      <Text style={[styles.auditMetricNum, { color: '#ef4444' }]}>
                        {flaggedCount}
                      </Text>
                      <Text style={[styles.auditMetricLabel, { color: colors.textMuted }]}>FLAGGED</Text>
                    </View>
                  </View>

                  {/* Founder Batch Invite Code Generator */}
                  <View
                    style={[
                      styles.batchDropCard,
                      { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Ticket size={15} color={colors.primary} />
                      <Text style={[styles.batchDropTitle, { color: colors.textPrimary }]}>
                        Generate Batch Invite Code
                      </Text>
                    </View>
                    <Text style={[styles.auditHeaderSub, { color: colors.textMuted, marginBottom: 10 }]}>
                      Hand out a batch code during lectures or WhatsApp group launches so students can unlock full posting after Gmail OTP sign-in.
                    </Text>

                    {batchColleges.length > 0 && (
                      <View style={styles.batchCollegeRow}>
                        {batchColleges.map((c) => {
                          const selected = batchCollegeId === c.id;
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={[
                                styles.batchCollegePill,
                                {
                                  backgroundColor: selected ? colors.primary : colors.surface,
                                  borderColor: selected ? colors.primary : colors.cardBorder,
                                },
                              ]}
                              onPress={() => setBatchCollegeId(c.id)}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: selected ? '#ffffff' : colors.textSecondary,
                                }}
                              >
                                {c.short_name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    <View style={styles.batchInputRow}>
                      <TextInput
                        style={[
                          styles.settingsInput,
                          {
                            flex: 1,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                            borderColor: colors.cardBorder,
                            marginBottom: 0,
                          },
                        ]}
                        placeholder="Custom code (optional, e.g. GEUBTECH)"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        value={batchCodeInput}
                        onChangeText={setBatchCodeInput}
                      />
                      <TextInput
                        style={[
                          styles.settingsInput,
                          {
                            width: 72,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                            borderColor: colors.cardBorder,
                            marginBottom: 0,
                            textAlign: 'center',
                          },
                        ]}
                        placeholder="50"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={batchMaxUsesInput}
                        onChangeText={setBatchMaxUsesInput}
                      />
                    </View>

                    <TextInput
                      style={[
                        styles.settingsInput,
                        {
                          backgroundColor: colors.surface,
                          color: colors.textPrimary,
                          borderColor: colors.cardBorder,
                          marginTop: 8,
                          marginBottom: 10,
                        },
                      ]}
                      placeholder="Batch label (e.g. CSE Sec A Batch 2026)"
                      placeholderTextColor={colors.textMuted}
                      value={batchLabelInput}
                      onChangeText={setBatchLabelInput}
                    />

                    <TouchableOpacity
                      style={[styles.saveChangesBtn, { marginTop: 0, backgroundColor: colors.primary }]}
                      onPress={handleCreateBatchCode}
                      disabled={creatingBatchCode}
                    >
                      <Text style={styles.saveChangesText}>
                        {creatingBatchCode ? 'Creating Code...' : 'Generate Batch Invite Code'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {auditLoading ? (
                    <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10 }}>
                        Loading registered students...
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 12, marginTop: 14 }}>
                      {auditStudents.map((s) => (
                        <View
                          key={s.user_id}
                          style={[
                            styles.auditCard,
                            { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                            s.pending_review && styles.auditCardPending,
                            s.is_flagged_fake && styles.auditCardFlagged,
                          ]}
                        >
                          <View style={styles.auditCardTop}>
                            <UserAvatar
                              uri={s.avatar || s.profile_picture}
                              name={s.full_name || s.username}
                              size={40}
                            />
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <Text style={[styles.auditName, { color: colors.textPrimary }]}>@{s.username}</Text>
                                <View
                                  style={[
                                    styles.auditMethodPill,
                                    s.pending_review
                                      ? styles.pillPending
                                      : s.verification_method === 'ID_CARD_OCR'
                                      ? styles.pillOcr
                                      : styles.pillEmail,
                                  ]}
                                >
                                  <Text style={styles.auditMethodText}>
                                    {s.pending_review
                                      ? '⏳ ID REVIEW PENDING'
                                      : s.verification_method === 'ID_CARD_OCR'
                                      ? '📷 ID CARD'
                                      : s.verification_method || s.verification_tier}
                                  </Text>
                                </View>
                              </View>
                              <Text style={[styles.auditMetaText, { color: colors.textSecondary }]}>
                                📱 {s.phone_number} • ✉️ {s.email}
                              </Text>
                              <Text style={[styles.auditAcademicText, { color: colors.textMuted }]}>
                                🏛️ {s.college_name} • {s.course_name} ({s.branch_name})
                              </Text>
                              <Text style={[styles.auditRollText, { color: colors.textMuted }]}>
                                🔒 Roll Number: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{s.admission_number || 'Pending'}</Text>
                              </Text>
                            </View>
                          </View>

                          {s.id_card_image ? (
                            <View style={[styles.auditIdImageWrap, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
                              <Image
                                source={{ uri: s.id_card_image }}
                                style={styles.auditIdImage}
                                resizeMode="contain"
                              />
                            </View>
                          ) : null}

                          {s.is_flagged_fake && (
                            <View style={styles.auditFlagBox}>
                              <Text style={styles.auditFlagIcon}>⚠️</Text>
                              <Text style={styles.auditFlagReason}>
                                {s.flag_reason || 'Flagged fake profile during campus testing audit'}
                              </Text>
                            </View>
                          )}

                          <View style={[styles.auditActionsRow, { gap: 8 }]}>
                            {(!s.id_card_verified || s.is_flagged_fake || !s.can_participate) && (
                              <TouchableOpacity
                                style={styles.auditApproveBtn}
                                onPress={() => handleAuditAction(s.user_id, 'APPROVE')}
                              >
                                <Text style={styles.auditApproveText}>✅ Approve Student</Text>
                              </TouchableOpacity>
                            )}
                            {!s.is_flagged_fake && (
                              <TouchableOpacity
                                style={styles.auditFlagBtn}
                                onPress={() => handleAuditAction(s.user_id, 'FLAG_FAKE')}
                              >
                                <Text style={styles.auditFlagText}>🚫 Flag Fake</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      )}

      {/* Full Screen Modal Switcher */}
      {switcherModalVisible && (
      <Modal
        visible={switcherModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setSwitcherModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Switch Campus Account</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Select any student to test interactions</Text>
              </View>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.surfaceLight }]}
                onPress={() => setSwitcherModalVisible(false)}
              >
                <Text style={[styles.closeBtnText, { color: colors.textPrimary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {demoUsers.map((user) => {
                const isCurrent = user.email.toLowerCase() === currentUser.email.toLowerCase();
                return (
                  <TouchableOpacity
                    key={user.id}
                    style={[
                      styles.modalUserRow,
                      { borderBottomColor: colors.cardBorder },
                      isCurrent && [styles.modalUserRowCurrent, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.14)' : 'rgba(79, 70, 229, 0.08)' }],
                    ]}
                    onPress={() => handleSwitchAccount(user.email)}
                    disabled={switchingUser !== null}
                  >
                    <UserAvatar
                      uri={user.avatar || (user as any).profile_picture}
                      name={user.full_name}
                      size={40}
                    />
                    <View style={styles.modalUserCol}>
                      <Text style={[styles.modalUserName, { color: colors.textPrimary }]}>
                        {user.full_name} {isCurrent ? ' (Active)' : ''}
                      </Text>
                      <Text style={[styles.modalUserSub, { color: colors.textMuted }]}>
                        {user.course} • {user.branch || 'General'} • @{user.username}
                      </Text>
                      <Text style={[styles.modalUserBio, { color: colors.textSecondary }]} numberOfLines={1}>
                        {user.bio}
                      </Text>
                    </View>
                    {isCurrent ? (
                      <Text style={styles.modalCheckmark}>✓</Text>
                    ) : (
                      <Text style={[styles.modalSwitchArrow, { color: colors.textMuted }]}>➔</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}

      {/* Social List Modal (Followers / Following / Connections) */}
      <SocialListModal
        visible={socialModalVisible}
        type={socialModalType}
        targetUserId={socialModalUserId}
        isSelf={socialModalUserId === currentUser.id}
        onClose={() => {
          setSocialModalVisible(false);
          // Refresh own profile counts when closing social list
          profileService.getMyProfile().then((data) => {
            if (data) setProfile(data);
          }).catch(() => {});
        }}
        onSelectUser={(uid) => {
          setViewingStudentId(uid);
        }}
      />

      {/* Student Profile Modal (Public Profile Inspection) */}
      <StudentProfileModal
        visible={viewingStudentId !== null}
        userId={viewingStudentId}
        canParticipate={effectiveCanParticipate}
        onRequireVerify={onRequireVerify}
        onClose={() => {
          setViewingStudentId(null);
          // Refresh own profile counts when closing student profile modal
          profileService.getMyProfile().then((data) => {
            if (data) setProfile(data);
          }).catch(() => {});
        }}
        onOpenChat={() => {
          showCrossPlatformAlert('Chat Ready', 'Head to the Messages tab to continue this conversation.');
        }}
        onOpenSocialList={(type, targetUid) => {
          setSocialModalType(type);
          setSocialModalUserId(targetUid);
          setSocialModalVisible(true);
        }}
      />

      {/* 🔖 My Saved Posts Modal */}
      <Modal
        visible={savedModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setSavedModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.customModalSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.customModalTitle, { color: colors.textPrimary }]}>🔖 My Saved Posts</Text>
                <Text style={[styles.customModalSubtitle, { color: colors.textMuted }]}>
                  {savedPosts.length} saved bookmarks
                </Text>
              </View>
              <TouchableOpacity style={styles.customCloseBtn} onPress={() => setSavedModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {loadingSaved ? (
              <View style={styles.modalCenterBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.modalCenterText, { color: colors.textSecondary }]}>Loading saved posts...</Text>
              </View>
            ) : savedPosts.length === 0 ? (
              <View style={styles.modalCenterBox}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>🔖</Text>
                <Text style={[styles.modalEmptyTitle, { color: colors.textPrimary }]}>No saved posts</Text>
                <Text style={[styles.modalEmptySub, { color: colors.textMuted }]}>
                  Tap the bookmark icon on any post in your campus feed to save it here for quick access later.
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.customModalScroll} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 12, paddingBottom: 32 }}>
                  {savedPosts.map((post) => (
                    <View
                      key={post.id}
                      style={[styles.savedCardBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                    >
                      <View style={styles.savedCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.savedAuthorName, { color: colors.textPrimary }]}>{post.author_name}</Text>
                          <Text style={[styles.savedPostTime, { color: colors.textMuted }]}>
                            {new Date(post.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.unsaveBtn}
                          onPress={() => handleRemoveSavedPost(post.id)}
                        >
                          <Bookmark size={14} color="#eab308" fill="#eab308" />
                          <Text style={styles.unsaveBtnText}>Unsave</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.savedContentText, { color: colors.textPrimary }]} numberOfLines={3}>
                        {post.content}
                      </Text>
                      {post.media_url ? (
                        <View style={styles.savedMediaIndicator}>
                          <Text style={{ fontSize: 12, color: colors.primary }}>📎 Media attached</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 🚫 My Blocked IDs Modal */}
      <Modal
        visible={blockedModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setBlockedModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.customModalSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.customModalTitle, { color: colors.textPrimary }]}>🚫 Blocked Students</Text>
                <Text style={[styles.customModalSubtitle, { color: colors.textMuted }]}>
                  {blockedUsers.length} blocked accounts
                </Text>
              </View>
              <TouchableOpacity style={styles.customCloseBtn} onPress={() => setBlockedModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {loadingBlocked ? (
              <View style={styles.modalCenterBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.modalCenterText, { color: colors.textSecondary }]}>Loading blocked students...</Text>
              </View>
            ) : blockedUsers.length === 0 ? (
              <View style={styles.modalCenterBox}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>🛡️</Text>
                <Text style={[styles.modalEmptyTitle, { color: colors.textPrimary }]}>No Blocked Students</Text>
                <Text style={[styles.modalEmptySub, { color: colors.textMuted }]}>
                  You haven't blocked anyone. Students you block won't be able to message you or view your profile.
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.customModalScroll} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 10, paddingBottom: 32 }}>
                  {blockedUsers.map((item) => {
                    const targetUser = item.user || item;
                    const isUnblocking = unblockingId === targetUser.id;
                    return (
                      <View
                        key={targetUser.id}
                        style={[styles.blockedUserRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                      >
                        <UserAvatar
                          uri={targetUser.avatar || targetUser.profile_picture}
                          name={targetUser.full_name || targetUser.name}
                          size={42}
                          borderRadius={10}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.blockedUserName, { color: colors.textPrimary }]}>
                            {targetUser.full_name || targetUser.name}
                          </Text>
                          <Text style={[styles.blockedUserHandle, { color: colors.primary }]}>
                            @{targetUser.username || targetUser.email?.split('@')[0]}
                          </Text>
                          {targetUser.college_name ? (
                            <Text style={[styles.blockedUserCollege, { color: colors.textMuted }]}>
                              {targetUser.college_name}
                            </Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={styles.unblockActionBtn}
                          onPress={() => handleUnblock(targetUser.id, targetUser.full_name || targetUser.name)}
                          disabled={isUnblocking}
                        >
                          {isUnblocking ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.unblockActionText}>Unblock</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 🏛️ My Account Info Modal */}
      <Modal
        visible={accountInfoModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setAccountInfoModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.customModalSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.customModalTitle, { color: colors.textPrimary }]}>🏛️ Student Account Info</Text>
                <Text style={[styles.customModalSubtitle, { color: colors.textMuted }]}>
                  Verified academic enrollment credentials
                </Text>
              </View>
              <TouchableOpacity style={styles.customCloseBtn} onPress={() => setAccountInfoModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.customModalScroll} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 12, paddingBottom: 32 }}>
                {/* Verification Badge Hero */}
                <View style={[styles.credentialHeroCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck
                      size={26}
                      color={
                        verificationTier === 'FULLY_VERIFIED'
                          ? '#10b981'
                          : verificationTier === 'INVITE_VERIFIED'
                          ? '#828fff'
                          : verificationTier === 'SEMI_VERIFIED'
                          ? '#f59e0b'
                          : colors.textMuted
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.credentialStatusTitle, { color: colors.textPrimary }]}>
                        {verificationTier === 'FULLY_VERIFIED'
                          ? 'Official Verified Student ✅'
                          : verificationTier === 'INVITE_VERIFIED'
                          ? 'Campus Invited (Verified Peer)'
                          : verificationTier === 'SEMI_VERIFIED'
                          ? 'Student ID Under Admin Review'
                          : 'Read-Only Account (Unverified)'}
                      </Text>
                      <Text style={[styles.credentialStatusSub, { color: colors.textMuted }]}>
                        {verificationTier === 'FULLY_VERIFIED'
                          ? 'Institutional credentials verified via official college Microsoft ID or admin review.'
                          : verificationTier === 'INVITE_VERIFIED'
                          ? 'Full participation unlocked via a Campus Batch Invite Code. Link Microsoft ID anytime to upgrade.'
                          : verificationTier === 'SEMI_VERIFIED'
                          ? 'Physical student ID uploaded and queued for review. Enter an invite code or link Microsoft SSO for instant access.'
                          : 'Personal email accounts are read-only until verified via invite code, student ID, or college Microsoft ID.'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Details Breakdown */}
                <View style={[styles.infoCardWrapper, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Legal Full Name</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{currentUser.full_name || 'Campus Student'}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Campus Handle</Text>
                    <Text style={[styles.infoModalVal, { color: colors.primary }]}>@{profile?.username || currentUser.email.split('@')[0]}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>College / University</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{profile?.college_name || 'Graphic Era University'}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Degree / Course</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{profile?.course_name || 'B.Tech'}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Department / Branch</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{profile?.branch_name || 'Computer Science & Engineering'}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Academic Cohort</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{profile?.academic_year_name || 'Year 1'} • {profile?.section_name || 'Section A'}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Roll / Admission No.</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{profile?.admission_number || 'GEU/24/CS/108'}</Text>
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  <View style={styles.infoModalRow}>
                    <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Institutional Email</Text>
                    <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>{currentUser.email}</Text>
                  </View>

                  {Boolean(profile?.gender) && (
                    <>
                      <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />
                      <View style={styles.infoModalRow}>
                        <Text style={[styles.infoModalLabel, { color: colors.textMuted }]}>Gender</Text>
                        <Text style={[styles.infoModalVal, { color: colors.textPrimary }]}>
                          {profile?.gender} {profile?.show_gender === false ? '(Hidden on profile)' : '(Public)'}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ⚙️ My Preferences Modal */}
      <Modal
        visible={preferencesModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.customModalSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.customModalTitle, { color: colors.textPrimary }]}>⚙️ Preferences & Privacy</Text>
                <Text style={[styles.customModalSubtitle, { color: colors.textMuted }]}>
                  Campus safety, avatar style & messaging permissions
                </Text>
              </View>
              <TouchableOpacity style={styles.customCloseBtn} onPress={() => setPreferencesModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.customModalScroll} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 16, paddingBottom: 32 }}>
                {/* Avatar Shape Preference */}
                <View style={[styles.prefBlock, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.prefBlockTitle, { color: colors.textPrimary }]}>Profile Picture Style</Text>
                  <Text style={[styles.prefBlockSub, { color: colors.textMuted }]}>
                    Choose between brutalist 0-radius square or classic circular avatar.
                  </Text>
                  <View style={styles.shapePrefRow}>
                    <TouchableOpacity
                      style={[
                        styles.shapePrefCard,
                        avatarShape === 'SQUARE' && styles.shapePrefCardActive,
                        { borderColor: avatarShape === 'SQUARE' ? colors.primary : colors.cardBorder },
                      ]}
                      onPress={() => handleToggleAvatarShape('SQUARE')}
                    >
                      <UserAvatar
                        uri={profile?.profile_picture || currentUser.profile_picture || currentUser.avatar}
                        name={currentUser.full_name || profile?.username || currentUser.email}
                        size={48}
                        borderRadius={0}
                        style={{ marginBottom: 8 }}
                      />
                      <Text style={[styles.shapePrefLabel, { color: avatarShape === 'SQUARE' ? colors.primary : colors.textPrimary }]}>
                        ⬛ 0 Shape (Square)
                      </Text>
                      <Text style={[styles.shapePrefDesc, { color: colors.textMuted }]}>Brutalist modern</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.shapePrefCard,
                        avatarShape === 'CIRCLE' && styles.shapePrefCardActive,
                        { borderColor: avatarShape === 'CIRCLE' ? colors.primary : colors.cardBorder },
                      ]}
                      onPress={() => handleToggleAvatarShape('CIRCLE')}
                    >
                      <UserAvatar
                        uri={profile?.profile_picture || currentUser.profile_picture || currentUser.avatar}
                        name={currentUser.full_name || profile?.username || currentUser.email}
                        size={48}
                        borderRadius={24}
                        style={{ marginBottom: 8 }}
                      />
                      <Text style={[styles.shapePrefLabel, { color: avatarShape === 'CIRCLE' ? colors.primary : colors.textPrimary }]}>
                        ⚪ Round Circle
                      </Text>
                      <Text style={[styles.shapePrefDesc, { color: colors.textMuted }]}>Classic circle</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Account Privacy Toggle */}
                <View style={[styles.prefBlock, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.prefBlockTitle, { color: colors.textPrimary }]}>Private Account</Text>
                      <Text style={[styles.prefBlockSub, { color: colors.textMuted }]}>
                        Only students you approve can follow and view your posts. Non-followers see a locked card.
                      </Text>
                    </View>
                    <Switch
                      value={isPrivateAccount}
                      onValueChange={handleTogglePrivateAccount}
                      trackColor={{ false: colors.cardBorder, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                {/* Gender Visibility */}
                <View style={[styles.prefBlock, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.prefBlockTitle, { color: colors.textPrimary }]}>Show Gender on Profile</Text>
                      <Text style={[styles.prefBlockSub, { color: colors.textMuted }]}>
                        Allow other students to view your gender on your profile card.
                      </Text>
                    </View>
                    <Switch
                      value={editShowGender}
                      onValueChange={(val) => {
                        setEditShowGender(val);
                        profileService.updateProfile({ show_gender: val }).catch(() => {});
                      }}
                      trackColor={{ false: colors.cardBorder, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                {/* Messaging Permissions */}
                <View style={[styles.prefBlock, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.prefBlockTitle, { color: colors.textPrimary }]}>Who Can Message You</Text>
                  <Text style={[styles.prefBlockSub, { color: colors.textMuted }]}>
                    Control who can initiate direct message requests with you on campus.
                  </Text>

                  <View style={{ gap: 8, marginTop: 10 }}>
                    {(
                      [
                        { key: 'EVERYONE', label: 'Everyone on Campus', desc: 'Any verified student' },
                        { key: 'FOLLOWING', label: 'People You Follow', desc: 'Only students you follow' },
                        { key: 'CONNECTIONS_ONLY', label: 'Connections Only', desc: 'Mutual campus connections' },
                        { key: 'NOBODY', label: 'Nobody', desc: 'Completely close direct messaging' },
                      ] as const
                    ).map((opt) => {
                      const isSelected = messagingPreference === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.msgPrefOption,
                            isSelected && styles.msgPrefOptionActive,
                            { backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.12)' : colors.surface, borderColor: isSelected ? colors.primary : colors.cardBorder },
                          ]}
                          onPress={() => handleUpdateMessagingPreference(opt.key)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.msgPrefLabel, { color: isSelected ? colors.primary : colors.textPrimary }]}>
                              {opt.label}
                            </Text>
                            <Text style={[styles.msgPrefSub, { color: colors.textMuted }]}>{opt.desc}</Text>
                          </View>
                          {isSelected && <Check size={16} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 🔔 My Notification Settings Modal */}
      <Modal
        visible={notifModalVisible}
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.customModalSheet, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.customModalTitle, { color: colors.textPrimary }]}>🔔 Notification Settings</Text>
                <Text style={[styles.customModalSubtitle, { color: colors.textMuted }]}>
                  Alert sounds, push notifications & quiet mode
                </Text>
              </View>
              <TouchableOpacity style={styles.customCloseBtn} onPress={() => setNotifModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.customModalScroll} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 16, paddingBottom: 32 }}>
                {/* Master Switch: Block All Notifications */}
                <View
                  style={[
                    styles.prefBlock,
                    notificationsBlocked && { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)' },
                    !notificationsBlocked && { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.prefBlockTitle, { color: notificationsBlocked ? '#ef4444' : colors.textPrimary }]}>
                          Block All Notifications
                        </Text>
                        {notificationsBlocked && (
                          <View style={styles.quietBadge}>
                            <Text style={styles.quietBadgeText}>MUTED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.prefBlockSub, { color: colors.textMuted }]}>
                        Quiet Campus Mode / Do Not Disturb. Completely silences all external push and browser notifications.
                      </Text>
                    </View>
                    <Switch
                      value={notificationsBlocked}
                      onValueChange={handleToggleNotificationsBlocked}
                      trackColor={{ false: colors.cardBorder, true: '#ef4444' }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                {/* Sub-Switches */}
                <View
                  style={[
                    styles.prefBlock,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                    notificationsBlocked && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[styles.prefBlockTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                    Granular Alerts
                  </Text>

                  {/* Likes */}
                  <View style={styles.notifSubRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notifSubLabel, { color: colors.textPrimary }]}>Likes & Endorsements</Text>
                      <Text style={[styles.notifSubDesc, { color: colors.textMuted }]}>
                        When students like your posts or endorse your credibility
                      </Text>
                    </View>
                    <Switch
                      value={notifLikes && !notificationsBlocked}
                      disabled={notificationsBlocked}
                      onValueChange={(v) => handleToggleNotifSub('@campus_notif_likes', v, setNotifLikes)}
                      trackColor={{ false: colors.cardBorder, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  {/* Comments */}
                  <View style={styles.notifSubRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notifSubLabel, { color: colors.textPrimary }]}>Comments & Discussion</Text>
                      <Text style={[styles.notifSubDesc, { color: colors.textMuted }]}>
                        When someone replies to your post or mentions you
                      </Text>
                    </View>
                    <Switch
                      value={notifComments && !notificationsBlocked}
                      disabled={notificationsBlocked}
                      onValueChange={(v) => handleToggleNotifSub('@campus_notif_comments', v, setNotifComments)}
                      trackColor={{ false: colors.cardBorder, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                  <View style={[styles.infoModalDivider, { backgroundColor: colors.cardBorder }]} />

                  {/* Direct Messages */}
                  <View style={styles.notifSubRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notifSubLabel, { color: colors.textPrimary }]}>Direct Messages & Requests</Text>
                      <Text style={[styles.notifSubDesc, { color: colors.textMuted }]}>
                        When a classmate sends you a DM or message request
                      </Text>
                    </View>
                    <Switch
                      value={notifMessages && !notificationsBlocked}
                      disabled={notificationsBlocked}
                      onValueChange={(v) => handleToggleNotifSub('@campus_notif_messages', v, setNotifMessages)}
                      trackColor={{ false: colors.cardBorder, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 14,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.cardBorder,
  },
  privacyToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyToggleBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  privacyToggleBtnInactive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
  },
  privacyToggleBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  prefOptionsList: {
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  prefOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  prefOptionCardActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  prefOptionLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  prefOptionLabelActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  prefOptionSub: {
    color: '#94a3b8',
    fontSize: 11,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  radioCircleActive: {
    borderColor: '#38bdf8',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38bdf8',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 45,
    paddingBottom: 60,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 16,
    position: 'relative',
  },
  heroTopActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  settingsIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  settingsIconText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editProfileBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
    paddingVertical: 10,
  },
  avatarPreviewBox: {
    width: 76,
    height: 76,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarPreviewImage: {
    width: '100%',
    height: '100%',
  },
  avatarUploadOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    height: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditInfoCol: {
    flex: 1,
    gap: 8,
  },
  photoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  photoUploadBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  photoHelpText: {
    fontSize: 12,
  },
  shapeSwitchSubBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  shapeSwitchSubText: {
    fontSize: 11,
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  heroIdentity: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fullName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  verifiedTag: {
    backgroundColor: 'rgba(39, 166, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(39, 166, 68, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedTagText: {
    color: '#27a644',
    fontSize: 10,
    fontWeight: '700',
  },
  semiVerifiedTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  semiVerifiedTagText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
  },
  inviteVerifiedTag: {
    backgroundColor: 'rgba(94, 106, 210, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inviteVerifiedTagText: {
    color: '#828fff',
    fontSize: 10,
    fontWeight: '700',
  },
  unverifiedTag: {
    backgroundColor: 'rgba(138, 143, 152, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(138, 143, 152, 0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unverifiedTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  semiVerifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    gap: 10,
  },
  semiVerifiedBannerTitle: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '700',
  },
  inviteUpgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(94, 106, 210, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    gap: 10,
  },
  inviteUpgradeBannerTitle: {
    color: '#828fff',
    fontSize: 13,
    fontWeight: '700',
  },
  verifyUpgradeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyUpgradeBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  semiVerifiedBannerSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  inlineNoticeBanner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCodeValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  inviteCodeBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  inviteCodeMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  copyCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  copyCodeBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  handleText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  emailText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  bioContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  bioText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  switchButtonIcon: {
    fontSize: 16,
  },
  switchButtonText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyPostsBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyPostsTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyPostsSub: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
    maxWidth: '55%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  privacyFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  privacyIcon: {
    fontSize: 22,
  },
  privacyCol: {
    flex: 1,
  },
  privacyHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  privacySub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeActiveText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
  },
  switcherHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switcherCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  switcherDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 17,
  },
  demoGrid: {
    gap: 10,
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 12,
  },
  demoCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  demoAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  demoAvatarLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  activeCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  demoInfoCol: {
    flex: 1,
  },
  demoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  demoNameActive: {
    color: '#818cf8',
  },
  currentPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  currentPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  demoMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  demoBio: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  demoCallActions: {
    flexDirection: 'row',
    gap: 6,
  },
  quickCallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCallIcon: {
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  closeBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 460,
  },
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: 12,
  },
  modalUserRowCurrent: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  modalAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalUserCol: {
    flex: 1,
  },
  modalUserName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalUserSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  modalUserBio: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCheckmark: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10b981',
  },
  modalSwitchArrow: {
    fontSize: 14,
    color: colors.textMuted,
  },

  // Settings Modal Styles
  settingsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  settingsNavRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  settingsNavTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  settingsNavTabActive: {
    backgroundColor: colors.primary,
  },
  settingsNavText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsNavTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  settingsContentScroll: {
    maxHeight: 520,
  },
  settingsSectionBody: {
    paddingBottom: 24,
  },
  inputGroupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  settingsInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 10,
  },
  bioInputArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  genderOption: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  genderOptionActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: colors.primary,
  },
  genderOptionText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  genderOptionTextActive: {
    color: '#818cf8',
    fontWeight: '800',
  },
  saveChangesBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveChangesText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 20,
  },
  subtext: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 10,
  },
  secondaryActionBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryActionText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '700',
  },
  resetOtpBlock: {
    marginTop: 10,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  themeOptionCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  themeOptionCardActive: {
    borderWidth: 1.5,
  },
  themeOptionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  themeOptionDesc: {
    fontSize: 10,
    fontWeight: '500',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  prefTextCol: {
    flex: 1,
  },
  prefHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  prefSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  dangerLogoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  dangerLogoutText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
  },
  auditIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  auditIconText: {
    color: colors.primaryHover,
    fontSize: 12,
    fontWeight: '600',
  },
  heroLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  heroLogoutText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  heroDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  heroDeleteText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  dangerDeleteAccountBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  dangerDeleteAccountText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '800',
  },
  auditHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  auditHeaderSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  refreshAuditBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  refreshAuditText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  auditMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  auditMetricBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  auditMetricNum: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  auditMetricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  batchDropCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
  },
  batchDropTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  batchCollegeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  batchCollegePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  batchInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  auditCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 14,
  },
  auditCardPending: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.04)',
  },
  auditCardFlagged: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  },
  auditCardTop: {
    flexDirection: 'row',
    gap: 12,
  },
  auditAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  auditName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  auditMethodPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pillPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  pillOcr: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  pillEmail: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  auditMethodText: {
    color: '#a5b4fc',
    fontSize: 9,
    fontWeight: '800',
  },
  auditIdImageWrap: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 4,
  },
  auditIdImage: {
    width: '100%',
    height: 140,
    borderRadius: 6,
  },
  auditMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 3,
  },
  auditAcademicText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  auditRollText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 3,
  },
  auditFlagBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    gap: 6,
  },
  auditFlagIcon: {
    fontSize: 14,
  },
  auditFlagReason: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  auditActionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  auditApproveBtn: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  auditApproveText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
  },
  auditFlagBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  auditFlagText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  // Avatar Shape & Hub Styles
  shapeBadgePill: {
    position: 'absolute',
    top: -4,
    right: -4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  shapeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  avatarShapeTogglePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  avatarShapeToggleText: {
    fontSize: 11,
  },
  hubDescText: {
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 17,
  },
  hubGrid: {
    gap: 10,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  hubIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hubCardTextCol: {
    flex: 1,
  },
  hubCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  hubCardSubtitle: {
    fontSize: 11,
  },
  quietBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  quietBadgeText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '800',
  },
  customModalSheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  customModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  customModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  customCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  modalCenterBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCenterText: {
    marginTop: 10,
    fontSize: 13,
  },
  modalEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalEmptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  customModalScroll: {
    marginTop: 14,
  },
  savedCardBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  savedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  savedAuthorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  savedPostTime: {
    fontSize: 11,
  },
  unsaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unsaveBtnText: {
    color: '#eab308',
    fontSize: 11,
    fontWeight: '700',
  },
  savedContentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  savedMediaIndicator: {
    marginTop: 8,
  },
  blockedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  blockedAvatarBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedAvatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  blockedUserName: {
    fontSize: 14,
    fontWeight: '700',
  },
  blockedUserHandle: {
    fontSize: 12,
    fontWeight: '600',
  },
  blockedUserCollege: {
    fontSize: 11,
    marginTop: 2,
  },
  unblockActionBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  unblockActionText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  credentialHeroCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  credentialStatusTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  credentialStatusSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  infoCardWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  infoModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoModalLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoModalVal: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '55%',
    textAlign: 'right',
  },
  infoModalDivider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },
  prefBlock: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  prefBlockTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  prefBlockSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  shapePrefRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  shapePrefCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  shapePrefCardActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  shapePreviewBox: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  shapePreviewLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  shapePrefLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  shapePrefDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  msgPrefOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  msgPrefOptionActive: {
    borderColor: colors.primary,
  },
  msgPrefLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  msgPrefSub: {
    fontSize: 11,
    marginTop: 2,
  },
  notifSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  notifSubLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  notifSubDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});
