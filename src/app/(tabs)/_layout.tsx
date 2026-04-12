import { Tabs, Redirect } from "expo-router";
import { COLORS } from "@/lib/constants";
import {
  Platform,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

function TabIcon({
  label,
  symbol,
  focused,
  color,
}: {
  label: string;
  symbol: string;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={styles.tabIconContainer}>
      <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
        <Text style={[styles.iconSymbol, { color }]}>{symbol}</Text>
      </View>
      <Text
        style={[
          styles.customLabel,
          { color },
          focused && styles.customLabelActive,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your workspace...</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  const bottomPadding = Math.max(
    insets.bottom,
    Platform.OS === "ios" ? 10 : 8
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: 70 + bottomPadding,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          paddingHorizontal: 12,
        },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              label="Chat"
              symbol="💬"
              focused={focused}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              label="Settings"
              symbol="⚙️"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "500",
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 70,
  },
  iconBubble: {
    minWidth: 42,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  iconBubbleActive: {
    backgroundColor: COLORS.primary + "18",
  },
  iconSymbol: {
    fontSize: 19,
  },
  customLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  customLabelActive: {
    fontWeight: "800",
  },
});