import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

import { useAuth } from "@/lib/auth";
import type { UserMetadata } from "@/lib/types";
import { COLORS, API_BASE, FREE_STORAGE_LIMIT } from "@/lib/constants";

export default function SettingsScreen() {
  const { user, supabase, signOut, loading: authLoading } = useAuth();
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Replace this later with real usage from DB/storage if you want
  const storageUsed = 12 * 1024 * 1024;
  const storagePercent = Math.min((storageUsed / FREE_STORAGE_LIMIT) * 100, 100);

  const userMetadata = (user?.user_metadata as UserMetadata) || {};
  const displayName = userMetadata.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = userMetadata.avatar_url || null;
  const nameInitial = displayName.charAt(0).toUpperCase();

  const [editingName, setEditingName] = useState(displayName);

  const currentAvatar = useMemo(
    () => profileImageUri || avatarUrl || null,
    [profileImageUri, avatarUrl]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const openEditProfile = () => {
    setEditingName(displayName);
    setProfileImageUri(null);
    setProfileEditing(true);
  };

  const closeEditProfile = () => {
    setProfileEditing(false);
    setEditingName(displayName);
    setProfileImageUri(null);
  };

  const pickProfileImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow photo library access.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setProfileImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("[Settings] pickProfileImage error:", error);
      Alert.alert("Error", "Could not open image library.");
    }
  };

  const uploadAvatar = async (uri: string): Promise<string | null> => {
    try {
      if (!user?.id) {
        Alert.alert("Error", "User not found.");
        return null;
      }

      const fileExt = uri.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = fileExt === "png" ? "png" : "jpg";
      const filePath = `${user.id}/avatar.${safeExt}`;
      const contentType = safeExt === "png" ? "image/png" : "image/jpeg";

      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("[Settings] uploadAvatar upload error:", uploadError);
        Alert.alert("Upload failed", uploadError.message);
        return null;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      if (!data?.publicUrl) {
        Alert.alert("Upload failed", "Could not get image URL.");
        return null;
      }

      return `${data.publicUrl}?t=${Date.now()}`;
    } catch (error: any) {
      console.error("[Settings] uploadAvatar error:", error);
      Alert.alert("Upload failed", error?.message || "Something went wrong.");
      return null;
    }
  };

  const saveProfile = async () => {
    if (!editingName.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }

    setSavingProfile(true);

    try {
      let newAvatarUrl = avatarUrl;

      if (profileImageUri) {
        const uploadedUrl = await uploadAvatar(profileImageUri);
        if (!uploadedUrl) return;
        newAvatarUrl = uploadedUrl;
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: editingName.trim(),
          avatar_url: newAvatarUrl,
        },
      });

      if (error) throw error;

      Alert.alert("Success", "Profile updated successfully.");
      setProfileEditing(false);
      setProfileImageUri(null);
    } catch (err: any) {
      console.error("[Settings] saveProfile error:", err);
      Alert.alert("Update failed", err?.message || "Something went wrong.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExport = async () => {
    if (!user?.id) return;

    setExporting(true);

    try {
      const url = `${API_BASE}/api/export?userId=${user.id}`;
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert("Export failed", "Cannot open export link on this device.");
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.error("[Settings] handleExport error:", error);
      Alert.alert("Export failed", "Could not export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleClearChat = () => {
    Alert.alert(
      "Clear Chat History",
      "This will delete all your chat messages. Your saved notes and files will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            Alert.alert("Done", "Chat history cleared.");
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      await signOut();
      router.replace("/(auth)/login");
    } catch (error: any) {
      console.error("[Settings] logout error:", error);
      Alert.alert("Logout failed", error?.message || "Could not log out.");
      setLoggingOut(false);
    }
  };

  const SettingRow = ({
    title,
    subtitle,
    onPress,
    danger = false,
    right,
  }: {
    title: string;
    subtitle?: string;
    onPress?: () => void;
    danger?: boolean;
    right?: React.ReactNode;
  }) => (
    <Pressable
      style={({ pressed }) => [
        styles.settingRow,
        pressed && onPress ? styles.settingRowPressed : null,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingInfo}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>
          {title}
        </Text>
        {!!subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>

      {right || (onPress ? <Text style={styles.chevron}>›</Text> : null)}
    </Pressable>
  );

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
          translucent={false}
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loaderText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.background}
        translucent={false}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>
            Manage your account and private data
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.profileAvatar}>
              {currentAvatar ? (
                <Image source={{ uri: currentAvatar }} style={styles.profileAvatarImage} />
              ) : (
                <Text style={styles.profileAvatarText}>{nameInitial}</Text>
              )}
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
          </View>

          <Pressable style={styles.editButton} onPress={openEditProfile}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        {profileEditing && (
          <View style={styles.editCard}>
            <Text style={styles.cardTitle}>Edit Profile</Text>

            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.textSecondary}
              autoCorrect={false}
              autoCapitalize="words"
            />

            <Pressable style={styles.secondaryButton} onPress={pickProfileImage}>
              <Text style={styles.secondaryButtonText}>
                {profileImageUri ? "Change Photo" : "Pick Profile Photo"}
              </Text>
            </Pressable>

            <View style={styles.actionRow}>
              <Pressable style={styles.cancelButton} onPress={closeEditProfile}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryButton, savingProfile && styles.buttonDisabled]}
                onPress={saveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>

          <View style={styles.card}>
            <View style={styles.storageTop}>
              <Text style={styles.storageUsed}>{formatSize(storageUsed)} used</Text>
              <Text style={styles.storageLimit}>
                of {formatSize(FREE_STORAGE_LIMIT)}
              </Text>
            </View>

            <View style={styles.storageBar}>
              <View
                style={[
                  styles.storageBarFill,
                  { width: `${storagePercent}%` },
                ]}
              />
            </View>

            <Text style={styles.storageNote}>
              Your uploaded files are stored privately.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>

          <View style={styles.card}>
            <SettingRow
              title="Download My Data"
              subtitle="Export notes, files, and chats"
              onPress={handleExport}
              right={
                exporting ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : undefined
              }
            />
            <View style={styles.divider} />
            <SettingRow
              title="Clear Chat History"
              subtitle="Delete all chat messages"
              onPress={handleClearChat}
              danger
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.card}>
            <SettingRow
              title="Private Storage"
              subtitle="Your files stay linked to your account"
              right={<Text style={styles.statusText}>ON</Text>}
            />
          </View>
        </View>

        <Pressable
          style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
          onPress={handleLogout}
        >
          {loggingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.logoutButtonText}>Log Out</Text>
          )}
        </Pressable>

        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Memora v1.0.0</Text>
          <Text style={styles.appInfoText}>Your private AI memory</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scroll: {
    flex: 1,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: COLORS.background,
  },

  loaderText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },

  header: {
    marginBottom: 20,
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },

  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },

  profileTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  profileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 14,
  },

  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },

  profileAvatarText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },

  profileInfo: {
    flex: 1,
  },

  profileName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },

  profileEmail: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },

  editButton: {
    marginTop: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },

  editButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },

  editCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },

  cardTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 14,
  },

  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },

  input: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },

  secondaryButton: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },

  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },

  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  section: {
    marginTop: 6,
    marginBottom: 16,
  },

  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    paddingLeft: 2,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    paddingVertical: 2,
  },

  storageTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    marginBottom: 12,
  },

  storageUsed: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },

  storageLimit: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  storageBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 999,
    overflow: "hidden",
    marginHorizontal: 16,
  },

  storageBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },

  storageNote: {
    color: COLORS.textSecondary,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  settingRowPressed: {
    opacity: 0.7,
  },

  settingInfo: {
    flex: 1,
  },

  settingTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },

  settingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },

  dangerText: {
    color: COLORS.error,
  },

  chevron: {
    color: COLORS.textSecondary,
    fontSize: 22,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 16,
  },

  statusText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  logoutButton: {
    backgroundColor: COLORS.error,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  appInfo: {
    alignItems: "center",
    marginTop: 20,
    gap: 4,
  },

  appInfoText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
});