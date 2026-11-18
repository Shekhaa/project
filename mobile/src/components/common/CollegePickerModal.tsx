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
import { Building2, Check, MapPin, Search, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface CollegeCatalogItem {
  id: number;
  name: string;
  short_name: string;
  city?: string;
}

export const getCollegeCity = (item: CollegeCatalogItem): string => {
  if (item.city && item.city.trim()) return item.city.trim();
  const nameL = (item.name || '').toLowerCase();
  const codeL = (item.short_name || '').toLowerCase();
  if (nameL.includes('rudrapur') || codeL.includes('rdr') || codeL.includes('dvp')) return 'Rudrapur';
  if (nameL.includes('haldwani') || codeL.includes('hld')) return 'Haldwani';
  if (nameL.includes('bhimtal')) return 'Bhimtal';
  if (nameL.includes('nainital') || codeL.includes('ntl')) return 'Nainital';
  if (nameL.includes('pantnagar')) return 'Pantnagar';
  if (nameL.includes('roorkee') || codeL.includes('iitr') || codeL.includes('coer')) return 'Roorkee';
  if (nameL.includes('rishikesh')) return 'Rishikesh';
  if (nameL.includes('srinagar') || codeL.includes('nituk') || codeL.includes('hnbgu')) return 'Srinagar Garhwal';
  if (nameL.includes('dehradun') || codeL.includes('ddn') || codeL.includes('geu') || codeL.includes('dit') || codeL.includes('upes')) return 'Dehradun';
  return 'Uttarakhand';
};

interface CollegePickerModalProps {
  visible: boolean;
  colleges: CollegeCatalogItem[];
  selectedCollegeId?: number;
  title?: string;
  onSelect: (college: CollegeCatalogItem) => void;
  onClose: () => void;
}

const CITY_FILTERS = ['All', 'Dehradun', 'Haldwani', 'Rudrapur', 'Uttarakhand'] as const;
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
      const city = getCollegeCity(c).toLowerCase();

      if (cityFilter === 'Dehradun') {
        if (!DEHRADUN_CODES.has(code) && !city.includes('dehradun') && !nameL.includes('dehradun') && !nameL.includes('graphic era')) {
          return false;
        }
      } else if (cityFilter === 'Haldwani') {
        if (!HALDWANI_CODES.has(code) && !city.includes('haldwani') && !nameL.includes('haldwani') && !nameL.includes('bhimtal') && !nameL.includes('nainital')) {
          return false;
        }
      } else if (cityFilter === 'Rudrapur') {
        if (!city.includes('rudrapur') && !nameL.includes('rudrapur') && !code.includes('RDR') && !code.includes('DVP')) {
          return false;
        }
      }

      if (!q) return true;
      return nameL.includes(q) || code.toLowerCase().includes(q) || city.includes(q);
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
                    <View style={styles.itemMetaRow}>
                      <Text style={[styles.itemCode, { color: colors.primary }]}>{item.short_name}</Text>
                      <Text style={[styles.itemDot, { color: colors.textMuted }]}>•</Text>
                      <View style={styles.cityBadge}>
                        <MapPin size={11} color={colors.textSecondary} />
                        <Text style={[styles.itemCity, { color: colors.textSecondary }]}>{getCollegeCity(item)}</Text>
                      </View>
                    </View>
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
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  itemDot: {
    fontSize: 11,
  },
  cityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  itemCity: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  itemCode: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 24,
  },
});
