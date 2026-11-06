import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { profileService } from '../services/profileService';
import { authService, User } from '../services/authService';
import { ShieldCheck, AlertCircle, Sparkles, Lock, Check } from 'lucide-react-native';

interface ProfileSetupScreenProps {
  currentUser: User;
  onProfileComplete: () => void;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({ currentUser, onProfileComplete }) => {
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form State
  const [fullName, setFullName] = useState(currentUser.full_name || '');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [showGender, setShowGender] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phone_number || '');
  const [bio, setBio] = useState('Excited for campus tech clubs, hackathons & fests!');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [collegeName, setCollegeName] = useState('Graphic Era University');
  const [courseName, setCourseName] = useState('B.Tech');
  const [branchName, setBranchName] = useState('Computer Science & Engineering');
  const [verificationTier, setVerificationTier] = useState<string>(currentUser.verification_tier || 'FULLY_VERIFIED');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExistingData();
  }, []);

  const loadExistingData = async () => {
    try {
      const data = await profileService.getMyProfile().catch(() => null);
      if (data) {
        if (data.full_name) setFullName(data.full_name);
        if (data.username) setUsername(data.username);
        if (data.admission_number) setAdmissionNumber(data.admission_number);
        if (data.college_name) setCollegeName(data.college_name);
        if (data.course_name) setCourseName(data.course_name);
        if (data.branch_name) setBranchName(data.branch_name);
        if (data.gender) setGender(data.gender);
        if (typeof data.show_gender === 'boolean') setShowGender(data.show_gender);
        if (data.verification_tier) setVerificationTier(data.verification_tier);
        if (data.bio) setBio(data.bio);
      } else {
        const emailPrefix = currentUser.email.split('@')[0];
        setAdmissionNumber(emailPrefix);
        setUsername(`student_${emailPrefix}`);
      }
    } catch (e) {
      console.log('Error loading initial profile', e);
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleFinishSetup = async () => {
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanUser || cleanUser.length < 3) {
      Alert.alert('Invalid Handle', 'Please choose a nickname/handle with at least 3 letters, numbers, or underscores.');
      return;
    }

    setSaving(true);
    try {
      const res = await profileService.completeProfile({
        full_name: fullName.trim() || currentUser.full_name,
        username: cleanUser,
        gender,
        show_gender: showGender,
        phone_number: phoneNumber.trim() || undefined,
        bio: bio.trim(),
      });

      if (res.user) {
        await authService.updateCurrentUser(res.user);
      } else {
        await authService.updateCurrentUser({ profile_completed: true });
      }

      const joinedList = res.communities_joined?.length
        ? res.communities_joined.map((c: string) => `• ${c}`).join('\n')
        : `• ${collegeName}\n• ${courseName} (${branchName})`;

      if (Platform.OS === 'web') {
        window.alert(`Welcome, @${cleanUser}! 🎉\n\nYour campus profile is active. You have joined:\n${joinedList}`);
      } else {
        Alert.alert(
          'Campus Identity Claimed! 🎉',
          `Welcome, @${cleanUser}!\n\nYour profile is verified and active. You have been auto-enrolled in:\n${joinedList}`
        );
      }
      onProfileComplete();
    } catch (e: any) {
      const err =
        e.response?.data?.username?.[0] ||
        e.response?.data?.error ||
        e.message ||
        'Failed to save campus profile.';
      Alert.alert('Setup Failed', err);
    } finally {
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Verifying University Credentials...</Text>
      </View>
    );
  }

  const isGreenVerified = verificationTier === 'FULLY_VERIFIED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Text style={styles.logoIcon}>🎓</Text>
          <Text style={styles.appTitle}>Campus Connect</Text>
        </View>
        <Text style={styles.title}>Claim Your Campus Identity</Text>
        <Text style={styles.subtitle}>
          Your academic identity has been verified. Pick your public nickname and preferences before entering the campus feed.
        </Text>
      </View>

      {/* VERIFICATION TIER STATUS BANNER */}
      {isGreenVerified ? (
        <View style={styles.greenBanner}>
          <View style={styles.bannerIconCircleGreen}>
            <ShieldCheck size={20} color="#22c55e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.greenBannerTitle}>Official Microsoft SSO Verified 🛡️</Text>
            <Text style={styles.greenBannerSub}>
              Cryptographically certified via Graphic Era Entra ID. You will receive the Green Verified Student Badge across all channels.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.yellowBanner}>
          <View style={styles.bannerIconCircleYellow}>
            <AlertCircle size={20} color="#f59e0b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.yellowBannerTitle}>Physical ID Card Scanned (Under Review) 🟡</Text>
            <Text style={styles.yellowBannerSub}>
              Anti-fraud OCR verified. You will receive the Yellow Badge until in-person campus verification is completed.
            </Text>
          </View>
        </View>
      )}

      {/* LOCKED ACADEMIC CREDENTIALS BOX */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Lock size={15} color={colors.textMuted} />
          <Text style={styles.cardSectionTitle}>VERIFIED ACADEMIC RECORD (LOCKED)</Text>
        </View>
        <Text style={styles.cardHint}>
          Auto-linked to your institutional record. College, roll number & course cannot be modified.
        </Text>

        <View style={styles.lockedGrid}>
          <View style={styles.lockedItem}>
            <Text style={styles.lockedLabel}>University / College</Text>
            <Text style={styles.lockedValue}>{collegeName}</Text>
          </View>

          <View style={styles.lockedItem}>
            <Text style={styles.lockedLabel}>University Roll Number</Text>
            <Text style={styles.lockedValueHighlight}>{admissionNumber || 'GEU Verified'}</Text>
          </View>

          <View style={styles.lockedItem}>
            <Text style={styles.lockedLabel}>Official Name</Text>
            <Text style={styles.lockedValue}>{fullName || currentUser.email}</Text>
          </View>

          <View style={styles.lockedItem}>
            <Text style={styles.lockedLabel}>Enrolled Degree & Branch</Text>
            <Text style={styles.lockedValue}>{courseName} • {branchName}</Text>
          </View>
        </View>
      </View>

      {/* CUSTOMIZABLE CAMPUS IDENTITY BOX */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Sparkles size={15} color={colors.primary} />
          <Text style={styles.cardSectionTitle}>CHOOSE YOUR CAMPUS NICKNAME & IDENTITY</Text>
        </View>

        {/* 1. Custom Username / Handle */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Campus Handle / Nickname *</Text>
          <Text style={styles.inputSubtext}>
            Your public identity across campus feed, comments, and direct message requests.
          </Text>
          <View style={styles.usernameRow}>
            <Text style={styles.atSymbol}>@</Text>
            <TextInput
              style={styles.usernameInput}
              value={username}
              onChangeText={(txt) => setUsername(txt.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. shekhar_rana"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              maxLength={30}
            />
          </View>
        </View>

        {/* 2. Gender Selection & Hide Gender Toggle */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Gender</Text>
          <View style={styles.genderOptionsRow}>
            {(['Male', 'Female', 'Other'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.genderPill, gender === g && styles.genderPillActive]}
                onPress={() => setGender(g)}
              >
                <Text style={[styles.genderPillText, gender === g && styles.genderPillTextActive]}>
                  {g === 'Male' ? '👨 Male' : g === 'Female' ? '👩 Female' : '✨ Other'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Privacy Switch: Hide Gender on Public Profile */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.toggleTitle}>Hide Gender on Public Profile</Text>
              <Text style={styles.toggleDesc}>
                Keep gender private. It will not be shown on your profile card or to other students.
              </Text>
            </View>
            <Switch
              value={!showGender}
              onValueChange={(val) => setShowGender(!val)}
              trackColor={{ false: '#262626', true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* 3. Optional Phone Number */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Mobile Phone Number (Optional)</Text>
          <Text style={styles.inputSubtext}>
            Used for urgent campus fest alerts & WhatsApp notifications (never shared publicly).
          </Text>
          <TextInput
            style={styles.textInput}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="e.g. 9876543210"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>

        {/* 4. Campus Bio */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Campus Bio / Interests</Text>
          <TextInput
            style={[styles.textInput, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Share what you study, hobbies, or clubs you're interested in..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={300}
          />
        </View>

        {/* Finish Button */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleFinishSetup}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <View style={styles.submitBtnContent}>
              <Check size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Finish Setup & Enter Campus 🚀</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 18,
    paddingTop: 40,
    paddingBottom: 60,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  logoIcon: {
    fontSize: 24,
  },
  appTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  greenBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerIconCircleGreen: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greenBannerTitle: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '800',
  },
  greenBannerSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  yellowBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerIconCircleYellow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yellowBannerTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '800',
  },
  yellowBannerSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardSectionTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 14,
  },
  lockedGrid: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  lockedItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    paddingBottom: 8,
  },
  lockedLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  lockedValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  lockedValueHighlight: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  inputSubtext: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 15,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  atSymbol: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
    marginRight: 4,
  },
  usernameInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 12,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 13,
  },
  bioInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  genderOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  genderPill: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: colors.primary,
  },
  genderPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  genderPillTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleDesc: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
