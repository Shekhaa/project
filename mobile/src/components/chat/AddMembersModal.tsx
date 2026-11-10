import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../config/api';
import { UserAvatar } from '../common/UserAvatar';
import { showCrossPlatformAlert } from '../../utils/mediaUtils';
import { Search, X, Check } from 'lucide-react-native';

interface AddMembersModalProps {
  visible: boolean;
  title?: string;
  existingMemberIds?: number[];
  onClose: () => void;
  onAddMembers: (selectedIds: number[]) => Promise<void>;
}

export const AddMembersModal: React.FC<AddMembersModalProps> = ({
  visible,
  title = 'Add People',
  existingMemberIds = [],
  onClose,
  onAddMembers,
}) => {
  const { colors: themeColors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load initial students or search
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setSelectedIds([]);
      setSubmitting(false);
      return;
    }
    searchUsers('');
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const searchUsers = async (q: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/authentication/users/search/?q=${encodeURIComponent(q.trim())}`);
      const list = res.data.results || res.data || [];
      // Filter out users who are already members
      const filtered = list.filter((u: any) => !existingMemberIds.includes(u.id));
      setResults(filtered);
    } catch {
      // fallback empty
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0 || submitting) return;
    try {
      setSubmitting(true);
      await onAddMembers(selectedIds);
      onClose();
    } catch (e: any) {
      showCrossPlatformAlert('Error', e.response?.data?.error || 'Could not add selected members.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Header (Instagram Style) */}
        <View
          style={[
            styles.header,
            { backgroundColor: themeColors.surface, borderBottomColor: themeColors.cardBorder },
          ]}
        >
          <TouchableOpacity onPress={onClose} style={styles.headerLeftBtn}>
            <Text style={[styles.cancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>

          <TouchableOpacity
            onPress={handleConfirm}
            style={[
              styles.addBtn,
              { backgroundColor: themeColors.primary },
              (selectedIds.length === 0 || submitting) && styles.addBtnDisabled,
            ]}
            disabled={selectedIds.length === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.addBtnText}>
                Add{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: themeColors.surfaceLight, borderColor: themeColors.cardBorder },
          ]}
        >
          <Search size={16} color={themeColors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.textPrimary }]}
            placeholder="Search students by name, email, or ID..."
            placeholderTextColor={themeColors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Pill Bar */}
        {selectedIds.length > 0 && (
          <View style={[styles.selectedBar, { backgroundColor: themeColors.primary + '1A' }]}>
            <Text style={[styles.selectedCountText, { color: themeColors.primary }]}>
              {selectedIds.length} {selectedIds.length === 1 ? 'person' : 'people'} selected
            </Text>
          </View>
        )}

        {/* Results List */}
        {loading && results.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
                    No students found
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isSelected = selectedIds.includes(item.id);
              const name = item.full_name || item.username || item.email?.split('@')[0] || 'Student';

              return (
                <TouchableOpacity
                  style={[
                    styles.userRow,
                    isSelected && { backgroundColor: themeColors.primary + '14' },
                  ]}
                  onPress={() => toggleSelect(item.id)}
                  activeOpacity={0.7}
                >
                  <UserAvatar
                    uri={item.avatar || item.profile_picture}
                    name={name}
                    size={44}
                    style={{ marginRight: 12 }}
                  />

                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.userSub, { color: themeColors.textSecondary }]} numberOfLines={1}>
                      {item.username ? `@${item.username} • ` : ''}
                      {item.course_branch || item.email}
                    </Text>
                  </View>

                  {/* Instagram-style circular checkmark */}
                  <View
                    style={[
                      styles.checkCircle,
                      { borderColor: themeColors.cardBorder },
                      isSelected && {
                        backgroundColor: themeColors.primary,
                        borderColor: themeColors.primary,
                      },
                    ]}
                  >
                    {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerLeftBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cancelText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '55%',
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 70,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.5,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  selectedBar: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    marginHorizontal: 16,
    borderRadius: 6,
    marginBottom: 6,
  },
  selectedCountText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  userRowSelected: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#475569',
  },
  avatarText: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  userSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
});
