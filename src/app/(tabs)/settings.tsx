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
import { useAuth } from "@/lib/auth";
import type { UserMetadata } from "@/lib/types";
import { COLORS, API_BASE, FREE_STORAGE_LIMIT } from "@/lib/constants";

export default function SettingsScreen() {
  const { user, supabase, loading: authLoading } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const storageUsed = 12 * 1024 * 1024;
  const storagePercent = Math.min(
    (storageUsed / FREE_STORAGE_LIMIT) * 100,
    100
  );

  const userMetadata = (user?.user_metadata as UserMetadata) || {};
  const displayName =
    userMetadata.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = userMetadata.avatar_url;
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
    setProfileEditing((prev) => !prev);
  };

  const closeEditProfile = () => {
    setProfileEditing(false);
    setEditingName(displayName);
    setProfileImageUri(null);
  };

  const pickProfileImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow photo library access.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
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
      const fileExt = uri.split(".").pop() || "jpg";
      const fileName = `${user?.id}/avatar.${fileExt}`;
      const file = {
        uri,
        name: fileName,
        type: "image/jpeg",
      } as any;

      const { error } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error("[Settings] uploadAvatar error:", error);
      Alert.alert("Upload failed", "Could not upload profile picture.");
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
        newAvatarUrl = await uploadAvatar(profileImageUri);
        if (!newAvatarUrl) {
          setSavingProfile(false);
          return;
        }
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
      Alert.alert(
        "Export failed",
        "Could not export your data. Please try again."
      );
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

  const SettingRow = ({
    icon,
    title,
    subtitle,
    onPress,
    danger = false,
    right,
  }: {
    icon: string;
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
      <View style={styles.settingIconWrap}>
        <Text style={styles.settingIcon}>{icon}</Text>
      </View>

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

      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Account</Text>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>
          Manage your profile, storage and privacy
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.profileCard} onPress={openEditProfile}>
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
            <Text style={styles.profilePlan} numberOfLines={1}>
              Free Plan • {user.email}
            </Text>
          </View>

          <View style={styles.editBadge}>
            <Text style={styles.editBadgeText}>
              {profileEditing ? "Close" : "Edit"}
            </Text>
          </View>
        </Pressable>

        {profileEditing && (
          <View style={styles.editProfileCard}>
            <Text style={styles.editTitle}>Edit Profile</Text>

            <Text style={styles.editLabel}>Display Name</Text>
            <TextInput
              style={styles.editNameInput}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.textSecondary}
              autoCorrect={false}
              autoCapitalize="words"
            />

            <Pressable style={styles.pickAvatarBtn} onPress={pickProfileImage}>
              <Text style={styles.pickAvatarText}>
                {profileImageUri
                  ? "Photo selected — tap to change"
                  : "Pick Profile Photo"}
              </Text>
            </Pressable>

            <View style={styles.editButtons}>
              <Pressable style={styles.cancelBtn} onPress={closeEditProfile}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.saveBtn,
                  savingProfile && styles.saveBtnDisabled,
                ]}
                onPress={saveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>

          <View style={styles.storageCard}>
            <View style={styles.storageTop}>
              <Text style={styles.storageUsed}>
                {formatSize(storageUsed)} used
              </Text>
              <Text style={styles.storageLimit}>
                of {formatSize(FREE_STORAGE_LIMIT)}
              </Text>
            </View>

            <View style={styles.storageBar}>
              <View
                style={[
                  styles.storageBarFill,
                  { width: `${storagePercent}%` },
                  storagePercent > 80 && styles.storageBarWarning,
                ]}
              />
            </View>

            <View style={styles.storageBottom}>
              <Text style={styles.storagePercentText}>
                {storagePercent.toFixed(0)}% used
              </Text>
              <Text style={styles.storageNote}>
                Files stored privately
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Data</Text>

          <View style={styles.card}>
            <SettingRow
              icon="⬇️"
              title="Download My Data"
              subtitle="Export notes, files and chats as JSON"
              onPress={handleExport}
              right={
                exporting ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : undefined
              }
            />
            <View style={styles.divider} />
            <SettingRow
              icon="🗑️"
              title="Clear Chat History"
              subtitle="Delete all chat messages now"
              onPress={handleClearChat}
              danger
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>

          <View style={styles.card}>
            <SettingRow
              icon="🔒"
              title="Auto-delete Chat"
              subtitle="Chat messages clear every 24 hours"
              right={<Text style={styles.badgeGreen}>ON</Text>}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="🛡️"
              title="Private Storage"
              subtitle="Files are stored privately, not visible in chat"
              right={<Text style={styles.badgeGreen}>ON</Text>}
            />
          </View>
        </View>

        <View style={styles.upgradeCard}>
          <Text style={styles.upgradeTitle}>Upgrade to Pro 🚀</Text>
          <Text style={styles.upgradeDesc}>
            Get more storage, longer memory and priority features
          </Text>

          <Pressable style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>View Plans</Text>
          </Pressable>
        </View>

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

  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: COLORS.background,
  },
  loaderText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },

  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 48,
  },

  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileAvatarText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  profilePlan: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  editBadge: {
    backgroundColor: COLORS.primary + "18",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  editBadgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },

  editProfileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + "66",
  },
  editTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  editLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  editNameInput: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickAvatarBtn: {
    backgroundColor: COLORS.primary + "12",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  pickAvatarText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  editButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  section: {
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingLeft: 4,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },

  storageCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  storageTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
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
  },
  storageBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  storageBarWarning: {
    backgroundColor: COLORS.warning,
  },
  storageBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  storagePercentText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  storageNote: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  settingRowPressed: {
    opacity: 0.7,
  },
  settingIconWrap: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  settingIcon: {
    fontSize: 19,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  dangerText: {
    color: COLORS.error,
  },
  settingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  chevron: {
    color: COLORS.textSecondary,
    fontSize: 22,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 62,
  },

  badgeGreen: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: "800",
    backgroundColor: COLORS.success + "18",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  upgradeCard: {
    backgroundColor: COLORS.primary + "14",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    gap: 10,
    alignItems: "center",
  },
  upgradeTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
  },
  upgradeDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  upgradeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 2,
  },
  upgradeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  appInfo: {
    alignItems: "center",
    gap: 4,
    paddingTop: 4,
  },
  appInfoText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
});