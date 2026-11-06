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
import { Home, Building2, MessageSquare, User as UserIcon, Search } from 'lucide-react-native';
import { authService, User } from './src/services/authService';
import { setAuthExpiredListener } from './src/config/api';
import { AuthScreen } from './src/screens/AuthScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { CommunitiesScreen } from './src/screens/CommunitiesScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { LostFoundScreen } from './src/screens/LostFoundScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { StudentProfileModal } from './src/components/profile/StudentProfileModal';

type TabType = 'FEED' | 'COMMUNITIES' | 'CHAT' | 'LOST_FOUND' | 'PROFILE';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('FEED');
  const [selectedCommunityConv, setSelectedCommunityConv] = useState<any | null>(null);
  const [composerTrigger, setComposerTrigger] = useState(0);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = colors.background;
      document.documentElement.style.backgroundColor = colors.background;
      document.body.style.margin = '0';
      document.body.style.padding = '0';
    }
  }, []);

  // Instagram-style Back Button Support (Android Hardware + Web Browser history)
  useEffect(() => {
    const onBackPress = () => {
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
  }, [activeTab]);

  const navigateToTab = (tab: TabType) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
      window.history.pushState({ tab }, '', `#${tab.toLowerCase()}`);
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    setAuthExpiredListener(() => {
      setCurrentUser(null);
    });
    checkInitialSession();
    return () => {
      setAuthExpiredListener(null);
    };
  }, []);

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
        <ProfileSetupScreen
          currentUser={currentUser}
          onProfileComplete={handleProfileComplete}
        />
      </SafeAreaView>
    );
  }

  // 3. Fully Onboarded Student -> Main App
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Screen Content */}
      <View style={styles.mainContent}>
        {activeTab === 'FEED' && (
          <FeedScreen
            composerTrigger={composerTrigger}
            currentUser={currentUser}
            onNavigateToChat={(convId) => {
              if (convId) {
                setSelectedCommunityConv({ id: String(convId) });
              }
              navigateToTab('CHAT');
            }}
            onOpenProfile={(uid) => setViewingProfileUserId(uid)}
          />
        )}
        {activeTab === 'COMMUNITIES' && (
          <CommunitiesScreen
            currentUser={currentUser}
            onOpenProfile={(uid) => setViewingProfileUserId(uid)}
          />
        )}
        {activeTab === 'CHAT' && (
          <ChatScreen
            currentUser={currentUser}
            initialConversation={selectedCommunityConv}
            onClearInitialConversation={() => setSelectedCommunityConv(null)}
            onOpenProfile={(uid) => setViewingProfileUserId(uid)}
          />
        )}
        {activeTab === 'LOST_FOUND' && <LostFoundScreen />}
        {activeTab === 'PROFILE' && (
          <ProfileScreen
            currentUser={currentUser}
            onUserSwitched={handleUserSwitched}
            onLogout={handleLogout}
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
            Campus
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
          onPress={() => navigateToTab('LOST_FOUND')}
          activeOpacity={0.7}
        >
          <Search
            size={22}
            color={activeTab === 'LOST_FOUND' ? colors.primary : colors.textSecondary}
            strokeWidth={activeTab === 'LOST_FOUND' ? 2.5 : 1.8}
          />
          <Text style={[styles.tabLabel, activeTab === 'LOST_FOUND' && styles.tabActiveText]}>
            Lost/Found
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

      {/* Global Student Profile Modal */}
      <StudentProfileModal
        visible={!!viewingProfileUserId}
        userId={viewingProfileUserId}
        onClose={() => setViewingProfileUserId(null)}
        onOpenChat={(conv) => {
          setViewingProfileUserId(null);
          setSelectedCommunityConv(conv);
          navigateToTab('CHAT');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    height: (Platform.OS === 'web' ? '100dvh' : '100%') as any,
    maxHeight: (Platform.OS === 'web' ? '100dvh' : undefined) as any,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 100,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  tabActiveText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});

// mctool->changed ->validity rule 
// ICE_result_df
// US_MAC_Final_