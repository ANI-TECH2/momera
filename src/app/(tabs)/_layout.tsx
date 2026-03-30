import { Tabs } from 'expo-router';
import { Redirect } from 'expo-router';
import { COLORS } from '@/lib/constants';
import { Platform, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function TabsLayout() {
  const { session, loading } = useAuth();

  // Show spinner while checking auth state
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Block unauthenticated users
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingBottom: Platform.OS === 'ios' ? 8 : 0,
        },
        tabBarItemStyle: {
          paddingVertical: 8,
        },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 24, color }}>
              {focused ? '💬' : '💭'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 24, color }}>
              {focused ? '⚙️' : '🛠️'}
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});