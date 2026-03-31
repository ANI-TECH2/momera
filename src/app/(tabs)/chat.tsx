import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatMessage } from "@/lib/types";
import { COLORS } from "@/lib/constants";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  type: "assistant",
  message:
    "Hello! I am Memora 👋\n\nI can help you:\n💾 Save: 'save my [your info]'\n🔍 Find: 'show my [topic]'\n📄 Upload: Tap the + button\n\nWhat would you like to save today?",
  createdAt: new Date().toISOString(),
};

export default function ChatScreen() {
  const { user, session } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (userId && session?.access_token) {
      loadChatHistory();
    }
  }, [userId, session?.access_token]);

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  const loadChatHistory = async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) return;

      const data = await res.json();

      if (Array.isArray(data?.messages) && data.messages.length > 0) {
        const history: ChatMessage[] = data.messages.map(
          (m: any, index: number) => ({
            id: String(m.id ?? `history-${index}-${Date.now()}`),
            role: m.role,
            type: m.role === "user" ? "text" : "assistant",
            message: m.message ?? "",
            createdAt: m.created_at ?? new Date().toISOString(),
          })
        );

        setMessages([WELCOME_MESSAGE, ...history]);

        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      }
    } catch (error) {
      console.log("[Chat] Could not load history:", error);
    }
  };

  const sendMessage = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || loading) return;

    if (!userId || !session?.access_token) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          type: "system",
          message: "Please log in to continue.",
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      type: "text",
      message: trimmedInput,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    requestAnimationFrame(() => {
      scrollToBottom();
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: trimmedInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || `Server error ${res.status}`);
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        type: data?.type || "assistant",
        message: data?.message || "No response returned.",
        fileCard: data?.fileCard,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.log("[Chat] Send error:", error);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          type: "system",
          message: "Something went wrong. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  };

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>M</Text>
          </View>

          <View>
            <Text style={styles.headerTitle}>Memora</Text>
            <Text style={styles.headerSub}>Your private memory</Text>
          </View>
        </View>

        <Pressable
          style={styles.uploadBtn}
          onPress={() => router.push("/upload")}
        >
          <Text style={styles.uploadBtnText}>+</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={styles.content}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => item.id ?? `${item.createdAt}-${index}`}
            renderItem={({ item }) => <ChatBubble message={item} />}
            style={styles.list}
            contentContainerStyle={[
              styles.chatContent,
              { paddingBottom: loading ? 12 : 8 },
            ]}
            onContentSizeChange={() => scrollToBottom(false)}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />

          {loading && (
            <View style={styles.typingRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>M</Text>
              </View>

              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            </View>
          )}

          <View
            style={[
              styles.inputWrap,
              { paddingBottom: Math.max(insets.bottom, 8) },
            ]}
          >
            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Save or find something..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                maxLength={1000}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (!loading && input.trim()) {
                    sendMessage();
                  }
                }}
              />

              <Pressable
                style={[
                  styles.sendBtn,
                  (!input.trim() || loading) && styles.sendBtnDisabled,
                ]}
                onPress={sendMessage}
                disabled={!input.trim() || loading}
              >
                <Text style={styles.sendText}>{loading ? "..." : "Send"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardRoot: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  headerSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  uploadBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtnText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "300",
  },
  list: {
    flex: 1,
  },
  chatContent: {
    paddingTop: 12,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 8,
    backgroundColor: COLORS.background,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  inputWrap: {
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: COLORS.text,
    fontSize: 15,
    minHeight: 46,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: "top",
  },
  sendBtn: {
    minWidth: 72,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  sendText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
});