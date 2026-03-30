import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '@/lib/constants';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)/chat" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
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