import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../theme/colors';
import { api } from '../../config/api';
import { X, Search, UserCheck } from 'lucide-react-native';

interface DirectorySearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (user: any) => void;
}

export const DirectorySearchModal: React.FC<DirectorySearchModalProps> = ({
  visible,
  onClose,
  onSelectUser,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      if (query.trim().length >= 1) {
        searchUsers(query.trim());
      } else {
        setResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, visible]);

  const searchUsers = async (q: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/authentication/users/search/?q=${encodeURIComponent(q)}`);
      setResults(res.data.results || res.data || []);
    } catch (e) {
      console.log('Error searching directory', e);
    } finally {
      setLoading(false);
    }
  };

  const renderUserItem = ({ item }: { item: any }) => {
    const name = item.full_name || item.email?.split('@')[0] || 'Student';
    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => onSelectUser(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        <View style={styles.chatAction}>
          <Text style={styles.chatActionText}>Chat</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Campus Directory</Text>
          <View style={{ width: 30 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search verified students by name or email..."
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : results.length === 0 ? (
          <View style={styles.centerBox}>
            <UserCheck size={36} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>
              {query.length > 0 ? 'No students found' : 'Find your classmates'}
            </Text>
            <Text style={styles.emptySub}>
              Search by name or college email to start a private conversation.
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderUserItem}
            contentContainerStyle={styles.listContent}
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#93c5fd',
    fontSize: 15,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '700',
  },
  userEmail: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  chatAction: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chatActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
