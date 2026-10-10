import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { communityService, Community } from '../services/communityService';

interface CommunitiesScreenProps {
  onOpenCommunityChat?: (conversation: any) => void;
}

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({ onOpenCommunityChat }) => {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [openingChatSlug, setOpeningChatSlug] = useState<string | null>(null);

  // Custom community creation form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadCommunities = async () => {
    setLoading(true);
    try {
      const data = await communityService.getMyCommunities();
      setCommunities(data);
    } catch (e) {
      console.log('Error loading communities', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommunities();
  }, []);

  const handleCreateCustom = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Please enter a club or group name.');
      return;
    }

    setCreating(true);
    try {
      await communityService.createCustomCommunity({
        name: newTitle.trim(),
        description: newDesc.trim(),
        is_private: false,
      });
      setModalVisible(false);
      setNewTitle('');
      setNewDesc('');
      await loadCommunities();
      Alert.alert('Created!', 'Your custom campus community is now live!');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create community.');
    } finally {
      setCreating(false);
    }
  };

  const coreCommunities = communities.filter((c) =>
    ['COLLEGE', 'COURSE', 'SECTION'].includes(c.community_type)
  );

  const customCommunities = communities.filter(
    (c) => c.community_type === 'CUSTOM'
  );

  const handleOpenChat = async (slug: string, name: string) => {
    setOpeningChatSlug(slug);
    try {
      const conv = await communityService.openCommunityChat(slug);
      if (onOpenCommunityChat) {
        onOpenCommunityChat(conv);
      } else {
        Alert.alert('Group Chat Active!', `Connected to ${name} chat. Switch to Chats tab.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not open community chat.');
    } finally {
      setOpeningChatSlug(null);
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'COLLEGE':
        return '#3b82f6';
      case 'COURSE':
        return '#10b981';
      case 'SECTION':
        return '#f59e0b';
      default:
        return '#8b5cf6';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Communities</Text>
          <Text style={styles.headerSubtitle}>Core Academic Hubs & Student Clubs</Text>
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.createBtnText}>+ Create Club</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[
            { type: 'HEADER_CORE', title: '🏛️ YOUR 3 MANDATORY CORE HUBS' },
            ...coreCommunities,
            { type: 'HEADER_CUSTOM', title: '🎮 STUDENT CLUBS & CUSTOM COMMUNITIES' },
            ...customCommunities,
          ]}
          keyExtractor={(item: any, idx) => item.id?.toString() || idx.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: any) => {
            if (item.type === 'HEADER_CORE' || item.type === 'HEADER_CUSTOM') {
              return <Text style={styles.sectionHeader}>{item.title}</Text>;
            }

            return (
              <View style={styles.communityCard}>
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: getBadgeColor(item.community_type) },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>{item.community_type}</Text>
                  </View>
                  <Text style={styles.memberCount}>👥 {item.total_members} members</Text>
                </View>

                <Text style={styles.communityName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.communityDesc}>{item.description}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.chatActionBtn}
                  onPress={() => handleOpenChat(item.slug, item.name)}
                  disabled={openingChatSlug === item.slug}
                >
                  {openingChatSlug === item.slug ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.chatActionIcon}>💬</Text>
                      <Text style={styles.chatActionText}>Open Group Chat</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Modal: Create Custom Community */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Campus Community</Text>
            <Text style={styles.modalSubtitle}>
              Start a gaming squad, project group, or hobby club
            </Text>

            <Text style={styles.label}>Community / Club Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. GEU Esports & Valorant Club"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.descInput]}
              placeholder="What is this group about?"
              placeholderTextColor={colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleCreateCustom}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Create Community</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 10,
  },
  communityCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  memberCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  communityName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  communityDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 18,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  descInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  chatActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  chatActionIcon: {
    fontSize: 14,
  },
  chatActionText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '700',
  },
});
