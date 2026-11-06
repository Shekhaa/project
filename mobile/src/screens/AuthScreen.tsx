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

// Microsoft Entra ID (Azure AD) Client ID for CampusConnect
const AZURE_CLIENT_ID = process.env.EXPO_PUBLIC_AZURE_CLIENT_ID || '3b64e29f-bcab-4aee-9fa2-11bb605f161a';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  // Microsoft Entra ID (College SSO) State
  const [ssoTokenModal, setSsoTokenModal] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);

  // Common UI & ID Card Scan State
  const [loading, setLoading] = useState(false);
  const [idScanLoading, setIdScanLoading] = useState(false);

  // Safe Base64 encoding helper for cross-platform JWT simulation
  const createDevStudentToken = (email: string, name: string) => {
    const encodeB64 = (str: string) => {
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
    const header = encodeB64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '');
    const claims = encodeB64(
      JSON.stringify({
        email,
        name,
        tid: 'graphic-era-entra-id',
        sub: 'student-' + email.split('@')[0],
      })
    ).replace(/=/g, '');
    return `${header}.${claims}.dummy_signature`;
  };

  // 4. MICROSOFT ENTRA ID INSTITUTIONAL COLLEGE SSO (Zero OTP, 1-Tap Student Verification)
  const handleMicrosoftSSO = async (passedToken?: string) => {
    const tokenToUse = passedToken || manualTokenInput.trim();
    if (tokenToUse) {
      setSsoLoading(true);
      try {
        const res = await authService.loginWithMicrosoft(tokenToUse);
        setSsoTokenModal(false);
        setManualTokenInput('');
        Alert.alert(
          'University Identity Verified! 🎓',
          `Welcome, ${res.user.full_name || 'Student'}!\nVerified Email: ${res.user.email}\nRoll Number: ${res.detected_student?.roll_number || 'Verified'}\nCollege: ${res.detected_student?.college_name || 'Graphic Era University'}`
        );
        onLoginSuccess(res.user);
      } catch (err: any) {
        Alert.alert(
          'SSO Verification Failed',
          err.response?.data?.error || err.message || 'Token verification failed. Please try again.'
        );
      } finally {
        setSsoLoading(false);
      }
      return;
    }

    const clientId = AZURE_CLIENT_ID;
    let redirectUri = 'https://jwt.ms';
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
      if (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('project-mobile')) {
        redirectUri = `${window.location.origin}/`;
      }
    }
    const scopes = encodeURIComponent('openid profile email');

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=id_token&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scopes}&response_mode=fragment&nonce=${Date.now()}&prompt=select_account`;

    try {
      if (Platform.OS === 'web') {
        window.location.href = authUrl;
      } else {
        await Linking.openURL(authUrl);
        setSsoTokenModal(true);
      }
    } catch {
      setSsoTokenModal(true);
    }
  };

  // Auto-detect OAuth redirect if returning with token in hash (Vercel / Web)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token') || params.get('access_token');
        if (idToken) {
          handleMicrosoftSSO(idToken);
        }
      } catch {}
    }
  }, []);

  // Backward compatibility alias for Spotify SSO button
  const handleSpotifyStyleSSO = () => handleMicrosoftSSO();

  // 5. PHYSICAL ID CARD OCR LOGIN
  const handleScanAndLogin = async (base64Data: string) => {
    setIdScanLoading(true);
    try {
      const res = await authService.loginWithIDCard(base64Data);
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

  const handlePickCustomIDCard = async () => {
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
      const ImagePicker = require('expo-image-picker');
      Alert.alert(
        'Upload Physical ID Card',
        'Choose how to scan your College ID Card:',
        [
          {
            text: '📸 Take Photo with Camera',
            onPress: async () => {
              try {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Permission Needed', 'Camera permission is required to photograph your ID card.');
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  quality: 0.9,
                  base64: true,
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
            },
          },
          {
            text: '🖼️ Choose from Gallery',
            onPress: async () => {
              try {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Permission Needed', 'Photo gallery permission is required.');
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  quality: 0.9,
                  base64: true,
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
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
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

          {/* ========================================================= */}
          {/* HERO: OFFICIAL 1-TAP MICROSOFT COLLEGE SSO (RECOMMENDED)  */}
          {/* ========================================================= */}
          <View style={styles.linearSSOCard}>
            <View style={styles.linearSSOBadgeRow}>
              <View style={styles.linearSSOBadge}>
                <View style={styles.linearSSODot} />
                <Text style={styles.linearSSOBadgeText}>OFFICIAL GEU / GEHU SSO</Text>
              </View>
              <Text style={styles.linearSSOZeroOtp}>Zero OTP • 100% Real Students</Text>
            </View>

            <Text style={styles.linearSSOTitle}>Sign in with University Outlook</Text>
            <Text style={styles.linearSSODesc}>
              Authenticate directly via Graphic Era Entra ID. We auto-verify your name, university roll number & admission batch.
            </Text>

            <TouchableOpacity
              style={styles.linearSSOButton}
              onPress={() => handleMicrosoftSSO()}
              disabled={loading || ssoLoading}
              activeOpacity={0.88}
            >
              {ssoLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <View style={styles.linearSSOBtnContent}>
                  <View style={styles.msLogoGrid}>
                    <View style={[styles.msLogoCell, { backgroundColor: '#F25022' }]} />
                    <View style={[styles.msLogoCell, { backgroundColor: '#7FBA00' }]} />
                    <View style={[styles.msLogoCell, { backgroundColor: '#00A4EF' }]} />
                    <View style={[styles.msLogoCell, { backgroundColor: '#FFB900' }]} />
                  </View>
                  <Text style={styles.linearSSOBtnText}>Continue with College ID (@geu.ac.in)</Text>
                  <Text style={styles.linearSSOArrow}>→</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.linearSSOFeatures}>
              <Text style={styles.linearSSOFeatureItem}>✓ 🛡️ Green Verified Badge</Text>
              <Text style={styles.linearSSOFeatureDot}>•</Text>
              <Text style={styles.linearSSOFeatureItem}>✓ Auto Roll No. Extraction</Text>
              <Text style={styles.linearSSOFeatureDot}>•</Text>
              <TouchableOpacity onPress={() => setSsoTokenModal(true)}>
                <Text style={styles.linearSSODevLink}>⚡ Dev Test / Token</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Hairline Divider */}
          <View style={styles.linearDividerRow}>
            <View style={styles.linearDividerLine} />
            <Text style={styles.linearDividerText}>OR OPTION 2: PHYSICAL ID VERIFICATION</Text>
            <View style={styles.linearDividerLine} />
          </View>

          {/* OPTION 2: PHYSICAL COLLEGE ID CARD SCAN (YELLOW BADGE / SEMI-VERIFIED) */}
          <View style={styles.idCardScanCard}>
            <View style={styles.idCardBadgeRow}>
              <View style={styles.idCardYellowBadge}>
                <View style={styles.idCardYellowDot} />
                <Text style={styles.idCardYellowBadgeText}>SEMI-VERIFIED (YELLOW BADGE)</Text>
              </View>
              <Text style={styles.idCardYellowSub}>Under Review</Text>
            </View>

            <Text style={styles.idCardTitle}>Scan Physical College ID Card</Text>
            <Text style={styles.idCardDesc}>
              Upload your Graphic Era student ID card photo. Our local OCR extracts your name, roll number, and department. Once onboarded, complete your campus handle and profile.
            </Text>

            <TouchableOpacity
              style={styles.idCardUploadBtn}
              onPress={handlePickCustomIDCard}
              disabled={idScanLoading}
              activeOpacity={0.88}
            >
              {idScanLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <View style={styles.idCardBtnContent}>
                  <Text style={styles.idCardBtnIcon}>📷</Text>
                  <Text style={styles.idCardBtnText}>Upload Student ID Card Photo</Text>
                  <Text style={styles.linearSSOArrow}>→</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Quick Sample ID Presets for Instant Testing */}
            <View style={styles.testPresetsBox}>
              <Text style={styles.testPresetsHeading}>INSTANT TEST ID CARDS (ONE-TAP DEMO)</Text>
              <View style={styles.testPresetsGrid}>
                {SAMPLE_ID_PRESETS.map((p, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.presetPillCard}
                    onPress={() => handleScanAndLogin('data:image/jpeg;base64,' + btoa(p.rawText))}
                    disabled={idScanLoading}
                  >
                    <View style={styles.presetPillTop}>
                      <Text style={styles.presetPillName}>{p.name}</Text>
                      <View style={styles.presetYellowTag}>
                        <Text style={styles.presetYellowTagText}>🟡 Review</Text>
                      </View>
                    </View>
                    <Text style={styles.presetPillMeta}>{p.roll} • {p.dept}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ========================================================= */}
      {/* LINEAR-STYLED MICROSOFT ENTRA ID DEV & TOKEN MODAL        */}
      {/* ========================================================= */}
      <Modal
        visible={ssoTokenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSsoTokenModal(false)}
      >
        <View style={styles.linearModalOverlay}>
          <View style={styles.linearModalContent}>
            <View style={styles.linearModalHeader}>
              <View style={styles.linearModalTitleRow}>
                <View style={styles.msLogoGridSmall}>
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#F25022' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#7FBA00' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#00A4EF' }]} />
                  <View style={[styles.msLogoCellSmall, { backgroundColor: '#FFB900' }]} />
                </View>
                <Text style={styles.linearModalTitle}>Microsoft SSO Verification</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSsoTokenModal(false)}
                style={styles.linearModalCloseBtn}
              >
                <Text style={styles.linearModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.linearModalSub}>
                Test single-tap college authentication. Verified claims extract student name, roll number, and official admission year.
              </Text>

              {/* Action 1: Instant Test as Chandra Shekhar Singh Rana */}
              <Text style={styles.linearModalSectionLabel}>INSTANT 1-TAP VERIFICATION (TEST)</Text>
              <TouchableOpacity
                style={styles.linearTestProfileCard}
                onPress={() => {
                  const token = createDevStudentToken(
                    '2313812137@geu.ac.in',
                    'Chandra Shekhar Singh Rana'
                  );
                  handleMicrosoftSSO(token);
                }}
                disabled={ssoLoading}
              >
                <View style={styles.linearTestProfileTop}>
                  <Text style={styles.linearTestProfileName}>Chandra Shekhar Singh Rana</Text>
                  <View style={styles.linearVerifiedBadge}>
                    <Text style={styles.linearVerifiedBadgeText}>GEU Verified</Text>
                  </View>
                </View>
                <Text style={styles.linearTestProfileMeta}>
                  Roll: 2313812137 • Batch: 2023 • @geu.ac.in
                </Text>
                <Text style={styles.linearTestProfileCta}>Tap to Sign In as Chandra Shekhar →</Text>
              </TouchableOpacity>

              {/* Action 2: Secondary Test Profile (Priya Rawat) */}
              <TouchableOpacity
                style={[styles.linearTestProfileCard, { marginTop: 8 }]}
                onPress={() => {
                  const token = createDevStudentToken(
                    '2313812140@geu.ac.in',
                    'Priya Rawat'
                  );
                  handleMicrosoftSSO(token);
                }}
                disabled={ssoLoading}
              >
                <View style={styles.linearTestProfileTop}>
                  <Text style={styles.linearTestProfileName}>Priya Rawat</Text>
                  <View style={styles.linearVerifiedBadge}>
                    <Text style={styles.linearVerifiedBadgeText}>GEU Verified</Text>
                  </View>
                </View>
                <Text style={styles.linearTestProfileMeta}>
                  Roll: 2313812140 • Batch: 2023 • @geu.ac.in
                </Text>
                <Text style={styles.linearTestProfileCta}>Tap to Sign In as Priya →</Text>
              </TouchableOpacity>

              {/* Action 3: Direct Token Paste from jwt.ms */}
              <Text style={[styles.linearModalSectionLabel, { marginTop: 18 }]}>
                PASTE ID TOKEN (FROM JWT.MS / AZURE)
              </Text>
              <TextInput
                style={styles.linearModalInput}
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
                style={styles.linearModalPrimaryBtn}
                onPress={() => handleMicrosoftSSO()}
                disabled={ssoLoading}
              >
                {ssoLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.linearModalPrimaryBtnText}>Verify & Login with Token</Text>
                )}
              </TouchableOpacity>

              {/* Action 4: Launch Microsoft Browser Session */}
              <TouchableOpacity
                style={styles.linearModalSecondaryBtn}
                onPress={() => {
                  let redirectUri = 'https://jwt.ms';
                  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
                    if (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('project-mobile')) {
                      redirectUri = `${window.location.origin}/`;
                    }
                  }
                  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${AZURE_CLIENT_ID}&response_type=id_token&redirect_uri=${encodeURIComponent(
                    redirectUri
                  )}&scope=openid%20profile%20email&response_mode=fragment&nonce=${Date.now()}&prompt=select_account`;
                  if (Platform.OS === 'web') {
                    window.location.href = authUrl;
                  } else {
                    Linking.openURL(authUrl);
                  }
                }}
              >
                <Text style={styles.linearModalSecondaryBtnText}>🌐 Open Microsoft Login in Browser</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
    paddingVertical: 32,
    backgroundColor: colors.background,
    minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any,
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

  // =========================================================
  // LINEAR MICROSOFT SSO DESIGN TOKENS & COMPONENTS
  // =========================================================
  linearSSOCard: {
    backgroundColor: '#0f1011',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  linearSSOBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  linearSSOBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(39, 166, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(39, 166, 68, 0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 6,
  },
  linearSSODot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27a644',
  },
  linearSSOBadgeText: {
    color: '#27a644',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  linearSSOZeroOtp: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  linearSSOTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  linearSSODesc: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  linearSSOButton: {
    backgroundColor: '#5e6ad2',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linearSSOBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  msLogoGrid: {
    width: 16,
    height: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: 10,
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  msLogoCell: {
    width: 7,
    height: 7,
    borderRadius: 1,
  },
  linearSSOBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
    flex: 1,
    textAlign: 'center',
  },
  linearSSOArrow: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
  },
  linearSSOFeatures: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  linearSSOFeatureItem: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  linearSSOFeatureDot: {
    color: colors.hairlineStrong,
    fontSize: 10,
  },
  linearSSODevLink: {
    color: '#828fff',
    fontSize: 11,
    fontWeight: '600',
  },
  linearDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  linearDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#23252a',
  },
  linearDividerText: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  // Option 2 ID Card Scan Styles
  idCardScanCard: {
    backgroundColor: '#0f1011',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
  },
  idCardBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  idCardYellowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 6,
  },
  idCardYellowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
  idCardYellowBadgeText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  idCardYellowSub: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  idCardTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  idCardDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  idCardUploadBtn: {
    backgroundColor: '#1b1c1e',
    borderColor: '#2f3136',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idCardBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  idCardBtnIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  idCardBtnText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  testPresetsBox: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1c1d20',
  },
  testPresetsHeading: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  testPresetsGrid: {
    gap: 8,
  },
  presetPillCard: {
    backgroundColor: '#141516',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  presetPillTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetPillName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  presetYellowTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  presetYellowTagText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '700',
  },
  presetPillMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  // Modal Styles
  linearModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  linearModalContent: {
    backgroundColor: '#0f1011',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 12,
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    padding: 20,
  },
  linearModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linearModalTitleRow: {
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
  linearModalTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  linearModalCloseBtn: {
    padding: 4,
  },
  linearModalCloseText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  linearModalSub: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  linearModalSectionLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  linearTestProfileCard: {
    backgroundColor: '#141516',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  linearTestProfileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  linearTestProfileName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  linearVerifiedBadge: {
    backgroundColor: 'rgba(39, 166, 68, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(39, 166, 68, 0.25)',
  },
  linearVerifiedBadgeText: {
    color: '#27a644',
    fontSize: 9,
    fontWeight: '700',
  },
  linearTestProfileMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 6,
  },
  linearTestProfileCta: {
    color: '#828fff',
    fontSize: 11,
    fontWeight: '600',
  },
  linearModalInput: {
    backgroundColor: '#141516',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  linearModalPrimaryBtn: {
    backgroundColor: '#5e6ad2',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  linearModalPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  linearModalSecondaryBtn: {
    backgroundColor: '#141516',
    borderColor: '#23252a',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linearModalSecondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
