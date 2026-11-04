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
import { postService, Post } from '../../services/postService';
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
  Sparkles,
} from 'lucide-react-native';

interface StudentProfileModalProps {
  visible: boolean;
  userId: number | null;
  onClose: () => void;
  onOpenChat?: (conversation: any) => void;
  onOpenSocialList?: (type: 'followers' | 'following', targetUserId: number) => void;
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      loadProfile(userId);
    } else {
      setProfile(null);
      setPosts([]);
    }
  }, [visible, userId]);

  const loadProfile = async (targetId: number) => {
    try {
      setLoading(true);
      const data = await profileService.getPublicProfile(targetId);
      setProfile(data);
      if (data.can_view_content) {
        setPostsLoading(true);
        postService.getUserPosts(targetId)
          .then((res) => setPosts(res.results || []))
          .catch(() => setPosts([]))
          .finally(() => setPostsLoading(false));
      } else {
        setPosts([]);
      }
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

  // Endorse Handler (+1 Credibility toggle)
  const handleEndorseAction = async () => {
    if (!profile) return;
    try {
      setActionLoading(true);
      const res = await profileService.endorseStudent(profile.id);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              has_endorsed: res.endorsed,
              credibility_score: res.credibility_score,
            }
          : null
      );
      Alert.alert(res.endorsed ? 'Endorsed ⭐' : 'Endorsement Removed', res.message);
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update endorsement.');
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

                {/* Stats Row: Posts | Followers | Following | Credibility */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{profile.posts_count ?? 0}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>

                  <View style={styles.statDivider} />

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

                  <View style={styles.statBox}>
                    <Text style={[styles.statNumber, { color: '#fbbf24' }]}>⭐ {profile.credibility_score ?? 0}</Text>
                    <Text style={styles.statLabel}>Credibility</Text>
                  </View>
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
                          <Text style={styles.actionBtnMutedText}>Requested</Text>
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} color="#fff" />
                          <Text style={styles.actionBtnPrimaryText}>Follow</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Credibility Endorsement Action */}
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        profile.has_endorsed
                          ? styles.actionBtnEndorsed
                          : styles.actionBtnSecondary,
                      ]}
                      onPress={handleEndorseAction}
                      disabled={actionLoading}
                    >
                      <Sparkles size={16} color={profile.has_endorsed ? '#fbbf24' : '#8a8f98'} />
                      <Text style={profile.has_endorsed ? styles.actionBtnEndorsedText : styles.actionBtnSecondaryText}>
                        {profile.has_endorsed ? 'Endorsed' : 'Endorse'}
                      </Text>
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
                    <Lock size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.privateTitle}>This Account is Private</Text>
                  <Text style={styles.privateSub}>
                    Follow @{profile.username} to view their campus posts, cohort details, and academic community updates.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Academic Details */}
                  <View style={styles.detailsCard}>
                    <Text style={styles.detailsCardTitle}>Academic Information</Text>

                    <View style={styles.detailRow}>
                      <Building2 size={16} color={colors.textSecondary} style={styles.detailIcon} />
                      <View style={styles.detailTextCol}>
                        <Text style={styles.detailLabel}>College</Text>
                        <Text style={styles.detailValue}>
                          {profile.college_name} ({profile.college_short_name})
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailDivider} />

                    <View style={styles.detailRow}>
                      <GraduationCap size={16} color={colors.textSecondary} style={styles.detailIcon} />
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
                          <Calendar size={16} color={colors.textSecondary} style={styles.detailIcon} />
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
                          <BookOpen size={16} color={colors.textSecondary} style={styles.detailIcon} />
                          <View style={styles.detailTextCol}>
                            <Text style={styles.detailLabel}>Admission / Roll No</Text>
                            <Text style={styles.detailValue}>{profile.admission_number}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>

                  {/* Authorized Student Posts */}
                  <View style={styles.postsCard}>
                    <Text style={styles.detailsCardTitle}>Posts ({posts.length})</Text>
                    {postsLoading ? (
                      <ActivityIndicator size="small" color="#38bdf8" style={{ marginVertical: 14 }} />
                    ) : posts.length === 0 ? (
                      <Text style={styles.noPostsText}>No posts yet.</Text>
                    ) : (
                      posts.map((p) => (
                        <View key={p.id} style={styles.miniPostCard}>
                          <View style={styles.miniPostTopRow}>
                            <Text style={styles.miniPostOrigin}>
                              {p.community_name
                                ? p.community_name
                                : p.author_college_name
                                ? p.author_college_name
                                : 'Campus Feed'}
                            </Text>
                            <Text style={styles.miniPostTime}>
                              {new Date(p.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Text>
                          </View>
                          {p.content ? (
                            <Text style={styles.miniPostContent} numberOfLines={3}>
                              {p.content}
                            </Text>
                          ) : null}
                          <View style={styles.miniPostStats}>
                            <Text style={styles.miniPostStat}>❤️ {p.likes_count || 0}</Text>
                            <Text style={styles.miniPostStat}>💬 {p.comments_count || 0}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
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
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    backgroundColor: colors.surfaceLight,
    padding: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
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
    backgroundColor: 'rgba(94, 106, 210, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.25)',
  },
  verifiedText: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '800',
  },
  semiVerifiedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
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
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.hairline,
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
    backgroundColor: colors.primary,
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnOutline: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionBtnOutlineText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnSecondary: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionBtnSecondaryText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnEndorsed: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  actionBtnEndorsedText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  actionBtnConnectedText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnAccent: {
    backgroundColor: colors.primary,
  },
  actionBtnAccentText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnMuted: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionBtnMutedText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  actionBtnMessage: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionBtnMessageText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
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
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    marginVertical: 10,
  },
  privateIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(94, 106, 210, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  privateTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  privateSub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  detailsCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
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
    backgroundColor: colors.cardBorder,
    marginVertical: 10,
  },
  postsCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: 14,
  },
  noPostsText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  miniPostCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  miniPostTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  miniPostOrigin: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  miniPostTime: {
    color: colors.textMuted,
    fontSize: 11,
  },
  miniPostContent: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  miniPostStats: {
    flexDirection: 'row',
    gap: 14,
  },
  miniPostStat: {
    color: colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
});
