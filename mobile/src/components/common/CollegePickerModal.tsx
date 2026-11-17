import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Building2, Check, Search, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface CollegeCatalogItem {
  id: number;
  name: string;
  short_name: string;
}

interface CollegePickerModalProps {
  visible: boolean;
  colleges: CollegeCatalogItem[];
  selectedCollegeId?: number;
  title?: string;
  onSelect: (college: CollegeCatalogItem) => void;
  onClose: () => void;
}

const CITY_FILTERS = ['All', 'Dehradun', 'Haldwani', 'Uttarakhand'] as const;
type CityFilter = (typeof CITY_FILTERS)[number];

const DEHRADUN_CODES = new Set([
  'GEU', 'GEHU', 'DIT', 'UPES', 'UU', 'DU_DDN', 'TULAS', 'DBS', 'IUU',
  'SGRRU', 'DBUU', 'DOLPHIN', 'BFIT', 'DAV_DDN', 'MDU_DDN', 'JIGYASA',
]);

const HALDWANI_CODES = new Set([
  'GEHU_HLD', 'MBPG', 'AMRAPALI', 'MIET_K', 'PCTM', 'GMC_HLD', 'UOU', 'BIAS', 'KU_NTL',
]);

export const CollegePickerModal: React.FC<CollegePickerModalProps> = ({
  visible,
  colleges,
  selectedCollegeId,
  title = 'Select Uttarakhand College',
  onSelect,
  onClose,
}) => {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<CityFilter>('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return colleges.filter((c) => {
      const code = (c.short_name || '').toUpperCase();
      const nameL = (c.name || '').toLowerCase();
      if (cityFilter === 'Dehradun' && !DEHRADUN_CODES.has(code) && !nameL.includes('dehradun') && !nameL.includes('graphic era')) {
        return false;
      }
      if (cityFilter === 'Haldwani' && !HALDWANI_CODES.has(code) && !nameL.includes('haldwani') && !nameL.includes('bhimtal') && !nameL.includes('nainital')) {
        return false;
      }
      if (!q) return true;
      return nameL.includes(q) || code.toLowerCase().includes(q);
    });
  }, [colleges, search, cityFilter]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.modalOverlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={[styles.header, { borderBottomColor: colors.hairline }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Building2 size={17} color={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close college picker">
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBox, { backgroundColor: colors.surfaceLight, borderColor: colors.cardBorder }]}>
            <Search size={15} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search GEU, Haldwani, MBPG, UPES, DIT..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.cityRow}>
            {CITY_FILTERS.map((city) => {
              const active = cityFilter === city;
              return (
                <TouchableOpacity
                  key={city}
                  style={[
                    styles.cityPill,
                    {
                      backgroundColor: active ? colors.chipActiveBg : colors.surfaceLight,
                      borderColor: active ? colors.chipActiveBorder : colors.cardBorder,
                    },
                  ]}
                  onPress={() => setCityFilter(city)}
                >
                  <Text
                    style={[
                      styles.cityPillText,
                      { color: active ? colors.chipActiveText : colors.textSecondary },
                    ]}
                  >
                    {city}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No college matched "{search}". Try another keyword.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = selectedCollegeId === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.itemRow,
                    {
                      backgroundColor: selected ? colors.chipActiveBg : 'transparent',
                      borderColor: selected ? colors.chipActiveBorder : colors.hairline,
                    },
                  ]}
                  onPress={() => {
                    onSelect(item);
                    setSearch('');
                    onClose();
                  }}
                  activeOpacity={0.78}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.itemCode, { color: colors.textMuted }]}>{item.short_name}</Text>
                  </View>
                  {selected && <Check size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '82%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 10,
  },
  cityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  cityPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  itemCode: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 24,
  },
});
