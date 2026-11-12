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
  Modal,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { profileService } from '../services/profileService';
import {
  authService,
  buildMicrosoftAuthUrl,
  setMsOAuthMode,
  User,
} from '../services/authService';
import {
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Lock,
  Check,
  ArrowLeft,
  Sun,
  Moon,
  ChevronDown,
  Search,
  X,
  GraduationCap,
  Eye,
  EyeOff,
  KeyRound,
  Ticket,
  Link2,
  Building2,
} from 'lucide-react-native';

interface ProfileSetupScreenProps {
  currentUser: User;
  onProfileComplete: (user?: User) => void;
  onBack?: () => void;
  onUserUpdated?: (user: User) => void;
}

const AVAILABLE_COURSES = [
  {
    name: 'B.Tech',
    duration: '4 Years',
    branches: [
      'Computer Science & Engineering',
      'AI & Machine Learning',
      'Data Science',
      'Information Technology',
      'Electronics & Communication',
      'Mechanical Engineering',
      'Civil Engineering',
      'Aerospace Engineering',
    ],
  },
  {
    name: 'BCA',
    duration: '3 Years',
    branches: ['BCA Core', 'Cloud & Cyber Security', 'AI & Data Science'],
  },
  {
    name: 'B.Com (Hons)',
    duration: '3 Years',
    branches: ['Accounting & Finance', 'Banking & Insurance', 'Financial Markets'],
  },
  {
    name: 'B.Com',
    duration: '3 Years',
    branches: ['General Commerce', 'Corporate Accounting'],
  },
  {
    name: 'BBA',
    duration: '3 Years',
    branches: [
      'BBA Core & Finance',
      'Digital Marketing & Media',
      'Human Resource Management',
      'International Business',
    ],
  },
  {
    name: 'BA (Hons) English',
    duration: '3 Years',
    branches: ['English Literature & Language'],
  },
  {
    name: 'BA (Hons) Economics',
    duration: '3 Years',
    branches: ['Applied Economics & Econometrics'],
  },
  {
    name: 'BA (Hons) Psychology',
    duration: '3 Years',
    branches: ['Clinical & Applied Psychology'],
  },
  {
    name: 'BA (General)',
    duration: '3 Years',
    branches: ['Humanities & Social Sciences'],
  },
  {
    name: 'B.Sc. Computer Science',
    duration: '3 Years',
    branches: ['Computing & Analytics'],
  },
  {
    name: 'B.Sc. Information Technology',
    duration: '3 Years',
    branches: ['IT Infrastructure & Networks'],
  },
  {
    name: 'B.Sc. Biotechnology',
    duration: '3 Years',
    branches: ['Applied Biotechnology & Genetics'],
  },
  {
    name: 'B.Sc. Agriculture',
    duration: '4 Years',
    branches: ['Agronomy & Soil Science'],
  },
  {
    name: 'B.Sc. Nursing',
    duration: '4 Years',
    branches: ['Clinical Nursing'],
  },
  {
    name: 'B.Pharma',
    duration: '4 Years',
    branches: ['Pharmaceutical Sciences'],
  },
  {
    name: 'D.Pharma',
    duration: '2 Years',
    branches: ['Pharmacy Practice'],
  },
  {
    name: 'MBA',
    duration: '2 Years',
    branches: ['Business Analytics', 'Finance', 'Marketing', 'HR Management'],
  },
  {
    name: 'MCA',
    duration: '2 Years',
    branches: ['Full-Stack Development', 'Cloud & DevOps', 'AI/ML Applications'],
  },
  {
    name: 'M.Tech',
    duration: '2 Years',
    branches: ['Computer Science', 'VLSI Design', 'Structural Engineering'],
  },
  {
    name: 'M.Sc.',
    duration: '2 Years',
    branches: ['Information Technology', 'Biotechnology', 'Physics', 'Mathematics'],
  },
  {
    name: 'BHM (Hotel Management)',
    duration: '4 Years',
    branches: ['Hospitality & Culinary Arts', 'Hotel Operations'],
  },
];

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  currentUser,
  onProfileComplete,
  onBack,
  onUserUpdated,
}) => {
  const { colors, isDark, toggleTheme } = useTheme();
  const [loadingInitial, setLoadingInitial] = useState(true);

  const isInstitutionalEmail = /\.(ac|edu)\.in$/i.test(currentUser.email || '');

  // Form State
  const [fullName, setFullName] = useState(currentUser.full_name || '');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [showGender, setShowGender] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phone_number || '');
  const [bio, setBio] = useState('Excited for campus tech clubs, hackathons & fests!');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [colleges, setColleges] = useState<Array<{ id: number; name: string; short_name: string }>>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<number | undefined>(undefined);
  const [collegeName, setCollegeName] = useState('Graphic Era University');
  const [courseName, setCourseName] = useState('B.Tech');
  const [branchName, setBranchName] = useState('Computer Science & Engineering');
  const [verificationTier, setVerificationTier] = useState<string>(
    currentUser.verification_tier || 'UNVERIFIED'
  );

  // Campus Verification Upgrade inside Onboarding
  const [inviteCode, setInviteCode] = useState('');
  const [showMsLinkToken, setShowMsLinkToken] = useState(false);
  const [msLinkToken, setMsLinkToken] = useState('');
  const [linkingMs, setLinkingMs] = useState(false);

  // Course & Branch Selector Modals
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');

  // Account Password (for future logins)
  const [accountPassword, setAccountPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  useEffect(() => {
    loadExistingData();
  }, []);

  const loadExistingData = async () => {
    const shouldFetchProfile = Boolean(
      currentUser.profile_completed || currentUser.verification_method
    );
    try {
      const [profileRes, collegesRes] = await Promise.allSettled([
        shouldFetchProfile ? profileService.getMyProfile() : Promise.resolve(null),
        profileService.getColleges(),
      ]);

      const collegesList =
        collegesRes.status === 'fulfilled' && Array.isArray(collegesRes.value)
          ? collegesRes.value
          : [];
      setColleges(collegesList);

      const data = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const emailPrefix = (currentUser.email || '').split('@')[0];
      const safeUserPrefix = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || 'campus_student';

      const defaultCollege =
        collegesList.find(
          (c) => c.short_name === 'GEU' || c.name === 'Graphic Era University'
        ) || collegesList[0];

      if (data) {
        if (data.full_name) setFullName(data.full_name);
        if (data.username) {
          setUsername(data.username);
        } else {
          setUsername(`student_${safeUserPrefix}`);
        }
        if (data.admission_number) {
          setAdmissionNumber(data.admission_number);
        } else if (isInstitutionalEmail && emailPrefix) {
          setAdmissionNumber(emailPrefix);
        }
        if (data.college_name) setCollegeName(data.college_name);
        if (data.college) {
          setSelectedCollegeId(Number(data.college));
        } else if (data.college_name && collegesList.length > 0) {
          const matched = collegesList.find((c) => c.name === data.college_name);
          if (matched) setSelectedCollegeId(matched.id);
        } else if (defaultCollege) {
          setSelectedCollegeId(defaultCollege.id);
          setCollegeName(defaultCollege.name);
        }
        if (data.course_name) setCourseName(data.course_name);
        if (data.branch_name) setBranchName(data.branch_name);
        if (data.gender) setGender(data.gender);
        if (typeof data.show_gender === 'boolean') setShowGender(data.show_gender);
        if (data.verification_tier) setVerificationTier(data.verification_tier);
        if (data.bio) setBio(data.bio);
      } else {
        if (isInstitutionalEmail && emailPrefix) {
          setAdmissionNumber(emailPrefix);
        }
        setUsername(`student_${safeUserPrefix}`);
        if (defaultCollege) {
          setSelectedCollegeId(defaultCollege.id);
          setCollegeName(defaultCollege.name);
        }
      }
    } catch (e) {
      console.log('Error loading initial profile', e);
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleSelectCourse = (selectedCourse: (typeof AVAILABLE_COURSES)[0]) => {
    setCourseName(selectedCourse.name);
    if (selectedCourse.branches.length > 0) {
      setBranchName(selectedCourse.branches[0]);
    }
    setCourseModalVisible(false);
    setCourseSearch('');
  };

  const handleLinkMsBrowser = async () => {
    setErrorMsg(null);
    await setMsOAuthMode('link');
    const url = buildMicrosoftAuthUrl();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = url;
    } else {
      const { Linking } = require('react-native');
      await Linking.openURL(url);
      setShowMsLinkToken(true);
    }
  };

  const handleLinkMsToken = async () => {
    const clean = msLinkToken.trim();
    if (!clean) {
      setErrorMsg('Paste your Microsoft College ID token first.');
      return;
    }
    setLinkingMs(true);
    setErrorMsg(null);
    try {
      const res = await authService.linkWithMicrosoft(clean);
      setVerificationTier(res.user.verification_tier || 'FULLY_VERIFIED');
      if (res.detected_student?.college_name) {
        setCollegeName(res.detected_student.college_name);
      }
      if (res.detected_student?.roll_number) {
        setAdmissionNumber(res.detected_student.roll_number);
      }
      setShowMsLinkToken(false);
      setMsLinkToken('');
      setNoticeMsg(res.message || 'Microsoft College ID linked! You now have the Green Verified Badge.');
      onUserUpdated?.(res.user);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.detail ||
        e?.message ||
        'Could not link Microsoft College ID.';
      setErrorMsg(String(msg));
    } finally {
      setLinkingMs(false);
    }
  };

  const currentCourseObj = AVAILABLE_COURSES.find((c) => c.name === courseName) || AVAILABLE_COURSES[0];

  const handleFinishSetup = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanUser || cleanUser.length < 3) {
      const msg = 'Please choose a nickname/handle with at least 3 letters, numbers, or underscores.';
      setErrorMsg(msg);
      if (Platform.OS !== 'web') Alert.alert('Invalid Handle', msg);
      return;
    }

    if (accountPassword.trim()) {
      if (accountPassword.trim().length < 6) {
        const msg = 'Please choose a password with at least 6 characters.';
        setErrorMsg(msg);
        if (Platform.OS !== 'web') Alert.alert('Weak Password', msg);
        return;
      }
      if (accountPassword.trim() !== confirmPassword.trim()) {
        const msg = 'The passwords you entered do not match. Please re-enter.';
        setErrorMsg(msg);
        if (Platform.OS !== 'web') Alert.alert('Password Mismatch', msg);
        return;
      }
    }

    setSaving(true);
    try {
      const cleanInvite = inviteCode.trim().toUpperCase();
      const res = await profileService.completeProfile({
        full_name: fullName.trim() || currentUser.full_name,
        username: cleanUser,
        gender,
        show_gender: showGender,
        phone_number: phoneNumber.trim() || undefined,
        college: !isGreenVerified && selectedCollegeId ? selectedCollegeId : undefined,
        admission_number: !isGreenVerified && admissionNumber.trim() ? admissionNumber.trim() : undefined,
        course_name: courseName,
        branch_name: branchName,
        bio: bio.trim(),
        password: accountPassword.trim() || undefined,
        invite_code: cleanInvite || undefined,
      });

      if (res.user) {
        await authService.updateCurrentUser(res.user);
      } else {
        await authService.updateCurrentUser({ profile_completed: true });
      }

      if (Platform.OS !== 'web') {
        const joinedList = res.communities_joined?.length
          ? res.communities_joined.map((c: string) => `• ${c}`).join('\n')
          : `• ${collegeName}\n• ${courseName} (${branchName})`;
        Alert.alert(
          'Campus Identity Claimed!',
          `Welcome, @${cleanUser}!\n\nAuto-enrolled communities:\n${joinedList}`
        );
      }
      onProfileComplete(res.user);
    } catch (e: any) {
      const err =
        e.response?.data?.invite_code?.[0] ||
        e.response?.data?.username?.[0] ||
        e.response?.data?.error ||
        e.message ||
        'Failed to save campus profile.';
      setErrorMsg(String(err));
      if (Platform.OS !== 'web') {
        Alert.alert('Setup Failed', String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading Campus Onboarding...</Text>
      </View>
    );
  }

  const isGreenVerified = verificationTier === 'FULLY_VERIFIED';
  const isInviteVerified = verificationTier === 'INVITE_VERIFIED';
  const isIdPending = verificationTier === 'SEMI_VERIFIED';

  const filteredCourses = AVAILABLE_COURSES.filter(
    (c) =>
      c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
      c.branches.some((b) => b.toLowerCase().includes(courseSearch.toLowerCase()))
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Top Bar with Back Button + Theme Toggle */}
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <ArrowLeft size={16} color={colors.textPrimary} />
            <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>Switch Account</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <TouchableOpacity
          style={[styles.themeToggleBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
          onPress={toggleTheme}
          activeOpacity={0.8}
        >
          {isDark ? <Sun size={15} color="#fbbf24" /> : <Moon size={15} color={colors.textPrimary} />}
          <Text style={[styles.themeToggleText, { color: colors.textSecondary }]}>
            {isDark ? 'Light' : 'Dark'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <GraduationCap size={26} color={colors.primary} />
          <Text style={[styles.appTitle, { color: colors.primary }]}>Campus Connect</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Claim Your Campus Identity</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Select your campus, degree course, and handle before entering the feed.
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
            <Text style={[styles.greenBannerSub, { color: isDark ? '#86efac' : '#15803d' }]}>
              Certified via Graphic Era Entra ID. You receive the Green Verified Student Badge across all campus feeds.
            </Text>
          </View>
        </View>
      ) : isInviteVerified ? (
        <View style={[styles.greenBanner, { borderColor: 'rgba(94, 106, 210, 0.45)', backgroundColor: isDark ? 'rgba(94, 106, 210, 0.14)' : 'rgba(94, 106, 210, 0.08)' }]}>
          <View style={[styles.bannerIconCircleGreen, { backgroundColor: 'rgba(94, 106, 210, 0.2)' }]}>
            <Ticket size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greenBannerTitle, { color: colors.primary }]}>Campus Invite Verified 🎓</Text>
            <Text style={[styles.greenBannerSub, { color: colors.textSecondary }]}>
              Full access unlocked! You can post, comment, and join campus discussions. Link your College ID anytime for the Green Badge.
            </Text>
          </View>
        </View>
      ) : isIdPending ? (
        <View style={styles.yellowBanner}>
          <View style={styles.bannerIconCircleYellow}>
            <AlertCircle size={20} color="#d97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.yellowBannerTitle}>Physical ID Card Pending Admin Review 🟡</Text>
            <Text style={[styles.yellowBannerSub, { color: isDark ? '#fde68a' : '#b45309' }]}>
              You can browse read-only while an admin reviews your ID card. Have a batch invite code? Enter it below to unlock posting immediately.
            </Text>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.infoBanner,
            {
              backgroundColor: isDark ? 'rgba(94, 106, 210, 0.1)' : 'rgba(94, 106, 210, 0.06)',
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={[styles.bannerIconCircleGreen, { backgroundColor: 'rgba(94, 106, 210, 0.15)' }]}>
            <Sparkles size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoBannerTitle, { color: colors.textPrimary }]}>
              Personal Email Mode (Read-Only Until Verified)
            </Text>
            <Text style={[styles.infoBannerSub, { color: colors.textSecondary }]}>
              You can browse the campus feed right after setup. Enter a Campus Invite Code below or link your `@geu.ac.in` ID to unlock posting.
            </Text>
          </View>
        </View>
      )}

      {errorMsg && (
        <View style={styles.inlineErrorBox}>
          <AlertCircle size={16} color="#ef4444" />
          <Text style={styles.inlineErrorText}>{errorMsg}</Text>
        </View>
      )}

      {noticeMsg && (
        <View style={styles.inlineNoticeBox}>
          <Check size={16} color="#22c55e" />
          <Text style={[styles.inlineNoticeText, { color: isDark ? '#86efac' : '#15803d' }]}>{noticeMsg}</Text>
        </View>
      )}

      {/* ACADEMIC RECORD BOX */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHeaderRow}>
          {isGreenVerified ? (
            <Lock size={15} color={colors.textMuted} />
          ) : (
            <Building2 size={15} color={colors.primary} />
          )}
          <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>
            {isGreenVerified ? 'VERIFIED ACADEMIC RECORD' : 'CAMPUS & ACADEMIC DETAILS'}
          </Text>
        </View>
        <Text style={[styles.cardHint, { color: colors.textMuted }]}>
          {isGreenVerified
            ? 'Auto-linked to your institutional enrollment. University and Roll Number are verified.'
            : 'Choose your campus and optionally enter your university roll number.'}
        </Text>

        {isGreenVerified ? (
          <View style={[styles.lockedGrid, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <View style={[styles.lockedItem, { borderBottomColor: colors.hairline }]}>
              <Text style={[styles.lockedLabel, { color: colors.textMuted }]}>University / College</Text>
              <Text style={[styles.lockedValue, { color: colors.textPrimary }]}>{collegeName}</Text>
            </View>

            <View style={[styles.lockedItem, { borderBottomColor: colors.hairline }]}>
              <Text style={[styles.lockedLabel, { color: colors.textMuted }]}>University Roll Number</Text>
              <Text style={[styles.lockedValueHighlight, { color: colors.primary }]}>
                {admissionNumber || 'Verified'}
              </Text>
            </View>

            <View style={[styles.lockedItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <Text style={[styles.lockedLabel, { color: colors.textMuted }]}>Official Name</Text>
              <Text style={[styles.lockedValue, { color: colors.textPrimary }]}>{fullName || currentUser.email}</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Campus Selector Pills */}
            {colleges.length > 0 && (
              <View>
                <Text style={[styles.inputLabel, { color: colors.textPrimary, marginBottom: 6 }]}>
                  Your Campus *
                </Text>
                <View style={styles.collegeChipsRow}>
                  {colleges.map((c) => {
                    const active = selectedCollegeId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.collegeChip,
                          {
                            backgroundColor: active
                              ? isDark
                                ? 'rgba(94, 106, 210, 0.22)'
                                : '#e0e7ff'
                              : colors.surfaceLight,
                            borderColor: active ? colors.primary : colors.cardBorder,
                          },
                        ]}
                        onPress={() => {
                          setSelectedCollegeId(c.id);
                          setCollegeName(c.name);
                        }}
                      >
                        <Text
                          style={[
                            styles.collegeChipText,
                            { color: active ? colors.primary : colors.textPrimary },
                          ]}
                        >
                          {c.short_name} · {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Editable Full Name */}
            <View>
              <Text style={[styles.inputLabel, { color: colors.textPrimary, marginBottom: 4 }]}>
                Full Name
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Aarav Joshi"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Optional University Roll Number */}
            <View>
              <Text style={[styles.inputLabel, { color: colors.textPrimary, marginBottom: 4 }]}>
                University Roll Number (Optional)
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                value={admissionNumber}
                onChangeText={setAdmissionNumber}
                placeholder="e.g. 2313812137 (Leave blank if unsure)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </View>
        )}

        {/* INTERACTIVE COURSE & DEGREE SELECTION */}
        <View style={{ marginTop: 16 }}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Enrolled Degree / Course *</Text>
          <Text style={[styles.inputSubtext, { color: colors.textMuted }]}>
            Select your exact degree program to join your course & department community.
          </Text>

          <TouchableOpacity
            style={[styles.selectorBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setCourseModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.selectorBtnValue, { color: colors.textPrimary }]}>{courseName}</Text>
              <Text style={[styles.selectorBtnSub, { color: colors.textMuted }]}>{currentCourseObj.duration} Program</Text>
            </View>
            <ChevronDown size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* INTERACTIVE BRANCH SELECTION */}
        <View style={{ marginTop: 14 }}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Department / Branch *</Text>
          <TouchableOpacity
            style={[styles.selectorBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={() => setBranchModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.selectorBtnValue, { color: colors.textPrimary }]}>{branchName}</Text>
            </View>
            <ChevronDown size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* CUSTOMIZABLE CAMPUS IDENTITY BOX */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHeaderRow}>
          <Sparkles size={15} color={colors.primary} />
          <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>
            CHOOSE YOUR CAMPUS NICKNAME & IDENTITY
          </Text>
        </View>

        {/* 1. Custom Username / Handle */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Campus Handle / Nickname *</Text>
          <Text style={[styles.inputSubtext, { color: colors.textMuted }]}>
            Your public handle across campus discussions, confessions, and chat.
          </Text>
          <View style={[styles.usernameRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <Text style={[styles.atSymbol, { color: colors.primary }]}>@</Text>
            <TextInput
              style={[styles.usernameInput, { color: colors.textPrimary }]}
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
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Gender</Text>
          <View style={styles.genderOptionsRow}>
            {(['Male', 'Female', 'Other'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.genderPill,
                  { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                  gender === g && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setGender(g)}
              >
                <Text
                  style={[
                    styles.genderPillText,
                    { color: colors.textSecondary },
                    gender === g && { color: '#ffffff', fontWeight: '700' },
                  ]}
                >
                  {g === 'Male' ? '👨 Male' : g === 'Female' ? '👩 Female' : '✨ Other'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Privacy Switch: Hide Gender on Public Profile */}
          <View style={[styles.toggleRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>Hide Gender on Public Profile</Text>
              <Text style={[styles.toggleDesc, { color: colors.textMuted }]}>
                Keep gender confidential. It will not appear on your profile card or badges.
              </Text>
            </View>
            <Switch
              value={!showGender}
              onValueChange={(val) => setShowGender(!val)}
              trackColor={{ false: isDark ? '#262626' : '#cbd5e1', true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* 3. Optional Phone Number */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Mobile Phone Number (Optional)</Text>
          <Text style={[styles.inputSubtext, { color: colors.textMuted }]}>
            Used for official campus notices & WhatsApp alerts (never shown publicly).
          </Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, color: colors.textPrimary }]}
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
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Campus Bio / Interests</Text>
          <TextInput
            style={[
              styles.textInput,
              styles.bioInput,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, color: colors.textPrimary },
            ]}
            value={bio}
            onChangeText={setBio}
            placeholder="Share your branch interests, tech stacks, or societies you want to join..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={300}
          />
        </View>

        {/* 5. Set Account Password (for future logins when signed out) */}
        <View style={styles.inputGroup}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <KeyRound size={15} color={colors.primary} />
            <Text style={[styles.inputLabel, { color: colors.textPrimary, marginBottom: 0 }]}>
              Create Account Password *
            </Text>
          </View>
          <Text style={[styles.inputSubtext, { color: colors.textMuted, marginTop: 4 }]}>
            Set a password to easily log in with your Username or Roll Number whenever you sign out.
          </Text>

          {/* Password Input */}
          <View style={[styles.passwordFieldRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <TextInput
              style={[styles.passwordInput, { color: colors.textPrimary }]}
              value={accountPassword}
              onChangeText={setAccountPassword}
              placeholder="Enter new password (min. 6 chars)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              {showPassword ? (
                <EyeOff size={18} color={colors.textSecondary} />
              ) : (
                <Eye size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Confirm Password Input */}
          <View style={[styles.passwordFieldRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, marginTop: 10 }]}>
            <TextInput
              style={[styles.passwordInput, { color: colors.textPrimary }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Optional Instant Campus Unlock / Microsoft Link */}
        {!isGreenVerified && (
          <View
            style={[
              styles.upgradeBox,
              {
                backgroundColor: isDark ? '#141516' : '#f8fafc',
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View style={styles.upgradeHeaderRow}>
              <Ticket size={15} color={colors.primary} />
              <Text style={[styles.upgradeTitle, { color: colors.textPrimary }]}>
                {isInviteVerified
                  ? 'Upgrade to Official Green ID Badge (Optional)'
                  : 'Unlock Campus Posting Now (Optional)'}
              </Text>
            </View>
            <Text style={[styles.upgradeSub, { color: colors.textMuted }]}>
              {isInviteVerified
                ? 'Your invite code already unlocks posting! Link your @geu.ac.in Microsoft account anytime for the Official Green Badge.'
                : 'Have a batch/classmate invite code or @geu.ac.in Microsoft ID? Enter it below—otherwise you can enter right away in Read-Only mode.'}
            </Text>

            {!isInviteVerified && (
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.cardBorder,
                    color: colors.textPrimary,
                    marginBottom: 10,
                    fontWeight: '700',
                    letterSpacing: 0.6,
                  },
                ]}
                value={inviteCode}
                onChangeText={(txt) => setInviteCode(txt.toUpperCase())}
                placeholder="Batch Invite Code e.g. GEU2026 (optional)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={24}
              />
            )}

            <TouchableOpacity
              style={[
                styles.msLinkBtn,
                {
                  backgroundColor: isDark ? 'rgba(94, 106, 210, 0.14)' : '#eef2ff',
                  borderColor: 'rgba(94, 106, 210, 0.35)',
                },
              ]}
              onPress={handleLinkMsBrowser}
              disabled={linkingMs}
              activeOpacity={0.8}
            >
              <Link2 size={14} color={colors.primary} />
              <Text style={[styles.msLinkBtnText, { color: colors.primary }]}>
                Link @geu.ac.in / @gehu.ac.in Microsoft ID
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowMsLinkToken((prev) => !prev)}
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
            >
              <Text style={[styles.msTokenToggleText, { color: colors.textSecondary }]}>
                {showMsLinkToken ? 'Hide manual token input' : 'Have a Microsoft ID token? Paste manually'}
              </Text>
            </TouchableOpacity>

            {showMsLinkToken && (
              <View style={styles.msTokenBox}>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      flex: 1,
                      backgroundColor: colors.surface,
                      borderColor: colors.cardBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  value={msLinkToken}
                  onChangeText={setMsLinkToken}
                  placeholder="Paste Microsoft id_token or access_token"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.msTokenConfirmBtn, { backgroundColor: colors.primary }]}
                  onPress={handleLinkMsToken}
                  disabled={linkingMs}
                >
                  {linkingMs ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.msTokenConfirmBtnText}>Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

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
              <Text style={styles.submitBtnText}>Finish Setup & Enter Campus Feed 🚀</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ========================================================= */}
      {/* COURSE SELECTOR MODAL                                     */}
      {/* ========================================================= */}
      <Modal visible={courseModalVisible} animationType="slide" transparent onRequestClose={() => setCourseModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>Select Degree / Course</Text>
              <TouchableOpacity onPress={() => setCourseModalVisible(false)} style={styles.modalCloseBtn}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={[styles.searchRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search B.Tech, BCA, B.Com, MBA, etc."
                placeholderTextColor={colors.textMuted}
                value={courseSearch}
                onChangeText={setCourseSearch}
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filteredCourses.map((c) => (
                <TouchableOpacity
                  key={c.name}
                  style={[
                    styles.courseOptionCard,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                    courseName === c.name && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(94, 106, 210, 0.15)' : 'rgba(94, 106, 210, 0.08)' },
                  ]}
                  onPress={() => handleSelectCourse(c)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.courseOptionName, { color: colors.textPrimary }]}>{c.name}</Text>
                    <Text style={[styles.courseOptionMeta, { color: colors.textMuted }]}>
                      {c.duration} • {c.branches.length} Specializations
                    </Text>
                  </View>
                  {courseName === c.name && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================= */}
      {/* BRANCH SELECTOR MODAL                                     */}
      {/* ========================================================= */}
      <Modal visible={branchModalVisible} animationType="slide" transparent onRequestClose={() => setBranchModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>{courseName} Specializations</Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)} style={styles.modalCloseBtn}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {currentCourseObj.branches.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[
                    styles.courseOptionCard,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
                    branchName === b && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(94, 106, 210, 0.15)' : 'rgba(94, 106, 210, 0.08)' },
                  ]}
                  onPress={() => {
                    setBranchName(b);
                    setBranchModalVisible(false);
                  }}
                >
                  <Text style={[styles.courseOptionName, { color: colors.textPrimary }]}>{b}</Text>
                  {branchName === b && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
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
  },
  content: {
    padding: 18,
    paddingTop: 24,
    paddingBottom: 60,
    maxWidth: 580,
    width: '100%',
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  themeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeToggleText: {
    fontSize: 11,
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
  appTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  greenBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
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
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  yellowBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
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
    color: '#d97706',
    fontSize: 14,
    fontWeight: '800',
  },
  yellowBannerSub: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardHint: {
    fontSize: 11.5,
    marginBottom: 14,
  },
  lockedGrid: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  lockedItem: {
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  lockedLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  lockedValue: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  lockedValueHighlight: {
    fontSize: 14,
    fontWeight: '800',
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  selectorBtnValue: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  selectorBtnSub: {
    fontSize: 11,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  inputSubtext: {
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 15,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  atSymbol: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 4,
  },
  usernameInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 12,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderPillText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  toggleDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  submitBtn: {
    backgroundColor: '#5e6ad2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#5e6ad2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
    letterSpacing: -0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  courseOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  courseOptionName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  courseOptionMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  passwordFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 12,
  },
  eyeBtn: {
    padding: 6,
  },
  infoBanner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  infoBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  infoBannerSub: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  inlineErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  inlineErrorText: {
    flex: 1,
    color: '#ef4444',
    fontSize: 12.5,
    fontWeight: '600',
  },
  inlineNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  inlineNoticeText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  collegeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  collegeChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  collegeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  upgradeBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  upgradeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  upgradeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  upgradeSub: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 10,
  },
  msLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  msLinkBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  msTokenToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  msTokenBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  msTokenConfirmBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msTokenConfirmBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
