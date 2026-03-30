import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { ChatMessage } from "../../lib/types";
import { COLORS } from "../../lib/constants";

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";

  const renderContent = () => {
    // File card
    if (message.type === "file_card" && message.fileCard) {
      return (
        <View>
          <Text style={styles.assistantText}>{message.message}</Text>
          <View style={styles.fileCard}>
            <Pressable
              style={styles.openBtn}
              onPress={() => {
                if (message.fileCard?.signedUrl) {
                  Linking.openURL(message.fileCard.signedUrl);
                }
              }}
            >
              <Text style={styles.fileIcon}>
                {message.fileCard.fileType === "image" ? "🖼️" : "📄"}
              </Text>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName}>{message.fileCard.fileName}</Text>
                <Text style={styles.fileDesc}>{message.fileCard.description}</Text>
              </View>
              <Text style={styles.openText}>Open</Text>
            </Pressable>
            <Pressable 
              style={styles.deleteBtn}
              onPress={() => Alert.alert(
                "Delete file?",
                "This will permanently remove the file.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: async () => {
                    if (message.fileCard?.id) {
                      try {
                        const res = await fetch(`/api/delete?userId=user_001&id=${message.fileCard.id}&table=${message.fileCard.fileType === 'image' ? 'images' : 'documents'}`);
                        if (res.ok) {
                          Alert.alert('Deleted', 'File removed');
                          // Parent chat will reload
                        } else {
                          Alert.alert('Error', 'Delete failed');
                        }
                      } catch (err) {
                        Alert.alert('Error', 'Delete failed');
                      }
                    }
                  }}
                ]
              )}
            >
              <Text style={styles.deleteText}>✕</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // Save confirm
    if (message.type === "save_confirm") {
      return (
        <Text style={[styles.assistantText, styles.successText]}>
          {message.message}
        </Text>
      );
    }

    // Not found
    if (message.type === "not_found") {
      return (
        <Text style={[styles.assistantText, styles.dimText]}>
          {message.message}
        </Text>
      );
    }

    // Default text
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
        ]}
      >
        {renderContent()}
        <Text style={styles.time}>
          {new Date(message.createdAt).toLocaleTimeString("en-NG", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: 4,
    paddingHorizontal: 16,
    alignItems: "flex-end",
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
  },
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
  successText: {
    color: COLORS.success,
  },
  dimText: {
    color: COLORS.textSecondary,
  },
  time: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  fileCard: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  openBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fileIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  fileDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  openText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
