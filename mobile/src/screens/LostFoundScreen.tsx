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
import { colors } from '../theme/colors';
import { lostFoundService, LostFoundItem } from '../services/lostFoundService';

export const LostFoundScreen = () => {
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
      Alert.alert('Required', 'Please describe the item and where it was lost/found.');
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
      Alert.alert('Reported! 📢', 'Your lost & found notice is now visible across campus.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContact = async (item: LostFoundItem) => {
    if (item.is_mine) {
      Alert.alert('Notice', 'This is your own report.');
      return;
    }

    try {
      const res = await lostFoundService.contactReporter(item.id);
      Alert.alert(
        'Chat Thread Opened! 💬',
        `Direct chat started with ${item.reporter_name}.\nMessage context: "${item.description.slice(0, 40)}..."`
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not open chat.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lost & Found</Text>
          <Text style={styles.headerSubtitle}>Frictionless 1-step campus recovery</Text>
        </View>

        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.reportBtnText}>+ Report Item</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {(['ALL', 'LOST', 'FOUND'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'ALL' ? 'All Notices' : tab === 'LOST' ? '🔍 Lost' : '🎁 Found'}
            </Text>
          </TouchableOpacity>
        ))}
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
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.typeTag,
                    item.item_type === 'LOST' ? styles.lostTag : styles.foundTag,
                  ]}
                >
                  <Text style={styles.typeTagText}>
                    {item.item_type === 'LOST' ? '🔍 LOST' : '🎁 FOUND'}
                  </Text>
                </View>
                <Text style={styles.reporterName}>Reported by {item.reporter_name}</Text>
              </View>

              <Text style={styles.itemDesc}>{item.description}</Text>

              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={styles.locationText}>{item.location}</Text>
              </View>

              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => handleContact(item)}
              >
                <Text style={styles.contactBtnText}>
                  {item.item_type === 'LOST' ? 'I Found This! (Message)' : 'This is Mine! (Claim)'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Modal: Frictionless Report */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report Lost / Found Item</Text>
            <Text style={styles.modalSubtitle}>
              No complex forms. Just tell what happened and where.
            </Text>

            <View style={styles.typeToggleRow}>
              <TouchableOpacity
                style={[styles.typeOption, reportType === 'LOST' && styles.typeOptionLost]}
                onPress={() => setReportType('LOST')}
              >
                <Text style={styles.typeOptionText}>🔍 I Lost Something</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeOption, reportType === 'FOUND' && styles.typeOptionFound]}
                onPress={() => setReportType('FOUND')}
              >
                <Text style={styles.typeOptionText}>🎁 I Found Something</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Descriptive Message</Text>
            <TextInput
              style={[styles.input, styles.descInput]}
              placeholder="e.g. Black boat airdopes case mila CS lab 3 me, bench no 4 ke paas."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={styles.label}>Location (Where was it?)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. CS Lab 3, 2nd Floor Block B"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 14,
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
  reportBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  reportBtnText: {
    color: '#064e3b',
    fontWeight: '800',
    fontSize: 13,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  lostTag: {
    backgroundColor: '#7f1d1d',
  },
  foundTag: {
    backgroundColor: '#064e3b',
  },
  typeTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  reporterName: {
    color: colors.textMuted,
    fontSize: 12,
  },
  itemDesc: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginVertical: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  locationIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  locationText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  contactBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  contactBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.textSecondary,
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
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  typeOptionLost: {
    backgroundColor: '#7f1d1d',
    borderColor: '#ef4444',
  },
  typeOptionFound: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  typeOptionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
    marginBottom: 12,
  },
  descInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
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
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#064e3b',
    fontWeight: '800',
  },
});
