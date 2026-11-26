import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { lostFoundService, LostFoundItem } from '../services/lostFoundService';
import { Post, postService } from '../services/postService';
import { CommentsModal } from '../components/feed/CommentsModal';
import { ShareModal } from '../components/feed/ShareModal';
import { ImageCropperModal } from '../components/media/ImageCropperModal';
import { backHandlerRegistry } from '../services/backHandlerRegistry';
import {
  MapPin,
  Plus,
  ShieldCheck,
  MessageCircle,
  HelpCircle,
  X,
  Search,
  Flame,
  Camera,
  Heart,
  Share2,
  Trash2,
  Lock,
  Crop,
  Globe,
  Building2,
  GraduationCap,
  Sparkles,
  RotateCw,
} from 'lucide-react-native';

interface ArenaScreenProps {
  currentUser?: any;
  canParticipate?: boolean;
  onRequireAuth?: () => void;
  onRequireVerify?: (reason?: string) => void;
  onOpenProfile?: (userId: number) => void;
  onNavigateToChat?: (conversationId?: string | number) => void;
}

const MASCOTS = [
  { name: '🦉 Night Owl', icon: '🦉', desc: 'Wise & watchful' },
  { name: '🐅 Brave Tiger', icon: '🐅', desc: 'Fierce & bold' },
  { name: '👻 Campus Ghost', icon: '👻', desc: 'Unseen & floating' },
  { name: '🥷 Stealth Ninja', icon: '🥷', desc: 'Stealthy & silent' },
  { name: '🦅 High Falcon', icon: '🦅', desc: 'Keen & sharp' },
];

export type ConfessionScope = 'ALL' | 'GLOBAL' | 'COLLEGE' | 'COURSE';

const CONFESSION_SCOPES: { key: ConfessionScope; label: string; icon: string }[] = [
  { key: 'ALL', label: 'All Feeds', icon: '✨' },
  { key: 'GLOBAL', label: 'All Campuses', icon: '🌐' },
  { key: 'COLLEGE', label: 'My College', icon: '🏛️' },
  { key: 'COURSE', label: 'My Course', icon: '🎓' },
];

export const ArenaScreen: React.FC<ArenaScreenProps> = ({
  currentUser,
  canParticipate = true,
  onRequireAuth,
  onRequireVerify,
  onOpenProfile,
  onNavigateToChat,
}) => {
  const { colors, isDark } = useTheme();
  const [activeSlab, setActiveSlab] = useState<'LOST_FOUND' | 'CONFESSIONS'>('LOST_FOUND');

  // --- Lost & Found State ---
  const [lfItems, setLfItems] = useState<LostFoundItem[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'LOST' | 'FOUND'>('ALL');
  const [loadingLf, setLoadingLf] = useState(false);
  const [lfModalVisible, setLfModalVisible] = useState(false);
  const [reportType, setReportType] = useState<'LOST' | 'FOUND'>('FOUND');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [itemImage, setItemImage] = useState<any>(null);
  const [submittingLf, setSubmittingLf] = useState(false);

  // --- Confessions State ---
  const [confessions, setConfessions] = useState<Post[]>([]);
  const [confessionScope, setConfessionScope] = useState<ConfessionScope>('ALL');
  const [loadingConfessions, setLoadingConfessions] = useState(false);
  const [confessionModalVisible, setConfessionModalVisible] = useState(false);
  const [selectedMascot, setSelectedMascot] = useState('🦉 Night Owl');
  const [confessionText, setConfessionText] = useState('');
  const [confessionAudience, setConfessionAudience] = useState<'COLLEGE' | 'GLOBAL'>('COLLEGE');
  const [croppingImageUri, setCroppingImageUri] = useState<string | null>(null);
  const [submittingConfession, setSubmittingConfession] = useState(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const [banner, setBanner] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);

  // Load Lost & Found Items
  const loadLfItems = useCallback(async () => {
    setLoadingLf(true);
    try {
      const typeParam = activeTab === 'ALL' ? undefined : activeTab;
      const data = await lostFoundService.getItems(typeParam);
      setLfItems(data);
    } catch (e) {
      console.log('Error fetching lost & found', e);
    } finally {
      setLoadingLf(false);
    }
  }, [activeTab]);

  // Load Confessions with level filters (GLOBAL, COLLEGE, COURSE, ALL)
  const loadConfessions = useCallback(async (scopeOverride?: ConfessionScope) => {
    setLoadingConfessions(true);
    try {
      const activeScope = scopeOverride || confessionScope;
      const feedData = await postService.getFeed({
        scope: 'CONFESSIONS',
        level: activeScope !== 'ALL' ? activeScope : undefined,
      }, 1);
      setConfessions(feedData.results || []);
    } catch (e) {
      console.log('Error fetching confessions', e);
    } finally {
      setLoadingConfessions(false);
    }
  }, [confessionScope]);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeSlab === 'LOST_FOUND') {
        await loadLfItems();
      } else {
        await loadConfessions();
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeSlab, loadLfItems, loadConfessions]);

  // Auto-refresh Lost & Found / Confessions when switching back to app
  useAutoRefresh(handleRefresh, 25000);

  useEffect(() => {
    if (activeSlab === 'LOST_FOUND') {
      loadLfItems();
    } else {
      loadConfessions();
    }
  }, [activeSlab, loadLfItems, loadConfessions]);

  // Back button handling for Arena modals
  useEffect(() => {
    if (lfModalVisible) {
      backHandlerRegistry.push('ArenaLfModal', () => {
        setLfModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('ArenaLfModal');
    }
  }, [lfModalVisible]);

  useEffect(() => {
    if (confessionModalVisible) {
      backHandlerRegistry.push('ArenaConfessionModal', () => {
        setConfessionModalVisible(false);
        return true;
      });
      return () => backHandlerRegistry.pop('ArenaConfessionModal');
    }
  }, [confessionModalVisible]);

  useEffect(() => {
    if (activeCommentsPost) {
      backHandlerRegistry.push('ArenaCommentsModal', () => {
        setActiveCommentsPost(null);
        return true;
      });
      return () => backHandlerRegistry.pop('ArenaCommentsModal');
    }
  }, [activeCommentsPost]);

  useEffect(() => {
    if (sharePost) {
      backHandlerRegistry.push('ArenaShareModal', () => {
        setSharePost(null);
        return true;
      });
      return () => backHandlerRegistry.pop('ArenaShareModal');
    }
  }, [sharePost]);

  // Camera Capture for Lost & Found (Opens ImageCropperModal Crop Studio)
  const handleCaptureLfPhoto = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        const msg = 'Please grant camera permission to take a picture of the item.';
        setBanner({ kind: 'error', text: msg });
        if (Platform.OS !== 'web') Alert.alert('Permission Needed', msg);
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Opens ImageCropperModal Crop Studio!
        quality: 0.9,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setCroppingImageUri(res.assets[0].uri);
      }
    } catch (err) {
      console.log('Error launching camera', err);
    }
  };

  // Gallery Picker for Lost & Found (Opens ImageCropperModal Crop Studio)
  const handlePickLfImage = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        const msg = 'Please grant photo gallery permission to attach item images.';
        setBanner({ kind: 'error', text: msg });
        if (Platform.OS !== 'web') Alert.alert('Permission Needed', msg);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Opens ImageCropperModal Crop Studio!
        quality: 0.9,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setCroppingImageUri(res.assets[0].uri);
      }
    } catch (err) {
      console.log('Error picking image', err);
    }
  };

  // Crop Complete Handler for Lost & Found
  const handleLfCropComplete = (croppedUri: string) => {
    setItemImage({
      uri: croppedUri,
      name: 'lost_found_photo.jpg',
      type: 'image/jpeg',
    });
    setCroppingImageUri(null);
  };

  const handleOpenReportModal = () => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID or enter an invite code to report lost or found items.');
      return;
    }
    setBanner(null);
    setLfModalVisible(true);
  };

  const handleReportLf = async () => {
    if (!canParticipate) {
      setLfModalVisible(false);
      onRequireVerify?.('Verify your campus ID or enter an invite code to report lost or found items.');
      return;
    }
    if (!description.trim() || !location.trim()) {
      const msg = 'Please describe the item and where it was lost or found.';
      setBanner({ kind: 'error', text: msg });
      if (Platform.OS !== 'web') Alert.alert('Required', msg);
      return;
    }

    setSubmittingLf(true);
    setBanner(null);
    try {
      let payload: any;
      if (itemImage) {
        const formData = new FormData();
        formData.append('item_type', reportType);
        formData.append('description', description.trim());
        formData.append('location', location.trim());
        if (Platform.OS === 'web') {
          const blob = await fetch(itemImage.uri).then((r) => r.blob());
          formData.append('image', blob, 'item_photo.jpg');
        } else {
          formData.append('image', {
            uri: itemImage.uri,
            name: 'item_photo.jpg',
            type: 'image/jpeg',
          } as any);
        }
        payload = formData;
      } else {
        payload = {
          item_type: reportType,
          description: description.trim(),
          location: location.trim(),
        };
      }

      await lostFoundService.reportItem(payload);
      setLfModalVisible(false);
      setDescription('');
      setLocation('');
      setItemImage(null);
      await loadLfItems();
      const okMsg = 'Your notice is now live on campus!';
      setBanner({ kind: 'notice', text: okMsg });
      if (Platform.OS !== 'web') Alert.alert('Reported! 📢', okMsg);
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.response?.data?.code === 'CAMPUS_VERIFICATION_REQUIRED') {
        setLfModalVisible(false);
        onRequireVerify?.(e.response?.data?.error || 'Campus verification required to report items.');
      } else {
        const msg = e.response?.data?.error || 'Failed to submit report.';
        setBanner({ kind: 'error', text: msg });
        if (Platform.OS !== 'web') Alert.alert('Error', msg);
      }
    } finally {
      setSubmittingLf(false);
    }
  };

  const handleContactLf = async (item: LostFoundItem) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID or enter an invite code to contact reporters.');
      return;
    }

    const isMyNotice =
      item.is_mine === true ||
      (item as any).is_owner === true ||
      (currentUser && (
        (item.reporter_id && item.reporter_id === currentUser.id) ||
        ((item as any).author && (item as any).author === currentUser.id) ||
        ((item as any).author_email && currentUser.email && (item as any).author_email === currentUser.email)
      ));

    if (isMyNotice) {
      const msg = 'This is your own report. Classmates who find or claim this item will message you directly.';
      setBanner({ kind: 'notice', text: msg });
      if (Platform.OS !== 'web') Alert.alert('Your Notice', msg);
      return;
    }

    try {
      const res: any = await lostFoundService.contactReporter(item.id);
      const okMsg = `Direct chat opened with ${item.reporter_name || 'student'}.`;
      setBanner({ kind: 'notice', text: okMsg });

      if (res?.conversation_id && onNavigateToChat) {
        onNavigateToChat(res.conversation_id);
      } else if (Platform.OS !== 'web') {
        Alert.alert(
          'Chat Thread Opened! 💬',
          `Direct chat started with ${item.reporter_name || 'student'}.\nMessage context sent.`
        );
      }
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.response?.data?.code === 'CAMPUS_VERIFICATION_REQUIRED') {
        onRequireVerify?.(e.response?.data?.error || 'Campus verification required to contact students.');
      } else {
        const msg = e.response?.data?.error || 'Could not open chat.';
        setBanner({ kind: 'error', text: msg });
        if (Platform.OS !== 'web') Alert.alert('Error', msg);
      }
    }
  };

  const handleDeleteLf = async (itemId: string) => {
    const doDelete = async () => {
      try {
        await lostFoundService.deleteItem(itemId);
        setLfItems((prev) => prev.filter((it) => it.id !== itemId));
        setBanner({ kind: 'notice', text: 'Lost & Found notice deleted successfully.' });
      } catch (err: any) {
        const msg = err?.response?.data?.error || 'Failed to delete notice.';
        setBanner({ kind: 'error', text: msg });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Are you sure you want to delete this notice?')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Delete Notice',
        'Are you sure you want to delete this Lost & Found notice from campus?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // --- Confessions Actions ---
  const handleOpenConfessionModal = () => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onRequireVerify?.('Verify your Campus ID or enter an invite code to post confessions.');
      return;
    }
    setBanner(null);
    setConfessionModalVisible(true);
  };

  const handlePostConfession = async () => {
    if (!canParticipate) {
      setConfessionModalVisible(false);
      onRequireVerify?.('Verify your Campus ID or enter an invite code to post confessions.');
      return;
    }
    if (!confessionText.trim()) {
      const msg = 'Please write your confession first.';
      setBanner({ kind: 'error', text: msg });
      if (Platform.OS !== 'web') Alert.alert('Required', msg);
      return;
    }

    setSubmittingConfession(true);
    setBanner(null);
    try {
      const formData = new FormData();
      formData.append('content', confessionText.trim());
      formData.append('is_anonymous', 'true');
      formData.append('is_confession', 'true');
      formData.append('anonymous_alias', selectedMascot);
      formData.append('visibility', confessionAudience);

      const created = await postService.createPost(formData);
      setConfessionModalVisible(false);
      setConfessionText('');
      setConfessions((prev) => [created, ...prev]);
      await loadConfessions();
      const okMsg = 'Your confession was spilled anonymously into The Arena! 🎭';
      setBanner({ kind: 'notice', text: okMsg });
      if (Platform.OS !== 'web') Alert.alert('Spilled! ☕', okMsg);
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Failed to post confession.';
      setBanner({ kind: 'error', text: msg });
      if (Platform.OS !== 'web') Alert.alert('Error', msg);
    } finally {
      setSubmittingConfession(false);
    }
  };

  const handleLikeConfession = async (postId: number) => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!canParticipate) {
      onRequireVerify?.('Verify your campus ID to react to confessions.');
      return;
    }
    try {
      const res = await postService.toggleLike(postId);
      setConfessions((prev) =>
        prev.map((c) =>
          c.id === postId
            ? {
                ...c,
                has_liked: res.has_liked ?? res.liked,
                likes_count: res.likes_count,
              }
            : c
        )
      );
    } catch (err) {
      console.log('Error liking confession', err);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={handleRefresh} activeOpacity={0.75} style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Flame size={20} color={colors.ephemeralFire || '#f97316'} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>The Arena</Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
            {activeSlab === 'LOST_FOUND'
              ? 'Campus Recovery • 1-Click Pickup'
              : '100% Anonymous Campus Confessions'}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <TouchableOpacity
            style={[
              styles.refreshBtn,
              { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
              refreshing && { opacity: 0.7 },
            ]}
            onPress={handleRefresh}
            activeOpacity={0.7}
            disabled={refreshing}
            accessibilityLabel="Refresh arena"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RotateCw size={14} color={colors.textPrimary} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={activeSlab === 'LOST_FOUND' ? handleOpenReportModal : handleOpenConfessionModal}
            activeOpacity={0.85}
          >
            <Plus size={14} color={colors.onPrimary} style={{ marginRight: 3 }} />
            <Text style={[styles.actionBtnText, { color: colors.onPrimary }]}>
              {activeSlab === 'LOST_FOUND' ? 'Report Item' : 'Spill Tea 🎭'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Two Slabs / Sub-Tabs Bar */}
      <View style={[styles.slabContainer, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={[
            styles.slabTab,
            activeSlab === 'LOST_FOUND'
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
          ]}
          onPress={() => setActiveSlab('LOST_FOUND')}
          activeOpacity={0.8}
        >
          <Search size={15} color={activeSlab === 'LOST_FOUND' ? colors.onPrimary : colors.textSecondary} />
          <Text
            style={[
              styles.slabText,
              {
                color: activeSlab === 'LOST_FOUND' ? colors.onPrimary : colors.textSecondary,
                fontWeight: activeSlab === 'LOST_FOUND' ? '700' : '600',
              },
            ]}
          >
            Lost & Found
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.slabTab,
            activeSlab === 'CONFESSIONS'
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder },
          ]}
          onPress={() => setActiveSlab('CONFESSIONS')}
          activeOpacity={0.8}
        >
          <Flame size={15} color={activeSlab === 'CONFESSIONS' ? colors.onPrimary : colors.textSecondary} />
          <Text
            style={[
              styles.slabText,
              {
                color: activeSlab === 'CONFESSIONS' ? colors.onPrimary : colors.textSecondary,
                fontWeight: activeSlab === 'CONFESSIONS' ? '700' : '600',
              },
            ]}
          >
            Confessions
          </Text>
        </TouchableOpacity>
      </View>

      {/* Verification Shield Banner */}
      {(!currentUser || !canParticipate) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: isDark ? 'rgba(0, 112, 243, 0.14)' : '#eff6ff',
            borderBottomWidth: 1,
            borderBottomColor: colors.cardBorder,
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>
            Read-only mode · Verify your ID or enter invite code to post or participate.
          </Text>
          <TouchableOpacity
            onPress={() => onRequireVerify?.()}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
          >
            <Text style={{ color: colors.onPrimary, fontSize: 11.5, fontWeight: '700' }}>Verify ID</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live Notice Banner */}
      {banner && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginHorizontal: 14,
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            borderWidth: 1,
            backgroundColor:
              banner.kind === 'error'
                ? isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2'
                : isDark ? 'rgba(34, 197, 94, 0.14)' : '#f0fdf4',
            borderColor:
              banner.kind === 'error'
                ? 'rgba(239, 68, 68, 0.35)'
                : 'rgba(34, 197, 94, 0.35)',
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: '600',
              color: banner.kind === 'error' ? '#ef4444' : isDark ? '#86efac' : '#15803d',
            }}
          >
            {banner.text}
          </Text>
          <TouchableOpacity onPress={() => setBanner(null)}>
            <X size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================= */}
      {/* SLAB 1: LOST & FOUND STREAM */}
      {/* ========================================================================= */}
      {activeSlab === 'LOST_FOUND' && (
        <>
          {/* Filter Tabs */}
          <View style={[styles.tabsRow, { backgroundColor: colors.background }]}>
            {(['ALL', 'LOST', 'FOUND'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: active
                        ? (isDark ? '#27272a' : '#e0f2fe')
                        : colors.surface,
                      borderColor: active
                        ? (isDark ? '#ffffff' : '#0284c7')
                        : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color: active
                          ? (isDark ? '#ffffff' : '#0369a1')
                          : colors.textSecondary,
                        fontWeight: active ? '700' : '600',
                      },
                    ]}
                  >
                    {tab === 'ALL' ? 'All Notices' : tab === 'LOST' ? '🔍 Lost' : '📦 Found'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loadingLf ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={lfItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              renderItem={({ item }) => (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  {/* Top Badge & Reporter */}
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.typeTag,
                        item.item_type === 'LOST' ? styles.lostTag : styles.foundTag,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeTagText,
                          item.item_type === 'LOST' ? styles.lostTagText : styles.foundTagText,
                        ]}
                      >
                        {item.item_type === 'LOST' ? 'LOST ITEM' : 'FOUND ITEM'}
                      </Text>
                    </View>
                    <Text style={[styles.reporterName, { color: colors.textMuted }]}>
                      Reported by {item.reporter_name}
                    </Text>
                  </View>

                  {/* Optional Item Photo */}
                  {item.image ? (
                    <View style={styles.itemImageWrapper}>
                      <Image source={{ uri: item.image }} style={styles.itemImage} resizeMode="cover" />
                    </View>
                  ) : null}

                  <Text style={[styles.itemDesc, { color: colors.textPrimary }]}>{item.description}</Text>

                  <View style={styles.locationRow}>
                    <MapPin size={13} color={colors.primary} style={{ marginRight: 5 }} />
                    <Text style={[styles.locationText, { color: colors.textSecondary }]}>{item.location}</Text>
                  </View>

                  {/* Claim / Contact / Delete Action Row */}
                  {(() => {
                    const isMyNotice =
                      item.is_mine === true ||
                      (item as any).is_owner === true ||
                      (currentUser && (
                        (item.reporter_id && item.reporter_id === currentUser.id) ||
                        ((item as any).author && (item as any).author === currentUser.id) ||
                        ((item as any).author_email && currentUser.email && (item as any).author_email === currentUser.email)
                      ));

                    if (isMyNotice) {
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View
                            style={[
                              styles.contactBtn,
                              {
                                flex: 1,
                                backgroundColor: colors.surfaceLight,
                                borderColor: colors.cardBorder,
                                opacity: 0.85,
                              },
                            ]}
                          >
                            <View style={styles.actionBtnInner}>
                              <HelpCircle size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
                              <Text style={[styles.contactBtnText, { color: colors.textMuted }]} numberOfLines={1}>
                                Your Notice · Active
                              </Text>
                            </View>
                          </View>

                          {/* Delete Button for Author */}
                          <TouchableOpacity
                            style={[
                              styles.contactBtn,
                              {
                                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                borderColor: 'rgba(239, 68, 68, 0.35)',
                                paddingHorizontal: 12,
                              },
                            ]}
                            onPress={() => handleDeleteLf(item.id)}
                            activeOpacity={0.8}
                            accessibilityLabel="Delete your notice"
                          >
                            <View style={styles.actionBtnInner}>
                              <Trash2 size={15} color="#ef4444" style={{ marginRight: 5 }} />
                              <Text style={[styles.contactBtnText, { color: '#ef4444' }]}>Delete</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (item.item_type === 'FOUND') {
                      return (
                        <TouchableOpacity
                          style={[
                            styles.contactBtn,
                            {
                              backgroundColor: isDark ? 'rgba(0, 112, 243, 0.16)' : 'rgba(0, 102, 204, 0.08)',
                              borderColor: isDark ? 'rgba(0, 112, 243, 0.4)' : 'rgba(0, 102, 204, 0.28)',
                            },
                          ]}
                          onPress={() => handleContactLf(item)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.actionBtnInner}>
                            <ShieldCheck size={16} color={colors.primary} style={{ marginRight: 7 }} />
                            <Text style={[styles.contactBtnText, { color: colors.primary }]}>
                              Claim Item · Contact Finder
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }

                    return (
                      <TouchableOpacity
                        style={[
                          styles.contactBtn,
                          {
                            backgroundColor: isDark ? 'rgba(39, 166, 68, 0.16)' : 'rgba(22, 163, 74, 0.08)',
                            borderColor: isDark ? 'rgba(39, 166, 68, 0.4)' : 'rgba(22, 163, 74, 0.28)',
                          },
                        ]}
                        onPress={() => handleContactLf(item)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.actionBtnInner}>
                          <MessageCircle size={16} color={colors.accent} style={{ marginRight: 7 }} />
                          <Text style={[styles.contactBtnText, { color: colors.accent }]}>
                            I Found This · Message Owner
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🔍</Text>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No notices yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                    Lost something on campus or found an item? Help your campus peers by reporting it here.
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* SLAB 2: ANONYMOUS CONFESSIONS STREAM */}
      {/* ========================================================================= */}
      {activeSlab === 'CONFESSIONS' && (
        <>
          {/* Confessions Scope Filter Tabs */}
          <View style={[styles.tabsRow, { backgroundColor: colors.background }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CONFESSION_SCOPES.map((scopeItem) => {
                const active = confessionScope === scopeItem.key;
                return (
                  <TouchableOpacity
                    key={scopeItem.key}
                    style={[
                      styles.tab,
                      {
                        backgroundColor: active
                          ? (isDark ? '#27272a' : '#e0f2fe')
                          : colors.surface,
                        borderColor: active
                          ? (isDark ? '#ffffff' : '#0284c7')
                          : colors.cardBorder,
                      },
                    ]}
                    onPress={() => {
                      setConfessionScope(scopeItem.key);
                      loadConfessions(scopeItem.key);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color: active
                            ? (isDark ? '#ffffff' : '#0369a1')
                            : colors.textSecondary,
                          fontWeight: active ? '700' : '600',
                        },
                      ]}
                    >
                      {scopeItem.icon} {scopeItem.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {loadingConfessions ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={confessions}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              renderItem={({ item }) => {
                const mascotIcon =
                  item.anonymous_alias?.includes('Owl') ? '🦉' :
                  item.anonymous_alias?.includes('Tiger') ? '🐅' :
                  item.anonymous_alias?.includes('Ghost') ? '👻' :
                  item.anonymous_alias?.includes('Ninja') ? '🥷' :
                  item.anonymous_alias?.includes('Falcon') ? '🦅' : '🎭';

                const displayImage =
                  item.images && item.images.length > 0
                    ? item.images[0].image
                    : item.media_url || null;

                return (
                  <View style={[styles.confessionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                    {/* Confession Top Row */}
                    <View style={styles.confessionTopRow}>
                      <View style={styles.mascotBadge}>
                        <Text style={{ fontSize: 22 }}>{mascotIcon}</Text>
                        <View style={{ marginLeft: 8 }}>
                          <Text style={[styles.mascotName, { color: colors.textPrimary }]}>
                            {item.anonymous_alias || 'Anonymous Student'}
                          </Text>
                          <Text style={[styles.confessionMeta, { color: colors.textMuted }]}>
                            Campus Confession · {new Date(item.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.anonPill, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
                        <Lock size={11} color={colors.textMuted} style={{ marginRight: 3 }} />
                        <Text style={[styles.anonPillText, { color: colors.textMuted }]}>Encrypted</Text>
                      </View>
                    </View>

                    {/* Content */}
                    <Text style={[styles.confessionBody, { color: colors.textPrimary }]}>
                      {item.content}
                    </Text>

                    {/* Optional Attached Confession Photo */}
                    {displayImage ? (
                      <View style={styles.confessionImageWrapper}>
                        <Image source={{ uri: displayImage }} style={styles.confessionImage} resizeMode="cover" />
                      </View>
                    ) : null}

                    {/* Reaction Bar */}
                    <View style={[styles.reactionRow, { borderTopColor: colors.cardBorder }]}>
                      <TouchableOpacity
                        style={styles.reactionBtn}
                        onPress={() => handleLikeConfession(item.id)}
                        activeOpacity={0.7}
                      >
                        <Heart
                          size={17}
                          color={item.has_liked ? '#ef4444' : colors.textSecondary}
                          fill={item.has_liked ? '#ef4444' : 'transparent'}
                        />
                        <Text style={[styles.reactionCount, { color: item.has_liked ? '#ef4444' : colors.textSecondary }]}>
                          {item.likes_count || 0}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.reactionBtn}
                        onPress={() => setActiveCommentsPost(item)}
                        activeOpacity={0.7}
                      >
                        <MessageCircle size={17} color={colors.textSecondary} />
                        <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                          {item.comments_count || 0}
                        </Text>
                      </TouchableOpacity>

                      <View style={{ flex: 1 }} />

                      <TouchableOpacity
                        style={styles.reactionBtn}
                        onPress={() => setSharePost(item)}
                        activeOpacity={0.7}
                        accessibilityLabel="Share confession"
                      >
                        <Share2 size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>🎭</Text>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>The Arena is Quiet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                    Be the first to spill an anonymous campus confession. Tap "Spill Tea 🎭" above!
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: REPORT LOST / FOUND (WITH PHOTO PICKER) */}
      {/* ========================================================================= */}
      <Modal visible={lfModalVisible} animationType="slide" transparent onRequestClose={() => setLfModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Report Lost / Found Item</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Attach a photo to help classmates identify and recover the item quickly.
            </Text>

            <View style={styles.typeToggleRow}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  {
                    backgroundColor: reportType === 'LOST'
                      ? isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)'
                      : colors.surfaceLight,
                    borderColor: reportType === 'LOST' ? '#ef4444' : colors.cardBorder,
                  },
                ]}
                onPress={() => setReportType('LOST')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    { color: reportType === 'LOST' ? '#ef4444' : colors.textSecondary },
                  ]}
                >
                  🔍 I Lost Something
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeOption,
                  {
                    backgroundColor: reportType === 'FOUND'
                      ? isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.12)'
                      : colors.surfaceLight,
                    borderColor: reportType === 'FOUND' ? '#22c55e' : colors.cardBorder,
                  },
                ]}
                onPress={() => setReportType('FOUND')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    { color: reportType === 'FOUND' ? '#22c55e' : colors.textSecondary },
                  ]}
                >
                  📦 I Found Something
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
              placeholder="What item? (e.g. Black boAt Earphones, Blue ID Card Holder)"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
            />

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
              placeholder="Where? (e.g. Central Library 2nd Floor, Ground Canteen)"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
            />

            {/* Photo Attachment Picker with Crop Studio */}
            {itemImage ? (
              <View style={styles.imagePreviewBox}>
                <Image source={{ uri: itemImage.uri }} style={styles.previewThumb} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.photoAttachedText, { color: colors.textPrimary }]}>Photo Attached (Cropped)</Text>
                  <Text style={[styles.photoSubText, { color: colors.textMuted }]}>Classmates will see this item photo</Text>
                </View>
                <TouchableOpacity
                  style={[styles.cropActionBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                  onPress={() => setCroppingImageUri(itemImage.uri)}
                  activeOpacity={0.7}
                  accessibilityLabel="Recrop photo"
                >
                  <Crop size={15} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setItemImage(null)}
                  accessibilityLabel="Remove photo"
                >
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
                <TouchableOpacity
                  style={[styles.pickPhotoBtn, { flex: 1, backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                  onPress={handleCaptureLfPhoto}
                  activeOpacity={0.8}
                >
                  <Camera size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickPhotoText, { color: colors.primary }]}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pickPhotoBtn, { flex: 1, backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}
                  onPress={handlePickLfImage}
                  activeOpacity={0.8}
                >
                  <Plus size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickPhotoText, { color: colors.primary }]}>Upload Photo</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.cardBorder }]}
                onPress={() => setLfModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleReportLf}
                disabled={submittingLf}
              >
                {submittingLf ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>Post Notice</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: SPILL ANONYMOUS CONFESSION */}
      {/* ========================================================================= */}
      <Modal visible={confessionModalVisible} animationType="slide" transparent onRequestClose={() => setConfessionModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 }}
            style={{ width: '100%' }}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Spill Confession ☕</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                    Your student identity and details are 100% hidden.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setConfessionModalVisible(false)}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Scope / Audience Selection */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CONFESSION AUDIENCE</Text>
              <View style={styles.audienceRow}>
                <TouchableOpacity
                  style={[
                    styles.audienceChip,
                    {
                      backgroundColor: confessionAudience === 'COLLEGE' ? colors.primary : colors.surfaceLight,
                      borderColor: confessionAudience === 'COLLEGE' ? colors.primary : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setConfessionAudience('COLLEGE')}
                  activeOpacity={0.8}
                >
                  <Building2 size={13} color={confessionAudience === 'COLLEGE' ? colors.onPrimary : colors.textSecondary} />
                  <Text style={[styles.audienceChipText, { color: confessionAudience === 'COLLEGE' ? colors.onPrimary : colors.textSecondary }]}>
                    My College
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.audienceChip,
                    {
                      backgroundColor: confessionAudience === 'GLOBAL' ? colors.primary : colors.surfaceLight,
                      borderColor: confessionAudience === 'GLOBAL' ? colors.primary : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setConfessionAudience('GLOBAL')}
                  activeOpacity={0.8}
                >
                  <Globe size={13} color={confessionAudience === 'GLOBAL' ? colors.onPrimary : colors.textSecondary} />
                  <Text style={[styles.audienceChipText, { color: confessionAudience === 'GLOBAL' ? colors.onPrimary : colors.textSecondary }]}>
                    All Campuses
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mascot Picker */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 8 }]}>CHOOSE YOUR ANONYMOUS MASCOT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                {MASCOTS.map((m) => {
                  const isSelected = selectedMascot === m.name;
                  return (
                    <TouchableOpacity
                      key={m.name}
                      style={[
                        styles.mascotChip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surfaceLight,
                          borderColor: isSelected ? colors.primary : colors.cardBorder,
                        },
                      ]}
                      onPress={() => setSelectedMascot(m.name)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 18 }}>{m.icon}</Text>
                      <Text style={[styles.mascotChipText, { color: isSelected ? colors.onPrimary : colors.textSecondary }]}>
                        {m.name.replace(/^[^\s]+\s+/, '')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Confession Text Area - Large and Spacious */}
              <TextInput
                style={[styles.confessionInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.cardBorder }]}
                placeholder="What's your confession? Spill the tea anonymously... Share thoughts, stories, secrets, or shoutouts."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={8}
                value={confessionText}
                onChangeText={setConfessionText}
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.cardBorder }]}
                  onPress={() => {
                    setConfessionModalVisible(false);
                  }}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                  onPress={handlePostConfession}
                  disabled={submittingConfession}
                >
                  {submittingConfession ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>Post Confession</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Image Cropper Modal */}
      {croppingImageUri && (
        <ImageCropperModal
          visible={!!croppingImageUri}
          imageUri={croppingImageUri}
          onClose={() => setCroppingImageUri(null)}
          onCropComplete={handleLfCropComplete}
          initialAspectRatio="FREE"
        />
      )}

      {/* Structured Comments Modal Reused for Confessions */}
      <CommentsModal
        visible={!!activeCommentsPost}
        post={activeCommentsPost}
        currentUser={currentUser}
        canParticipate={canParticipate}
        onRequireAuth={onRequireAuth}
        onRequireVerify={onRequireVerify}
        onClose={() => setActiveCommentsPost(null)}
        onOpenProfile={onOpenProfile}
      />

      {/* Share Modal for Confessions & Arena Posts */}
      <ShareModal
        visible={!!sharePost}
        post={sharePost}
        onClose={() => setSharePost(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    flexShrink: 0,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  slabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  slabTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  slabText: {
    fontSize: 13,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 12.5,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lostTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  foundTag: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  typeTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lostTagText: {
    color: '#ef4444',
  },
  foundTagText: {
    color: '#22c55e',
  },
  reporterName: {
    fontSize: 11.5,
  },
  itemImageWrapper: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#000',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemDesc: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 12.5,
  },
  contactBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  actionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  confessionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  confessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mascotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mascotName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  confessionMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  anonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  anonPillText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  confessionBody: {
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 12,
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 16,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeOptionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    marginBottom: 10,
  },
  pickPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 14,
  },
  pickPhotoText: {
    fontSize: 13,
    fontWeight: '700',
  },
  imagePreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 10,
    padding: 8,
    marginBottom: 14,
  },
  previewThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  photoAttachedText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  photoSubText: {
    fontSize: 11,
  },
  removeImageBtn: {
    padding: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  mascotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  mascotChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  confessionInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 180,
    textAlignVertical: 'top',
    marginTop: 8,
    marginBottom: 14,
  },
  confessionImageWrapper: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#000',
  },
  confessionImage: {
    width: '100%',
    height: '100%',
  },
  audienceRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6,
  },
  audienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  audienceChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cropActionBtn: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export { ArenaScreen as LostFoundScreen };
