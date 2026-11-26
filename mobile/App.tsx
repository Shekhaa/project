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

// Global native unhandled exception barrier: prevents Android release APK force-close
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const previousHandler = (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.warn('Captured Global Exception (prevented process exit):', error, isFatal);
    if (!isFatal && previousHandler) {
      try {
        previousHandler(error, isFatal);
      } catch {}
    }
  });
}

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Home, Building2, MessageSquare, User as UserIcon, Search, Flame } from 'lucide-react-native';
import {
  authService,
  User,
  computeCanParticipate,
  consumeMsOAuthMode,
} from './src/services/authService';
import { notificationService } from './src/services/notificationService';
import { backHandlerRegistry } from './src/services/backHandlerRegistry';
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
  const [feedRefreshTrigger, setFeedRefreshTrigger] = useState(0);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<number | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyReason, setVerifyReason] = useState<string | undefined>(undefined);

  const canParticipate = computeCanParticipate(currentUser);

  // Back Button Support (Android Hardware + Web Browser history)
  useEffect(() => {
    const onBackPress = () => {
      // 1. Pop topmost modal from registry (Comments, Composer, Share, Profile, ImageViewer, etc.)
      if (backHandlerRegistry.handleBack()) {
        return true;
      }
      // 2. Check root-level modals
      if (viewingProfileUserId) {
        setViewingProfileUserId(null);
        return true;
      }
      if (verifyModalVisible) {
        setVerifyModalVisible(false);
        return true;
      }
      if (authModalVisible) {
        setAuthModalVisible(false);
        return true;
      }
      // 3. Step back to Home FEED from other tabs
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
  }, [activeTab, authModalVisible, verifyModalVisible, viewingProfileUserId]);

  const navigateToTab = (tab: TabType) => {
    if (tab === 'FEED' && activeTab === 'FEED') {
      // Tap Home when already on Feed -> Instagram style scroll to top & refresh
      setFeedRefreshTrigger((prev) => prev + 1);
      return;
    }
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

  // Register and listen for native push notifications when signed in
  useEffect(() => {
    if (currentUser) {
      notificationService.registerForNativePushNotifications().catch(() => {});
      const unsubscribe = notificationService.attachNativeResponseListener((data) => {
        if (data?.conversation_id) {
          navigateToTab('CHAT');
        } else if (data?.post_id) {
          navigateToTab('FEED');
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [currentUser]);

  const checkInitialSession = async () => {
    try {
      const session = await authService.getStoredSession();
      let activeUser: User | null = session?.user || null;
      if (activeUser && typeof activeUser.id === 'number') {
        setCurrentUser(activeUser);
      } else {
        activeUser = null;
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
            if (freshUser && typeof freshUser.id === 'number') {
              setCurrentUser(freshUser);
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.log('Session check error', e);
      try {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_info']);
      } catch {}
      setCurrentUser(null);
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
  const isProfileIncomplete =
    currentUser &&
    !currentUser.profile_completed &&
    !currentUser.is_staff &&
    !currentUser.is_superuser;

  if (isProfileIncomplete) {
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
            feedRefreshTrigger={feedRefreshTrigger}
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
        {(displayedTab === 'LOST_FOUND' || (displayedTab as string) === 'ARENA') && currentUser && (
          <LostFoundScreen
            currentUser={currentUser}
            canParticipate={canParticipate}
            onRequireAuth={handleRequireAuth}
            onRequireVerify={handleRequireVerify}
            onOpenProfile={(uid) => setViewingProfileUserId(uid)}
            onNavigateToChat={(convId) => {
              if (convId) {
                setSelectedCommunityConv({ id: String(convId) });
              }
              navigateToTab('CHAT');
            }}
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
          <View
            style={[
              styles.tabIconPill,
              displayedTab === 'FEED' && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(2, 132, 199, 0.12)',
              },
            ]}
          >
            <Home
              size={20}
              color={displayedTab === 'FEED' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted}
              strokeWidth={displayedTab === 'FEED' ? 2.4 : 1.8}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'FEED' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted },
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
          <View
            style={[
              styles.tabIconPill,
              displayedTab === 'COMMUNITIES' && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(2, 132, 199, 0.12)',
              },
            ]}
          >
            <Building2
              size={20}
              color={displayedTab === 'COMMUNITIES' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted}
              strokeWidth={displayedTab === 'COMMUNITIES' ? 2.4 : 1.8}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'COMMUNITIES' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted },
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
          <View
            style={[
              styles.tabIconPill,
              displayedTab === 'CHAT' && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(2, 132, 199, 0.12)',
              },
            ]}
          >
            <MessageSquare
              size={20}
              color={displayedTab === 'CHAT' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted}
              strokeWidth={displayedTab === 'CHAT' ? 2.4 : 1.8}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'CHAT' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted },
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
          <View
            style={[
              styles.tabIconPill,
              (displayedTab === 'LOST_FOUND' || (displayedTab as string) === 'ARENA') && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(2, 132, 199, 0.12)',
              },
            ]}
          >
            <Flame
              size={20}
              color={(displayedTab === 'LOST_FOUND' || (displayedTab as string) === 'ARENA') ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted}
              strokeWidth={(displayedTab === 'LOST_FOUND' || (displayedTab as string) === 'ARENA') ? 2.4 : 1.8}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: (displayedTab === 'LOST_FOUND' || (displayedTab as string) === 'ARENA') ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted },
              (displayedTab === 'LOST_FOUND' || (displayedTab as string) === 'ARENA') && styles.tabActiveText,
            ]}
          >
            Arena
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigateToTab('PROFILE')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.tabIconPill,
              displayedTab === 'PROFILE' && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(2, 132, 199, 0.12)',
              },
            ]}
          >
            <UserIcon
              size={20}
              color={displayedTab === 'PROFILE' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted}
              strokeWidth={displayedTab === 'PROFILE' ? 2.4 : 1.8}
            />
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: displayedTab === 'PROFILE' ? (isDark ? '#ffffff' : colors.primary) : colors.textMuted },
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

      {/* Global Sign-In / Sign-Up Auth Screen (Rendered as full-screen overlay to avoid nested Modal crashes on Android) */}
      {authModalVisible && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background, zIndex: 9999 }]}>
          <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <AuthScreen
              onDismiss={() => setAuthModalVisible(false)}
              onLoginSuccess={handleLoginSuccess}
            />
          </SafeAreaView>
        </View>
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

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo);
  }

  handleReload = async () => {
    this.setState({ hasError: false, error: null });
  };

  handleResetSession = async () => {
    try {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_info']);
    } catch {}
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f19', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#6366F1', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, width: '100%', maxWidth: 280, alignItems: 'center' }}
            onPress={this.handleReload}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Reload Campus Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }}
            onPress={this.handleResetSession}
          >
            <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '600' }}>Clear Saved Session & Start Fresh</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <AppMain />
      </ThemeProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: (Platform.OS === 'web' ? '100dvh' : '100%') as any,
    maxHeight: (Platform.OS === 'web' ? '100dvh' : undefined) as any,
    maxWidth: Platform.OS === 'web' ? 620 : undefined,
    width: '100%',
    alignSelf: 'center',
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
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 100,
    elevation: 10,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 620 : undefined,
    alignSelf: 'center',
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  tabIconPill: {
    width: 40,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 2,
  },
  tabActiveText: {
    fontWeight: '700',
  },
});