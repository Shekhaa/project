import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Linking,
  Pressable,
} from 'react-native';
import {
  GraduationCap,
  ShieldCheck,
  Camera,
  UploadCloud,
  Sun,
  Moon,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Flame,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  KeyRound,
  RefreshCw,
  Mail,
  LogIn,
  ArrowLeft,
  Building2,
} from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import {
  authService,
  buildMicrosoftAuthUrl,
  setMsOAuthMode,
} from '../services/authService';
import { profileService } from '../services/profileService';
import { CollegeCatalogItem, CollegePickerModal, getCollegeCity } from '../components/common/CollegePickerModal';
import { showCrossPlatformAlert } from '../utils/mediaUtils';

// Safe Base64 encoding helper for cross-platform JWT simulation (Web + Native Hermes)
const safeBase64Encode = (str: string): string => {
  try {
    if (typeof btoa !== 'undefined') return btoa(str);
  } catch {}
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (
    let block = 0, charCode, idx = 0, map = chars;
    str.charAt(idx | 0) || ((map = '='), idx % 1);
    output += map.charAt(63 & (block >> (8 - (idx % 1) * 8)))
  ) {
    charCode = str.charCodeAt((idx += 3 / 4));
    block = (block << 8) | charCode;
  }
  return output;
};

// Dynamic native WebView import for seamless In-App OAuth on Android/iOS
let NativeWebView: any = null;
if (Platform.OS !== 'web') {
  try {
    NativeWebView = require('react-native-webview').WebView;
  } catch {}
}

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
  onDismiss?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess, onDismiss }) => {
  const { colors, isDark, resolvedTheme, toggleTheme } = useTheme();

  // Mode Switcher: 'LOGIN' (Existing Student Credentials) vs 'SIGN_IN' (New Student Verification / SSO)
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'SIGN_IN'>('LOGIN');

  // ==========================================
  // 1. CREDENTIAL LOGIN STATE
  // ==========================================
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Forgot Password Modal State
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  // ==========================================
  // 2. MICROSOFT SSO & ID CARD VERIFICATION STATE
  // ==========================================
  const [inAppOAuthVisible, setInAppOAuthVisible] = useState(false);
  const [ssoTokenModal, setSsoTokenModal] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);

  // ID Card Scan State + Uttarakhand College Catalog
  const [idScanLoading, setIdScanLoading] = useState(false);
  const [showDevPresets, setShowDevPresets] = useState(false);
  const [colleges, setColleges] = useState<CollegeCatalogItem[]>([]);
  const [selectedIdCollegeId, setSelectedIdCollegeId] = useState<number | undefined>(undefined);
  const [idCollegePickerVisible, setIdCollegePickerVisible] = useState(false);
  const [idContactEmail, setIdContactEmail] = useState('');
  const [idScanError, setIdScanError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    profileService
      .getColleges()
      .then((list) => {
        if (!active || !Array.isArray(list)) return;
        setColleges(list);
        if (list.length > 0) {
          const geu = list.find((c) => c.short_name === 'GEU');
          setSelectedIdCollegeId((prev) => prev ?? (geu ? geu.id : list[0].id));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedIdCollege = colleges.find((c) => c.id === selectedIdCollegeId) || null;

  // Safe Base64 encoding helper for cross-platform JWT simulation
  const createDevStudentToken = (email: string, name: string) => {
    const header = safeBase64Encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '');
    const claims = safeBase64Encode(
      JSON.stringify({
        email,
        name,
        tid: 'graphic-era-entra-id',
        sub: 'student-' + email.split('@')[0],
      })
    ).replace(/=/g, '');
    return `${header}.${claims}.dummy_signature`;
  };

  // ==========================================
  // CREDENTIAL LOGIN ACTION
  // ==========================================
  const handleCredentialLogin = async () => {
    const cleanId = loginIdentifier.trim();
    const cleanPass = loginPassword.trim();

    if (!cleanId) {
      setLoginError('Please enter your Username, College ID / Roll No., or Email.');
      return;
    }
    if (!cleanPass) {
      setLoginError('Please enter your account password.');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await authService.loginWithPassword(cleanId, cleanPass);
      onLoginSuccess(res.user);
    } catch (err: any) {
      const data = err.response?.data;
      let errMsg = 'Invalid login credentials. Please check your username/roll number and password.';
      if (typeof data?.error === 'string') {
        errMsg = data.error;
      } else if (typeof data?.detail === 'string') {
        errMsg = data.detail;
      } else if (typeof err.message === 'string') {
        errMsg = err.message;
      }
      setLoginError(errMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  // ==========================================
  // FORGOT PASSWORD FLOW
  // ==========================================
  const handleSendForgotOTP = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError('Please enter your valid registered email address.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      await authService.forgotPassword(forgotEmail.trim().toLowerCase());
      setForgotStep('OTP');
      setForgotMsg(`A 6-digit reset code has been sent to ${forgotEmail.trim().toLowerCase()}.`);
    } catch (err: any) {
      setForgotError(err.response?.data?.error || 'Failed to dispatch password reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!forgotOtp.trim()) {
      setForgotError('Please enter the 6-digit OTP code.');
      return;
    }
    if (!forgotNewPassword.trim() || forgotNewPassword.trim().length < 6) {
      setForgotError('New password must be at least 6 characters long.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      await authService.resetPassword(forgotEmail.trim().toLowerCase(), forgotOtp.trim(), forgotNewPassword.trim());
      showCrossPlatformAlert('Password Updated', 'Your password has been reset. You can now log in.');
      setForgotModalVisible(false);
      setLoginIdentifier(forgotEmail.trim());
      setLoginPassword(forgotNewPassword.trim());
    } catch (err: any) {
      setForgotError(err.response?.data?.error || 'Password reset failed. Please check the code.');
    } finally {
      setForgotLoading(false);
    }
  };

  // ==========================================
  // MICROSOFT ENTRA ID INSTITUTIONAL SSO
  // ==========================================
  const handleMicrosoftSSO = async (passedToken?: string) => {
    const tokenToUse = passedToken || manualTokenInput.trim();
    if (tokenToUse) {
      setSsoLoading(true);
      setSsoError(null);
      try {
        const res = await authService.loginWithMicrosoft(tokenToUse);
        setSsoTokenModal(false);
        setInAppOAuthVisible(false);
        setManualTokenInput('');
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        onLoginSuccess(res.user);
      } catch (err: any) {
        const data = err.response?.data;
        const errMsg =
          (typeof data?.error === 'string' && data.error) ||
          (typeof data?.detail === 'string' && data.detail) ||
          (typeof err.message === 'string' && err.message) ||
          'Microsoft verification failed. Please try again.';
        setSsoError(errMsg);
      } finally {
        setSsoLoading(false);
      }
      return;
    }

    await setMsOAuthMode('login');
    const authUrl = buildMicrosoftAuthUrl();

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = authUrl;
      } else {
        // Native APK: Launch Seamless In-App OAuth Sheet (Zero copy-paste required)
        setSsoError(null);
        setInAppOAuthVisible(true);
      }
    } catch {
      setSsoTokenModal(true);
    }
  };

  const handleOAuthNavigationChange = async (navState: any) => {
    const url = navState.url;
    if (!url) return;

    // Intercept redirect when url contains id_token or access_token
    if (url.includes('id_token=') || url.includes('access_token=')) {
      setInAppOAuthVisible(false);
      setSsoLoading(true);
      try {
        const match = url.match(/(?:id_token|access_token)=([^&#]+)/);
        const token = match ? decodeURIComponent(match[1]) : null;
        if (token) {
          const res = await authService.loginWithMicrosoft(token);
          onLoginSuccess(res.user);
        } else {
          setSsoError('Could not parse identity token from university response.');
        }
      } catch (err: any) {
        const data = err.response?.data;
        const errMsg =
          (typeof data?.error === 'string' && data.error) ||
          (typeof data?.detail === 'string' && data.detail) ||
          (typeof err.message === 'string' && err.message) ||
          'Microsoft verification failed. Please try again.';
        setSsoError(errMsg);
      } finally {
        setSsoLoading(false);
      }
    }
  };

  // ==========================================
  // PHYSICAL ID CARD SUBMISSION (PENDING ADMIN REVIEW)
  // ==========================================
  const validateIdCardInputs = (): string | null => {
    const cleanEmail = idContactEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.endsWith('.local')) {
      return 'Please enter a valid contact email first (required for ID Card accounts).';
    }
    if (!selectedIdCollegeId && colleges.length > 0) {
      return 'Please select your Uttarakhand college before uploading your Student ID.';
    }
    return null;
  };

  const handleScanAndLogin = async (base64Data: string, skipEmailGuard = false) => {
    const cleanEmail = idContactEmail.trim().toLowerCase();
    if (!skipEmailGuard) {
      const validationError = validateIdCardInputs();
      if (validationError) {
        setIdScanError(validationError);
        return;
      }
    }
    setIdScanError(null);
    setIdScanLoading(true);
    try {
      const res = await authService.loginWithIDCard(base64Data, {
        college_id: selectedIdCollegeId,
        email: skipEmailGuard ? undefined : cleanEmail,
      });
      showCrossPlatformAlert(
        'ID Card Submitted for Review',
        res.message ||
          'You can browse the campus feed in read-only mode now. Full posting unlocks once a campus admin approves your ID or you redeem an invite code.'
      );
      onLoginSuccess(res.user);
    } catch (e: any) {
      const errMsg = e.response?.data?.error || e.message || 'Could not process ID card image. Please ensure photo is clear.';
      setIdScanError(errMsg);
      showCrossPlatformAlert('ID Upload Notice', errMsg);
    } finally {
      setIdScanLoading(false);
    }
  };

  // Safe client-side image downscaling for web uploads
  const optimizeAndSendWebImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const img = new (window as any).Image();
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            handleScanAndLogin(compressed);
          } else {
            handleScanAndLogin(reader.result as string);
          }
        };
        img.onerror = () => {
          handleScanAndLogin(reader.result as string);
        };
        img.src = reader.result as string;
      } catch {
        handleScanAndLogin(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Web file input helper deferred to prevent touch responder desync
  const triggerWebFileInput = (capture: boolean) => {
    setTimeout(() => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        if (capture) {
          input.capture = 'environment';
        }
        input.style.display = 'none';
        document.body.appendChild(input);
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            optimizeAndSendWebImage(file);
          }
          try {
            document.body.removeChild(input);
          } catch {}
        };
        input.click();
      } catch (err) {
        console.warn('Web file input error', err);
      }
    }, 60);
  };

  const handleScanWithCamera = async () => {
    const validationError = validateIdCardInputs();
    if (validationError) {
      setIdScanError(validationError);
      return;
    }
    setIdScanError(null);
    if (Platform.OS === 'web') {
      triggerWebFileInput(true);
    } else {
      try {
        const ImagePicker = require('expo-image-picker');
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Camera permission is required to photograph your ID card.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.85,
          base64: true,
          allowsEditing: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          if (asset.base64) {
            handleScanAndLogin(`data:image/jpeg;base64,${asset.base64}`);
          }
        }
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Could not access camera.');
      }
    }
  };

  const handlePickFromGallery = async () => {
    const validationError = validateIdCardInputs();
    if (validationError) {
      setIdScanError(validationError);
      return;
    }
    setIdScanError(null);
    if (Platform.OS === 'web') {
      triggerWebFileInput(false);
    } else {
      try {
        const ImagePicker = require('expo-image-picker');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Photo gallery permission is required.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          base64: true,
          allowsEditing: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          if (asset.base64) {
            handleScanAndLogin(`data:image/jpeg;base64,${asset.base64}`);
          }
        }
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Could not pick image from gallery.');
      }
    }
  };

  const SAMPLE_ID_PRESETS = [
    {
      name: 'Aarav Joshi',
      roll: 'GEHU2024CSE01',
      dept: 'B.Tech CSE • 2nd Year',
      college: 'Graphic Era Hill University',
      rawText: 'GRAPHIC ERA HILL UNIVERSITY\nNAME: AARAV JOSHI\nROLL NO: GEHU2024CSE01\nCOURSE: B.TECH COMPUTER SCIENCE\nYEAR: 2ND YEAR',
    },
    {
      name: 'Priya Rawat',
      roll: 'GEHU2024AIML02',
      dept: 'B.Tech AI/ML • 2nd Year',
      college: 'Graphic Era Hill University',
      rawText: 'GRAPHIC ERA HILL UNIVERSITY\nNAME: PRIYA RAWAT\nROLL NO: GEHU2024AIML02\nCOURSE: B.TECH AI MACHINE LEARNING\nYEAR: 2ND YEAR',
    },
    {
      name: 'Rohan Bisht',
      roll: 'GEHU2024BCA03',
      dept: 'BCA Core • 1st Year',
      college: 'Graphic Era Hill University',
      rawText: 'GRAPHIC ERA HILL UNIVERSITY\nNAME: ROHAN BISHT\nROLL NO: GEHU2024BCA03\nCOURSE: BCA CORE\nYEAR: 1ST YEAR',
    },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Navbar: Browse Feed / Campus Identity + Quick Theme Switcher */}
        <View style={styles.topNavRow}>
          {onDismiss ? (
            <TouchableOpacity
              style={[styles.browseFeedBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
              onPress={onDismiss}
              activeOpacity={0.8}
              accessibilityLabel="Browse Feed"
            >
              <ArrowLeft size={14} color={colors.textPrimary} />
              <Text style={[styles.browseFeedText, { color: colors.textPrimary }]}>Browse Feed</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.topBrandPill}>
              <View style={styles.activeDot} />
              <Text style={[styles.topBrandText, { color: colors.textSecondary }]}>
                GEU & GEHU Campus Network
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.themeToggleBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
            onPress={toggleTheme}
            activeOpacity={0.8}
            accessibilityLabel="Toggle theme"
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

        {/* Main Card Container */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          {/* Editorial Hero Wordmark — Zero Decorative Blobs or Fake Counters */}
          <View style={styles.brandHero}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Campus
              <Text style={{ color: colors.brandAccent }}>Connect</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Verified campus network for Uttarakhand colleges.
            </Text>
          </View>

          {/* ========================================================= */}
          {/* SEGMENTED CONTROL: [ LOG IN ]  |  [ SIGN IN / VERIFY ]    */}
          {/* ========================================================= */}
          <View style={[styles.tabSelectorRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'LOGIN' && [
                  styles.tabBtnActive,
                  { backgroundColor: colors.primary },
                ],
              ]}
              onPress={() => {
                setActiveTab('LOGIN');
                setLoginError(null);
              }}
              activeOpacity={0.82}
            >
              <Lock
                size={14}
                color={activeTab === 'LOGIN' ? colors.onPrimary : colors.textMuted}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  {
                    color: activeTab === 'LOGIN' ? colors.onPrimary : colors.textMuted,
                  },
                  activeTab === 'LOGIN' && styles.tabBtnTextActive,
                ]}
              >
                Log In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'SIGN_IN' && [
                  styles.tabBtnActive,
                  { backgroundColor: colors.primary },
                ],
              ]}
              onPress={() => {
                setActiveTab('SIGN_IN');
                setLoginError(null);
              }}
              activeOpacity={0.82}
            >
              <ShieldCheck
                size={14}
                color={activeTab === 'SIGN_IN' ? colors.onPrimary : colors.textMuted}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  {
                    color: activeTab === 'SIGN_IN' ? colors.onPrimary : colors.textMuted,
                  },
                  activeTab === 'SIGN_IN' && styles.tabBtnTextActive,
                ]}
              >
                Sign In / Verify
              </Text>
            </TouchableOpacity>
          </View>

          {/* ========================================================= */}
          {/* TAB 1: DEDICATED STUDENT LOGIN (USERNAME / ID + PASSWORD) */}
          {/* ========================================================= */}
          {activeTab === 'LOGIN' ? (
            <View style={styles.loginFormBox}>
              <View style={styles.formHeader}>
                <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Sign in to your account</Text>
                <Text style={[styles.formSub, { color: colors.textMuted }]}>
                  Use your campus handle, roll number, or verified email.
                </Text>
              </View>

              {/* Inline Error Alert */}
              {loginError && (
                <View style={styles.errorAlertBox}>
                  <AlertCircle size={16} color="#ef4444" />
                  <Text style={styles.errorAlertText}>{loginError}</Text>
                </View>
              )}

              {/* Identifier Input */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                  Username, Roll No., or College Email
                </Text>
                <View
                  style={[
                    styles.inputFieldRow,
                    { backgroundColor: isDark ? colors.background : colors.surfaceLight, borderColor: colors.cardBorder },
                  ]}
                >
                  <User size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.fieldTextInput, { color: colors.textPrimary }]}
                    placeholder="e.g. 2313812137, shekhar_rana, or email"
                    placeholderTextColor={colors.textTertiary}
                    value={loginIdentifier}
                    onChangeText={(val) => {
                      setLoginIdentifier(val);
                      setLoginError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Password</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setForgotModalVisible(true);
                      setForgotStep('EMAIL');
                      setForgotError('');
                      setForgotMsg('');
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.forgotLink, { color: colors.primary }]}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.inputFieldRow,
                    { backgroundColor: isDark ? colors.background : colors.surfaceLight, borderColor: colors.cardBorder },
                  ]}
                >
                  <Lock size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.fieldTextInput, { color: colors.textPrimary }]}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textTertiary}
                    value={loginPassword}
                    onChangeText={(val) => {
                      setLoginPassword(val);
                      setLoginError(null);
                    }}
                    secureTextEntry={!showLoginPassword}
                    autoCapitalize="none"
                    onSubmitEditing={handleCredentialLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowLoginPassword(!showLoginPassword)}
                    style={styles.eyeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showLoginPassword ? (
                      <EyeOff size={17} color={colors.textMuted} />
                    ) : (
                      <Eye size={17} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                onPress={handleCredentialLogin}
                disabled={loginLoading}
                activeOpacity={0.88}
              >
                {loginLoading ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <View style={styles.primaryActionContent}>
                    <LogIn size={16} color={colors.onPrimary} />
                    <Text style={[styles.primaryActionText, { color: colors.onPrimary }]}>Log In to CampusConnect</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.hairline }]} />
                <Text style={[styles.dividerLabel, { color: colors.textTertiary }]}>OR CONTINUE WITH</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.hairline }]} />
              </View>

              {/* 1-Tap Microsoft Login Button (Clean Neutral Surface) */}
              <TouchableOpacity
                style={[
                  styles.msButtonSecondary,
                  {
                    backgroundColor: isDark ? colors.surfaceLight : '#ffffff',
                    borderColor: colors.hairlineStrong,
                  },
                ]}
                onPress={() => handleMicrosoftSSO()}
                disabled={ssoLoading}
                activeOpacity={0.88}
              >
                {ssoLoading ? (
                  <ActivityIndicator color={colors.textPrimary} size="small" />
                ) : (
                  <View style={styles.msButtonContent}>
                    <View style={styles.msLogoGrid}>
                      <View style={[styles.msLogoCell, { backgroundColor: '#F25022' }]} />
                      <View style={[styles.msLogoCell, { backgroundColor: '#7FBA00' }]} />
                      <View style={[styles.msLogoCell, { backgroundColor: '#00A4EF' }]} />
                      <View style={[styles.msLogoCell, { backgroundColor: '#FFB900' }]} />
                    </View>
                    <Text style={[styles.msButtonText, { color: colors.textPrimary }]}>
                      Continue with College ID (@geu.ac.in)
                    </Text>
                    <ArrowRight size={15} color={colors.textMuted} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* ========================================================= */
            /* TAB 2: CAMPUS-VERIFIED SIGN IN (COLLEGE ID OR ID CARD)    */
            /* ========================================================= */
            <View>
              {/* #1 PRIMARY GATE: OFFICIAL COLLEGE ID (MICROSOFT ENTRA SSO) */}
              <View style={[styles.ssoCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                <View style={styles.ssoCardHeader}>
                  <View style={styles.badgeRow}>
                    <View style={styles.verifiedGreenBadge}>
                      <ShieldCheck size={12} color="#22c55e" />
                      <Text style={styles.verifiedGreenBadgeText}>OFFICIAL COLLEGE ID</Text>
                    </View>
                    <Text style={[styles.zeroOtpLabel, { color: colors.textMuted }]}>Instant Verification</Text>
                  </View>

                  <Text style={[styles.ssoTitle, { color: colors.textPrimary }]}>
                    Sign in with College Microsoft ID
                  </Text>
                  <Text style={[styles.ssoDesc, { color: colors.textSecondary }]}>
                    Use your official university Outlook account (@geu.ac.in / @gehu.ac.in). Instant verified badge & auto roll number — add your personal Gmail next for contact.
                  </Text>
                </View>

                {ssoError && (
                  <View style={[styles.errorAlertBox, { marginBottom: 10 }]}>
                    <AlertCircle size={16} color="#ef4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.errorAlertText}>{ssoError}</Text>
                      <TouchableOpacity onPress={() => setSsoTokenModal(true)} style={{ marginTop: 4 }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                          Paste Entra token instead
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.msButton, { backgroundColor: colors.primary }]}
                  onPress={() => handleMicrosoftSSO()}
                  disabled={ssoLoading}
                  activeOpacity={0.88}
                >
                  {ssoLoading ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <View style={styles.msButtonContent}>
                      <View style={styles.msLogoGrid}>
                        <View style={[styles.msLogoCell, { backgroundColor: '#F25022' }]} />
                        <View style={[styles.msLogoCell, { backgroundColor: '#7FBA00' }]} />
                        <View style={[styles.msLogoCell, { backgroundColor: '#00A4EF' }]} />
                        <View style={[styles.msLogoCell, { backgroundColor: '#FFB900' }]} />
                      </View>
                      <Text style={[styles.msButtonText, { color: colors.onPrimary }]}>
                        Continue with College ID (@geu.ac.in)
                      </Text>
                      <ArrowRight size={16} color={colors.onPrimary} />
                    </View>
                  )}
                </TouchableOpacity>

                <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
                  <TouchableOpacity onPress={() => setSsoTokenModal(true)} style={styles.devLinkPill}>
                    <Text style={[styles.devLinkText, { color: colors.textMuted }]}>Have an Entra token? Paste Token</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* #2 PHYSICAL STUDENT ID CARD (ALL 32 UTTARAKHAND COLLEGES + CONTACT EMAIL) */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.hairline }]} />
                <Text style={[styles.dividerLabel, { color: colors.textTertiary }]}>OR VERIFY WITH STUDENT ID CARD</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.hairline }]} />
              </View>

              <View style={[styles.idScanSection, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                <View style={styles.idScanHeader}>
                  <View style={styles.idScanBadgeRow}>
                    <View style={styles.semiBadge}>
                      <View style={styles.semiBadgeDot} />
                      <Text style={styles.semiBadgeText}>ID CARD REVIEW</Text>
                    </View>
                    <Text style={[styles.semiBadgeSub, { color: colors.textMuted }]}>Dehradun • Haldwani • UK</Text>
                  </View>

                  <Text style={[styles.idScanTitle, { color: colors.textPrimary }]}>
                    Upload Physical Student ID Card
                  </Text>
                  <Text style={[styles.idScanDesc, { color: colors.textSecondary }]}>
                    Select your Uttarakhand college, enter your contact email (required), and upload a clear photo of your student ID card.
                  </Text>
                </View>

                {/* Uttarakhand College Catalog Picker */}
                <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginBottom: 6 }]}>
                  Your College / Campus *
                </Text>
                <TouchableOpacity
                  style={[
                    styles.inputFieldRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.cardBorder,
                      marginBottom: 10,
                      paddingVertical: 11,
                    },
                  ]}
                  onPress={() => setIdCollegePickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Building2 size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: selectedIdCollege ? colors.textPrimary : colors.textMuted, fontSize: 13, fontWeight: '600' }}
                      numberOfLines={1}
                    >
                      {selectedIdCollege ? selectedIdCollege.name : 'Select Dehradun, Haldwani, Rudrapur or UK College'}
                    </Text>
                    {selectedIdCollege ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {selectedIdCollege.short_name} • {getCollegeCity(selectedIdCollege)}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronDown size={16} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Mandatory Contact Email Input for ID Card */}
                <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginBottom: 6 }]}>
                  Contact Email (Required) *
                </Text>
                <View
                  style={[
                    styles.inputFieldRow,
                    { backgroundColor: colors.surface, borderColor: colors.cardBorder, marginBottom: 6 },
                  ]}
                >
                  <Mail size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.fieldTextInput, { color: colors.textPrimary }]}
                    placeholder="you@gmail.com (verify now or later)"
                    placeholderTextColor={colors.textMuted}
                    value={idContactEmail}
                    onChangeText={(val) => {
                      setIdContactEmail(val);
                      setIdScanError(null);
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 10 }}>
                  Required for account recovery & campus updates. You can verify it with OTP now or later from Profile.
                </Text>

                {idScanError && (
                  <View style={[styles.errorAlertBox, { marginBottom: 10 }]}>
                    <AlertCircle size={15} color="#ef4444" />
                    <Text style={styles.errorAlertText}>{idScanError}</Text>
                  </View>
                )}

                {/* Action Buttons: Camera vs File Upload */}
                <View style={styles.idActionGrid}>
                  <TouchableOpacity
                    style={[styles.idActionBtn, styles.idCameraBtn]}
                    onPress={handleScanWithCamera}
                    disabled={idScanLoading}
                    activeOpacity={0.85}
                  >
                    {idScanLoading ? (
                      <ActivityIndicator color="#f59e0b" size="small" />
                    ) : (
                      <View style={styles.idActionBtnContent}>
                        <View style={styles.idActionIconWrapYellow}>
                          <Camera size={18} color="#d97706" />
                        </View>
                        <View style={styles.idActionTextWrap}>
                          <Text style={styles.idActionTitleYellow}>Direct Camera Capture</Text>
                          <Text style={[styles.idActionSub, { color: colors.textMuted }]}>
                            Photograph physical ID card
                          </Text>
                        </View>
                        <ArrowRight size={15} color="#d97706" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.idActionBtn, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                    onPress={handlePickFromGallery}
                    disabled={idScanLoading}
                    activeOpacity={0.85}
                  >
                    <View style={styles.idActionBtnContent}>
                      <View style={[styles.idActionIconWrapMuted, { backgroundColor: colors.surfaceLight }]}>
                        <UploadCloud size={18} color={colors.textSecondary} />
                      </View>
                      <View style={styles.idActionTextWrap}>
                        <Text style={[styles.idActionTitleStandard, { color: colors.textPrimary }]}>
                          Upload from Gallery / Files
                        </Text>
                        <Text style={[styles.idActionSub, { color: colors.textMuted }]}>
                          Select clear JPG or PNG
                        </Text>
                      </View>
                      <ArrowRight size={15} color={colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* DEVELOPER / DEMO 1-TAP SWITCHER ACCORDION */}
              <View style={[styles.devAccordionBox, { borderColor: colors.cardBorder }]}>
                <TouchableOpacity
                  style={styles.devAccordionHeader}
                  onPress={() => setShowDevPresets(!showDevPresets)}
                  activeOpacity={0.75}
                >
                  <View style={styles.devAccordionTitleRow}>
                    <Sparkles size={14} color={colors.primary} />
                    <Text style={[styles.devAccordionTitle, { color: colors.textSecondary }]}>
                      Instant 1-Tap Demo Student Profiles
                    </Text>
                  </View>
                  {showDevPresets ? (
                    <ChevronUp size={16} color={colors.textMuted} />
                  ) : (
                    <ChevronDown size={16} color={colors.textMuted} />
                  )}
                </TouchableOpacity>

                {showDevPresets && (
                  <View style={styles.devPresetsContent}>
                    <Text style={[styles.devPresetsSub, { color: colors.textMuted }]}>
                      Test complete student onboarding without scanning physical cards:
                    </Text>

                    {/* Instant Test Profiles */}
                    <View style={styles.presetsGrid}>
                      <TouchableOpacity
                        style={[styles.presetCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                        onPress={() => {
                          const token = createDevStudentToken(
                            '2313812137@geu.ac.in',
                            'Chandra Shekhar Singh Rana'
                          );
                          handleMicrosoftSSO(token);
                        }}
                        disabled={ssoLoading}
                      >
                        <View style={styles.presetTop}>
                          <Text style={[styles.presetName, { color: colors.textPrimary }]}>Chandra Shekhar Rana</Text>
                          <View style={styles.presetBadgeGreen}>
                            <Text style={styles.presetBadgeGreenText}>🟢 GEU Verified</Text>
                          </View>
                        </View>
                        <Text style={[styles.presetMeta, { color: colors.textMuted }]}>
                          Roll: 2313812137 • B.Tech CSE • @geu.ac.in
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.presetCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                        onPress={() => {
                          const token = createDevStudentToken(
                            '2313812140@geu.ac.in',
                            'Priya Rawat'
                          );
                          handleMicrosoftSSO(token);
                        }}
                        disabled={ssoLoading}
                      >
                        <View style={styles.presetTop}>
                          <Text style={[styles.presetName, { color: colors.textPrimary }]}>Priya Rawat</Text>
                          <View style={styles.presetBadgeGreen}>
                            <Text style={styles.presetBadgeGreenText}>🟢 GEU Verified</Text>
                          </View>
                        </View>
                        <Text style={[styles.presetMeta, { color: colors.textMuted }]}>
                          Roll: 2313812140 • B.Tech AI/ML • @geu.ac.in
                        </Text>
                      </TouchableOpacity>

                      {SAMPLE_ID_PRESETS.map((p, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.presetCard, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                          onPress={() => handleScanAndLogin('data:image/jpeg;base64,' + safeBase64Encode(p.rawText), true)}
                          disabled={idScanLoading}
                        >
                          <View style={styles.presetTop}>
                            <Text style={[styles.presetName, { color: colors.textPrimary }]}>{p.name}</Text>
                            <View style={styles.presetBadgeYellow}>
                              <Text style={styles.presetBadgeYellowText}>🟡 Pending Review</Text>
                            </View>
                          </View>
                          <Text style={[styles.presetMeta, { color: colors.textMuted }]}>
                            {p.roll} • {p.dept}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Student Privacy & Integrity Footer */}
          <View style={styles.footerNote}>
            <Lock size={12} color={colors.textTertiary} />
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              Encrypted end-to-end. Verified Uttarakhand campus network.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ========================================================= */}
      {/* FORGOT PASSWORD MODAL (EMAIL + OTP + NEW PASSWORD)        */}
      {/* ========================================================= */}
      {forgotModalVisible && (
      <Modal
        visible={forgotModalVisible}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <KeyRound size={18} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Reset Account Password</Text>
              </View>
              <TouchableOpacity
                onPress={() => setForgotModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={[styles.modalCloseText, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                {forgotStep === 'EMAIL'
                  ? 'Enter your registered Graphic Era college email address to receive a 6-digit reset code.'
                  : forgotMsg || 'Enter the 6-digit OTP sent to your email and set your new password.'}
              </Text>

              {forgotError ? (
                <View style={styles.errorAlertBox}>
                  <AlertCircle size={15} color="#ef4444" />
                  <Text style={styles.errorAlertText}>{forgotError}</Text>
                </View>
              ) : null}

              {forgotStep === 'EMAIL' ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>College Email</Text>
                  <View style={[styles.inputFieldRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                    <Mail size={16} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.fieldTextInput, { color: colors.textPrimary }]}
                      placeholder="e.g. 2313812137@geu.ac.in"
                      placeholderTextColor={colors.textMuted}
                      value={forgotEmail}
                      onChangeText={(val) => {
                        setForgotEmail(val);
                        setForgotError('');
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryActionBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                    onPress={handleSendForgotOTP}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? (
                      <ActivityIndicator color={colors.onPrimary} size="small" />
                    ) : (
                      <Text style={[styles.primaryActionText, { color: colors.onPrimary }]}>Send Reset Code</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>6-Digit OTP</Text>
                  <View style={[styles.inputFieldRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                    <KeyRound size={16} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.fieldTextInput, { color: colors.textPrimary }]}
                      placeholder="Enter 6-digit OTP"
                      placeholderTextColor={colors.textMuted}
                      value={forgotOtp}
                      onChangeText={(val) => {
                        setForgotOtp(val);
                        setForgotError('');
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 12 }]}>New Password</Text>
                  <View style={[styles.inputFieldRow, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                    <Lock size={16} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.fieldTextInput, { color: colors.textPrimary }]}
                      placeholder="Min. 6 characters"
                      placeholderTextColor={colors.textMuted}
                      value={forgotNewPassword}
                      onChangeText={(val) => {
                        setForgotNewPassword(val);
                        setForgotError('');
                      }}
                      secureTextEntry={!showForgotNewPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowForgotNewPassword(!showForgotNewPassword)}
                      style={styles.eyeBtn}
                    >
                      {showForgotNewPassword ? (
                        <EyeOff size={16} color={colors.textSecondary} />
                      ) : (
                        <Eye size={16} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryActionBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                    onPress={handleResetPassword}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? (
                      <ActivityIndicator color={colors.onPrimary} size="small" />
                    ) : (
                      <Text style={[styles.primaryActionText, { color: colors.onPrimary }]}>Update Password & Log In</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ marginTop: 12, alignItems: 'center' }}
                    onPress={() => setForgotStep('EMAIL')}
                  >
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>← Back to change email</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}

      {/* ========================================================= */}
      {/* SEAMLESS IN-APP MICROSOFT SSO (NATIVE ANDROID / IOS)      */}
      {/* ========================================================= */}
      {inAppOAuthVisible && (
        <Modal
          visible={inAppOAuthVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setInAppOAuthVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header with Title and Cancel button */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.cardBorder,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.msLogoGridSmall}>
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#F25022' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#7FBA00' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#00A4EF' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#FFB900' }]} />
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                  Graphic Era Official Login
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setInAppOAuthVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Embedded Native WebView with domStorage & token auto-capture */}
            {NativeWebView ? (
              <NativeWebView
                source={{ uri: buildMicrosoftAuthUrl() }}
                onNavigationStateChange={handleOAuthNavigationChange}
                startInLoadingState={true}
                renderLoading={() => (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: colors.background,
                    }}
                  >
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 13 }}>
                      Connecting to Graphic Era Microsoft portal...
                    </Text>
                  </View>
                )}
                incognito={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                sharedCookiesEnabled={true}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12, textAlign: 'center' }}>
                  Loading university sign-in portal...
                </Text>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MICROSOFT SSO TOKEN & DEV MODAL                           */}
      {/* ========================================================= */}
      {ssoTokenModal && (
      <Modal
        visible={ssoTokenModal}
        transparent
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        onRequestClose={() => setSsoTokenModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.msLogoGridSmall}>
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#F25022' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#7FBA00' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#00A4EF' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#FFB900' }]} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Microsoft SSO Verification</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSsoTokenModal(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={[styles.modalCloseText, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                Directly paste an ID token or test single-tap login as a verified Graphic Era student.
              </Text>

              {/* Paste ID Token */}
              <Text style={[styles.modalSectionLabel, { color: colors.textTertiary }]}>
                PASTE ID TOKEN (FROM JWT.MS / AZURE)
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder, color: colors.textPrimary },
                ]}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                placeholderTextColor={colors.textTertiary}
                value={manualTokenInput}
                onChangeText={setManualTokenInput}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={() => handleMicrosoftSSO()}
                disabled={ssoLoading}
              >
                {ssoLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>Verify & Login with Token</Text>
                )}
              </TouchableOpacity>

              {/* Open in Browser */}
              <TouchableOpacity
                style={[styles.modalSecondaryBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                onPress={async () => {
                  await setMsOAuthMode('login');
                  const authUrl = buildMicrosoftAuthUrl();
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.href = authUrl;
                  } else {
                    Linking.openURL(authUrl);
                  }
                }}
              >
                <Text style={[styles.modalSecondaryBtnText, { color: colors.textSecondary }]}>
                  🌐 Open Microsoft Login in Browser
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}
      <CollegePickerModal
        visible={idCollegePickerVisible}
        colleges={colleges}
        selectedCollegeId={selectedIdCollegeId}
        onSelect={(college) => {
          setSelectedIdCollegeId(college.id);
          setIdScanError(null);
        }}
        onClose={() => setIdCollegePickerVisible(false)}
        title="Select Your Uttarakhand College"
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  topNavRow: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  browseFeedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  browseFeedText: {
    fontSize: 12,
    fontWeight: '700',
  },
  topBrandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22c55e',
  },
  topBrandText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  themeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeToggleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emailOtpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  emailOtpBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emailOtpInfoBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 6,
  },
  emailOtpInfoText: {
    fontSize: 12,
    lineHeight: 16,
  },
  devOtpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  devOtpLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  devOtpFillBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  devOtpFillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  otpSecondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  otpSecondaryLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    maxWidth: 460,
    width: '100%',
  },
  brandHero: {
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  logoShield: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 5,
    textAlign: 'left',
    lineHeight: 19,
  },
  pulsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27a644',
  },
  pulseText: {
    color: '#27a644',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tagChipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  tagChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 10.5,
    fontWeight: '600',
  },

  // Segmented Control Tabs
  tabSelectorRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    fontWeight: '700',
  },

  // Login Form Styles
  loginFormBox: {
    marginBottom: 6,
  },
  formHeader: {
    marginBottom: 14,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  formSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  errorAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  errorAlertText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  forgotLink: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  inputFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  fieldTextInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 12,
  },
  eyeBtn: {
    padding: 6,
  },
  primaryActionBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  quickDevFillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  quickDevFillLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  quickDevChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quickDevChipText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // SSO Card Styles
  ssoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  ssoCardHeader: {
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  verifiedGreenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(39, 166, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(39, 166, 68, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedGreenBadgeText: {
    color: '#27a644',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  zeroOtpLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  ssoTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  ssoDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  msButton: {
    backgroundColor: '#0070f3',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msButtonSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  msLogoGrid: {
    width: 16,
    height: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  msLogoCell: {
    width: 7,
    height: 7,
    borderRadius: 1,
  },
  msButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  featurePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featurePillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  devLinkPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  devLinkText: {
    color: '#2997ff',
    fontSize: 11,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  idScanSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  idScanHeader: {
    marginBottom: 12,
  },
  idScanBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  semiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  semiBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
  semiBadgeText: {
    color: '#f59e0b',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  semiBadgeSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  idScanTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  idScanDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  idActionGrid: {
    gap: 9,
  },
  idActionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  idCameraBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  idActionBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  idActionIconWrapYellow: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  idActionIconWrapMuted: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idActionTextWrap: {
    flex: 1,
  },
  idActionTitleYellow: {
    color: '#d97706',
    fontSize: 13,
    fontWeight: '700',
  },
  idActionTitleStandard: {
    fontSize: 13,
    fontWeight: '600',
  },
  idActionSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  devAccordionBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  devAccordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  devAccordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  devAccordionTitle: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  devPresetsContent: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  devPresetsSub: {
    fontSize: 11,
    marginBottom: 8,
  },
  presetsGrid: {
    gap: 8,
  },
  presetCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  presetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  presetName: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  presetBadgeGreen: {
    backgroundColor: 'rgba(39, 166, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  presetBadgeGreenText: {
    color: '#27a644',
    fontSize: 9,
    fontWeight: '700',
  },
  presetBadgeYellow: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  presetBadgeYellowText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '700',
  },
  presetMeta: {
    fontSize: 10.5,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  footerText: {
    fontSize: 10.5,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  msLogoGridSmall: {
    width: 14,
    height: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  msLogoCellSmall: {
    width: 6,
    height: 6,
    borderRadius: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSub: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  modalInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  modalPrimaryBtn: {
    backgroundColor: '#0070f3',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modalPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
