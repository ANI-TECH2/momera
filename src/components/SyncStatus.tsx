import React, { useEffect } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSyncStatus } from "@/lib/useCached";
import { COLORS } from "./constants";

/**
 * Component: Sync Status Indicator
 * Shows at the top to indicate sync/offline status
 */
export function SyncStatusIndicator() {
  const { status, isOnline } = useSyncStatus();
  const [visible, setVisible] = React.useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    if (status === "synced") {
      // Auto-hide after 2s
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -50,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => setVisible(false));
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      setVisible(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [status]);

  if (!visible) return null;

  let icon = "cloud-check";
  let message = "Data synced";
  let bgColor = "#10b981";

  if (!isOnline) {
    icon = "cloud-offline";
    message = "Offline - changes will sync later";
    bgColor = "#f59e0b";
  } else if (status === "syncing") {
    icon = "cloud-upload";
    message = "Syncing...";
    bgColor = "#3b82f6";
  } else if (status === "error") {
    icon = "alert-circle";
    message = "Sync failed - will retry";
    bgColor = "#ef4444";
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: bgColor,
        },
      ]}
    >
      <Ionicons name={icon as any} size={16} color="white" />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  text: {
    color: "white",
    fontSize: 12,
    fontWeight: "500",
  },
});

/**
 * Hook: Initialize sync manager
 * Call this at app startup
 */
export function useInitializeSync() {
  useEffect(() => {
    const { cacheSyncManager } = require("@/lib/cacheSync");
    cacheSyncManager.start();

    return () => {
      cacheSyncManager.stop();
    };
  }, []);
}
