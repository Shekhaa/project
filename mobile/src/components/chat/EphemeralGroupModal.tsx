import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { chatService, Conversation } from '../../services/chatService';
import { X, Flame, Clock } from 'lucide-react-native';

interface EphemeralGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onGroupCreated: (conv: Conversation) => void;
}

const DURATION_OPTIONS = [
  { label: '1 Hour', value: 1 },
  { label: '6 Hours', value: 6 },
  { label: '24 Hours', value: 24 },
  { label: '7 Days', value: 168 },
];

export const EphemeralGroupModal: React.FC<EphemeralGroupModalProps> = ({
  visible,
  onClose,
  onGroupCreated,
}) => {
  const [name, setName] = useState('');
  const [purposeTag, setPurposeTag] = useState('');
  const [duration, setDuration] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Group Name Required', 'Please enter a name for your ephemeral group.');
      return;
    }

    try {
      setSubmitting(true);
      const conv = await chatService.createEphemeralGroup({
        name: name.trim(),
        purpose_tag: purposeTag.trim() || 'Study Group',
        duration,
      });
      setName('');
      setPurposeTag('');
      setDuration(24);
      onClose();
      onGroupCreated(conv);
    } catch (e: any) {
      Alert.alert('Creation Failed', e.response?.data?.error || 'Could not create ephemeral group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Flame size={20} color="#f97316" />
              <Text style={styles.title}>Self-Destructing Group</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            This group and all messages will permanently vanish after the chosen timer expires.
          </Text>

          {/* Group Name */}
          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Hackathon Team, Fest Organizers..."
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />

          {/* Purpose Tag */}
          <Text style={styles.inputLabel}>Purpose Tag (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Study, Event, Lost & Found..."
            placeholderTextColor={colors.textSecondary}
            value={purposeTag}
            onChangeText={setPurposeTag}
          />

          {/* Duration Selector */}
          <Text style={styles.inputLabel}>Self-Destruct Countdown</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((opt) => {
              const isSelected = duration === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.durationPill, isSelected && styles.durationPillActive]}
                  onPress={() => setDuration(opt.value)}
                >
                  <Clock size={12} color={isSelected ? '#fff' : colors.textSecondary} />
                  <Text
                    style={[
                      styles.durationText,
                      isSelected && styles.durationTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.createBtn, (!name.trim() || submitting) && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={!name.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Create Ephemeral Group 🔥</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f97316',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 14,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  durationPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 4,
  },
  durationPillActive: {
    backgroundColor: '#ea580c',
    borderColor: '#f97316',
  },
  durationText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  durationTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  createBtn: {
    backgroundColor: '#ea580c',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
