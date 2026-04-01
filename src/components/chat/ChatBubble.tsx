import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  Share,
} from "react-native";
import { ChatMessage } from "../../lib/types";
import { COLORS } from "../../lib/constants";
import { useAuth } from "@/lib/auth";

interface ChatBubbleProps {
  message: ChatMessage;
}

// ─── FILE TYPE HELPERS ────────────────────────────────────────

function getFileExtension(fileName: string | null | undefined): string {
  if (!fileName) return "FILE";
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "FILE";
  return ext.slice(0, 4);
}

function getFileSize(size: number | null | undefined): string {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isImageType(fileType: string | null | undefined): boolean {
  return fileType === "image" ||
    ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(
      (fileType ?? "").toLowerCase()
    );
}

// ─── IMAGE CARD ───────────────────────────────────────────────
function ImageCard({
  fileCard,
  onDelete,
}: {
  fileCard: NonNullable<ChatMessage["fileCard"]>;
  onDelete: () => void;
}) {
  return (
    <View style={cardStyles.imageCard}>
      {/* Image preview area */}
      <View style={cardStyles.imagePreview}>
        <View style={cardStyles.imageIconWrap}>
          <Text style={cardStyles.imageIconText}>🖼</Text>
        </View>
        <Text style={cardStyles.imagePreviewLabel} numberOfLines={1}>
          {fileCard.fileName ?? "Image"}
        </Text>
      </View>

      {/* File info */}
      <View style={cardStyles.imageInfo}>
        <View style={cardStyles.imageInfoRow}>
          <Text style={cardStyles.imageFileName} numberOfLines={1}>
            {fileCard.fileName ?? "Image"}
          </Text>
          <View style={cardStyles.imageBadge}>
            <Text style={cardStyles.imageBadgeText}>image</Text>
          </View>
        </View>

        {!!fileCard.description && (
          <Text style={cardStyles.imageDesc} numberOfLines={2}>
            {fileCard.description}
          </Text>
        )}

        {!!fileCard.createdAt && (
          <Text style={cardStyles.imageMeta}>
            {formatDate(fileCard.createdAt)}
          </Text>
        )}

        {/* Action buttons */}
        <View style={cardStyles.actionRow}>
          <Pressable
            style={cardStyles.actionBtn}
            onPress={() => {
              if (fileCard.signedUrl) Linking.openURL(fileCard.signedUrl);
            }}
          >
            <Text style={cardStyles.actionBtnText}>View</Text>
          </Pressable>

          <Pressable
            style={cardStyles.actionBtn}
            onPress={async () => {
              if (fileCard.signedUrl) {
                await Share.share({ url: fileCard.signedUrl, message: fileCard.fileName ?? "Image" });
              }
            }}
          >
            <Text style={cardStyles.actionBtnText}>Share</Text>
          </Pressable>

          <Pressable style={cardStyles.deleteBtn} onPress={onDelete}>
            <Text style={cardStyles.deleteBtnText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── DOCUMENT CARD ────────────────────────────────────────────
function DocumentCard({
  fileCard,
  onDelete,
}: {
  fileCard: NonNullable<ChatMessage["fileCard"]>;
  onDelete: () => void;
}) {
  const ext = getFileExtension(fileCard.fileName);
  const isPdf = ext === "PDF";

  return (
    <View style={cardStyles.docCard}>
      <View style={cardStyles.docRow}>
        {/* File type badge */}
        <View style={[cardStyles.docIcon, isPdf && cardStyles.docIconPdf]}>
          <Text style={[cardStyles.docIconText, isPdf && cardStyles.docIconTextPdf]}>
            {ext}
          </Text>
        </View>

        {/* File info */}
        <View style={cardStyles.docInfo}>
          <Text style={cardStyles.docName} numberOfLines={1}>
            {fileCard.fileName ?? "Document"}
          </Text>
          {!!fileCard.description && (
            <Text style={cardStyles.docDesc} numberOfLines={1}>
              {fileCard.description}
            </Text>
          )}
          {!!fileCard.createdAt && (
            <Text style={cardStyles.docMeta}>
              {formatDate(fileCard.createdAt)}
            </Text>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={[cardStyles.actionRow, cardStyles.docActionRow]}>
        <Pressable
          style={cardStyles.actionBtn}
          onPress={() => {
            if (fileCard.signedUrl) Linking.openURL(fileCard.signedUrl);
          }}
        >
          <Text style={cardStyles.actionBtnText}>Open</Text>
        </Pressable>

        <Pressable
          style={cardStyles.actionBtn}
          onPress={async () => {
            if (fileCard.signedUrl) {
              await Share.share({ url: fileCard.signedUrl, message: fileCard.fileName ?? "Document" });
            }
          }}
        >
          <Text style={cardStyles.actionBtnText}>Share</Text>
        </Pressable>

        <Pressable style={cardStyles.deleteBtn} onPress={onDelete}>
          <Text style={cardStyles.deleteBtnText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── MAIN BUBBLE ──────────────────────────────────────────────
export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const { session } = useAuth();

  const handleDeleteFile = () => {
    Alert.alert(
      "Delete file?",
      "This will permanently remove the file.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!message.fileCard?.id) return;
            try {
              const table = isImageType(message.fileCard.fileType)
                ? "images"
                : "documents";
              const res = await fetch(
                `/api/delete?id=${message.fileCard.id}&table=${table}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                  },
                }
              );
              if (res.ok) {
                Alert.alert("Deleted", "File removed successfully.");
              } else {
                Alert.alert("Error", "Failed to delete file.");
              }
            } catch {
              Alert.alert("Error", "Something went wrong.");
            }
          },
        },
      ]
    );
  };

  const renderContent = () => {
    // ─── FILE CARD ─────────────────────────────────────────
    if (message.type === "file_card" && message.fileCard) {
      const isImg = isImageType(message.fileCard.fileType);
      return (
        <View>
          <Text style={styles.assistantText}>{message.message}</Text>
          <View style={{ marginTop: 10 }}>
            {isImg ? (
              <ImageCard
                fileCard={message.fileCard}
                onDelete={handleDeleteFile}
              />
            ) : (
              <DocumentCard
                fileCard={message.fileCard}
                onDelete={handleDeleteFile}
              />
            )}
          </View>
        </View>
      );
    }

    // ─── SAVE CONFIRM ──────────────────────────────────────
    if (message.type === "save_confirm") {
      return (
        <Text style={[styles.assistantText, styles.successText]}>
          {message.message}
        </Text>
      );
    }

    // ─── NOT FOUND ─────────────────────────────────────────
    if (message.type === "not_found") {
      return (
        <Text style={[styles.assistantText, styles.dimText]}>
          {message.message}
        </Text>
      );
    }

    // ─── DEFAULT TEXT ──────────────────────────────────────
    return (
      <Text style={isUser ? styles.userText : styles.assistantText}>
        {message.message}
      </Text>
    );
  };

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          message.type === "file_card" && styles.fileBubble,
        ]}
      >
        {renderContent()}
        <Text style={styles.time}>
          {new Date(message.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}

// ─── CARD STYLES ──────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  // Image card
  imageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  imagePreview: {
    backgroundColor: COLORS.background,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  imageIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  imageIconText: {
    fontSize: 22,
  },
  imagePreviewLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  imageInfo: {
    padding: 12,
  },
  imageInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  imageFileName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  imageBadge: {
    backgroundColor: COLORS.primary + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  imageBadgeText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "500",
  },
  imageDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  imageMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },

  // Document card
  docCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    backgroundColor: COLORS.card,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  docIcon: {
    width: 44,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docIconPdf: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  docIconText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  docIconTextPdf: {
    color: "#ef4444",
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  docDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  docMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  docActionRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // Shared action buttons
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  actionBtnText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "500",
  },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "500",
  },
});

// ─── BUBBLE STYLES ────────────────────────────────────────────
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: 4,
    paddingHorizontal: 16,
    alignItems: "flex-end",
  },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fileBubble: {
    maxWidth: "90%",  // ✅ wider for file cards
    paddingHorizontal: 10,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },
  assistantText: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },
  successText: { color: COLORS.success ?? "#22c55e" },
  dimText: { color: COLORS.textSecondary },
  time: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
});