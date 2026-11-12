import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Ticket,
  UploadCloud,
  X,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import {
  User,
  authService,
  buildMicrosoftAuthUrl,
  setMsOAuthMode,
} from '../../services/authService';
import { profileService } from '../../services/profileService';

interface VerificationGateModalProps {
  visible: boolean;
  currentUser: User | null;
  reason?: string;
  onClose: () => void;
  onVerified: (updatedUser: User) => void;
}

export const VerificationGateModal: React.FC<VerificationGateModalProps> = ({
  visible,
  currentUser,
  reason,
  onClose,
  onVerified,
}) => {
  const { colors, isDark } = useTheme();

  // Path A: Invite Code
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Path B: Microsoft SSO Link
  const [msLoading, setMsLoading] = useState(false);
  const [showTokenPaste, setShowTokenPaste] = useState(false);
  const [msTokenInput, setMsTokenInput] = useState('');

  // Path C: Physical ID Upload (Pending Admin Review)
  const [rollNumberInput, setRollNumberInput] = useState('');
  const [colleges, setColleges] = useState<Array<{ id: number; name: string; short_name: string }>>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<number | undefined>(undefined);
  const [idLoading, setIdLoading] = useState(false);

  // Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const profilePromise = currentUser?.profile_completed
      ? profileService.getMyProfile().catch(() => null)
      : Promise.resolve(null);
    Promise.all([profileService.getColleges().catch(() => []), profilePromise]).then(
      ([list, myProfile]) => {
        if (list?.length) {
          setColleges(list);
          if (!selectedCollegeId) {
            const profCollegeId = myProfile?.college ? Number(myProfile.college) : undefined;
            const preferred =
              (profCollegeId && list.find((c: any) => c.id === profCollegeId)) ||
              list.find((c: any) => c.short_name === 'GEU' || c.name === 'Graphic Era University') ||
              list[0];
            if (preferred) {
              setSelectedCollegeId(preferred.id);
            }
          }
        }
      }
    );
  }, [visible]);

  const handleRedeemInvite = async () => {
    const clean = inviteCode.trim().toUpperCase();
    if (!clean) {
      setErrorMsg('Enter a campus invite code (e.g. GEU2026) or a friend’s code.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setInviteLoading(true);
    try {
      const res = await authService.redeemInviteCode(clean);
      setSuccessMsg(res.message || 'Campus access unlocked!');
      setInviteCode('');
      if (res.user) {
        onVerified(res.user);
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err?.message ||
          'Invalid or expired invite code.'
      );
    } finally {
      setInviteLoading(false);
    }
  };

  const handleLinkMicrosoft = async (tokenOverride?: string) => {
    const token = (tokenOverride ?? msTokenInput).trim();
    if (token) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setMsLoading(true);
      try {
        const res = await authService.linkWithMicrosoft(token);
        setSuccessMsg(res.message || 'College Microsoft ID verified!');
        setMsTokenInput('');
        setShowTokenPaste(false);
        if (res.user) {
          onVerified(res.user);
        }
        setTimeout(() => {
          onClose();
        }, 650);
      } catch (err: any) {
        setErrorMsg(
          err?.response?.data?.error ||
            err?.response?.data?.detail ||
            err?.message ||
            'Could not verify Microsoft ID token.'
        );
      } finally {
        setMsLoading(false);
      }
      return;
    }

    setErrorMsg(null);
    await setMsOAuthMode('link');
    const authUrl = buildMicrosoftAuthUrl();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = authUrl;
    } else {
      try {
        await Linking.openURL(authUrl);
        setShowTokenPaste(true);
      } catch {
        setShowTokenPaste(true);
      }
    }
  };

  const submitIdCardBase64 = async (base64Data: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIdLoading(true);
    try {
      const res = await profileService.scanIdCard(base64Data, {
        admission_number: rollNumberInput.trim() || undefined,
        college_id: selectedCollegeId,
      });
      if (res.user) {
        await authService.updateCurrentUser(res.user);
        onVerified({ ...(currentUser as User), ...res.user });
      }
      setSuccessMsg(
        res.message ||
          'ID card photo submitted for admin review. You can keep reading the feed until approved, or enter an invite code above for immediate access.'
      );
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err?.message ||
          'Failed to upload ID card image. Ensure photo is clear JPG/PNG.'
      );
    } finally {
      setIdLoading(false);
    }
  };

  const triggerWebFilePick = (capture: boolean) => {
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
            const reader = new FileReader();
            reader.onload = () => {
              const img = new (window as any).Image();
              img.onload = () => {
                const maxDim = 1600;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                  if (w > h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                  } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                  }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0, w, h);
                  submitIdCardBase64(canvas.toDataURL('image/jpeg', 0.85));
                } else {
                  submitIdCardBase64(reader.result as string);
                }
              };
              img.onerror = () => submitIdCardBase64(reader.result as string);
              img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
          }
          try {
            document.body.removeChild(input);
          } catch {}
        };
        input.click();
      } catch (err) {
        console.warn('File picker error', err);
      }
    }, 50);
  };

  const handleCameraPick = async () => {
    if (Platform.OS === 'web') {
      triggerWebFilePick(true);
      return;
    }
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Camera permission is required to photograph your ID card.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        base64: true,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        await submitIdCardBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Unable to open camera.');
    }
  };

  const handleGalleryPick = async () => {
    if (Platform.OS === 'web') {
      triggerWebFilePick(false);
      return;
    }
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Photo library permission is required to upload your ID card.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        await submitIdCardBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Unable to select image.');
    }
  };

  const isIdPending =
    currentUser?.verification_tier === 'SEMI_VERIFIED' ||
    currentUser?.verification_method === 'ID_CARD_OCR';

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.cardBorder },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.hairline }]}>
            <View style={styles.headerTitleRow}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: isDark
                      ? 'rgba(94, 106, 210, 0.16)'
                      : 'rgba(79, 70, 229, 0.12)',
                  },
                ]}
              >
                <ShieldCheck size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Verify Campus Identity
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {reason ||
                    'Read-only mode active. Verify once to post, confess, vote & message.'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Current Status Banner */}
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isIdPending
                    ? isDark
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(217, 119, 6, 0.08)'
                    : isDark
                    ? 'rgba(138, 143, 152, 0.1)'
                    : '#f1f5f9',
                  borderColor: isIdPending
                    ? 'rgba(245, 158, 11, 0.35)'
                    : colors.cardBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isIdPending ? colors.warning : colors.textMuted },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: isIdPending ? colors.warning : colors.textSecondary },
                ]}
              >
                {isIdPending
                  ? 'ID Card submitted — waiting for admin approval (Read-Only)'
                  : 'Unverified Email Account — Browsing in Read-Only mode'}
              </Text>
            </View>

            {/* Feedback Banners */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <AlertCircle size={15} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
              </View>
            )}

            {successMsg && (
              <View style={styles.successBox}>
                <CheckCircle2 size={15} color={colors.success} />
                <Text style={[styles.successText, { color: colors.success }]}>{successMsg}</Text>
              </View>
            )}

            {/* PATH A: CAMPUS INVITE CODE */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Ticket size={15} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  1. Enter Campus Invite Code
                </Text>
                <View style={styles.fastTag}>
                  <Text style={styles.fastTagText}>Instant</Text>
                </View>
              </View>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
                Got a batch code (like GEU2026) or invite from a verified classmate? Enter it below.
              </Text>
              <View style={styles.inviteRow}>
                <TextInput
                  style={[
                    styles.inviteInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.cardBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="e.g. GEU2026"
                  placeholderTextColor={colors.textTertiary}
                  value={inviteCode}
                  onChangeText={(txt) => {
                    setInviteCode(txt.toUpperCase());
                    if (errorMsg) setErrorMsg(null);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={24}
                  onSubmitEditing={handleRedeemInvite}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={handleRedeemInvite}
                  disabled={inviteLoading}
                  activeOpacity={0.85}
                >
                  {inviteLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Unlock</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* PATH B: LINK MICROSOFT COLLEGE ID */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.sectionHeader}>
                <View style={styles.msGrid}>
                  <View style={[styles.msCell, { backgroundColor: '#F25022' }]} />
                  <View style={[styles.msCell, { backgroundColor: '#7FBA00' }]} />
                  <View style={[styles.msCell, { backgroundColor: '#00A4EF' }]} />
                  <View style={[styles.msCell, { backgroundColor: '#FFB900' }]} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  2. Link Microsoft College ID
                </Text>
                <View style={styles.greenTag}>
                  <Text style={styles.greenTagText}>Verified Badge</Text>
                </View>
              </View>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
                Sign in with your @geu.ac.in / @gehu.ac.in Outlook account to upgrade this profile without creating a duplicate account.
              </Text>

              <TouchableOpacity
                style={[styles.msActionBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleLinkMicrosoft()}
                disabled={msLoading}
                activeOpacity={0.85}
              >
                {msLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <View style={styles.msActionContent}>
                    <Text style={styles.msActionText}>Link College Microsoft ID</Text>
                    <ArrowRight size={15} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowTokenPaste((prev) => !prev)}
                style={styles.tokenToggleLink}
              >
                <KeyRound size={12} color={colors.primary} />
                <Text style={[styles.tokenToggleText, { color: colors.primary }]}>
                  {showTokenPaste ? 'Hide token paste box' : 'Have an ID token? Paste token'}
                </Text>
              </TouchableOpacity>

              {showTokenPaste && (
                <View style={styles.tokenPasteBox}>
                  <TextInput
                    style={[
                      styles.tokenInput,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.cardBorder,
                        color: colors.textPrimary,
                      },
                    ]}
                    placeholder="Paste Microsoft id_token JWT..."
                    placeholderTextColor={colors.textTertiary}
                    value={msTokenInput}
                    onChangeText={setMsTokenInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    numberOfLines={2}
                  />
                  <TouchableOpacity
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => handleLinkMicrosoft(msTokenInput)}
                    disabled={msLoading}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                      Verify & Link Token
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* PATH C: PHYSICAL ID CARD UPLOAD (ADMIN REVIEW) */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Camera size={15} color={colors.warning} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  3. Upload Student ID Card
                </Text>
                <View style={styles.amberTag}>
                  <Text style={styles.amberTagText}>Admin Review</Text>
                </View>
              </View>
              <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
                No invite code or Outlook login? Upload a clear photo of your ID card. Posting unlocks as soon as an admin approves it.
              </Text>

              {colleges.length > 0 && (
                <View style={styles.collegeChipsRow}>
                  {colleges.map((col) => {
                    const active = selectedCollegeId === col.id;
                    return (
                      <TouchableOpacity
                        key={col.id}
                        style={[
                          styles.collegeChip,
                          {
                            backgroundColor: active
                              ? isDark
                                ? 'rgba(94, 106, 210, 0.2)'
                                : 'rgba(79, 70, 229, 0.1)'
                              : colors.surface,
                            borderColor: active ? colors.primary : colors.cardBorder,
                          },
                        ]}
                        onPress={() => setSelectedCollegeId(col.id)}
                      >
                        <Text
                          style={[
                            styles.collegeChipText,
                            { color: active ? colors.primary : colors.textSecondary },
                          ]}
                        >
                          {col.short_name || col.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <TextInput
                style={[
                  styles.rollInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.cardBorder,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Roll / Admission No. (optional, e.g. 2313812137)"
                placeholderTextColor={colors.textTertiary}
                value={rollNumberInput}
                onChangeText={setRollNumberInput}
                autoCapitalize="characters"
              />

              <View style={styles.idBtnGrid}>
                <TouchableOpacity
                  style={[
                    styles.idActionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                  ]}
                  onPress={handleCameraPick}
                  disabled={idLoading}
                >
                  {idLoading ? (
                    <ActivityIndicator size="small" color={colors.warning} />
                  ) : (
                    <>
                      <Camera size={15} color={colors.warning} />
                      <Text style={[styles.idActionText, { color: colors.textPrimary }]}>
                        Take ID Photo
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.idActionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                  ]}
                  onPress={handleGalleryPick}
                  disabled={idLoading}
                >
                  <UploadCloud size={15} color={colors.textSecondary} />
                  <Text style={[styles.idActionText, { color: colors.textPrimary }]}>
                    Upload Image
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    width: '100%',
  },
  bodyContent: {
    padding: 16,
    gap: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(39, 166, 68, 0.35)',
    backgroundColor: 'rgba(39, 166, 68, 0.1)',
  },
  successText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 13,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  fastTag: {
    backgroundColor: 'rgba(94, 106, 210, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  fastTagText: {
    color: '#828fff',
    fontSize: 10,
    fontWeight: '700',
  },
  greenTag: {
    backgroundColor: 'rgba(39, 166, 68, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  greenTagText: {
    color: '#27a644',
    fontSize: 10,
    fontWeight: '700',
  },
  amberTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  amberTagText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inviteInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  primaryBtn: {
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 78,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  msGrid: {
    width: 14,
    height: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  msCell: {
    width: 6,
    height: 6,
    borderRadius: 1,
  },
  msActionBtn: {
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  msActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  tokenToggleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
  },
  tokenToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  tokenPasteBox: {
    gap: 8,
    marginTop: 2,
  },
  tokenInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 9,
    fontSize: 11.5,
    minHeight: 54,
    textAlignVertical: 'top',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  collegeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  collegeChip: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  collegeChipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  rollInput: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 12.5,
  },
  idBtnGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  idActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  idActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
