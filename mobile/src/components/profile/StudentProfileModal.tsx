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
import { useTheme } from '../../theme/ThemeContext';
import { profileService, PublicProfile } from '../../services/profileService';
import { chatService } from '../../services/chatService';
import { postService, Post } from '../../services/postService';
import { UserAvatar } from '../common/UserAvatar';
import { showCrossPlatformAlert } from '../../utils/mediaUtils';
import {
  X,
  Shield,
  ShieldCheck,
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
  const { colors, isDark } = useTheme();
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
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not load student profile.');
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
        showCrossPlatformAlert('Request Sent 🤝', res.message || 'Connection request sent.');
      } else if (profile.connection_status === 'REQUEST_SENT') {
        // Cancel request
        await profileService.removeConnection(profile.id);
        showCrossPlatformAlert('Cancelled', 'Connection request was cancelled.');
      } else if (profile.connection_status === 'REQUEST_RECEIVED') {
        // Accept incoming request
        await profileService.respondConnection(profile.id, 'ACCEPT');
        showCrossPlatformAlert('Connected! 🎉', `You and ${profile.full_name} are now connected.`);
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
          showCrossPlatformAlert('Removed', 'Connection removed.');
        } else {
          setActionLoading(false);
          return;
        }
      }
      await loadProfile(profile.id);
    } catch (e: any) {
      showCrossPlatformAlert('Action Failed', e.response?.data?.error || 'Could not update connection.');
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
          showCrossPlatformAlert('Follow Requested ⏳', 'This account is private. Your request has been sent for approval.');
        } else {
          showCrossPlatformAlert('Following! 🎉', `You are now following ${profile.full_name}.`);
        }
      } else {
        // Unfollow
        const res = await profileService.unfollowUser(profile.id);
        showCrossPlatformAlert('Unfollowed', res.message || `You unfollowed ${profile.full_name}.`);
      }
      await loadProfile(profile.id);
    } catch (e: any) {
      showCrossPlatformAlert('Action Failed', e.response?.data?.error || 'Could not update follow status.');
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
      showCrossPlatformAlert(res.endorsed ? 'Endorsed ⭐' : 'Endorsement Removed', res.message);
    } catch (e: any) {
      showCrossPlatformAlert('Action Failed', e.response?.data?.error || 'Could not update endorsement.');
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
        showCrossPlatformAlert(
          'Message Request Sent 📩',
          res.message || 'Your message request was submitted and is awaiting approval.'
        );
      } else if (onOpenChat) {
        onClose();
        onOpenChat(res);
      } else {
        showCrossPlatformAlert('Direct Chat Ready 💬', 'Conversation is available in your messages.');
      }
    } catch (e: any) {
      showCrossPlatformAlert('Message Failed', e.response?.data?.error || 'Could not initiate chat.');
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
        showCrossPlatformAlert('Unblocked', `${profile.full_name} has been unblocked.`);
      } else {
        await profileService.blockUser(profile.id);
        showCrossPlatformAlert('Blocked', `${profile.full_name} has been blocked.`);
      }
      await loadProfile(profile.id);
    } catch (e: any) {
      showCrossPlatformAlert('Action Failed', e.response?.data?.error || 'Could not update block status.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!visible) return null;

  const isSelf = profile?.connection_status === 'SELF';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder }]}>
          {/* Grab Handle */}
          <View style={styles.sheetHandleRow}>
            <View style={[styles.sheetHandle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)' }]} />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.hairline }]}>
            <View style={styles.headerTitleBox}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Student Identity</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Graphic Era Campus Network</Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceLight }]}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Verifying campus credentials...</Text>
            </View>
          ) : !profile ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Student profile not found.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Campus ID Card Banner */}
              <View style={[styles.profileHero, { backgroundColor: colors.surfaceLight, borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder }]}>
                {/* Campus University Header Strip */}
                <View style={[styles.campusBannerStrip, { backgroundColor: isDark ? 'rgba(94, 106, 210, 0.14)' : 'rgba(79, 70, 229, 0.08)', borderBottomColor: isDark ? 'rgba(94, 106, 210, 0.25)' : 'rgba(79, 70, 229, 0.15)' }]}>
                  <Building2 size={13} color={colors.primary} />
                  <Text style={[styles.campusBannerStripText, { color: colors.primary }]}>
                    {profile.college_name || 'Graphic Era University'}
                  </Text>
                </View>

                <View style={styles.heroBody}>
                  {/* Large Student Avatar */}
                  <View style={[styles.avatarCircle, { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : colors.cardBorder }]}>
                    <UserAvatar
                      uri={profile.profile_picture || profile.avatar}
                      name={profile.full_name}
                      size={77}
                    />
                    {profile.is_private_account && (
                      <View style={[styles.lockBadge, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                        <Lock size={12} color={colors.textSecondary} />
                      </View>
                    )}
                  </View>

                  {/* Name & Institutional Verification Badge */}
                  <View style={styles.nameRow}>
                    <Text style={[styles.fullName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {profile.full_name || 'Student'}
                    </Text>
                    {profile.is_verified ? (
                      <View style={styles.verifiedBadge}>
                        <ShieldCheck size={13} color="#10b981" />
                        <Text style={styles.verifiedText}>OFFICIAL ID</Text>
                      </View>
                    ) : (
                      <View style={styles.semiVerifiedBadge}>
                        <Text style={styles.semiVerifiedText}>SEMI-VERIFIED</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.username, { color: colors.primary }]}>@{profile.username}</Text>

                  {profile.bio ? (
                    <View style={[styles.bioQuoteBox, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.cardBorder }]}>
                      <Text style={[styles.bioText, { color: colors.textSecondary }]}>"{profile.bio}"</Text>
                    </View>
                  ) : null}

                  {/* Stats Row: Posts | Followers | Following | Credibility */}
                  <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.cardBorder }]}>
                    <View style={styles.statBox}>
                      <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{profile.posts_count ?? 0}</Text>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Posts</Text>
                    </View>

                    <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.hairline }]} />

                    <TouchableOpacity
                      style={styles.statBox}
                      onPress={() => onOpenSocialList && onOpenSocialList('followers', profile.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{profile.followers_count ?? 0}</Text>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Followers</Text>
                    </TouchableOpacity>

                    <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.hairline }]} />

                    <TouchableOpacity
                      style={styles.statBox}
                      onPress={() => onOpenSocialList && onOpenSocialList('following', profile.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{profile.following_count ?? 0}</Text>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Following</Text>
                    </TouchableOpacity>

                    <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.hairline }]} />

                    <View style={styles.statBox}>
                      <Text style={[styles.statNumber, { color: '#fbbf24' }]}>⭐ {profile.credibility_score ?? 0}</Text>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Credibility</Text>
                    </View>
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
                          ? [styles.actionBtnOutline, { backgroundColor: colors.surfaceLight, borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.cardBorder }]
                          : profile.follow_status === 'REQUEST_SENT'
                          ? [styles.actionBtnMuted, { backgroundColor: colors.surfaceLight }]
                          : [styles.actionBtnPrimary, { backgroundColor: colors.primary }],
                      ]}
                      onPress={handleFollowAction}
                      disabled={actionLoading}
                    >
                      {profile.follow_status === 'FOLLOWING' ? (
                        <>
                          <UserCheck size={16} color="#10b981" />
                          <Text style={[styles.actionBtnOutlineText, { color: colors.textPrimary }]}>Following</Text>
                        </>
                      ) : profile.follow_status === 'REQUEST_SENT' ? (
                        <>
                          <UserPlus size={16} color={colors.textSecondary} />
                          <Text style={[styles.actionBtnMutedText, { color: colors.textMuted }]}>Requested</Text>
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
                          : [styles.actionBtnSecondary, { backgroundColor: colors.surfaceLight, borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.cardBorder }],
                      ]}
                      onPress={handleEndorseAction}
                      disabled={actionLoading}
                    >
                      <Sparkles size={16} color={profile.has_endorsed ? '#fbbf24' : colors.textSecondary} />
                      <Text style={profile.has_endorsed ? styles.actionBtnEndorsedText : [styles.actionBtnSecondaryText, { color: colors.textSecondary }]}>
                        {profile.has_endorsed ? 'Endorsed' : 'Endorse'}
                      </Text>
                    </TouchableOpacity>

                    {/* Direct Message Action */}
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnMessage, { backgroundColor: colors.surfaceLight, borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.cardBorder }]}
                      onPress={handleMessageAction}
                      disabled={actionLoading}
                    >
                      <MessageSquare size={16} color={colors.textPrimary} />
                      <Text style={[styles.actionBtnMessageText, { color: colors.textPrimary }]}>Message</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Block / Unblock link */}
                  <TouchableOpacity
                    style={styles.blockRow}
                    onPress={handleBlockAction}
                    disabled={actionLoading}
                  >
                    <AlertTriangle size={13} color={profile.is_blocked ? '#10b981' : '#ef4444'} />
                    <Text style={profile.is_blocked ? styles.unblockText : styles.blockText}>
                      {profile.is_blocked ? 'Unblock Student' : 'Block Student'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Private Account Locked Card */}
              {!profile.can_view_content ? (
                <View style={[styles.privateCard, { backgroundColor: colors.surfaceLight, borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder }]}>
                  <View style={[styles.privateIconCircle, { backgroundColor: isDark ? 'rgba(94, 106, 210, 0.15)' : 'rgba(79, 70, 229, 0.1)' }]}>
                    <Lock size={26} color={colors.primary} />
                  </View>
                  <Text style={[styles.privateTitle, { color: colors.textPrimary }]}>This Account is Private</Text>
                  <Text style={[styles.privateSub, { color: colors.textSecondary }]}>
                    Follow @{profile.username} to view their campus posts, cohort details, and academic community updates.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Academic Details */}
                  <View style={[styles.detailsCard, { backgroundColor: colors.surfaceLight, borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder }]}>
                    <Text style={[styles.detailsCardTitle, { color: colors.textPrimary }]}>Academic Credentials</Text>

                    <View style={styles.detailRow}>
                      <Building2 size={16} color={colors.primary} style={styles.detailIcon} />
                      <View style={styles.detailTextCol}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>College</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                          {profile.college_name} ({profile.college_short_name})
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.detailDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.hairline }]} />

                    <View style={styles.detailRow}>
                      <GraduationCap size={16} color={colors.primary} style={styles.detailIcon} />
                      <View style={styles.detailTextCol}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Program & Specialization</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                          {profile.course_name} • {profile.branch_name}
                        </Text>
                      </View>
                    </View>

                    {profile.academic_year_name ? (
                      <>
                        <View style={[styles.detailDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.hairline }]} />
                        <View style={styles.detailRow}>
                          <Calendar size={16} color={colors.primary} style={styles.detailIcon} />
                          <View style={styles.detailTextCol}>
                            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Cohort</Text>
                            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{profile.academic_year_name}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}

                    {profile.admission_number ? (
                      <>
                        <View style={[styles.detailDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.hairline }]} />
                        <View style={styles.detailRow}>
                          <BookOpen size={16} color={colors.primary} style={styles.detailIcon} />
                          <View style={styles.detailTextCol}>
                            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Admission / Roll Number</Text>
                            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{profile.admission_number}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}

                    {profile.gender ? (
                      <>
                        <View style={[styles.detailDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.hairline }]} />
                        <View style={styles.detailRow}>
                          <Users size={16} color={colors.primary} style={styles.detailIcon} />
                          <View style={styles.detailTextCol}>
                            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Gender</Text>
                            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{profile.gender}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>

                  {/* Authorized Student Posts */}
                  <View
                    style={[
                      styles.postsCard,
                      {
                        backgroundColor: colors.surfaceLight,
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.detailsCardTitle, { color: colors.textPrimary }]}>
                      Posts ({posts.length})
                    </Text>
                    {postsLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 14 }} />
                    ) : posts.length === 0 ? (
                      <Text style={[styles.noPostsText, { color: colors.textMuted }]}>No posts yet.</Text>
                    ) : (
                      posts.map((p) => (
                        <View
                          key={p.id}
                          style={[
                            styles.miniPostCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.cardBorder,
                            },
                          ]}
                        >
                          <View style={styles.miniPostTopRow}>
                            <Text style={[styles.miniPostOrigin, { color: colors.primary }]}>
                              {p.community_name
                                ? p.community_name
                                : p.author_college_name
                                ? p.author_college_name
                                : 'Campus Feed'}
                            </Text>
                            <Text style={[styles.miniPostTime, { color: colors.textMuted }]}>
                              {new Date(p.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Text>
                          </View>
                          {p.content ? (
                            <Text style={[styles.miniPostContent, { color: colors.textSecondary }]} numberOfLines={3}>
                              {p.content}
                            </Text>
                          ) : null}
                          <View style={styles.miniPostStats}>
                            <Text style={[styles.miniPostStat, { color: colors.textMuted }]}>
                              ❤️ {p.likes_count || 0}
                            </Text>
                            <Text style={[styles.miniPostStat, { color: colors.textMuted }]}>
                              💬 {p.comments_count || 0}
                            </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 580,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '65%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 15,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHero: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  campusBannerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  campusBannerStripText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroBody: {
    alignItems: 'center',
    padding: 18,
  },
  avatarCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(94, 106, 210, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    borderWidth: 2.5,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '800',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
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
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  verifiedText: {
    color: '#10b981',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  semiVerifiedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  semiVerifiedText: {
    color: '#f59e0b',
    fontSize: 9.5,
    fontWeight: '700',
  },
  username: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 10,
  },
  bioQuoteBox: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  bioText: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 22,
  },
  actionsContainer: {
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnPrimary: {},
  actionBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnOutline: {
    borderWidth: 1,
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnSecondary: {
    borderWidth: 1,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnEndorsed: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  actionBtnEndorsedText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnMuted: {
    borderWidth: 1,
  },
  actionBtnMutedText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionBtnMessage: {
    borderWidth: 1,
  },
  actionBtnMessageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    marginVertical: 10,
  },
  privateIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  privateTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  privateSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  detailsCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  detailsCardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 12,
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
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  detailDivider: {
    height: 1,
    marginVertical: 8,
  },
  postsCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginTop: 14,
  },
  noPostsText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  miniPostCard: {
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
  },
  miniPostTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  miniPostOrigin: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  miniPostTime: {
    fontSize: 11,
  },
  miniPostContent: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  miniPostStats: {
    flexDirection: 'row',
    gap: 14,
  },
  miniPostStat: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
