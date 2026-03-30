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
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from '@/lib/auth';
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatMessage } from "@/lib/types";
import { COLORS } from "@/lib/constants";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  type: "assistant",
  message:
    "Hello! I am Memora 👋\n\nI can help you:\n💾 Save: 'save these [your info]'\n🔍 Find: 'show my [topic]'\n📄 Upload: Tap the + button\n\nWhat would you like to save today?",
  createdAt: new Date().toISOString(),
};

export default function ChatScreen() {
  const { user, session } = useAuth(); // ✅ added session
  const userId = user?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (userId && session) { // ✅ wait for both user and session
      loadChatHistory();
    }
  }, [userId, session]);

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  const loadChatHistory = async () => {
    try {
      const res = await fetch(
        `/api/chat?userId=${encodeURIComponent(userId!)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`, // ✅ auth header
          },
        }
      );

      if (!res.ok) return;

      const data = await res.json();

      if (Array.isArray(data?.messages) && data.messages.length > 0) {
        const history: ChatMessage[] = data.messages.map(
          (m: any, index: number) => ({
            id: String(m.id ?? `history-${index}-${m.created_at ?? Date.now()}`),
            role: m.role,
            type: m.role === "user" ? "text" : "assistant",
            message: m.message ?? "",
            createdAt: m.created_at ?? new Date().toISOString(),
          })
        );
        setMessages([WELCOME_MESSAGE, ...history]);
      }
    } catch (error) {
      console.log("Could not load history:", error);
    }
  };

  const sendMessage = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || loading || !userId || !session) return; // ✅ check session too

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
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`, // ✅ auth header
        },
        body: JSON.stringify({
          message: userMessage.message,
          userId: userId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Request failed");
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        type: data?.type || "assistant",
        message: data?.message || "No response returned.",
        fileCard: data?.fileCard,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.log("Send message error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          type: "system",
          message: "Something went wrong. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.safe}>
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
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => item.id ?? `${item.createdAt}-${index}`}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollToBottom(false)}
          showsVerticalScrollIndicator={false}
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

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Save or find something..."
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={1000}
          />

          <Pressable
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
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
  flex: {
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
  chatContent: {
    paddingVertical: 12,
    paddingBottom: 8,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
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
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  sendIcon: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
});