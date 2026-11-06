import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { lostFoundService, LostFoundItem } from '../services/lostFoundService';
import { MapPin, Plus, ShieldCheck, MessageCircle, HelpCircle } from 'lucide-react-native';

export const LostFoundScreen = () => {
  const { colors, isDark } = useTheme();
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'LOST' | 'FOUND'>('ALL');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Frictionless Report Form
  const [reportType, setReportType] = useState<'LOST' | 'FOUND'>('FOUND');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const typeParam = activeTab === 'ALL' ? undefined : activeTab;
      const data = await lostFoundService.getItems(typeParam);
      setItems(data);
    } catch (e) {
      console.log('Error fetching lost & found', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [activeTab]);

  const handleReport = async () => {
    if (!description.trim() || !location.trim()) {
      Alert.alert('Required', 'Please describe the item and where it was lost or found.');
      return;
    }

    setSubmitting(true);
    try {
      await lostFoundService.reportItem({
        item_type: reportType,
        description: description.trim(),
        location: location.trim(),
      });
      setModalVisible(false);
      setDescription('');
      setLocation('');
      await loadItems();
      Alert.alert('Reported! 📢', 'Your notice is now live for all students on campus.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContact = async (item: LostFoundItem) => {
    if (item.is_mine) {
      Alert.alert('Your Notice', 'This is your own report. Classmates who find or claim this item will message you directly.');
      return;
    }

    try {
      await lostFoundService.contactReporter(item.id);
      Alert.alert(
        'Chat Thread Opened! 💬',
        `Direct chat started with ${item.reporter_name}.\nMessage context: "${item.description.slice(0, 40)}..."`
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not open chat.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Lost & Found</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Frictionless 1-step campus recovery
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.reportBtn, { backgroundColor: colors.primary }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <Plus size={15} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.reportBtnText}>Report Item</Text>
        </TouchableOpacity>
      </View>

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
                    ? colors.primary
                    : colors.surface,
                  borderColor: active ? colors.primary : colors.cardBorder,
                },
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? '#ffffff' : colors.textSecondary,
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

      {/* List */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.typeTag,
                    item.item_type === 'LOST' ? styles.lostTag : styles.foundTag,
                  ]}
                >
                  <Text style={[styles.typeTagText, item.item_type === 'LOST' ? styles.lostTagText : styles.foundTagText]}>
                    {item.item_type === 'LOST' ? 'LOST ITEM' : 'FOUND ITEM'}
                  </Text>
                </View>
                <Text style={[styles.reporterName, { color: colors.textMuted }]}>
                  Reported by {item.reporter_name}
                </Text>
              </View>

              <Text style={[styles.itemDesc, { color: colors.textPrimary }]}>{item.description}</Text>

              <View style={styles.locationRow}>
                <MapPin size={13} color={colors.primary} style={{ marginRight: 5 }} />
                <Text style={[styles.locationText, { color: colors.textSecondary }]}>{item.location}</Text>
              </View>

              {/* Redesigned Claim / Contact Action Button */}
              {item.is_mine ? (
                <View
                  style={[
                    styles.contactBtn,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.cardBorder,
                      opacity: 0.8,
                    },
                  ]}
                >
                  <View style={styles.actionBtnInner}>
                    <HelpCircle size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={[styles.contactBtnText, { color: colors.textMuted }]}>
                      Your Notice · Active on Campus
                    </Text>
                  </View>
                </View>
              ) : item.item_type === 'FOUND' ? (
                <TouchableOpacity
                  style={[
                    styles.contactBtn,
                    {
                      backgroundColor: isDark ? 'rgba(94, 106, 210, 0.16)' : 'rgba(79, 70, 229, 0.08)',
                      borderColor: isDark ? 'rgba(94, 106, 210, 0.4)' : 'rgba(79, 70, 229, 0.28)',
                    },
                  ]}
                  onPress={() => handleContact(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.actionBtnInner}>
                    <ShieldCheck size={16} color={colors.primary} style={{ marginRight: 7 }} />
                    <Text style={[styles.contactBtnText, { color: colors.primary }]}>
                      Claim Item · Contact Finder
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.contactBtn,
                    {
                      backgroundColor: isDark ? 'rgba(39, 166, 68, 0.16)' : 'rgba(22, 163, 74, 0.08)',
                      borderColor: isDark ? 'rgba(39, 166, 68, 0.4)' : 'rgba(22, 163, 74, 0.28)',
                    },
                  ]}
                  onPress={() => handleContact(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.actionBtnInner}>
                    <MessageCircle size={16} color={colors.accent} style={{ marginRight: 7 }} />
                    <Text style={[styles.contactBtnText, { color: colors.accent }]}>
                      I Found This · Message Owner
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
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

      {/* Modal: Frictionless Report */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Report Lost / Found Item</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              No complex paperwork. Just specify what happened and where.
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
                      ? isDark ? 'rgba(39, 166, 68, 0.2)' : 'rgba(22, 163, 74, 0.12)'
                      : colors.surfaceLight,
                    borderColor: reportType === 'FOUND' ? colors.accent : colors.cardBorder,
                  },
                ]}
                onPress={() => setReportType('FOUND')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    { color: reportType === 'FOUND' ? colors.accent : colors.textSecondary },
                  ]}
                >
                  📦 I Found Something
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Item Description *</Text>
            <TextInput
              style={[
                styles.input,
                styles.descInput,
                {
                  backgroundColor: isDark ? '#141516' : '#f1f5f9',
                  borderColor: colors.cardBorder,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="e.g. Black boAt Airdopes case found in CS Lab 3, near bench 4."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Campus Location *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#141516' : '#f1f5f9',
                  borderColor: colors.cardBorder,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="e.g. CS Lab 3, 2nd Floor Block B"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  {
                    backgroundColor: colors.surfaceLight,
                    borderColor: colors.cardBorder,
                  },
                ]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                onPress={handleReport}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Publish Notice</Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  reportBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 12.5,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  typeTag: {
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  lostTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  foundTag: {
    backgroundColor: 'rgba(39, 166, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(39, 166, 68, 0.3)',
  },
  typeTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  lostTagText: {
    color: '#ef4444',
  },
  foundTagText: {
    color: '#16a34a',
  },
  reporterName: {
    fontSize: 12,
  },
  itemDesc: {
    fontSize: 15.5,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  locationText: {
    fontSize: 13,
  },
  contactBtn: {
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  typeOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
    fontSize: 13.5,
  },
  descInput: {
    height: 75,
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
  },
  cancelBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
});
