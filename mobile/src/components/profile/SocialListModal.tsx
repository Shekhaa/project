import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { profileService, ConnectionItem, FollowItem } from '../../services/profileService';
import { X, Search, Users, UserCheck, UserPlus, Shield, Check, Clock } from 'lucide-react-native';

export type SocialModalType = 'followers' | 'following' | 'connections';

interface SocialListModalProps {
  visible: boolean;
  type: SocialModalType;
  targetUserId: number;
  isSelf: boolean;
  onClose: () => void;
  onSelectUser: (userId: number) => void;
}

export const SocialListModal: React.FC<SocialListModalProps> = ({
  visible,
  type,
  targetUserId,
  isSelf,
  onClose,
  onSelectUser,
}) => {
  // Connections tab state: 'connected' | 'received' | 'sent'
  const [connectionsTab, setConnectionsTab] = useState<'connected' | 'received' | 'sent'>('connected');
  // Followers view mode: 'list' | 'requests'
  const [followersMode, setFollowersMode] = useState<'list' | 'requests'>('list');

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (visible && targetUserId) {
      loadData();
    } else {
      setItems([]);
      setSearchQuery('');
    }
  }, [visible, type, targetUserId, connectionsTab, followersMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (type === 'followers') {
        if (followersMode === 'requests' && isSelf) {
          const res = await profileService.getFollowRequests();
          setItems(res.results || []);
        } else {
          const res = await profileService.getFollowers(targetUserId);
          setItems(res.results || []);
        }
      } else if (type === 'following') {
        const res = await profileService.getFollowing(targetUserId);
        setItems(res.results || []);
      } else if (type === 'connections') {
        const res = await profileService.getConnections(connectionsTab);
        setItems(res.results || []);
      }
    } catch (e: any) {
      console.log('Error loading social list', e);
    } finally {
      setLoading(false);
    }
  };

  // Follow request respond (Accept/Reject)
  const handleRespondFollowRequest = async (requestId: number, action: 'ACCEPT' | 'REJECT') => {
    try {
      setActionLoadingId(requestId);
      await profileService.respondFollowRequest(requestId, action);
      setItems((prev) => prev.filter((item) => item.id !== requestId));
      Alert.alert(action === 'ACCEPT' ? 'Approved ✅' : 'Declined', `Follow request ${action.toLowerCase()}ed.`);
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Connection respond (ACCEPT/DECLINE)
  const handleRespondConnection = async (userId: number, action: 'ACCEPT' | 'DECLINE') => {
    try {
      setActionLoadingId(userId);
      await profileService.respondConnection(userId, action);
      setItems((prev) => prev.filter((item) => item.other_user?.id !== userId && item.id !== userId));
      Alert.alert(action === 'ACCEPT' ? 'Connected! 🎉' : 'Declined', `Connection request ${action.toLowerCase()}ed.`);
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not update connection.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Connection cancel
  const handleCancelConnection = async (userId: number) => {
    try {
      setActionLoadingId(userId);
      await profileService.removeConnection(userId);
      setItems((prev) => prev.filter((item) => item.other_user?.id !== userId && item.id !== userId));
      Alert.alert('Cancelled', 'Connection request cancelled.');
    } catch (e: any) {
      Alert.alert('Action Failed', e.response?.data?.error || 'Could not cancel request.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!visible) return null;

  // Filter items by search query
  const filteredItems = items.filter((item) => {
    const u = item.user || item.other_user || item;
    const name = (u.full_name || '').toLowerCase();
    const handle = (u.username || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    return !q || name.includes(q) || handle.includes(q);
  });

  const getTitle = () => {
    if (type === 'followers') {
      return followersMode === 'requests' ? 'Follow Requests' : 'Followers';
    }
    if (type === 'following') return 'Following';
    return 'Campus Connections';
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>{getTitle()}</Text>
              {type === 'followers' && isSelf && (
                <TouchableOpacity
                  style={followersMode === 'requests' ? styles.subTabActive : styles.subTab}
                  onPress={() => setFollowersMode(followersMode === 'requests' ? 'list' : 'requests')}
                >
                  <Text style={followersMode === 'requests' ? styles.subTabTextActive : styles.subTabText}>
                    {followersMode === 'requests' ? '← Followers' : 'Pending Requests'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Sub-tabs for Connections */}
          {type === 'connections' && (
            <View style={styles.tabsRow}>
              {(['connected', 'received', 'sent'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabBtn, connectionsTab === tab && styles.tabBtnActive]}
                  onPress={() => setConnectionsTab(tab)}
                >
                  <Text style={[styles.tabBtnText, connectionsTab === tab && styles.tabBtnTextActive]}>
                    {tab === 'connected' ? 'Connected' : tab === 'received' ? 'Received' : 'Sent'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search students..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? `No students matching "${searchQuery}"`
                  : type === 'connections'
                  ? connectionsTab === 'received'
                    ? 'No pending connection requests.'
                    : connectionsTab === 'sent'
                    ? 'No sent connection requests.'
                    : 'No connections yet. Connect with classmates!'
                  : followersMode === 'requests'
                  ? 'No pending follow requests.'
                  : `No ${type} found.`}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item, idx) => String(item.id || idx)}
              renderItem={({ item }) => {
                const u = item.user || item.other_user || item;
                const userId = u.id || item.user_id;
                const initial = (u.full_name || u.username || 'U').charAt(0).toUpperCase();

                return (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => onSelectUser(userId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>

                    <View style={styles.userInfo}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName}>{u.full_name || u.username}</Text>
                        {u.is_verified && (
                          <Shield size={12} color="#38bdf8" style={{ marginLeft: 4 }} />
                        )}
                      </View>
                      <Text style={styles.userHandle}>@{u.username}</Text>
                      {u.college_name ? (
                        <Text style={styles.userCollege} numberOfLines={1}>
                          {u.college_name}
                        </Text>
                      ) : null}
                    </View>

                    {/* Action buttons depending on mode */}
                    {followersMode === 'requests' ? (
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => handleRespondFollowRequest(item.id, 'ACCEPT')}
                          disabled={actionLoadingId === item.id}
                        >
                          <Check size={14} color="#fff" />
                          <Text style={styles.acceptBtnText}>Confirm</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.declineBtn}
                          onPress={() => handleRespondFollowRequest(item.id, 'REJECT')}
                          disabled={actionLoadingId === item.id}
                        >
                          <X size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : type === 'connections' && connectionsTab === 'received' ? (
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => handleRespondConnection(userId, 'ACCEPT')}
                          disabled={actionLoadingId === userId}
                        >
                          <Check size={14} color="#fff" />
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.declineBtn}
                          onPress={() => handleRespondConnection(userId, 'DECLINE')}
                          disabled={actionLoadingId === userId}
                        >
                          <X size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : type === 'connections' && connectionsTab === 'sent' ? (
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => handleCancelConnection(userId)}
                        disabled={actionLoadingId === userId}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.viewBtn}
                        onPress={() => onSelectUser(userId)}
                      >
                        <Text style={styles.viewBtnText}>View</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.listContent}
            />
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
    height: '80%',
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  subTab: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  subTabActive: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subTabText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  subTabTextActive: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  tabBtnActive: {
    backgroundColor: '#0284c7',
  },
  tabBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  userHandle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  userCollege: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  declineBtn: {
    backgroundColor: '#334155',
    padding: 6,
    borderRadius: 10,
  },
  cancelBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  cancelBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  viewBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  viewBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
});
