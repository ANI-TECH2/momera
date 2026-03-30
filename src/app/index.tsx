import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Redirect, useRouter } from 'expo-router';
import { COLORS } from '@/lib/constants';
import { useEffect, useState } from 'react';

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Redirect to login if not authenticated, tabs if logged in
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)/chat" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
