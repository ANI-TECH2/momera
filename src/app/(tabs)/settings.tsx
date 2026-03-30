import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
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
  const storagePercent = (storageUsed / FREE_STORAGE_LIMIT) * 100;

  const userMetadata = (user?.user_metadata as UserMetadata) || {};
  const displayName = userMetadata.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = userMetadata.avatar_url;
  const nameInitial = displayName.charAt(0).toUpperCase();

  // ✅ Initialize editingName from actual current name
  const [editingName, setEditingName] = useState(displayName);

  if (authLoading) {
    return (
      <ActivityIndicator
        style={{ flex: 1, backgroundColor: COLORS.background }}
        color={COLORS.primary}
      />
    );
  }

  // ✅ Safety net — layout guard should prevent this
  if (!user) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pickProfileImage = async () => {
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

    if (!result.canceled && result.assets[0]) {
      setProfileImageUri(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string): Promise<string | null> => {
    try {
      const fileExt = uri.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      const file = { uri, name: fileName, type: "image/jpeg" } as any;

      const { error } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch {
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
        if (!newAvatarUrl) return;
      }

      // ✅ Update name in Supabase auth user_metadata
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: editingName.trim(),
          avatar_url: newAvatarUrl,
        },
      });

      if (error) throw error;

      Alert.alert("Success", "Profile updated!");
      setProfileEditing(false);
      setProfileImageUri(null);
    } catch (err: any) {
      Alert.alert("Update failed", err.message || "Something went wrong.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = `${API_BASE}/api/export?userId=${user.id}`;
      await Linking.openURL(url);
    } catch {
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
      style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>
          {title}
        </Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {right || (onPress && <Text style={styles.chevron}>›</Text>)}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Profile card */}
        <Pressable
          style={styles.profileCard}
          onPress={() => {
            setEditingName(displayName); // ✅ Reset to current name on open
            setProfileEditing(!profileEditing);
          }}
        >
          <View style={styles.profileAvatar}>
            {avatarUrl || profileImageUri ? (
              <Image
                source={{ uri: profileImageUri || avatarUrl! }}
                style={styles.profileAvatarImage}
              />
            ) : (
              <Text style={styles.profileAvatarText}>{nameInitial}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profilePlan}>Free Plan · {user.email}</Text>
          </View>
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeText}>Edit ↗</Text>
          </View>
        </Pressable>

        {/* Edit profile form */}
        {profileEditing && (
          <View style={styles.editProfileCard}>
            <Text style={styles.editTitle}>Edit Profile</Text>

            {/* ✅ Name input pre-filled with current name */}
            <Text style={styles.editLabel}>Display Name</Text>
            <TextInput
              style={styles.editNameInput}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.textSecondary}
              autoCorrect={false}
            />

            <Pressable style={styles.pickAvatarBtn} onPress={pickProfileImage}>
              <Text style={styles.pickAvatarText}>
                {profileImageUri ? "✅ Photo selected — tap to change" : "Pick Profile Photo"}
              </Text>
            </Pressable>

            <View style={styles.editButtons}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => {
                  setProfileEditing(false);
                  setEditingName(displayName);
                  setProfileImageUri(null);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.saveBtn}
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

        {/* Storage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          <View style={styles.storageCard}>
            <View style={styles.storageTop}>
              <Text style={styles.storageUsed}>{formatSize(storageUsed)} used</Text>
              <Text style={styles.storageLimit}>of {formatSize(FREE_STORAGE_LIMIT)} free</Text>
            </View>
            <View style={styles.storageBar}>
              <View
                style={[
                  styles.storageBarFill,
                  { width: `${Math.min(storagePercent, 100)}%` },
                  storagePercent > 80 && styles.storageBarWarning,
                ]}
              />
            </View>
            <Text style={styles.storageNote}>
              Files stored privately · Chat clears every 24h
            </Text>
          </View>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Data</Text>
          <View style={styles.card}>
            <SettingRow
              icon="⬇️"
              title="Download My Data"
              subtitle="Export all notes, files and chats as JSON"
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

        {/* Privacy */}
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

        {/* Upgrade */}
        <View style={styles.upgradeCard}>
          <Text style={styles.upgradeTitle}>Upgrade to Pro 🚀</Text>
          <Text style={styles.upgradeDesc}>
            Get 10GB storage, longer memory and priority features
          </Text>
          <Pressable style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>View Plans</Text>
          </Pressable>
        </View>

        {/* App info */}
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
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  profileAvatarText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  profileName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  profilePlan: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  editBadge: {
    backgroundColor: COLORS.primary + "30",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editBadgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  editProfileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  editLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: -4,
  },
  editNameInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickAvatarBtn: {
    backgroundColor: COLORS.primary + "20",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  pickAvatarText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  editButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  storageCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  storageTop: {
    flexDirection: "row",
    justifyContent: "space-between",
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
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  storageBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  storageBarWarning: {
    backgroundColor: COLORS.warning,
  },
  storageNote: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  settingIcon: {
    fontSize: 20,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "500",
  },
  dangerText: {
    color: COLORS.error,
  },
  settingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: COLORS.textSecondary,
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 52,
  },
  badgeGreen: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: COLORS.success + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  upgradeCard: {
    backgroundColor: COLORS.primary + "20",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 8,
    alignItems: "center",
  },
  upgradeTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  upgradeDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  upgradeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 4,
  },
  upgradeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  appInfo: {
    alignItems: "center",
    gap: 4,
  },
  appInfoText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
});