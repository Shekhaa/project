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
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { api } from '../../config/api';
import { Search, X, Check, UserPlus } from 'lucide-react-native';

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
      Alert.alert('Error', e.response?.data?.error || 'Could not add selected members.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header (Instagram Style) */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerLeftBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>

          <TouchableOpacity
            onPress={handleConfirm}
            style={[
              styles.addBtn,
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
        <View style={styles.searchContainer}>
          <Search size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search students by name, email, or ID..."
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={16} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Pill Bar */}
        {selectedIds.length > 0 && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedCountText}>
              {selectedIds.length} {selectedIds.length === 1 ? 'person' : 'people'} selected
            </Text>
          </View>
        )}

        {/* Results List */}
        {loading && results.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
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
                  <Text style={styles.emptyText}>No students found</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isSelected = selectedIds.includes(item.id);
              const initial = (item.full_name || item.email || 'S')[0].toUpperCase();

              return (
                <TouchableOpacity
                  style={[styles.userRow, isSelected && styles.userRowSelected]}
                  onPress={() => toggleSelect(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>

                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.full_name || item.email.split('@')[0]}
                    </Text>
                    <Text style={styles.userSub} numberOfLines={1}>
                      {item.course_branch || item.email}
                    </Text>
                  </View>

                  {/* Instagram-style circular checkmark */}
                  <View
                    style={[
                      styles.checkCircle,
                      isSelected && styles.checkCircleSelected,
                    ]}
                  >
                    {isSelected && <Check size={14} color="#0f172a" strokeWidth={3} />}
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
