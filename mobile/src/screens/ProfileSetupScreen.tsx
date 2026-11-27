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
import { colors } from '../theme/colors';
import { profileService } from '../services/profileService';
import {
  authService,
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
  Mail,
  Building2,
} from 'lucide-react-native';
import { CollegeCatalogItem, CollegePickerModal, getCollegeCity } from '../components/common/CollegePickerModal';

interface ProfileSetupScreenProps {
  currentUser?: User | null;
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
    name: 'GNM',
    duration: '3 Years',
    branches: ['General Nursing & Midwifery Core', 'Clinical & Critical Care'],
  },
  {
    name: 'LLB',
    duration: '3 Years',
    branches: ['General Legal Studies', 'Corporate & Commercial Law', 'Criminal & Constitutional Law'],
  },
  {
    name: 'BA LLB',
    duration: '5 Years',
    branches: ['Integrated Constitutional & Corporate Law', 'Criminal & Human Rights Law'],
  },
  {
    name: 'BBA LLB',
    duration: '5 Years',
    branches: ['Corporate Law & Governance', 'Business & Commercial Law'],
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
    branches: [
      'Pharmaceutics & Drug Delivery',
      'Pharmacology & Toxicology',
      'Pharmaceutical Chemistry',
      'Pharmacognosy & Natural Products',
      'Clinical & Hospital Pharmacy',
      'Pharmacy Practice Core',
    ],
  },
  {
    name: 'D.Pharma',
    duration: '2 Years',
    branches: [
      'Hospital & Clinical Pharmacy',
      'Community Pharmacy Practice',
      'Pharmaceutical Science & Dispensing',
      'Pharmacy Practice Core',
    ],
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
  const { colors, isDark, resolvedTheme, toggleTheme } = useTheme();
  const [loadingInitial, setLoadingInitial] = useState(true);

  const isInstitutionalEmail = /\.(ac|edu)\.in$/i.test(currentUser.email || '');

  const isPlaceholderEmail =
    !currentUser.email ||
    currentUser.email.toLowerCase().endsWith('.local') ||
    currentUser.email.toLowerCase().startsWith('student_');

  const isDummyName = (val?: string | null) => {
    const clean = (val || '').trim().toLowerCase();
    return (
      !clean ||
      clean === 'student' ||
      clean === 'student (id pending)' ||
      clean === 'campus student' ||
      clean === 'unverified' ||
      clean.startsWith('student_') ||
      clean.startsWith('id_')
    );
  };

  // Form State (empty by default so faded placeholders act as clean examples)
  const [fullName, setFullName] = useState(isDummyName(currentUser.full_name) ? '' : currentUser.full_name);
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [showGender, setShowGender] = useState(true);
  const [contactEmail, setContactEmail] = useState(isPlaceholderEmail ? '' : currentUser.email || '');
  const [emailVerified, setEmailVerified] = useState<boolean>(
    Boolean(currentUser.is_email_verified && !isPlaceholderEmail)
  );
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailDevCode, setEmailDevCode] = useState<string | null>(null);
  const [emailActionLoading, setEmailActionLoading] = useState(false);
  const [bio, setBio] = useState('');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [colleges, setColleges] = useState<CollegeCatalogItem[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<number | undefined>(undefined);
  const [collegeName, setCollegeName] = useState('Graphic Era University');
  const [courseName, setCourseName] = useState('B.Tech');
  const [branchName, setBranchName] = useState('Computer Science & Engineering');
  const [verificationTier, setVerificationTier] = useState<string>(
    currentUser.verification_tier || 'UNVERIFIED'
  );

  // Campus Invite Code (Top of Onboarding)
  const [inviteCode, setInviteCode] = useState('');

  // College, Course & Branch Selector Modals
  const [collegeModalVisible, setCollegeModalVisible] = useState(false);
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

      const defaultCollege =
        collegesList.find(
          (c) => c.short_name === 'GEU' || c.name === 'Graphic Era University'
        ) || collegesList[0];

      if (data) {
        if (data.full_name && !isDummyName(data.full_name)) {
          setFullName(data.full_name);
        }
        if (data.profile_completed && data.username && !isDummyName(data.username)) {
          setUsername(data.username);
        }
        if (data.admission_number && !String(data.admission_number).startsWith('PENDING-')) {
          setAdmissionNumber(data.admission_number);
        } else if (isInstitutionalEmail && emailPrefix && !emailPrefix.toLowerCase().startsWith('student_')) {
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
        if (data.bio && !data.bio.startsWith('Excited for campus tech clubs')) {
          setBio(data.bio);
        }
      } else {
        if (isInstitutionalEmail && emailPrefix && !emailPrefix.toLowerCase().startsWith('student_')) {
          setAdmissionNumber(emailPrefix);
        }
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

  const handleSendContactEmailOtp = async () => {
    const clean = contactEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.') || clean.endsWith('.local')) {
      setErrorMsg('Please enter a valid email address first.');
      return;
    }
    setEmailActionLoading(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    setEmailDevCode(null);
    try {
      const res = await authService.bindContactEmail('send', clean);
      setEmailOtpSent(true);
      setNoticeMsg(res.message || `6-digit code sent to ${clean}.`);
      if (res.dev_otp) setEmailDevCode(String(res.dev_otp));
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error || e?.message || 'Could not send email verification code.');
    } finally {
      setEmailActionLoading(false);
    }
  };

  const handleVerifyContactEmailOtp = async () => {
    const clean = contactEmail.trim().toLowerCase();
    const code = emailOtpCode.trim();
    if (!code || code.length < 4) {
      setErrorMsg('Enter the 6-digit verification code sent to your email.');
      return;
    }
    setEmailActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await authService.bindContactEmail('verify', clean, code);
      setEmailVerified(true);
      setEmailOtpSent(false);
      setEmailOtpCode('');
      setEmailDevCode(null);
      setNoticeMsg(res.message || 'Email verified!');
      if (res.user) onUserUpdated?.(res.user);
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error || e?.message || 'Invalid verification code.');
    } finally {
      setEmailActionLoading(false);
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
      const cleanPwd = accountPassword.trim();
      const weakList = ['12345678', '123456789', '1234567890', 'password', 'password1', 'password123', 'qwerty123', 'admin123'];
      let pwdErr: string | null = null;
      if (cleanPwd.length < 8) {
        pwdErr = 'Password must be at least 8 characters long.';
      } else if (!/[a-zA-Z]/.test(cleanPwd) || !/[0-9]/.test(cleanPwd)) {
        pwdErr = 'Password must include both letters and numbers.';
      } else if (weakList.includes(cleanPwd.toLowerCase()) || new Set(cleanPwd.toLowerCase()).size < 4) {
        pwdErr = 'Password is too weak or common. Choose a stronger mix of letters and numbers.';
      }
      if (pwdErr) {
        setErrorMsg(pwdErr);
        if (Platform.OS !== 'web') Alert.alert('Weak Password', pwdErr);
        return;
      }
      if (cleanPwd !== confirmPassword.trim()) {
        const msg = 'The passwords you entered do not match. Please re-enter.';
        setErrorMsg(msg);
        if (Platform.OS !== 'web') Alert.alert('Password Mismatch', msg);
        return;
      }
    }

    const cleanInvite = inviteCode.trim().toUpperCase();
    const cleanContactEmail = contactEmail.trim().toLowerCase();
    const emailRequired = Boolean(cleanInvite) || isIdPending || isInviteVerified || isPlaceholderEmail;
    if (emailRequired && (!cleanContactEmail || !cleanContactEmail.includes('@') || !cleanContactEmail.includes('.') || cleanContactEmail.endsWith('.local'))) {
      const msg = 'Please enter a valid contact email (mandatory for Invite Code & ID Card accounts). You can verify now or later.';
      setErrorMsg(msg);
      if (Platform.OS !== 'web') Alert.alert('Email Required', msg);
      return;
    }

    setSaving(true);
    try {
      const res = await profileService.completeProfile({
        full_name: fullName.trim() || currentUser.full_name,
        username: cleanUser,
        gender,
        show_gender: showGender,
        contact_email: cleanContactEmail || undefined,
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
          {isDark ? (
            <Sun size={15} color="#f59e0b" />
          ) : (
            <Moon size={15} color={colors.textPrimary} />
          )}
          <Text style={[styles.themeToggleText, { color: colors.textSecondary }]}>
            {isDark ? 'Light' : 'Dark'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <GraduationCap size={26} color={colors.brandAccent} />
          <Text style={[styles.appTitle, { color: colors.textPrimary }]}>
            Campus<Text style={{ color: colors.brandAccent }}>Connect</Text>
          </Text>
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
        <View style={[styles.greenBanner, { borderColor: 'rgba(0, 112, 243, 0.45)', backgroundColor: isDark ? 'rgba(0, 112, 243, 0.14)' : 'rgba(0, 112, 243, 0.08)' }]}>
          <View style={[styles.bannerIconCircleGreen, { backgroundColor: 'rgba(0, 112, 243, 0.2)' }]}>
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
              backgroundColor: isDark ? 'rgba(0, 112, 243, 0.1)' : 'rgba(0, 112, 243, 0.06)',
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={[styles.bannerIconCircleGreen, { backgroundColor: 'rgba(0, 112, 243, 0.15)' }]}>
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

      {/* TOP CARD: CAMPUS INVITE CODE (INSTANT UNLOCK) */}
      {!isGreenVerified && !isInviteVerified && (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <Ticket size={15} color={colors.primary} />
            <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>
              CAMPUS INVITE CODE (INSTANT UNLOCK)
            </Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.textMuted }]}>
            Have a batch or verified classmate invite code (e.g. GEU2026)? Enter it here to unlock posting immediately—your college locks automatically to your inviter’s campus.
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surfaceLight,
                borderColor: colors.cardBorder,
                color: colors.textPrimary,
                fontWeight: '700',
                letterSpacing: 0.6,
              },
            ]}
            value={inviteCode}
            onChangeText={(txt) => setInviteCode(txt.toUpperCase())}
            placeholder="e.g. GEU2026 (optional if uploading ID)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            maxLength={24}
          />
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
            {/* Searchable Uttarakhand College Catalog Picker */}
            {colleges.length > 0 && (
              <View>
                <Text style={[styles.inputLabel, { color: colors.textPrimary, marginBottom: 4 }]}>
                  Uttarakhand College / Campus *
                </Text>
                <Text style={[styles.inputSubtext, { color: colors.textMuted }]}>
                  Search all Dehradun, Haldwani & Uttarakhand colleges (auto-locked if using an invite code).
                </Text>
                <TouchableOpacity
                  style={[styles.selectorBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                  onPress={() => setCollegeModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.selectorBtnValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {colleges.find((c) => c.id === selectedCollegeId)?.name || collegeName}
                    </Text>
                    <Text style={[styles.selectorBtnSub, { color: colors.textMuted }]}>
                      {(() => {
                        const sel = colleges.find((c) => c.id === selectedCollegeId);
                        return sel ? `${sel.short_name} • ${getCollegeCity(sel)}` : 'Tap to search Uttarakhand catalog';
                      })()}
                    </Text>
                  </View>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>
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
          <Text style={[styles.inputSubtext, { color: colors.warning, marginTop: 6, marginBottom: 0, fontWeight: '600' }]}>
            Course can't be changed once saved • Ek baar select karne ke baad course change nahi hoga.
          </Text>
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
              onChangeText={(txt) => setUsername(txt.toLowerCase().replace(/[^a-z0-9@_]/g, ''))}
              placeholder="e.g. your_username"
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
                    gender === g && { color: colors.onPrimary, fontWeight: '700' },
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
              trackColor={{ false: isDark ? '#262626' : '#cbd5e1', true: colors.brandAccent }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* 3. Contact Email / Gmail (Asked AFTER Microsoft ID or ID Card — Verify Now or Later) */}
        <View style={styles.inputGroup}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary, marginBottom: 0 }]}>
              Contact Email / Gmail {inviteCode.trim() || isIdPending || isInviteVerified || isPlaceholderEmail ? '*' : ''}
            </Text>
            {emailVerified ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Check size={13} color={colors.success} />
                  <Text style={{ color: colors.success, fontSize: 11.5, fontWeight: '700' }}>Verified</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEmailVerified(false);
                    setEmailOtpSent(false);
                    setEmailOtpCode('');
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '700' }}>Change / Use Gmail</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Verify now or later</Text>
            )}
          </View>
          <Text style={[styles.inputSubtext, { color: colors.textMuted }]}>
            Your point of contact for recovery & alerts (never shown publicly). Add your personal Gmail and verify now or later from Profile.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View
              style={[
                styles.usernameRow,
                {
                  flex: 1,
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.cardBorder,
                  paddingHorizontal: 10,
                },
              ]}
            >
              <Mail size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.usernameInput, { color: colors.textPrimary, opacity: !emailVerified && isPlaceholderEmail ? 1 : 0.75 }]}
                value={contactEmail}
                onChangeText={(txt) => {
                  setContactEmail(txt.trim());
                }}
                editable={!emailVerified && isPlaceholderEmail}
                placeholder="you@gmail.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {!emailVerified && (
              <TouchableOpacity
                style={[
                  styles.msTokenConfirmBtn,
                  {
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    borderRadius: 10,
                  },
                ]}
                onPress={handleSendContactEmailOtp}
                disabled={emailActionLoading}
              >
                {emailActionLoading ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '700' }}>
                    {emailOtpSent ? 'Resend' : 'Verify Now'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {!emailVerified && emailOtpSent && (
            <View style={{ marginTop: 8, gap: 8 }}>
              {emailDevCode && (
                <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '700' }}>
                  Dev OTP: {emailDevCode}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      flex: 1,
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.cardBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  value={emailOtpCode}
                  onChangeText={(t) => setEmailOtpCode(t.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={[
                    styles.msTokenConfirmBtn,
                    { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10 },
                  ]}
                  onPress={handleVerifyContactEmailOtp}
                  disabled={emailActionLoading}
                >
                  <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '700' }}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
              placeholder="Min. 8 chars (letters & numbers)"
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

        {/* Finish Button */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary, shadowColor: 'transparent' }]}
          onPress={handleFinishSetup}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <View style={styles.submitBtnContent}>
              <Check size={18} color={colors.onPrimary} />
              <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>Finish Setup & Enter Campus Feed</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ========================================================= */}
      {/* UTTARAKHAND COLLEGE CATALOG PICKER                        */}
      {/* ========================================================= */}
      <CollegePickerModal
        visible={collegeModalVisible}
        colleges={colleges}
        selectedCollegeId={selectedCollegeId}
        title="Select Uttarakhand College"
        onSelect={(c) => {
          setSelectedCollegeId(c.id);
          setCollegeName(c.name);
        }}
        onClose={() => setCollegeModalVisible(false)}
      />

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
                    courseName === c.name && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(0, 112, 243, 0.15)' : 'rgba(0, 112, 243, 0.08)' },
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
                    branchName === b && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(0, 112, 243, 0.15)' : 'rgba(0, 112, 243, 0.08)' },
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
    backgroundColor: '#0070f3',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0070f3',
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
    color: colors.onPrimary,
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
    color: colors.onPrimary,
    fontSize: 12.5,
    fontWeight: '700',
  },
});
