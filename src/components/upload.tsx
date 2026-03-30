import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { COLORS, API_BASE } from "@/lib/constants";
const TEMP_USER_ID = "user_001";

export default function UploadScreen() {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileType, setFileType] = useState<"document" | "image">("document");

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
        setFileType("document");
      }
    } catch (err) {
      Alert.alert("Error", "Could not pick document");
    }
  };

  const pickImage = async () => {
    try {
      // Request media library permissions (ImagePicker docs)
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert("Permission required", "Media library access needed to pick images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
        setFileType("image");
      }
    } catch (err) {
      Alert.alert("Error", "Could not pick image");
    }
  };

  const uploadFile = async () => {
    if (!selectedFile || !description.trim()) {
      Alert.alert("Missing info", "Please select a file and add a description");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append("file", {
        uri: selectedFile.uri,
        name: selectedFile.name || `file_${Date.now()}`,
        type: selectedFile.mimeType || "application/octet-stream",
      } as any);

      formData.append("description", description.trim());
      formData.append("userId", TEMP_USER_ID);
      formData.append("fileType", fileType);

      const res = await fetch(`/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.error) {
        Alert.alert("Upload failed", data.error);
        return;
      }

      // Success → go back to chat
      // File is saved silently, no UI shown
      router.back();
    } catch (err) {
      Alert.alert("Error", "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setDescription("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Upload File</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Pick buttons */}
        {!selectedFile && (
          <View style={styles.pickSection}>
            <Text style={styles.sectionLabel}>Choose what to upload</Text>

            <Pressable style={styles.pickBtn} onPress={pickDocument}>
              <Text style={styles.pickIcon}>📄</Text>
              <Text style={styles.pickTitle}>Document / PDF</Text>
              <Text style={styles.pickSub}>PDF, Word, Text files, Markdown</Text>
            </Pressable>

            <Pressable style={styles.pickBtn} onPress={pickImage}>
              <Text style={styles.pickIcon}>🖼️</Text>
              <Text style={styles.pickTitle}>Image / Photo</Text>
              <Text style={styles.pickSub}>JPG, PNG, screenshots (crop & edit)</Text>
            </Pressable>
          </View>
        )}

        {/* Selected file preview */}
        {selectedFile && (
          <View style={styles.filePreview}>
            <View style={styles.filePreviewHeader}>
              <Text style={styles.filePreviewIcon}>
                {fileType === "image" ? "🖼️" : "📄"}
              </Text>
              <View style={styles.filePreviewInfo}>
                <Text style={styles.filePreviewName} numberOfLines={1}>
                  {selectedFile.name || "Selected file"}
                </Text>
                <Text style={styles.filePreviewSize}>
                  {selectedFile.size
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                    : ""}
                </Text>
              </View>
              <Pressable onPress={clearFile} style={styles.clearBtn}>
                <Text style={styles.clearText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Description input */}
        <View style={styles.descSection}>
          <Text style={styles.sectionLabel}>Add a description *</Text>
          <Text style={styles.sectionHint}>
            This helps you find the file later. Be specific!
          </Text>
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Food receipt from Shoprite March 28"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={4}
            maxLength={300}
          />
          <Text style={styles.charCount}>{description.length}/300</Text>
        </View>

        {/* Tips */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>💡 Good description examples:</Text>
          <Text style={styles.tipItem}>• "Receipt for groceries from Shoprite"</Text>
          <Text style={styles.tipItem}>• "My class assignment notes March 2026"</Text>
          <Text style={styles.tipItem}>• "Payment proof for rent March"</Text>
        </View>

        {/* Upload button */}
        {selectedFile && (
          <Pressable
            style={[
              styles.uploadBtn,
              (!description.trim() || loading) && styles.uploadBtnDisabled,
            ]}
            onPress={uploadFile}
            disabled={!description.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.uploadBtnText}>Save File Silently</Text>
            )}
          </Pressable>
        )}

        <Text style={styles.noteText}>
          🔒 Your file will be saved privately. No preview will be shown in chat.
          Ask me to find it anytime.
        </Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    padding: 4,
  },
  backText: {
    color: COLORS.secondary,
    fontSize: 15,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  headerRight: {
    width: 60,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  pickSection: {
    gap: 12,
  },
  sectionLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  pickBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  pickIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  pickTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  pickSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  filePreview: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  filePreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filePreviewIcon: {
    fontSize: 28,
  },
  filePreviewInfo: {
    flex: 1,
  },
  filePreviewName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  filePreviewSize: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  clearBtn: {
    padding: 6,
  },
  clearText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  descSection: {
    gap: 4,
  },
  descInput: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 100,
    textAlignVertical: "top",
    marginTop: 8,
  },
  charCount: {
    color: COLORS.textSecondary,
    fontSize: 11,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  tipsBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  tipsTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  tipItem: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  uploadBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  uploadBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  uploadBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  noteText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
