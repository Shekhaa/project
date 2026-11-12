import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  BackHandler,
  LogBox,
  Modal,
} from 'react-native';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

// Suppress React Native Web synthetic responder warnings during DevTools touch emulation & file pickers
LogBox.ignoreLogs([
  'Cannot record touch end without a touch start',
  'Touch Bank',
]);

if (Platform.OS === 'web' && typeof console !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Cannot record touch end without a touch start')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

import { Home, Building2, MessageSquare, User as UserIcon, Search } from 'lucide-react-native';
import {
  authService,
  User,
  computeCanParticipate,
  consumeMsOAuthMode,
} from './src/services/authService';
import { setAuthExpiredListener } from './src/config/api';
import { showCrossPlatformAlert } from './src/utils/mediaUtils';
import { AuthScreen } from './src/screens/AuthScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { CommunitiesScreen } from './src/screens/CommunitiesScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { LostFoundScreen } from './src/screens/LostFoundScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { StudentProfileModal } from './src/components/profile/StudentProfileModal';
import { VerificationGateModal } from './src/components/common/VerificationGateModal';

type TabType = 'FEED' | 'COMMUNITIES' | 'CHAT' | 'LOST_FOUND' | 'PROFILE';

function AppMain() {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('FEED');
  const [selectedCommunityConv, setSelectedCommunityConv] = useState<any | null>(null);
  const [composerTrigger, setComposerTrigger] = useState(0);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<number | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyReason, setVerifyReason] = useState<string | undefined>(undefined);

  const canParticipate = computeCanParticipate(currentUser);

  // Back Button Support (Android Hardware + Web Browser history)
  useEffect(() => {
    const onBackPress = () => {
      if (verifyModalVisible) {
        setVerifyModalVisible(false);
        return true;
      }
      if (authModalVisible) {
        setAuthModalVisible(false);
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
  }, [activeTab, authModalVisible, verifyModalVisible]);

  const navigateToTab = (tab: TabType) => {
    if (!currentUser && tab !== 'FEED') {
      setAuthModalVisible(true);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
      window.history.pushState({ tab }, '', `#${tab.toLowerCase()}`);
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    setAuthExpiredListener(() => {
      setCurrentUser(null);
      setActiveTab('FEED');
    });
    checkInitialSession();
    return () => {
      setAuthExpiredListener(null);
    };
  }, []);

  const checkInitialSession = async () => {
    try {
      const session = await authService.getStoredSession();
      let activeUser: User | null = session?.user || null;
      if (activeUser) {
        setCurrentUser(activeUser);
      }

      // Handle Microsoft Entra ID web redirect fragment (#id_token= or #access_token=) centrally
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
        const rawHash = window.location.hash.substring(1);
        if (rawHash.includes('id_token=') || rawHash.includes('access_token=')) {
          try {
            const params = new URLSearchParams(rawHash);
            const msToken = params.get('id_token') || params.get('access_token');
            if (window.history?.replaceState) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            if (msToken) {
              const oauthMode = await consumeMsOAuthMode();
              if (oauthMode === 'link' && session?.token) {
                const linked = await authService.linkWithMicrosoft(msToken);
                if (linked?.user) {
                  activeUser = linked.user;
                  setCurrentUser(linked.user);
                  showCrossPlatformAlert(
                    'College ID Linked',
                    linked.message || 'Your university Microsoft account is now verified.'
                  );
                }
              } else {
                const res = await authService.loginWithMicrosoft(msToken);
                if (res?.user) {
                  activeUser = res.user;
                  setCurrentUser(res.user);
                }
              }
            }
          } catch (oauthErr: any) {
            const errMsg =
              oauthErr?.response?.data?.error ||
              oauthErr?.response?.data?.detail ||
              oauthErr?.message ||
              'Microsoft verification failed.';
            showCrossPlatformAlert('Microsoft Verification', errMsg);
          }
        }
      }

      // Silently refresh user verification tier & admin flags on startup if signed in
      if (activeUser) {
        authService
          .getCurrentUser()
          .then((freshUser) => {
            if (freshUser) {
              setCurrentUser(freshUser);
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.log('Session check error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (user: User) => {
    setAuthModalVisible(false);
    setCurrentUser(user);
    setActiveTab('FEED');
  };

  const handleUserSwitched = (newUser: User) => {
    setCurrentUser(newUser);
    authService.updateCurrentUser(newUser).catch(() => {});
  };

  const handleProfileComplete = async (completedUser?: User) => {
    setActiveTab('FEED');
    if (completedUser) {
      setCurrentUser({ ...completedUser, profile_completed: true });
      return;
    }
    try {
      const fresh = await authService.getCurrentUser();
      if (fresh) {
        setCurrentUser({ ...fresh, profile_completed: true });
        return;
      }
      const updated = await authService.updateCurrentUser({ profile_completed: true });
      if (updated) {
        setCurrentUser(updated);
        return;
      }
    } catch (e) {}
    if (currentUser) {
      setCurrentUser({ ...currentUser, profile_completed: true });
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setViewingProfileUserId(null);
    setVerifyModalVisible(false);
    setActiveTab('FEED');
  };

  const handleRequireAuth = () => {
    setAuthModalVisible(true);
  };

  const handleRequireVerify = (reason?: string) => {
    if (!currentUser) {
      setAuthModalVisible(true);
      return;
    }
    setVerifyReason(reason);
    setVerifyModalVisible(true);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Authenticated non-staff with incomplete profile -> Mandatory Onboarding Screen
  if (currentUser && !currentUser.profile_completed && !currentUser.is_staff && !currentUser.is_superuser) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <ProfileSetupScreen
          currentUser={currentUser}
          onProfileComplete={handleProfileComplete}
          onUserUpdated={handleUserSwitched}
          onBack={handleLogout}
        />
      </SafeAreaView>
    );
  }

  const displayedTab: TabType = !currentUser ? 'FEED' : activeTab;

  // Main App Shell (Guest Read-Only Feed when !currentUser, Full App when authenticated)
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Screen Content */}
      <View style={styles.mainContent}>
        {displayedTab === 'FEED' && (
          <FeedScreen
            composerTrigger={composerTrigger}
            currentUser={currentUser}
            canParticipate={canParticipate}
            onRequireAuth={handleRequireAuth}
            onRequireVerify={handleRequireVerify}
            onNavigateToChat={(convId) => {
              if (!currentUser) {
                handleRequireAuth();
                return;
              }
              if (convId) {
                setSelectedCommunityConv({ id: String(convId) });
              }
              navigateToTab('CHAT');
            }}
            onOpenProfile={(uid) => {
              if (!currentUser) {
                handleRequireAuth();
                return;
              }
              setViewingProfileUserId(uid);
            }}
          />
        )}
        {displayedTab === 'COMMUNITIES' && currentUser && (
          <CommunitiesScreen
            currentUser={currentUser}
            canParticipate={canParticipate}
            onRequireVerify={handleRequireVerify}
            onOpenProfile={(uid) => setViewingProfileUserId(uid)}
          />
        )}
        {displayedTab === 'CHAT' && currentUser && (
          <ChatScreen
            currentUser={currentUser}
            canParticipate={canParticipate}
            onRequireVerify={handleRequireVerify}
            initialConversation={selectedCommunityConv}
            onClearInitialConversation={() => setSelectedCommunityConv(null)}
            onOpenProfile={(uid) => setViewingProfileUserId(uid)}
          />
        )}
        {displayedTab === 'LOST_FOUND' && currentUser && (
          <LostFoundScreen
            canParticipate={canParticipate}
            onRequireVerify={handleRequireVerify}
          />
        )}
        {displayedTab === 'PROFILE' && currentUser && (
          <ProfileScreen
            currentUser={currentUser}
            canParticipate={canParticipate}
            onRequireVerify={handleRequireVerify}
            onUserSwitched={handleUserSwitched}
            onLogout={handleLogout}
          />
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigateToTab('FEED')}
          activeOpacity={0.7}
        >
          <Home
            size={22}
            color={displayedTab === 'FEED' ? colors.primary : colors.textSecondary}
            strokeWidth={displayedTab === 'FEED' ? 2.5 : 1.8}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'FEED' ? colors.primary : colors.textMuted },
              displayedTab === 'FEED' && styles.tabActiveText,
            ]}
          >
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
            color={displayedTab === 'COMMUNITIES' ? colors.primary : colors.textSecondary}
            strokeWidth={displayedTab === 'COMMUNITIES' ? 2.5 : 1.8}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'COMMUNITIES' ? colors.primary : colors.textMuted },
              displayedTab === 'COMMUNITIES' && styles.tabActiveText,
            ]}
          >
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
            color={displayedTab === 'CHAT' ? colors.primary : colors.textSecondary}
            strokeWidth={displayedTab === 'CHAT' ? 2.5 : 1.8}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'CHAT' ? colors.primary : colors.textMuted },
              displayedTab === 'CHAT' && styles.tabActiveText,
            ]}
          >
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
            color={displayedTab === 'LOST_FOUND' ? colors.primary : colors.textSecondary}
            strokeWidth={displayedTab === 'LOST_FOUND' ? 2.5 : 1.8}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'LOST_FOUND' ? colors.primary : colors.textMuted },
              displayedTab === 'LOST_FOUND' && styles.tabActiveText,
            ]}
          >
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
            color={displayedTab === 'PROFILE' ? colors.primary : colors.textSecondary}
            strokeWidth={displayedTab === 'PROFILE' ? 2.5 : 1.8}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'PROFILE' ? colors.primary : colors.textMuted },
              displayedTab === 'PROFILE' && styles.tabActiveText,
            ]}
          >
            {currentUser ? 'Profile' : 'Sign In'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Global Student Profile Modal */}
      <StudentProfileModal
        visible={!!viewingProfileUserId}
        userId={viewingProfileUserId}
        canParticipate={canParticipate}
        onRequireVerify={handleRequireVerify}
        onClose={() => setViewingProfileUserId(null)}
        onOpenChat={(conv) => {
          setViewingProfileUserId(null);
          setSelectedCommunityConv(conv);
          navigateToTab('CHAT');
        }}
      />

      {/* Global Sign-In / Sign-Up Auth Modal (for Guests) */}
      {authModalVisible && (
        <Modal
          visible={authModalVisible}
          animationType={Platform.OS === 'web' ? 'none' : 'slide'}
          onRequestClose={() => setAuthModalVisible(false)}
        >
          <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <AuthScreen
              onDismiss={() => setAuthModalVisible(false)}
              onLoginSuccess={handleLoginSuccess}
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* Global Campus Verification Upgrade Modal (Invite Code / MS Link / ID Review) */}
      <VerificationGateModal
        visible={verifyModalVisible}
        currentUser={currentUser}
        reason={verifyReason}
        onClose={() => setVerifyModalVisible(false)}
        onVerified={(updatedUser) => {
          handleUserSwitched(updatedUser);
        }}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppMain />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: (Platform.OS === 'web' ? '100dvh' : '100%') as any,
    maxHeight: (Platform.OS === 'web' ? '100dvh' : undefined) as any,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
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
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  tabActiveText: {
    fontWeight: '700',
  },
});