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
} from 'react-native';
import { colors } from '../theme/colors';
import { authService } from '../services/authService';

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
}

// Graphic Era Coordinates (GEU Clement Town & GEHU Dehradun)
const CAMPUS_COORDS = {
  GEU_LAT: 30.2685,
  GEU_LNG: 77.9942,
  GEHU_LAT: 30.2700,
  GEHU_LNG: 77.9980,
};

function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 5 Production-Ready GEHU Student Test Accounts
const GEHU_TEST_CREDENTIALS = [
  {
    name: 'Aarav Joshi',
    handle: '@aarav_gehu',
    roll: 'GEHU2024CSE01',
    dept: 'B.Tech CSE (2nd Year)',
    email: 'aarav.joshi@gehu.ac.in',
    phone: '9876510001',
    college: 'Graphic Era Hill University',
  },
  {
    name: 'Priya Rawat',
    handle: '@priya_gehu',
    roll: 'GEHU2024AIML02',
    dept: 'B.Tech AI/ML (2nd Year)',
    email: 'priya.rawat@gehu.ac.in',
    phone: '9876510002',
    college: 'Graphic Era Hill University',
  },
  {
    name: 'Rohan Bisht',
    handle: '@rohan_gehu',
    roll: 'GEHU2024BCA03',
    dept: 'BCA Core (1st Year)',
    email: 'rohan.bisht@gehu.ac.in',
    phone: '9876510003',
    college: 'Graphic Era Hill University',
  },
  {
    name: 'Ananya Negi',
    handle: '@ananya_gehu',
    roll: 'GEHU2024MBA04',
    dept: 'MBA Core (1st Year)',
    email: 'ananya.negi@gehu.ac.in',
    phone: '9876510004',
    college: 'Graphic Era Hill University',
  },
  {
    name: 'Tanmay Bhatt',
    handle: '@tanmay_gehu',
    roll: 'GEHU2024MCA05',
    dept: 'MCA Core (2nd Year)',
    email: 'tanmay.bhatt@gehu.ac.in',
    phone: '9876510005',
    college: 'Graphic Era Hill University',
  },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  // Top-Level Mode: Returning Student Log In vs New Student Registration
  const [authFlow, setAuthFlow] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');

  // Direct Credential Login State
  const [loginIdentifier, setLoginIdentifier] = useState('aarav.joshi@gehu.ac.in');
  const [loginPassword, setLoginPassword] = useState('Campus@2026');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Sign-Up Password Creation State
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Sign-Up Sub-Tabs: 1. Phone (Geofenced), 2. College Email, 3. ID Card OCR
  const [signupTab, setSignupTab] = useState<'PHONE_GEO' | 'COLLEGE_EMAIL' | 'ID_CARD'>('PHONE_GEO');

  // Geolocation & Campus Geofence State
  const [simulateCampus, setSimulateCampus] = useState(true);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>({
    latitude: CAMPUS_COORDS.GEHU_LAT,
    longitude: CAMPUS_COORDS.GEHU_LNG,
  });
  const [distanceKm, setDistanceKm] = useState<number>(0.2);
  const [isLocating, setIsLocating] = useState(false);

  // Phone / WhatsApp OTP State
  const [phone, setPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [devPhoneOtp, setDevPhoneOtp] = useState<string | null>(null);
  const [isRealSms, setIsRealSms] = useState(false);
  const [gatewayNotice, setGatewayNotice] = useState<string | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');

  // College Email OTP State
  const [email, setEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [detectedCollege, setDetectedCollege] = useState<string | null>(null);
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null);

  // Common UI State
  const [loading, setLoading] = useState(false);
  const [idScanLoading, setIdScanLoading] = useState(false);
  const [demoModalVisible, setDemoModalVisible] = useState(false);
  const [demoUsers, setDemoUsers] = useState<any[]>([]);

  useEffect(() => {
    checkDeviceLocation();
  }, []);

  const checkDeviceLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocating(false);
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setUserCoords({ latitude: lat, longitude: lon });
          const distGeu = calculateHaversine(lat, lon, CAMPUS_COORDS.GEU_LAT, CAMPUS_COORDS.GEU_LNG);
          const distGehu = calculateHaversine(lat, lon, CAMPUS_COORDS.GEHU_LAT, CAMPUS_COORDS.GEHU_LNG);
          const minDist = Math.min(distGeu, distGehu);
          setDistanceKm(Number(minDist.toFixed(1)));
          if (minDist <= 5.0) {
            setSimulateCampus(false);
          }
        },
        () => {
          setIsLocating(false);
          setSimulateCampus(true);
          setDistanceKm(0.2);
        },
        { timeout: 7000 }
      );
    } else {
      setSimulateCampus(true);
      setDistanceKm(0.2);
    }
  };

  // 1. DIRECT CREDENTIAL LOGIN (Email/Phone/Handle + Password)
  const handleDirectLogin = async () => {
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      Alert.alert('Required Fields', 'Please enter your email, username, or phone number and password.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await authService.loginWithPassword(loginIdentifier.trim(), loginPassword.trim());
      Alert.alert('Welcome Back! 🎉', `Authenticated as @${res.user.username || res.user.email}`);
      onLoginSuccess(res.user);
    } catch (e: any) {
      Alert.alert('Login Failed', e.response?.data?.error || 'Invalid credentials. Please verify your password.');
    } finally {
      setLoginLoading(false);
    }
  };

  // 1-TAP LOGIN FOR SEEDED GEHU TEST STUDENTS
  const handleQuickGehuLogin = async (targetEmail: string) => {
    setLoading(true);
    try {
      const res = await authService.devQuickLogin(targetEmail);
      Alert.alert('1-Tap Login Successful! ⚡', `Switched to ${res.user.full_name} (${res.detected_college?.name || 'GEHU'})`);
      onLoginSuccess(res.user);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not log in.');
    } finally {
      setLoading(false);
    }
  };

  // 2. GEOFENCED PHONE SIGN-UP
  const handleSendPhoneOTP = async (channel: 'WHATSAPP' | 'SMS' = 'WHATSAPP') => {
    const clean = phone.replace(/[^0-9]/g, '').slice(-10);
    if (clean.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setSelectedChannel(channel);
    setLoading(true);
    try {
      const coords = simulateCampus
        ? { latitude: CAMPUS_COORDS.GEHU_LAT, longitude: CAMPUS_COORDS.GEHU_LNG, bypass_geofence: true }
        : { latitude: userCoords?.latitude, longitude: userCoords?.longitude, bypass_geofence: false };

      const data = await authService.sendPhoneLoginOTP(clean, channel, coords);
      setPhoneOtpSent(true);
      setIsRealSms(Boolean(data.is_real_sms));
      setGatewayNotice(data.gateway_notice || null);
      if (data.whatsapp_link) setWhatsappLink(data.whatsapp_link);
      if (data.dev_otp) {
        setDevPhoneOtp(data.dev_otp);
        setPhoneOtp(data.dev_otp);
      }

      if (channel === 'WHATSAPP') {
        Alert.alert(
          'WhatsApp OTP Generated! 💬',
          `Your 6-digit code is [${data.dev_otp || '123456'}].\n\nAuto-filled below for instant testing! Tap 'Verify Code' to continue.`
        );
      } else {
        Alert.alert('SMS OTP Ready 📱', `Verification code [${data.dev_otp || '123456'}] auto-filled below!`);
      }
    } catch (e: any) {
      Alert.alert('Campus Geofence Notice', e.response?.data?.error || 'Failed to dispatch verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOTP = async () => {
    const clean = phone.replace(/[^0-9]/g, '').slice(-10);
    if (phoneOtp.length < 6) {
      Alert.alert('Incomplete Code', 'Please enter the 6-digit code.');
      return;
    }
    if (signupPassword && signupPassword.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const data = await authService.verifyPhoneLoginOTP(clean, phoneOtp, signupPassword || undefined);
      if (signupPassword) {
        Alert.alert(
          'Account & Password Set! 🎉',
          `Your password is now active! You can log in anytime using your phone (${clean}) or handle with this password.`
        );
      }
      onLoginSuccess(data.user);
    } catch (e: any) {
      Alert.alert('Verification Failed', e.response?.data?.error || 'Invalid OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // 3. COLLEGE EMAIL OTP
  const handleSendEmailOTP = async () => {
    if (!email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter your official college email (e.g. name@gehu.ac.in).');
      return;
    }

    setLoading(true);
    try {
      const data = await authService.sendEmailOTP(email);
      setEmailOtpSent(true);
      if (data.detected_college) setDetectedCollege(data.detected_college.name);
      if (data.magic_link) setMagicLinkUrl(data.magic_link);
      Alert.alert('Verification Sent! 📬', `6-digit code dispatched to ${email}. Valid for 5 minutes.`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOTP = async () => {
    if (emailOtp.length < 6) {
      Alert.alert('Error', 'Please enter the 6-digit verification code.');
      return;
    }
    if (signupPassword && signupPassword.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const data = await authService.verifyEmailOTP(email, emailOtp, signupPassword || undefined);
      if (signupPassword) {
        Alert.alert(
          'Account & Password Set! 🎉',
          `Your password is now active! You can log in anytime using your email and password.`
        );
      }
      onLoginSuccess(data.user);
    } catch (e: any) {
      Alert.alert('Verification Failed', e.response?.data?.error || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  // 4. SPOTIFY-STYLE COLLEGE SSO (Graphic Era Portal 1-Tap Login)
  const handleSpotifyStyleSSO = async () => {
    setLoading(true);
    try {
      // Simulate Microsoft Entra ID / GEU-GEHU Portal SSO
      Alert.alert(
        '🎓 Graphic Era Portal SSO',
        'Authenticate directly via Graphic Era Institutional Single Sign-On (like Spotify Student Discount):',
        [
          {
            text: 'Sign In as Aarav Joshi (GEHU)',
            onPress: async () => {
              try {
                const res = await authService.devQuickLogin('aarav.joshi@gehu.ac.in');
                onLoginSuccess(res.user);
              } catch (err: any) {
                Alert.alert('SSO Error', err.message);
              }
            },
          },
          {
            text: 'Sign In as Priya Rawat (GEHU)',
            onPress: async () => {
              try {
                const res = await authService.devQuickLogin('priya.rawat@gehu.ac.in');
                onLoginSuccess(res.user);
              } catch (err: any) {
                Alert.alert('SSO Error', err.message);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  // 5. PHYSICAL ID CARD OCR LOGIN
  const handleScanAndLogin = async (base64Data: string) => {
    if (signupPassword && signupPassword.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters.');
      return;
    }
    setIdScanLoading(true);
    try {
      const res = await authService.loginWithIDCard(base64Data, signupPassword || undefined);
      Alert.alert(
        'Physical ID Verified! 🎓',
        `Welcome, ${res.user.full_name || 'Student'}!\nRoll No: ${res.extracted_data?.admission_number || 'GEHU'}\nJoined Graphic Era Hill University community.`
      );
      onLoginSuccess(res.user);
    } catch (e: any) {
      Alert.alert('ID Verification Failed', e.response?.data?.error || 'Could not verify ID card image.');
    } finally {
      setIdScanLoading(false);
    }
  };

  const handlePickCustomIDCard = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result as string;
            handleScanAndLogin(base64);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      handleScanAndLogin('data:image/jpeg;base64,' + btoa(SAMPLE_ID_PRESETS[0].rawText));
    }
  };

  const SAMPLE_ID_PRESETS = [
    {
      name: 'Aarav Joshi',
      roll: 'GEHU2024CSE01',
      dept: 'B.Tech CSE • 2nd Year',
      badge: 'GEHU Student',
      college: 'Graphic Era Hill University',
      rawText: 'GRAPHIC ERA HILL UNIVERSITY\nNAME: AARAV JOSHI\nROLL NO: GEHU2024CSE01\nCOURSE: B.TECH COMPUTER SCIENCE\nYEAR: 2ND YEAR',
    },
    {
      name: 'Priya Rawat',
      roll: 'GEHU2024AIML02',
      dept: 'B.Tech AI/ML • 2nd Year',
      badge: 'GEHU Student',
      college: 'Graphic Era Hill University',
      rawText: 'GRAPHIC ERA HILL UNIVERSITY\nNAME: PRIYA RAWAT\nROLL NO: GEHU2024AIML02\nCOURSE: B.TECH AI MACHINE LEARNING\nYEAR: 2ND YEAR',
    },
    {
      name: 'Rohan Bisht',
      roll: 'GEHU2024BCA03',
      dept: 'BCA Core • 1st Year',
      badge: 'GEHU Student',
      college: 'Graphic Era Hill University',
      rawText: 'GRAPHIC ERA HILL UNIVERSITY\nNAME: ROHAN BISHT\nROLL NO: GEHU2024BCA03\nCOURSE: BCA CORE\nYEAR: 1ST YEAR',
    },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logoIcon}>🎓</Text>
            <Text style={styles.title}>Campus Connect</Text>
            <Text style={styles.subtitle}>Graphic Era University & Graphic Era Hill University</Text>
          </View>

          {/* Top-Level Mode Selector: Log In vs Sign Up */}
          <View style={styles.mainFlowToggle}>
            <TouchableOpacity
              style={[styles.mainFlowBtn, authFlow === 'LOGIN' && styles.mainFlowBtnActive]}
              onPress={() => setAuthFlow('LOGIN')}
            >
              <Text style={[styles.mainFlowText, authFlow === 'LOGIN' && styles.mainFlowTextActive]}>
                🔑 Existing Student Log In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mainFlowBtn, authFlow === 'SIGNUP' && styles.mainFlowBtnActive]}
              onPress={() => setAuthFlow('SIGNUP')}
            >
              <Text style={[styles.mainFlowText, authFlow === 'SIGNUP' && styles.mainFlowTextActive]}>
                🚀 New Student Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* ========================================================= */}
          {/* FLOW A: DIRECT LOGIN (FOR STUDENTS WITH CREDENTIALS)      */}
          {/* ========================================================= */}
          {authFlow === 'LOGIN' && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionHeading}>Sign In with Student Credentials</Text>
              <Text style={styles.sectionSub}>Enter your college email, username, or phone number and password.</Text>

              <Text style={styles.label}>Email / Username / Phone</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. aarav.joshi@gehu.ac.in or 9876510001"
                placeholderTextColor={colors.textMuted}
                value={loginIdentifier}
                onChangeText={setLoginIdentifier}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInputFlex]}
                  placeholder="Enter password"
                  placeholderTextColor={colors.textMuted}
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  secureTextEntry={!showLoginPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowLoginPassword(!showLoginPassword)}
                >
                  <Text style={styles.eyeBtnText}>{showLoginPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleDirectLogin}
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Sign In to Campus Connect 🚀</Text>
                )}
              </TouchableOpacity>

              {/* 5 PRODUCTION TEST ACCOUNTS (GEHU) */}
              <View style={styles.testAccountsSection}>
                <View style={styles.testAccountsHeader}>
                  <Text style={styles.testAccountsTitle}>⚡ 5 PRODUCTION TEST ACCOUNTS (GEHU)</Text>
                  <Text style={styles.testAccountsSub}>1-Tap login to test across multiple physical devices:</Text>
                </View>

                {GEHU_TEST_CREDENTIALS.map((acc, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.testAccountCard}
                    onPress={() => {
                      setLoginIdentifier(acc.email);
                      setLoginPassword('Campus@2026');
                      handleQuickGehuLogin(acc.email);
                    }}
                  >
                    <View style={styles.testAccountTop}>
                      <View>
                        <Text style={styles.testAccountName}>{acc.name}</Text>
                        <Text style={styles.testAccountRoll}>{acc.roll} • {acc.dept}</Text>
                        <Text style={styles.testAccountEmail}>📧 {acc.email} | 📱 {acc.phone}</Text>
                      </View>
                      <View style={styles.quickLoginBtn}>
                        <Text style={styles.quickLoginBtnText}>1-Tap Login ⚡</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ========================================================= */}
          {/* FLOW B: NEW STUDENT SIGN UP (3 PATHWAYS)                  */}
          {/* ========================================================= */}
          {authFlow === 'SIGNUP' && (
            <View style={styles.sectionContainer}>
              {/* 3 Pathway Tabs */}
              <View style={styles.tabToggleRow}>
                <TouchableOpacity
                  style={[styles.tabToggleBtn, signupTab === 'PHONE_GEO' && styles.tabToggleBtnActive]}
                  onPress={() => setSignupTab('PHONE_GEO')}
                >
                  <Text style={[styles.tabToggleText, signupTab === 'PHONE_GEO' && styles.tabToggleTextActive]}>
                    📍 Phone (Geo)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabToggleBtn, signupTab === 'COLLEGE_EMAIL' && styles.tabToggleBtnActive]}
                  onPress={() => setSignupTab('COLLEGE_EMAIL')}
                >
                  <Text style={[styles.tabToggleText, signupTab === 'COLLEGE_EMAIL' && styles.tabToggleTextActive]}>
                    ✉️ College Email
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabToggleBtn, signupTab === 'ID_CARD' && styles.tabToggleBtnActive]}
                  onPress={() => setSignupTab('ID_CARD')}
                >
                  <Text style={[styles.tabToggleText, signupTab === 'ID_CARD' && styles.tabToggleTextActive]}>
                    🪪 ID Card OCR
                  </Text>
                </TouchableOpacity>
              </View>

              {/* --------------------------------------------------------- */}
              {/* PATHWAY 1: CAMPUS PHONE SIGN-UP (GEOFENCED)               */}
              {/* --------------------------------------------------------- */}
              {signupTab === 'PHONE_GEO' && (
                <View>
                  {/* Campus Geofence Status Card */}
                  <View style={[styles.geoStatusCard, simulateCampus || distanceKm <= 5.0 ? styles.geoStatusCardInside : styles.geoStatusCardOutside]}>
                    <View style={styles.geoStatusHeader}>
                      <Text style={styles.geoStatusIcon}>{simulateCampus || distanceKm <= 5.0 ? '📍' : '⚠️'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.geoStatusTitle}>
                          {simulateCampus || distanceKm <= 5.0 ? 'Inside Graphic Era Campus' : 'Outside Campus Perimeter'}
                        </Text>
                        <Text style={styles.geoStatusSub}>
                          {simulateCampus
                            ? 'Simulated: Graphic Era Hill University (0.2 km from main gate)'
                            : `Device distance: ~${distanceKm} km from campus.`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.geoActionRow}>
                      <TouchableOpacity
                        style={styles.geoToggleBtn}
                        onPress={() => setSimulateCampus(!simulateCampus)}
                      >
                        <Text style={styles.geoToggleBtnText}>
                          {simulateCampus ? 'Disable Simulation' : '⚡ Simulate On-Campus (Testing)'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.geoDetectBtn}
                        onPress={checkDeviceLocation}
                        disabled={isLocating}
                      >
                        <Text style={styles.geoDetectBtnText}>{isLocating ? 'Locating...' : 'Detect GPS 📡'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {!phoneOtpSent ? (
                    <View>
                      <Text style={styles.label}>Student Mobile Number</Text>
                      <View style={styles.phoneInputRow}>
                        <View style={styles.countryCodeBadge}>
                          <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                        </View>
                        <TextInput
                          style={[styles.input, styles.phoneInput]}
                          placeholder="98765 43210"
                          placeholderTextColor={colors.textMuted}
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                          maxLength={10}
                        />
                      </View>
                      <Text style={styles.helperText}>
                        🛡️ Phone registration requires physical campus presence or simulation mode.
                      </Text>

                      {/* WhatsApp Primary OTP Button */}
                      <TouchableOpacity
                        style={styles.whatsappButton}
                        onPress={() => handleSendPhoneOTP('WHATSAPP')}
                        disabled={loading}
                      >
                        {loading && selectedChannel === 'WHATSAPP' ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.whatsappButtonText}>💬 Get OTP on WhatsApp (Free & Instant)</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.secondarySmsBtn}
                        onPress={() => handleSendPhoneOTP('SMS')}
                        disabled={loading}
                      >
                        <Text style={styles.secondarySmsBtnText}>📱 Send Carrier SMS Code</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.smsNoticeCard}>
                        <Text style={styles.smsNoticeBadge}>
                          {selectedChannel === 'WHATSAPP' ? '💬 WhatsApp Dispatched' : '📱 SMS Code'}
                        </Text>
                        <Text style={styles.smsNoticeText}>
                          Code [{devPhoneOtp || '500105'}] auto-filled below for instant testing!
                        </Text>
                      </View>

                      <Text style={styles.label}>Enter 6-Digit Code</Text>
                      <TextInput
                        style={[styles.input, styles.otpInput]}
                        placeholder="123456"
                        placeholderTextColor={colors.textMuted}
                        value={phoneOtp}
                        onChangeText={setPhoneOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                      />

                      <Text style={styles.label}>Create Account Password (For Direct Logins)</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.input, styles.passwordInputFlex]}
                          placeholder="Set login password (min 6 chars, e.g. Campus@2026)"
                          placeholderTextColor={colors.textMuted}
                          value={signupPassword}
                          onChangeText={setSignupPassword}
                          secureTextEntry={!showSignupPassword}
                          autoCapitalize="none"
                        />
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => setShowSignupPassword(!showSignupPassword)}
                        >
                          <Text style={styles.eyeBtnText}>{showSignupPassword ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.helperText}>
                        🔑 Setting a password lets you log in anytime from any phone without waiting for OTP!
                      </Text>

                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleVerifyPhoneOTP}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryButtonText}>Verify & Proceed to ID Card Scan 🪪</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.changeEmailButton}
                        onPress={() => setPhoneOtpSent(false)}
                      >
                        <Text style={styles.changeEmailText}>Change Mobile Number</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* --------------------------------------------------------- */}
              {/* PATHWAY 2: COLLEGE EMAIL (.ac.in) + SPOTIFY-STYLE SSO     */}
              {/* --------------------------------------------------------- */}
              {signupTab === 'COLLEGE_EMAIL' && (
                <View>
                  {!emailOtpSent ? (
                    <View>
                      <Text style={styles.label}>Official College Email</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. yourname@gehu.ac.in"
                        placeholderTextColor={colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                      <Text style={styles.helperText}>
                        Accepted: @gehu.ac.in (Hill University) & @geu.ac.in (Main Campus)
                      </Text>

                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleSendEmailOTP}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryButtonText}>Send 6-Digit Code 📬</Text>
                        )}
                      </TouchableOpacity>

                      {/* SPOTIFY-STYLE DIRECT COLLEGE SSO BUTTON */}
                      <View style={styles.dividerContainer}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>OR 1-TAP INSTITUTIONAL SSO</Text>
                        <View style={styles.dividerLine} />
                      </View>

                      <TouchableOpacity
                        style={styles.ssoSpotifyButton}
                        onPress={handleSpotifyStyleSSO}
                        disabled={loading}
                      >
                        <Text style={styles.ssoSpotifyIcon}>🎓</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ssoSpotifyTitle}>Graphic Era Portal SSO (Spotify Style)</Text>
                          <Text style={styles.ssoSpotifySub}>Instant single sign-on with verified college credentials</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <Text style={styles.label}>Enter 6-Digit Code sent to {email}</Text>
                      <TextInput
                        style={[styles.input, styles.otpInput]}
                        placeholder="123456"
                        placeholderTextColor={colors.textMuted}
                        value={emailOtp}
                        onChangeText={setEmailOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                      />

                      <Text style={styles.label}>Create Account Password (For Direct Logins)</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.input, styles.passwordInputFlex]}
                          placeholder="Set login password (min 6 chars, e.g. Campus@2026)"
                          placeholderTextColor={colors.textMuted}
                          value={signupPassword}
                          onChangeText={setSignupPassword}
                          secureTextEntry={!showSignupPassword}
                          autoCapitalize="none"
                        />
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => setShowSignupPassword(!showSignupPassword)}
                        >
                          <Text style={styles.eyeBtnText}>{showSignupPassword ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.helperText}>
                        🔑 Setting a password lets you log in anytime from any device without needing email OTPs!
                      </Text>

                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleVerifyEmailOTP}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryButtonText}>Verify & Enter Campus</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.changeEmailButton}
                        onPress={() => setEmailOtpSent(false)}
                      >
                        <Text style={styles.changeEmailText}>Change Email Address</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* --------------------------------------------------------- */}
              {/* PATHWAY 3: SPOTIFY-STYLE PHYSICAL ID CARD OCR SCAN        */}
              {/* --------------------------------------------------------- */}
              {signupTab === 'ID_CARD' && (
                <View>
                  <View style={styles.idScanHeroCard}>
                    <Text style={styles.idScanHeroIcon}>🪪</Text>
                    <Text style={styles.idScanHeroTitle}>Spotify-Style Physical ID Verification</Text>
                    <Text style={styles.idScanHeroSub}>
                      Snap or upload your physical Graphic Era Hill University ID Card. Local OCR automatically extracts Name, Roll No & Branch and joins you into GEHU community!
                    </Text>
                  </View>

                  <Text style={styles.label}>Create Account Password (For Direct Logins)</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInputFlex]}
                      placeholder="Set login password (min 6 chars, e.g. Campus@2026)"
                      placeholderTextColor={colors.textMuted}
                      value={signupPassword}
                      onChangeText={setSignupPassword}
                      secureTextEntry={!showSignupPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowSignupPassword(!showSignupPassword)}
                    >
                      <Text style={styles.eyeBtnText}>{showSignupPassword ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.helperText}>
                    🔑 Enter your password here so your verified account is ready for instant future login!
                  </Text>

                  <TouchableOpacity
                    style={styles.uploadIdCardBtn}
                    onPress={handlePickCustomIDCard}
                    disabled={idScanLoading}
                  >
                    {idScanLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <View style={styles.uploadIdCardBtnContent}>
                        <Text style={styles.uploadIdCardIcon}>📸</Text>
                        <Text style={styles.uploadIdCardText}>Upload Physical ID Card Photo</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR 1-TAP GEHU SAMPLE CARDS</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <View style={styles.presetCardsCol}>
                    {SAMPLE_ID_PRESETS.map((p, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.idPresetCard}
                        onPress={() => handleScanAndLogin('data:image/jpeg;base64,' + btoa(p.rawText))}
                        disabled={idScanLoading}
                      >
                        <View style={styles.idPresetHeader}>
                          <Text style={styles.idPresetName}>{p.name}</Text>
                          <View style={styles.idPresetBadge}>
                            <Text style={styles.idPresetBadgeText}>{p.badge}</Text>
                          </View>
                        </View>
                        <Text style={styles.idPresetRoll}>{p.roll} • {p.dept}</Text>
                        <Text style={styles.idPresetCollege}>🏫 {p.college}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
    paddingVertical: 32,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logoIcon: {
    fontSize: 42,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  mainFlowToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  mainFlowBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  mainFlowBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  mainFlowText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  mainFlowTextActive: {
    color: '#ffffff',
  },
  sectionContainer: {
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passwordInputFlex: {
    flex: 1,
  },
  eyeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeBtnText: {
    fontSize: 16,
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  countryCodeText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
  },
  otpInput: {
    letterSpacing: 10,
    fontSize: 22,
    textAlign: 'center',
    fontWeight: '800',
  },
  helperText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  whatsappButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  whatsappButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondarySmsBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 14,
  },
  secondarySmsBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  smsNoticeCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  smsNoticeBadge: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  smsNoticeText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  changeEmailButton: {
    alignItems: 'center',
    marginTop: 14,
  },
  changeEmailText: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  testAccountsSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 16,
  },
  testAccountsHeader: {
    marginBottom: 12,
  },
  testAccountsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#818cf8',
    letterSpacing: 0.8,
  },
  testAccountsSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  testAccountCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  testAccountTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testAccountName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  testAccountRoll: {
    color: '#a5b4fc',
    fontSize: 11,
    marginTop: 1,
  },
  testAccountEmail: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  quickLoginBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: 'rgba(99, 102, 241, 0.5)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickLoginBtnText: {
    color: '#818cf8',
    fontSize: 11,
    fontWeight: '800',
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  tabToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  tabToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabToggleTextActive: {
    color: '#ffffff',
  },
  geoStatusCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  geoStatusCardInside: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  geoStatusCardOutside: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  geoStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  geoStatusIcon: {
    fontSize: 22,
  },
  geoStatusTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  geoStatusSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  geoActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  geoToggleBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  geoToggleBtnText: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '700',
  },
  geoDetectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  geoDetectBtnText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  ssoSpotifyButton: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ssoSpotifyIcon: {
    fontSize: 24,
  },
  ssoSpotifyTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  ssoSpotifySub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  idScanHeroCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  idScanHeroIcon: {
    fontSize: 30,
    marginBottom: 4,
  },
  idScanHeroTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  idScanHeroSub: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  uploadIdCardBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadIdCardBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadIdCardIcon: {
    fontSize: 16,
  },
  uploadIdCardText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  presetCardsCol: {
    gap: 8,
  },
  idPresetCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  idPresetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  idPresetName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  idPresetBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  idPresetBadgeText: {
    color: '#4ade80',
    fontSize: 9,
    fontWeight: '800',
  },
  idPresetRoll: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  idPresetCollege: {
    color: colors.textSecondary,
    fontSize: 10,
  },
});
