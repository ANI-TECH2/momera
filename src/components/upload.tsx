import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS, API_BASE } from "@/lib/constants";

type PickedFile = {
  uri: string;
  name?: string;
  size?: number;
  mimeType?: string;
};

export default function UploadScreen() {
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileType, setFileType] = useState<"document" | "image">("document");
  const { session } = useAuth();

  const hasDescription = description.trim().length > 0;
  const canSubmit = !!selectedFile && hasDescription && !loading;

  const fileMeta = useMemo(() => {
    if (!selectedFile) return null;

    const sizeLabel = selectedFile.size
      ? selectedFile.size >= 1024 * 1024
        ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(selectedFile.size / 1024).toFixed(1)} KB`
      : "Unknown size";

    return {
      icon: fileType === "image" ? "🖼️" : "📄",
      typeLabel: fileType === "image" ? "Image file" : "Document file",
      sizeLabel,
      name: selectedFile.name || "Selected file",
    };
  }, [selectedFile, fileType]);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "text/markdown",
          "image/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];

        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType || "application/octet-stream",
        });

        if ((asset.mimeType || "").startsWith("image/")) {
          setFileType("image");
        } else {
          setFileType("document");
        }
      }
    } catch (error) {
      console.error("[Upload] pickDocument error:", error);
      Alert.alert("Error", "Could not pick document.");
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "Media library access is needed to pick images."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];

        setSelectedFile({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          size: asset.fileSize,
          mimeType: asset.mimeType || "image/jpeg",
        });

        setFileType("image");
      }
    } catch (error) {
      console.error("[Upload] pickImage error:", error);
      Alert.alert("Error", "Could not pick image.");
    }
  };

  const uploadFile = async () => {
    const token = session?.access_token;

    console.log("[Upload] API_BASE:", API_BASE);
    console.log("[Upload] token exists:", !!token);
    console.log("[Upload] selectedFile:", selectedFile);
    console.log("[Upload] description:", description.trim());
    console.log("[Upload] fileType:", fileType);

    if (!token) {
      Alert.alert("Login Required", "Please log in to upload files.");
      router.push("/(auth)/login");
      return;
    }

    if (!selectedFile || !description.trim()) {
      Alert.alert(
        "Missing info",
        "Please select a file and add a description."
      );
      return;
    }

    setLoading(true);

    try {
      const fileName =
        selectedFile.name ||
        (fileType === "image"
          ? `image_${Date.now()}.jpg`
          : `file_${Date.now()}.bin`);

      const mimeType =
        selectedFile.mimeType ||
        (fileType === "image" ? "image/jpeg" : "application/octet-stream");

      const formData = new FormData();

      formData.append("file", {
        uri: selectedFile.uri,
        name: fileName,
        type: mimeType,
      } as any);

      formData.append("description", description.trim());
      formData.append("fileType", fileType);

      console.log("[Upload] sending file:", {
        uri: selectedFile.uri,
        name: fileName,
        type: mimeType,
      });

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const rawText = await res.text();
      console.log("[Upload] status:", res.status);
      console.log("[Upload] raw response:", rawText);

      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        Alert.alert(
          "Upload failed",
          data?.error || `Server error: ${res.status}`
        );
        return;
      }

      if (data?.error) {
        Alert.alert("Upload failed", data.error);
        return;
      }

      Alert.alert("Success", "File saved successfully.");
      setSelectedFile(null);
      setDescription("");
      setFileType("document");
      router.back();
    } catch (error: any) {
      console.error("[Upload] uploadFile error:", error);
      Alert.alert(
        "Error",
        error?.message || "Upload failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setDescription("");
    setFileType("document");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.background}
        translucent={false}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Upload File</Text>
          <Text style={styles.headerSubtitle}>Save documents and images privately</Text>
        </View>

        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!selectedFile ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose what to upload</Text>
            <Text style={styles.sectionSubtext}>
              Select a document or image you want to save.
            </Text>

            <Pressable style={styles.optionCard} onPress={pickDocument}>
              <View style={styles.optionIconWrap}>
                <Text style={styles.optionIcon}>📄</Text>
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Document / PDF</Text>
                <Text style={styles.optionSub}>
                  PDF, Word, text files, markdown
                </Text>
              </View>
            </Pressable>

            <Pressable style={styles.optionCard} onPress={pickImage}>
              <View style={styles.optionIconWrap}>
                <Text style={styles.optionIcon}>🖼️</Text>
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Image / Photo</Text>
                <Text style={styles.optionSub}>
                  JPG, PNG, screenshots, gallery images
                </Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.selectedCard}>
            <View style={styles.selectedTopRow}>
              <View style={styles.selectedIconWrap}>
                <Text style={styles.selectedIcon}>{fileMeta?.icon}</Text>
              </View>

              <View style={styles.selectedInfo}>
                <Text style={styles.selectedName} numberOfLines={1}>
                  {fileMeta?.name}
                </Text>
                <Text style={styles.selectedMeta}>
                  {fileMeta?.typeLabel} • {fileMeta?.sizeLabel}
                </Text>
              </View>

              <Pressable onPress={clearFile} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>Ready to save</Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.sectionSubtext}>
            Add a clear description so you can search for this file later.
          </Text>

          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Food receipt from Shoprite March 28"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={5}
            maxLength={300}
            textAlignVertical="top"
          />

          <View style={styles.inputFooter}>
            <Text style={styles.helperText}>
              Be specific so retrieval works better.
            </Text>
            <Text style={styles.charCount}>{description.length}/300</Text>
          </View>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Good description examples</Text>
          <Text style={styles.tipItem}>• Receipt for groceries from Shoprite</Text>
          <Text style={styles.tipItem}>• My class assignment notes March 2026</Text>
          <Text style={styles.tipItem}>• Payment proof for rent March</Text>
        </View>

        <Pressable
          style={[styles.uploadBtn, !canSubmit && styles.uploadBtnDisabled]}
          onPress={uploadFile}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={styles.uploadBtnText}>
              {selectedFile ? "Save File" : "Select a file first"}
            </Text>
          )}
        </Pressable>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Private upload</Text>
          <Text style={styles.noteText}>
            Your file will be saved privately. It will not appear as a chat preview.
            You can ask the app to find it later using your description.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
    marginTop: Platform.OS === "android" ? -1 : 0,
  },
  headerCenter: { flex: 1, paddingHorizontal: 12 },
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  headerSubtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  headerRight: { width: 42 },
  scroll: { flex: 1 },
  content: { padding: 18, paddingBottom: 32, gap: 18 },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  sectionSubtext: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  optionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 12,
  },
  optionIcon: { fontSize: 24 },
  optionTextWrap: { flex: 1 },
  optionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  optionSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  selectedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  selectedTopRow: { flexDirection: "row", alignItems: "center" },
  selectedIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 12,
  },
  selectedIcon: { fontSize: 24 },
  selectedInfo: { flex: 1, marginRight: 10 },
  selectedName: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  selectedMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  removeBtnText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: "700" },
  selectedBadge: {
    alignSelf: "flex-start",
    marginTop: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  selectedBadgeText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  descInput: {
    minHeight: 120,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },
  inputFooter: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  helperText: { flex: 1, color: COLORS.textSecondary, fontSize: 11 },
  charCount: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "600" },
  tipsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tipsTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700", marginBottom: 10 },
  tipItem: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  uploadBtn: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  uploadBtnDisabled: { opacity: 0.55 },
  uploadBtnText: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  noteCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  noteTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700", marginBottom: 6 },
  noteText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 20 },
});