import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  BackHandler,
} from 'react-native';
import { colors } from './src/theme/colors';
import { Home, Building2, MessageSquare, User as UserIcon } from 'lucide-react-native';
import { authService, User } from './src/services/authService';
import { callService, CallType } from './src/services/callService';
import { AuthScreen } from './src/screens/AuthScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { CommunitiesScreen } from './src/screens/CommunitiesScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { LostFoundScreen } from './src/screens/LostFoundScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { CallScreen } from './src/screens/CallScreen';

type TabType = 'FEED' | 'COMMUNITIES' | 'CHAT' | 'LOST_FOUND' | 'PROFILE';

interface ActiveCallState {
  roomId: string;
  peerName: string;
  peerEmail?: string;
  callType: CallType;
  isIncoming?: boolean;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('FEED');
  const [selectedCommunityConv, setSelectedCommunityConv] = useState<any | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [composerTrigger, setComposerTrigger] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = '#0b0f19';
      document.documentElement.style.backgroundColor = '#0b0f19';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
    }
  }, []);

  // Instagram-style Back Button Support (Android Hardware + Web Browser history)
  useEffect(() => {
    const onBackPress = () => {
      if (activeCall) {
        setActiveCall(null);
        return true;
      }
      if (activeTab !== 'FEED') {
        setActiveTab('FEED');
        return true;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handlePopState = () => {
        onBackPress();
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        backSubscription.remove();
        window.removeEventListener('popstate', handlePopState);
      };
    }

    return () => backSubscription.remove();
  }, [activeCall, activeTab]);

  const navigateToTab = (tab: TabType) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
      window.history.pushState({ tab }, '', `#${tab.toLowerCase()}`);
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    checkInitialSession();
  }, []);

  // Real-time incoming call listener across devices
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      try {
        const activeCalls = await callService.getActiveCalls();
        const incoming = activeCalls.find(
          (c) => c.receiver === currentUser.id && c.status === 'RINGING'
        );
        if (incoming && (!activeCall || activeCall.roomId !== incoming.room_id)) {
          setActiveCall({
            roomId: incoming.room_id,
            peerName: incoming.caller_name || 'Campus Student',
            peerEmail: incoming.caller_email,
            callType: incoming.call_type,
            isIncoming: true,
          });
        }
      } catch (e) {}
    }, 2500);

    return () => clearInterval(interval);
  }, [currentUser, activeCall]);

  const checkInitialSession = async () => {
    try {
      const session = await authService.getStoredSession();
      if (session) {
        setCurrentUser(session.user);
      }
    } catch (e) {
      console.log('Session check error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveTab('FEED');
  };

  const handleUserSwitched = (newUser: User) => {
    setCurrentUser(newUser);
  };

  const handleProfileComplete = async () => {
    try {
      const updated = await authService.updateCurrentUser({ profile_completed: true });
      if (updated) {
        setCurrentUser(updated);
        setActiveTab('FEED');
        return;
      }
    } catch (e) {}
    if (currentUser) {
      setCurrentUser({ ...currentUser, profile_completed: true });
      setActiveTab('FEED');
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setActiveTab('FEED');
  };

  const handleOpenCommunityChat = (conv: any) => {
    setSelectedCommunityConv(conv);
    setActiveTab('CHAT');
  };

  const handleStartCall = async (
    receiverId: number,
    receiverName: string,
    callType: CallType
  ) => {
    try {
      const session = await callService.initiateCall({
        receiver_id: receiverId,
        call_type: callType,
      });
      setActiveCall({
        roomId: session.room_id,
        peerName: receiverName,
        peerEmail: session.receiver_email,
        callType: callType,
      });
    } catch (e: any) {
      Alert.alert('Call Failed', e.response?.data?.error || 'Could not connect call.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // 1. Unauthenticated -> Auth Screen
  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <AuthScreen onLoginSuccess={handleLoginSuccess} />
      </SafeAreaView>
    );
  }

  // 2. Authenticated but Profile Incomplete -> Onboarding Screen
  if (!currentUser.profile_completed) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <ProfileSetupScreen onProfileComplete={handleProfileComplete} />
      </SafeAreaView>
    );
  }

  // 3. Fully Onboarded Student -> Main App
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Screen Content */}
      <View style={styles.mainContent}>
        {activeTab === 'FEED' && <FeedScreen composerTrigger={composerTrigger} />}
        {activeTab === 'COMMUNITIES' && (
          <CommunitiesScreen currentUser={currentUser} />
        )}
        {activeTab === 'CHAT' && (
          <ChatScreen
            currentUser={currentUser}
            initialConversation={selectedCommunityConv}
            onClearInitialConversation={() => setSelectedCommunityConv(null)}
            onStartCall={handleStartCall}
          />
        )}
        {activeTab === 'LOST_FOUND' && <LostFoundScreen />}
        {activeTab === 'PROFILE' && (
          <ProfileScreen
            currentUser={currentUser}
            onUserSwitched={handleUserSwitched}
            onLogout={handleLogout}
            onStartCall={handleStartCall}
          />
        )}
      </View>

      {/* 4-Tab Bottom Navigation Bar (Feed, Hubs, Chats, Profile) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigateToTab('FEED')}
          activeOpacity={0.7}
        >
          <Home
            size={22}
            color={activeTab === 'FEED' ? colors.primary : colors.textSecondary}
            strokeWidth={activeTab === 'FEED' ? 2.5 : 1.8}
          />
          <Text style={[styles.tabLabel, activeTab === 'FEED' && styles.tabActiveText]}>
            Feed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigateToTab('COMMUNITIES')}
          activeOpacity={0.7}
        >
          <Building2
            size={22}
            color={activeTab === 'COMMUNITIES' ? colors.primary : colors.textSecondary}
            strokeWidth={activeTab === 'COMMUNITIES' ? 2.5 : 1.8}
          />
          <Text style={[styles.tabLabel, activeTab === 'COMMUNITIES' && styles.tabActiveText]}>
            Hubs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigateToTab('CHAT')}
          activeOpacity={0.7}
        >
          <MessageSquare
            size={22}
            color={activeTab === 'CHAT' ? colors.primary : colors.textSecondary}
            strokeWidth={activeTab === 'CHAT' ? 2.5 : 1.8}
          />
          <Text style={[styles.tabLabel, activeTab === 'CHAT' && styles.tabActiveText]}>
            Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigateToTab('PROFILE')}
          activeOpacity={0.7}
        >
          <UserIcon
            size={22}
            color={activeTab === 'PROFILE' ? colors.primary : colors.textSecondary}
            strokeWidth={activeTab === 'PROFILE' ? 2.5 : 1.8}
          />
          <Text style={[styles.tabLabel, activeTab === 'PROFILE' && styles.tabActiveText]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* Global Call Screen Overlay Modal */}
      {activeCall && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setActiveCall(null)}
        >
          <CallScreen
            roomId={activeCall.roomId}
            peerName={activeCall.peerName}
            peerEmail={activeCall.peerEmail}
            callType={activeCall.callType}
            isIncoming={Boolean(activeCall.isIncoming)}
            onClose={() => setActiveCall(null)}
          />
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  tabActiveText: {
    color: colors.primary,
    fontWeight: '800',
  },
});

// mctool->changed ->validity rule 
// ICE_result_df
// US_MAC_Final_