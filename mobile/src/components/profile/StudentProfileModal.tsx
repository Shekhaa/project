import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { profileService, PublicProfile } from '../../services/profileService';
import { chatService } from '../../services/chatService';
import {
  X,
  Shield,
  Lock,
  UserPlus,
  UserCheck,
  UserX,
  MessageSquare,
  Building2,
  GraduationCap,
  BookOpen,
  Calendar,
  Users,
  AlertTriangle,
} from 'lucide-react-native';

interface StudentProfileModalProps {
  visible: boolean;
  userId: number | null;
  onClose: () => void;
  onOpenChat?: (conversation: any) => void;
  onOpenSocialList?: (type: 'followers' | 'following' | 'connections', targetUserId: number) => void;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  visible,
  userId,
  onClose,
  onOpenChat,
  onOpenSocialList,
}) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      loadProfile(userId);
    } else {
      setProfile(null);
    }
  }, [visible, userId]);

  const loadProfile = async (targetId: number) => {
    try {
      setLoading(true);
      const data = await profileService.getPublicProfile(targetId);
      setProfile(data);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not load student profile.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // Connection Handler
  const handleConnectionAction = async () => {
    if (!profile) return;
    try {
      setActionLoading(true);
      if (profile.connection_status === 'NOT_CONNECTED' || profile.connection_status === 'DECLINED') {
        const res = await profileService.sendConnectionRequest(profile.id);
        Alert.alert('Request Sent 🤝', res.message || 'Connection request sent.');
      } else if (profile.connection_status === 'REQUEST_SENT') {
        // Cancel request
        await profileService.removeConnection(profile.id);
        Alert.alert('Cancelled', 'Connection request was cancelled.');
      } else if (profile.connection_status === 'REQUEST_RECEIVED') {
        // Accept incoming request
        await profileService.respondConnection(profile.id, 'ACCEPT');
        Alert.alert('Connected! 🎉', `You and ${profile.full_name} are now connected.`);
      } else if (profile.connection_status === 'CONNECTED') {
        // Remove connection confirmation
        const confirmed = Platform.OS === 'web'
          ? (typeof window !== 'undefined' ? window.confirm(`Remove connection with ${profile.full_name}?`) : true)
          : await new Promise<boolean>((resolve) => {
              Alert.alert('Remove Connection', `Are you sure you want to remove ${profile.full_name} from your connections?`, [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });
        if (confirmed) {
          await profileService.removeConnection(profile.id);
          Alert.alert('Removed', 'Connection removed.');
        } else {
          setActionLoading(false);
          return;
        }
      }
      await loadProfile(profile.id);
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update connection.');
    } finally {
      setActionLoading(false);
    }
  };

  // Follow Handler
  const handleFollowAction = async () => {
    if (!profile) return;
    try {
      setActionLoading(true);
      if (profile.follow_status === 'NOT_FOLLOWING') {
        const res = await profileService.followUser(profile.id);
        if (res.follow_status === 'REQUEST_SENT') {
          Alert.alert('Follow Requested ⏳', 'This account is private. Your request has been sent for approval.');
        } else {
          Alert.alert('Following! 🎉', `You are now following ${profile.full_name}.`);
        }
      } else {
        // Unfollow
        const res = await profileService.unfollowUser(profile.id);
        Alert.alert('Unfollowed', res.message || `You unfollowed ${profile.full_name}.`);
      }
      await loadProfile(profile.id);
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update follow status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Message Handler
  const handleMessageAction = async () => {
    if (!profile) return;
    try {
      setActionLoading(true);
      const res: any = await chatService.startDirectChat(profile.email || String(profile.id));
      if (res.request_created) {
        Alert.alert(
          'Message Request Sent 📩',
          res.message || 'Your message request was submitted and is awaiting approval.'
        );
      } else if (onOpenChat) {
        onClose();
        onOpenChat(res);
      } else {
        Alert.alert('Direct Chat Ready 💬', 'Conversation is available in your messages.');
      }
    } catch (e: any) {
      Alert.alert('Message Failed', e.response?.data?.error || 'Could not initiate chat.');
    } finally {
      setActionLoading(false);
    }
  };

  // Block Handler
  const handleBlockAction = async () => {
    if (!profile) return;
    const isCurrentlyBlocked = profile.is_blocked;
    const confirmed = Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.confirm(isCurrentlyBlocked ? `Unblock ${profile.full_name}?` : `Block ${profile.full_name}? They won't be able to message you or view your profile.`) : true)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            isCurrentlyBlocked ? 'Unblock Student' : 'Block Student',
            isCurrentlyBlocked
              ? `Unblock ${profile.full_name}?`
              : `Are you sure you want to block ${profile.full_name}? They will no longer be able to message you, view your profile, or see your posts.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: isCurrentlyBlocked ? 'Unblock' : 'Block', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    try {
      setActionLoading(true);
      if (isCurrentlyBlocked) {
        await profileService.unblockUser(profile.id);
        Alert.alert('Unblocked', `${profile.full_name} has been unblocked.`);
      } else {
        await profileService.blockUser(profile.id);
        Alert.alert('Blocked', `${profile.full_name} has been blocked.`);
      }
      await loadProfile(profile.id);
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update block status.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!visible) return null;

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : (profile?.username || 'U').substring(0, 2).toUpperCase();

  const isSelf = profile?.connection_status === 'SELF';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Student Profile</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading profile details...</Text>
            </View>
          ) : !profile ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.emptyText}>Student profile not found.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {/* Profile Card Top */}
              <View style={styles.profileHero}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                  {profile.is_private_account && (
                    <View style={styles.lockBadge}>
                      <Lock size={12} color="#fff" />
                    </View>
                  )}
                </View>

                <View style={styles.nameRow}>
                  <Text style={styles.fullName}>{profile.full_name || 'Student'}</Text>
                  {profile.is_verified ? (
                    <View style={styles.verifiedBadge}>
                      <Shield size={13} color="#38bdf8" />
                      <Text style={styles.verifiedText}>VERIFIED</Text>
                    </View>
                  ) : (
                    <View style={styles.semiVerifiedBadge}>
                      <Text style={styles.semiVerifiedText}>SEMI-VERIFIED</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.username}>@{profile.username}</Text>

                {profile.bio ? (
                  <Text style={styles.bioText}>{profile.bio}</Text>
                ) : null}

                {/* Stats Row */}
                <View style={styles.statsRow}>
                  <TouchableOpacity
                    style={styles.statBox}
                    onPress={() => onOpenSocialList && onOpenSocialList('followers', profile.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.statNumber}>{profile.followers_count ?? 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  <TouchableOpacity
                    style={styles.statBox}
                    onPress={() => onOpenSocialList && onOpenSocialList('following', profile.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.statNumber}>{profile.following_count ?? 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  <TouchableOpacity
                    style={styles.statBox}
                    onPress={() => onOpenSocialList && onOpenSocialList('connections', profile.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.statNumber}>{profile.connections_count ?? 0}</Text>
                    <Text style={styles.statLabel}>Connections</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action Buttons for Non-Self */}
              {!isSelf && (
                <View style={styles.actionsContainer}>
                  <View style={styles.actionRow}>
                    {/* Follow Action */}
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        profile.follow_status === 'FOLLOWING'
                          ? styles.actionBtnOutline
                          : profile.follow_status === 'REQUEST_SENT'
                          ? styles.actionBtnMuted
                          : styles.actionBtnPrimary,
                      ]}
                      onPress={handleFollowAction}
                      disabled={actionLoading}
                    >
                      {profile.follow_status === 'FOLLOWING' ? (
                        <>
                          <UserCheck size={16} color="#38bdf8" />
                          <Text style={styles.actionBtnOutlineText}>Following</Text>
                        </>
                      ) : profile.follow_status === 'REQUEST_SENT' ? (
                        <>
                          <UserPlus size={16} color={colors.textSecondary} />
                          <Text style={styles.actionBtnMutedText}>Requested ⏳</Text>
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} color="#fff" />
                          <Text style={styles.actionBtnPrimaryText}>Follow</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Connect Action */}
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        profile.connection_status === 'CONNECTED'
                          ? styles.actionBtnConnected
                          : profile.connection_status === 'REQUEST_SENT'
                          ? styles.actionBtnMuted
                          : profile.connection_status === 'REQUEST_RECEIVED'
                          ? styles.actionBtnAccent
                          : styles.actionBtnSecondary,
                      ]}
                      onPress={handleConnectionAction}
                      disabled={actionLoading}
                    >
                      {profile.connection_status === 'CONNECTED' ? (
                        <>
                          <Users size={16} color="#10b981" />
                          <Text style={styles.actionBtnConnectedText}>Connected</Text>
                        </>
                      ) : profile.connection_status === 'REQUEST_SENT' ? (
                        <>
                          <Users size={16} color={colors.textSecondary} />
                          <Text style={styles.actionBtnMutedText}>Pending ⏳</Text>
                        </>
                      ) : profile.connection_status === 'REQUEST_RECEIVED' ? (
                        <>
                          <Users size={16} color="#fff" />
                          <Text style={styles.actionBtnAccentText}>Accept Connect</Text>
                        </>
                      ) : (
                        <>
                          <Users size={16} color="#38bdf8" />
                          <Text style={styles.actionBtnSecondaryText}>Connect</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Direct Message Action */}
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnMessage]}
                      onPress={handleMessageAction}
                      disabled={actionLoading}
                    >
                      <MessageSquare size={16} color="#fff" />
                      <Text style={styles.actionBtnMessageText}>Message</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Block / Unblock link */}
                  <TouchableOpacity
                    style={styles.blockRow}
                    onPress={handleBlockAction}
                    disabled={actionLoading}
                  >
                    <AlertTriangle size={14} color={profile.is_blocked ? '#10b981' : '#ef4444'} />
                    <Text style={profile.is_blocked ? styles.unblockText : styles.blockText}>
                      {profile.is_blocked ? 'Unblock Student' : 'Block Student'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Private Account Locked Card */}
              {!profile.can_view_content ? (
                <View style={styles.privateCard}>
                  <View style={styles.privateIconCircle}>
                    <Lock size={32} color="#38bdf8" />
                  </View>
                  <Text style={styles.privateTitle}>This Account is Private</Text>
                  <Text style={styles.privateSub}>
                    Follow @{profile.username} to view their campus posts, cohort details, and academic community updates.
                  </Text>
                </View>
              ) : (
                /* Academic Details */
                <View style={styles.detailsCard}>
                  <Text style={styles.detailsCardTitle}>Academic Information</Text>

                  <View style={styles.detailRow}>
                    <Building2 size={16} color="#38bdf8" style={styles.detailIcon} />
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailLabel}>College</Text>
                      <Text style={styles.detailValue}>
                        {profile.college_name} ({profile.college_short_name})
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailDivider} />

                  <View style={styles.detailRow}>
                    <GraduationCap size={16} color="#38bdf8" style={styles.detailIcon} />
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailLabel}>Course & Branch</Text>
                      <Text style={styles.detailValue}>
                        {profile.course_name} • {profile.branch_name}
                      </Text>
                    </View>
                  </View>

                  {profile.academic_year_name ? (
                    <>
                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <Calendar size={16} color="#38bdf8" style={styles.detailIcon} />
                        <View style={styles.detailTextCol}>
                          <Text style={styles.detailLabel}>Cohort</Text>
                          <Text style={styles.detailValue}>{profile.academic_year_name}</Text>
                        </View>
                      </View>
                    </>
                  ) : null}

                  {profile.admission_number ? (
                    <>
                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <BookOpen size={16} color="#38bdf8" style={styles.detailIcon} />
                        <View style={styles.detailTextCol}>
                          <Text style={styles.detailLabel}>Admission / Roll No</Text>
                          <Text style={styles.detailValue}>{profile.admission_number}</Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  profileHero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#334155',
    padding: 5,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 4,
  },
  fullName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  verifiedText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
  },
  semiVerifiedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  semiVerifiedText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
  },
  username: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 10,
  },
  bioText: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
  },
  actionsContainer: {
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  actionBtnPrimary: {
    backgroundColor: '#0284c7',
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnOutline: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  actionBtnOutlineText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  actionBtnSecondaryText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  actionBtnConnectedText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnAccent: {
    backgroundColor: '#10b981',
  },
  actionBtnAccentText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnMuted: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionBtnMutedText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnMessage: {
    backgroundColor: '#334155',
  },
  actionBtnMessageText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  blockText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  unblockText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  privateCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: 10,
  },
  privateIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  privateTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  privateSub: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  detailsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailsCardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  detailIcon: {
    marginTop: 2,
  },
  detailTextCol: {
    flex: 1,
  },
  detailLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 10,
  },
});
