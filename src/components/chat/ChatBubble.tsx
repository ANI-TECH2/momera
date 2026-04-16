import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  Share,
  Image,
  ActivityIndicator,
} from "react-native";
import { ChatMessage } from "@/lib/types";
import { COLORS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";

interface ChatBubbleProps {
  message: ChatMessage;
}

// ─── HELPERS ─────────────────────────────────────────

function getFileExtension(fileName?: string | null): string {
  if (!fileName) return "FILE";
  return fileName.split(".").pop()?.toUpperCase() ?? "FILE";
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isImageType(fileType?: string | null): boolean {
  return (
    fileType === "image" ||
    ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(
      (fileType ?? "").toLowerCase()
    )
  );
}

// ─── IMAGE CARD (FIXED) ─────────────────────────────

function ImageCard({
  fileCard,
  onDelete,
}: {
  fileCard: NonNullable<ChatMessage["fileCard"]>;
  onDelete: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleViewFull = () => {
    if (fileCard.signedUrl) {
      Linking.openURL(fileCard.signedUrl);
    }
  };

  return (
    <View style={cardStyles.imageCard}>
      <Pressable style={cardStyles.imagePreview} onPress={handleViewFull}>
        {fileCard.signedUrl && !error ? (
          <>
            {loading && (
              <ActivityIndicator size="small" color={COLORS.primary} />
            )}

            <Image
              source={{ uri: fileCard.signedUrl }}
              style={cardStyles.imagePreviewImage}
              resizeMode="cover"
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
            />
          </>
        ) : (
          <View style={cardStyles.imageFallback}>
            <Text style={cardStyles.imageIcon}>🖼</Text>
            <Text style={cardStyles.imageErrorText}>
              Failed to load image
            </Text>
          </View>
        )}
      </Pressable>

      <View style={cardStyles.imageInfo}>
        <Text style={cardStyles.imageFileName} numberOfLines={1}>
          {fileCard.fileName ?? "Image"}
        </Text>

        {!!fileCard.description && (
          <Text style={cardStyles.imageDesc}>
            {fileCard.description}
          </Text>
        )}

        {!!fileCard.createdAt && (
          <Text style={cardStyles.imageMeta}>
            {formatDate(fileCard.createdAt)}
          </Text>
        )}

        <View style={cardStyles.actionRow}>
          <Pressable style={cardStyles.actionBtn} onPress={handleViewFull}>
            <Text style={cardStyles.actionBtnText}>View</Text>
          </Pressable>

          <Pressable
            style={cardStyles.actionBtn}
            onPress={async () => {
              if (fileCard.signedUrl) {
                await Share.share({ url: fileCard.signedUrl });
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

// ─── DOCUMENT CARD ──────────────────────────────────

function DocumentCard({
  fileCard,
  onDelete,
}: {
  fileCard: NonNullable<ChatMessage["fileCard"]>;
  onDelete: () => void;
}) {
  const ext = getFileExtension(fileCard.fileName);

  return (
    <View style={cardStyles.docCard}>
      <View style={cardStyles.docRow}>
        <View style={cardStyles.docIcon}>
          <Text style={cardStyles.docIconText}>{ext}</Text>
        </View>

        <View style={cardStyles.docInfo}>
          <Text style={cardStyles.docName} numberOfLines={1}>
            {fileCard.fileName ?? "Document"}
          </Text>

          {!!fileCard.createdAt && (
            <Text style={cardStyles.docMeta}>
              {formatDate(fileCard.createdAt)}
            </Text>
          )}
        </View>
      </View>

      <View style={cardStyles.actionRow}>
        <Pressable
          style={cardStyles.actionBtn}
          onPress={() =>
            fileCard.signedUrl && Linking.openURL(fileCard.signedUrl)
          }
        >
          <Text style={cardStyles.actionBtnText}>Open</Text>
        </Pressable>

        <Pressable style={cardStyles.deleteBtn} onPress={onDelete}>
          <Text style={cardStyles.deleteBtnText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── MAIN ───────────────────────────────────────────

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const { session } = useAuth();

  const handleDeleteFile = () => {
    Alert.alert("Delete file?", "This will remove the file.", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!message.fileCard?.id) return;

          const table = isImageType(message.fileCard.fileType)
            ? "images"
            : "documents";

          await fetch(
            `/api/delete?id=${message.fileCard.id}&table=${table}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${session?.access_token}`,
              },
            }
          );
        },
      },
    ]);
  };

  const renderContent = () => {
    if (message.type === "file_card" && message.fileCard) {
      const isImg = isImageType(message.fileCard.fileType);

      return isImg ? (
        <ImageCard fileCard={message.fileCard} onDelete={handleDeleteFile} />
      ) : (
        <DocumentCard
          fileCard={message.fileCard}
          onDelete={handleDeleteFile}
        />
      );
    }

    return (
      <Text style={isUser ? styles.userText : styles.assistantText}>
        {message.message}
      </Text>
    );
  };

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {renderContent()}
      </View>
    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────

const cardStyles = StyleSheet.create({
  imageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  imagePreview: {
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  imagePreviewImage: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    alignItems: "center",
  },
  imageIcon: {
    fontSize: 24,
  },
  imageErrorText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  imageInfo: {
    padding: 10,
  },
  imageFileName: {
    fontWeight: "600",
    color: COLORS.text,
  },
  imageDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  imageMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  docCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  docRow: {
    flexDirection: "row",
    gap: 10,
  },
  docIcon: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  docIconText: {
    fontSize: 12,
  },
  docInfo: { flex: 1 },
  docName: { fontWeight: "600" },
  docMeta: { fontSize: 11, color: COLORS.textSecondary },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  actionBtnText: {
    fontSize: 12,
  },
  deleteBtn: {
    padding: 8,
    borderColor: "red",
    borderWidth: 1,
  },
  deleteBtnText: {
    color: "red",
  },
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", padding: 10 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  bubble: {
    padding: 10,
    borderRadius: 12,
    maxWidth: "80%",
  },
  userBubble: { backgroundColor: COLORS.primary },
  assistantBubble: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userText: { color: "#fff" },
  assistantText: { color: COLORS.text },
});