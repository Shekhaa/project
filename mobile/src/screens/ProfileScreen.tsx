import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { authService, User, DemoUser } from '../services/authService';
import { profileService } from '../services/profileService';

interface ProfileData {
  id: number;
  username: string;
  bio: string;
  profile_picture?: string;
  gender: string;
  anonymous_enabled: boolean;
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
  onUserSwitched: (newUser: User) => void;
  onLogout: () => void;
  onStartCall?: (receiverId: number, receiverName: string, callType: 'AUDIO' | 'VIDEO') => void;
}

type SettingsSection = 'PROFILE' | 'PASSWORD' | 'PREFERENCES' | 'AUDIT';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  currentUser,
  onUserSwitched,
  onLogout,
  onStartCall,
}) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [switchingUser, setSwitchingUser] = useState<string | null>(null);
  const [switcherModalVisible, setSwitcherModalVisible] = useState(false);

  // Settings Modal State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>('PROFILE');

  // Blind-Testing 100-User Audit State
  const [auditStudents, setAuditStudents] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Edit Profile State
  const [editFullName, setEditFullName] = useState(currentUser.full_name || '');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editGender, setEditGender] = useState('Male');
  const [savingProfile, setSavingProfile] = useState(false);

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

  const loadAuditList = async () => {
    setAuditLoading(true);
    try {
      const data = await profileService.getAdminAuditStudents();
      setAuditStudents(data.students || []);
      setTotalStudentsCount(data.total_students || 0);
      setFlaggedCount(data.flagged_accounts || 0);
    } catch (e: any) {
      console.log('Error loading audit students', e);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleAuditAction = async (userId: number, action: 'APPROVE' | 'FLAG_FAKE') => {
    try {
      const reason = action === 'FLAG_FAKE' ? 'Flagged fake profile during admin campus audit' : undefined;
      await profileService.auditUserAction(userId, action, reason);
      Alert.alert(
        action === 'APPROVE' ? 'Student Approved ✅' : 'Profile Flagged ⚠️',
        action === 'APPROVE'
          ? 'Account marked as verified student.'
          : 'Account flagged as fake. Student will be restricted from posting.'
      );
      loadAuditList();
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update student status.');
    }
  };

  useEffect(() => {
    loadProfileAndDemoUsers();
  }, [currentUser.id]);

  const loadProfileAndDemoUsers = async () => {
    setLoading(true);
    try {
      const [profileData, users] = await Promise.all([
        profileService.getMyProfile().catch(() => null),
        authService.getDemoUsers().catch(() => []),
      ]);
      setProfile(profileData);
      setDemoUsers(users);

      if (profileData) {
        setEditUsername(profileData.username || '');
        setEditBio(profileData.bio || '');
        setEditGender(profileData.gender || 'Male');
      }
      setEditFullName(currentUser.full_name || '');
    } catch (e) {
      console.log('Error loading profile data', e);
    } finally {
      setLoading(false);
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
      Alert.alert(
        'Account Switched! 🚀',
        `Logged in as ${res.user.full_name || res.user.email}. All chats, posts & communities are updated.`
      );
    } catch (e: any) {
      Alert.alert('Switch Failed', e.response?.data?.error || 'Could not switch account.');
    } finally {
      setSwitchingUser(null);
    }
  };

  // Save Profile Details
  const handleSaveProfile = async () => {
    if (!editUsername.trim()) {
      Alert.alert('Error', 'Username cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await profileService.updateProfile({
        full_name: editFullName.trim(),
        username: editUsername.trim(),
        bio: editBio.trim(),
        gender: editGender,
      });
      setProfile((prev) => (prev ? { ...prev, ...res.profile } : null));
      if (editFullName.trim() !== currentUser.full_name) {
        onUserSwitched({ ...currentUser, full_name: editFullName.trim() });
      }
      Alert.alert('Success ✅', 'Your campus profile details have been updated!');
    } catch (e: any) {
      Alert.alert('Update Failed', e.response?.data?.error || 'Could not save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await authService.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password Updated! 🔒', 'Your account password has been changed successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // Send Reset Password OTP
  const handleSendResetOtp = async () => {
    if (!resetEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid college email.');
      return;
    }

    setSendingResetOtp(true);
    try {
      const res = await authService.forgotPassword(resetEmail.trim());
      setResetOtpSent(true);
      Alert.alert(
        'Code Sent! 📬',
        `A 6-digit password reset code was sent to ${resetEmail}.\n${
          res.dev_otp ? `(Dev Code: ${res.dev_otp})` : ''
        }`
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to send reset code.');
    } finally {
      setSendingResetOtp(false);
    }
  };

  // Reset Password with OTP
  const handleResetPassword = async () => {
    if (!resetOtp || resetOtp.length < 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP code.');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }

    setResettingPassword(true);
    try {
      await authService.resetPassword(resetEmail.trim(), resetOtp.trim(), resetNewPassword.trim());
      setResetOtp('');
      setResetNewPassword('');
      setResetOtpSent(false);
      Alert.alert('Password Reset! 🎉', 'You can now use your new password to sign in.');
    } catch (e: any) {
      Alert.alert('Reset Failed', e.response?.data?.error || 'Invalid or expired code.');
    } finally {
      setResettingPassword(false);
    }
  };

  if (loading && !profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading campus profile...</Text>
      </View>
    );
  }

  const initials = (currentUser.full_name || currentUser.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Top Header Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopActions}>
          <TouchableOpacity
            style={styles.auditIconBtn}
            onPress={() => {
              setActiveSettingsSection('AUDIT');
              setSettingsModalVisible(true);
              loadAuditList();
            }}
          >
            <Text style={styles.auditIconText}>🛡️ Audit (100)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsIconBtn}
            onPress={() => setSettingsModalVisible(true)}
          >
            <Text style={styles.settingsIconText}>⚙️ Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroLogoutBtn}
            onPress={triggerLogout}
          >
            <Text style={styles.heroLogoutText}>🚪 Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
            <View style={styles.onlineBadge} />
          </View>
          <View style={styles.heroIdentity}>
            <View style={styles.nameBadgeRow}>
              <Text style={styles.fullName}>{currentUser.full_name || 'Campus Student'}</Text>
              {currentUser.verification_tier === 'SEMI_VERIFIED' || !profile?.verified ? (
                <View style={styles.semiVerifiedTag}>
                  <Text style={styles.semiVerifiedTagText}>🔴 SEMI-VERIFIED</Text>
                </View>
              ) : (
                <View style={styles.verifiedTag}>
                  <Text style={styles.verifiedTagText}>🛡️ VERIFIED STUDENT</Text>
                </View>
              )}
            </View>
            <Text style={styles.handleText}>
              @{profile?.username || currentUser.email.split('@')[0]}
            </Text>
            <Text style={styles.emailText}>{currentUser.email}</Text>
          </View>
        </View>

        {/* Semi-Verified Callout Banner */}
        {(currentUser.verification_tier === 'SEMI_VERIFIED' || !profile?.verified) && (
          <View style={styles.semiVerifiedBanner}>
            <Text style={styles.semiVerifiedBannerIcon}>🔴</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.semiVerifiedBannerTitle}>Semi-Verified Account (ID Pending)</Text>
              <Text style={styles.semiVerifiedBannerSub}>
                Phone presence verified on Graphic Era campus. Scan your physical College ID card to earn the official 🛡️ Verified Student badge.
              </Text>
            </View>
          </View>
        )}

        {profile?.bio ? (
          <View style={styles.bioContainer}>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Quick Switch Button in Hero */}
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setSwitcherModalVisible(true)}
        >
          <Text style={styles.switchButtonIcon}>🔄</Text>
          <Text style={styles.switchButtonText}>Switch Demo Account (12 Students)</Text>
        </TouchableOpacity>
      </View>

      {/* Academic Identity Details */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🏛️ Institutional Enrollment</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>College</Text>
          <Text style={styles.infoValue}>
            {profile?.college_name || 'Graphic Era University'}
          </Text>
        </View>
        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Degree / Course</Text>
          <Text style={styles.infoValue}>{profile?.course_name || 'B.Tech'}</Text>
        </View>
        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Department / Branch</Text>
          <Text style={styles.infoValue}>
            {profile?.branch_name || 'Computer Science & Engineering'}
          </Text>
        </View>
        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Academic Cohort</Text>
          <Text style={styles.infoValue}>
            {profile?.academic_year_name || 'Year 1'} • {profile?.section_name || 'Section A'}
          </Text>
        </View>
        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Roll / Admission No.</Text>
          <Text style={styles.infoValue}>
            {profile?.admission_number || 'GEU/24/CS/108'}
          </Text>
        </View>
      </View>

      {/* Privacy & Safe Campus Features */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🛡️ Privacy & Campus Shield</Text>

        <View style={styles.privacyFeatureRow}>
          <Text style={styles.privacyIcon}>🎭</Text>
          <View style={styles.privacyCol}>
            <Text style={styles.privacyHeading}>Anonymous Post Shield</Text>
            <Text style={styles.privacySub}>
              Configured with randomized animal mascots. Your identity is mathematically unlinked.
            </Text>
          </View>
          <View style={styles.badgeActive}>
            <Text style={styles.badgeActiveText}>ENABLED</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.privacyFeatureRow}>
          <Text style={styles.privacyIcon}>🔒</Text>
          <View style={styles.privacyCol}>
            <Text style={styles.privacyHeading}>End-to-End Ephemeral Hangouts</Text>
            <Text style={styles.privacySub}>
              Self-destructing temporary rooms auto-expire in 10m to 24h.
            </Text>
          </View>
          <View style={styles.badgeActive}>
            <Text style={styles.badgeActiveText}>ACTIVE</Text>
          </View>
        </View>
      </View>

      {/* Testing & Multi-User Switcher Section */}
      <View style={styles.sectionCard}>
        <View style={styles.switcherHeaderRow}>
          <Text style={styles.sectionTitle}>👥 Multi-User Testing Bench</Text>
          <Text style={styles.switcherCount}>{demoUsers.length} Students</Text>
        </View>
        <Text style={styles.switcherDescription}>
          Tap any student to instantly switch sessions and test multi-person group chats, direct messaging, posts, and audio/video calling.
        </Text>

        <View style={styles.demoGrid}>
          {demoUsers.map((user) => {
            const isCurrent = user.email.toLowerCase() === currentUser.email.toLowerCase();
            const userInitial = user.full_name[0] || 'U';
            return (
              <TouchableOpacity
                key={user.id}
                style={[styles.demoCard, isCurrent && styles.demoCardActive]}
                onPress={() => handleSwitchAccount(user.email)}
                disabled={switchingUser !== null}
              >
                <View style={styles.demoAvatarCircle}>
                  <Text style={styles.demoAvatarLetter}>{userInitial}</Text>
                  {isCurrent && <View style={styles.activeCheck} />}
                </View>
                <View style={styles.demoInfoCol}>
                  <View style={styles.demoNameRow}>
                    <Text style={[styles.demoName, isCurrent && styles.demoNameActive]}>
                      {user.full_name}
                    </Text>
                    {isCurrent && (
                      <View style={styles.currentPill}>
                        <Text style={styles.currentPillText}>YOU</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.demoMeta}>
                    {user.course} {user.branch ? `• ${user.branch}` : ''}
                  </Text>
                  <Text style={styles.demoBio} numberOfLines={1}>
                    {user.bio}
                  </Text>
                </View>

                {/* Quick Call Action Button for other users */}
                {!isCurrent && onStartCall && (
                  <View style={styles.demoCallActions}>
                    <TouchableOpacity
                      style={styles.quickCallBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        onStartCall(user.id, user.full_name, 'AUDIO');
                      }}
                    >
                      <Text style={styles.quickCallIcon}>📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickCallBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        onStartCall(user.id, user.full_name, 'VIDEO');
                      }}
                    >
                      <Text style={styles.quickCallIcon}>📹</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Logout Action */}
      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutButtonText}>Log Out from Device</Text>
      </TouchableOpacity>

      {/* ⚙️ Comprehensive Campus Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.settingsSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>⚙️ Campus Settings</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSettingsModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Navigation Tabs inside Settings */}
            <View style={styles.settingsNavRow}>
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
                    activeSettingsSection === 'PREFERENCES' && styles.settingsNavTextActive,
                  ]}
                >
                  🛡️ Safety
                </Text>
              </TouchableOpacity>

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
                    activeSettingsSection === 'AUDIT' && styles.settingsNavTextActive,
                  ]}
                >
                  📋 Audit (100)
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.settingsContentScroll} keyboardShouldPersistTaps="handled">
              {/* SECTION 1: EDIT PROFILE DETAILS */}
              {activeSettingsSection === 'PROFILE' && (
                <View style={styles.settingsSectionBody}>
                  <Text style={styles.inputGroupTitle}>Public Student Details</Text>

                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={editFullName}
                    onChangeText={setEditFullName}
                    placeholder="Your legal name"
                    placeholderTextColor={colors.textMuted}
                  />

                  <Text style={styles.fieldLabel}>Campus Handle (@username)</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={editUsername}
                    onChangeText={setEditUsername}
                    placeholder="e.g. rahul_cse"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />

                  <Text style={styles.fieldLabel}>Bio</Text>
                  <TextInput
                    style={[styles.settingsInput, styles.bioInputArea]}
                    value={editBio}
                    onChangeText={setEditBio}
                    placeholder="Tell your college batch about yourself..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />

                  <Text style={styles.fieldLabel}>Gender</Text>
                  <View style={styles.genderRow}>
                    {['Male', 'Female', 'Other'].map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.genderOption,
                          editGender === g && styles.genderOptionActive,
                        ]}
                        onPress={() => setEditGender(g)}
                      >
                        <Text
                          style={[
                            styles.genderOptionText,
                            editGender === g && styles.genderOptionTextActive,
                          ]}
                        >
                          {g}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.saveChangesBtn}
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
                  <Text style={styles.inputGroupTitle}>Change Password</Text>

                  <Text style={styles.fieldLabel}>Current Password</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={oldPassword}
                    onChangeText={setOldPassword}
                    placeholder="Enter current password (if set)"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />

                  <Text style={styles.fieldLabel}>New Password (min 6 characters)</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new strong password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />

                  <Text style={styles.fieldLabel}>Confirm New Password</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                  />

                  <TouchableOpacity
                    style={styles.saveChangesBtn}
                    onPress={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveChangesText}>Update Password</Text>
                    )}
                  </TouchableOpacity>

                  <View style={styles.settingsDivider} />

                  {/* Forgot / Reset Password with Email OTP */}
                  <Text style={styles.inputGroupTitle}>Forgot Password? (OTP Reset)</Text>
                  <Text style={styles.subtext}>
                    Receive a 6-digit reset code on your college email address.
                  </Text>

                  <Text style={styles.fieldLabel}>College Email</Text>
                  <TextInput
                    style={styles.settingsInput}
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
                        <ActivityIndicator color="#818cf8" />
                      ) : (
                        <Text style={styles.secondaryActionText}>Send Reset Code to Email</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.resetOtpBlock}>
                      <Text style={styles.fieldLabel}>6-Digit Reset Code</Text>
                      <TextInput
                        style={styles.settingsInput}
                        value={resetOtp}
                        onChangeText={setResetOtp}
                        placeholder="123456"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={6}
                      />

                      <Text style={styles.fieldLabel}>New Password</Text>
                      <TextInput
                        style={styles.settingsInput}
                        value={resetNewPassword}
                        onChangeText={setResetNewPassword}
                        placeholder="Enter new password"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry
                      />

                      <TouchableOpacity
                        style={styles.saveChangesBtn}
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
                  <Text style={styles.inputGroupTitle}>Campus Privacy Shield</Text>

                  <View style={styles.prefRow}>
                    <View style={styles.prefTextCol}>
                      <Text style={styles.prefHeading}>Anonymous Mode</Text>
                      <Text style={styles.prefSub}>
                        Allows posting with mascot pseudonyms without exposing your college handle.
                      </Text>
                    </View>
                    <View style={styles.badgeActive}>
                      <Text style={styles.badgeActiveText}>ACTIVE</Text>
                    </View>
                  </View>

                  <View style={styles.settingsDivider} />

                  <View style={styles.prefRow}>
                    <View style={styles.prefTextCol}>
                      <Text style={styles.prefHeading}>Push Notifications</Text>
                      <Text style={styles.prefSub}>
                        Alerts for community mentions, incoming calls, and DMs.
                      </Text>
                    </View>
                    <View style={styles.badgeActive}>
                      <Text style={styles.badgeActiveText}>ENABLED</Text>
                    </View>
                  </View>

                  <View style={styles.settingsDivider} />

                  <TouchableOpacity style={styles.dangerLogoutBtn} onPress={onLogout}>
                    <Text style={styles.dangerLogoutText}>Sign Out from this Device</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* SECTION 4: 100-USER BLIND TEST AUDIT QUEUE */}
              {activeSettingsSection === 'AUDIT' && (
                <View style={styles.settingsSectionBody}>
                  <View style={styles.auditHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputGroupTitle}>Campus 100-User Audit Shield</Text>
                      <Text style={styles.auditHeaderSub}>
                        Track verified ID cards and eliminate fake accounts during blind testing.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.refreshAuditBtn}
                      onPress={loadAuditList}
                      disabled={auditLoading}
                    >
                      <Text style={styles.refreshAuditText}>🔄 Refresh</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Metrics Bar */}
                  <View style={styles.auditMetricsRow}>
                    <View style={styles.auditMetricBox}>
                      <Text style={styles.auditMetricNum}>{totalStudentsCount}</Text>
                      <Text style={styles.auditMetricLabel}>STUDENTS</Text>
                    </View>
                    <View style={styles.auditMetricBox}>
                      <Text style={[styles.auditMetricNum, { color: '#34d399' }]}>
                        {totalStudentsCount - flaggedCount}
                      </Text>
                      <Text style={styles.auditMetricLabel}>VERIFIED</Text>
                    </View>
                    <View style={styles.auditMetricBox}>
                      <Text style={[styles.auditMetricNum, { color: '#ef4444' }]}>
                        {flaggedCount}
                      </Text>
                      <Text style={styles.auditMetricLabel}>FLAGGED FAKE</Text>
                    </View>
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
                            s.is_flagged_fake && styles.auditCardFlagged,
                          ]}
                        >
                          <View style={styles.auditCardTop}>
                            <View style={styles.auditAvatar}>
                              <Text style={styles.auditAvatarText}>
                                {s.username ? s.username[0].toUpperCase() : 'U'}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.auditName}>@{s.username}</Text>
                                <View
                                  style={[
                                    styles.auditMethodPill,
                                    s.verification_method === 'ID_CARD_OCR'
                                      ? styles.pillOcr
                                      : styles.pillEmail,
                                  ]}
                                >
                                  <Text style={styles.auditMethodText}>
                                    {s.verification_method === 'ID_CARD_OCR' ? '📷 ID CARD OCR' : s.verification_method}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.auditMetaText}>
                                📱 {s.phone_number} • ✉️ {s.email}
                              </Text>
                              <Text style={styles.auditAcademicText}>
                                🏛️ {s.college_name} • {s.course_name} ({s.branch_name})
                              </Text>
                              <Text style={styles.auditRollText}>
                                🔒 Roll Number: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{s.admission_number || 'Pending'}</Text>
                              </Text>
                            </View>
                          </View>

                          {s.is_flagged_fake && (
                            <View style={styles.auditFlagBox}>
                              <Text style={styles.auditFlagIcon}>⚠️</Text>
                              <Text style={styles.auditFlagReason}>
                                {s.flag_reason || 'Flagged fake profile during campus testing audit'}
                              </Text>
                            </View>
                          )}

                          <View style={styles.auditActionsRow}>
                            {s.is_flagged_fake ? (
                              <TouchableOpacity
                                style={styles.auditApproveBtn}
                                onPress={() => handleAuditAction(s.user_id, 'APPROVE')}
                              >
                                <Text style={styles.auditApproveText}>✅ Approve Student</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.auditFlagBtn}
                                onPress={() => handleAuditAction(s.user_id, 'FLAG_FAKE')}
                              >
                                <Text style={styles.auditFlagText}>🚫 Flag Fake Account</Text>
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

      {/* Full Screen Modal Switcher */}
      <Modal
        visible={switcherModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSwitcherModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Switch Campus Account</Text>
                <Text style={styles.modalSubtitle}>Select any student to test interactions</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSwitcherModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {demoUsers.map((user) => {
                const isCurrent = user.email.toLowerCase() === currentUser.email.toLowerCase();
                return (
                  <TouchableOpacity
                    key={user.id}
                    style={[styles.modalUserRow, isCurrent && styles.modalUserRowCurrent]}
                    onPress={() => handleSwitchAccount(user.email)}
                    disabled={switchingUser !== null}
                  >
                    <View style={styles.modalAvatarCircle}>
                      <Text style={styles.modalAvatarInitial}>{user.full_name[0]}</Text>
                    </View>
                    <View style={styles.modalUserCol}>
                      <Text style={styles.modalUserName}>
                        {user.full_name} {isCurrent ? ' (Active)' : ''}
                      </Text>
                      <Text style={styles.modalUserSub}>
                        {user.course} • {user.branch || 'General'} • @{user.username}
                      </Text>
                      <Text style={styles.modalUserBio} numberOfLines={1}>
                        {user.bio}
                      </Text>
                    </View>
                    {isCurrent ? (
                      <Text style={styles.modalCheckmark}>✓</Text>
                    ) : (
                      <Text style={styles.modalSwitchArrow}>➔</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
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
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  settingsIconBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  settingsIconText: {
    color: colors.textSecondary,
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
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  verifiedTagText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
  },
  semiVerifiedTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  semiVerifiedTagText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
  },
  semiVerifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    gap: 10,
  },
  semiVerifiedBannerIcon: {
    fontSize: 22,
  },
  semiVerifiedBannerTitle: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '800',
  },
  semiVerifiedBannerSub: {
    color: '#fca5a5',
    fontSize: 11,
    marginTop: 2,
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
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 8,
  },
  auditIconText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '700',
  },
  heroLogoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginLeft: 8,
  },
  heroLogoutText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
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
  auditCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    padding: 14,
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
});
