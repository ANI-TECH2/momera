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
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatMessage } from "@/lib/types";
import { COLORS } from "@/lib/constants";
import { detectIntentCompromise } from "@/server/nlp/reflex";
import { notesCache, pricesCache, imagesCache, documentsCache } from "@/lib/cache";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  type: "assistant",
  message:
    "Hello! I am Memora 👋\n\nI can help you:\n💾 Save: 'save my [your info]'\n🔍 Find: 'show my [topic]'\n📄 Upload: Tap the + button\n\nWhat would you like to save today?",
  createdAt: new Date().toISOString(),
};

const INPUT_MIN_HEIGHT = 46;
const INPUT_MAX_HEIGHT = 160;

export default function ChatScreen() {
  const { user, session, plan } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);

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

  const handleInputSizeChange = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>
  ) => {
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height))
    );

    setInputHeight(nextHeight);
  };

  const resetInputBox = () => {
    setInput("");
    setInputHeight(INPUT_MIN_HEIGHT);
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
    resetInputBox();

    const intent = detectIntentCompromise(trimmedInput);
    
    // Treat missing plan as 'free' (default for new users)
    const userPlan = plan || 'free';

    if (userPlan === 'free') {
      setLoading(true);

      let responseMessage = '';
      try {
        if (intent === 'intent.save') {
          responseMessage = await handleLocalSave(trimmedInput);
        } else if (intent === 'intent.retrieve') {
          responseMessage = await handleLocalRetrieve(trimmedInput);
        } else if (intent === 'intent.delete') {
          responseMessage = await handleLocalDelete(trimmedInput);
        } else if (intent === 'intent.list') {
          responseMessage = await handleLocalList();
        } else if (intent === 'intent.greet') {
          responseMessage = "Hello! I'm Memora. For free users, I can help you save notes locally, retrieve them, list them, or delete them. Just say 'save [your note]', 'show my notes', 'list all', or 'delete all'.";
        } else if (intent === 'intent.help') {
          responseMessage = "Help: As a free user, you can save notes with 'save [note]', retrieve with 'show [topic]', list all with 'list all', delete with 'delete all'. Your data stays on your device.";
        } else {
          responseMessage = "I'm sorry, I didn't understand. Try 'save [note]', 'show [topic]', 'list all', or 'delete all'.";
        }
      } catch (error) {
        console.error('[Chat] Local handler error:', error);
        responseMessage = "Something went wrong. Please try again.";
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        type: "assistant",
        message: responseMessage,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      setLoading(false);
      requestAnimationFrame(() => {
        scrollToBottom();
      });

      return;
    }

    // Pro user: use API (Supabase) but check local cache first
    setLoading(true);

    requestAnimationFrame(() => {
      scrollToBottom();
    });

    try {
      // For save operations, also save locally for pro users (hybrid approach)
      if (intent === 'intent.save') {
        const content = trimmedInput.replace(/\b(save|store|remember|keep|note|add)\b/gi, '').trim();
        if (content) {
          // Detect if it's a price
          const priceMatch = content.match(/\$(\d+\.?\d*)|price[:\s]+(\d+\.?\d*)/i);
          if (priceMatch) {
            const price = {
              id: Date.now().toString(),
              user_id: userId!,
              product_name: content.substring(0, 50),
              price: parseFloat(priceMatch[1] || priceMatch[2]),
              currency: 'USD',
              description: content,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            await pricesCache.set(price.id, price);
          } else {
            // Save as note locally
            const note = {
              id: Date.now().toString(),
              user_id: userId!,
              title: content.substring(0, 50),
              content,
              category: 'note',
              is_pinned: false,
              is_archived: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            await notesCache.set(note.id, note);
          }
        }
      }

      // Check local cache first for retrieve/list operations
      const localResult = await checkLocalCacheForPro(trimmedInput, intent);
      
      if (localResult) {
        // Found in local cache, use it
        const assistantMessage: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          type: "assistant",
          message: localResult,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setLoading(false);
        requestAnimationFrame(() => {
          scrollToBottom();
        });
        return;
      }

      // Not found locally, make API request
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

  const handleLocalSave = async (message: string) => {
    const content = message.replace(/\b(save|store|remember|keep|note|add)\b/gi, '').trim();
    if (!content) {
      return "Please provide something to save.";
    }

    // Detect if it's a price
    const priceMatch = content.match(/\$(\d+\.?\d*)|price[:\s]+(\d+\.?\d*)/i);
    if (priceMatch) {
      const price = {
        id: Date.now().toString(),
        user_id: userId!,
        product_name: content.substring(0, 50),
        price: parseFloat(priceMatch[1] || priceMatch[2]),
        currency: 'USD',
        description: content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await pricesCache.set(price.id, price);
      return `💰 Saved price locally: $${price.price}`;
    }

    // Default: save as note
    const note = {
      id: Date.now().toString(),
      user_id: userId!,
      title: content.substring(0, 50),
      content,
      category: 'note',
      is_pinned: false,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await notesCache.set(note.id, note);
    return `✅ Saved locally: ${content}`;
  };

  const handleLocalRetrieve = async (message: string) => {
    const query = message.replace(/\b(show|find|search|get|retrieve|look|display|what|where)\b/gi, '').toLowerCase().trim();

    // Search notes
    const notes = await notesCache.getAll();
    const matchedNotes = notes.filter(e => 
      e.data.content.toLowerCase().includes(query) || 
      e.data.title.toLowerCase().includes(query)
    );

    // Search prices
    const prices = await pricesCache.getAll();
    const matchedPrices = prices.filter(e => 
      e.data.product_name.toLowerCase().includes(query) || 
      (e.data.description?.toLowerCase().includes(query))
    );

    if (matchedNotes.length === 0 && matchedPrices.length === 0) {
      return query ? `No results found for "${query}".` : "You have no saved items.";
    }

    let response = '';
    if (matchedNotes.length > 0) {
      response += `📝 Notes found:\n${matchedNotes.map(e => e.data.content).join('\n---\n')}\n\n`;
    }
    if (matchedPrices.length > 0) {
      response += `💰 Prices found:\n${matchedPrices.map(e => `${e.data.product_name}: $${e.data.price}`).join('\n')}`;
    }
    return response;
  };

  const handleLocalDelete = async (message: string) => {
    const query = message.replace(/\b(delete|remove|erase|clear|purge|get rid of)\b/gi, '').toLowerCase().trim();

    // If asking to delete specific item
    if (query) {
      const notes = await notesCache.getAll();
      const toDelete = notes.filter(e => 
        e.data.content.toLowerCase().includes(query) || 
        e.data.title.toLowerCase().includes(query)
      );

      if (toDelete.length === 0) {
        return `No items found to delete for "${query}".`;
      }

      for (const entry of toDelete) {
        await notesCache.delete(entry.id);
      }
      return `✅ Deleted ${toDelete.length} item(s).`;
    }

    // Delete all
    await notesCache.clear();
    await pricesCache.clear();
    await imagesCache.clear();
    await documentsCache.clear();
    return `🗑️ All local data deleted.`;
  };

  const handleLocalList = async () => {
    const notes = await notesCache.getAll();
    const prices = await pricesCache.getAll();
    const images = await imagesCache.getAll();
    const documents = await documentsCache.getAll();

    if (notes.length === 0 && prices.length === 0 && images.length === 0 && documents.length === 0) {
      return "📦 You have no saved items.";
    }

    let response = '';
    if (notes.length > 0) {
      response += `📝 Notes (${notes.length}):\n${notes.map(e => `  • ${e.data.title}`).join('\n')}\n\n`;
    }
    if (prices.length > 0) {
      response += `💰 Prices (${prices.length}):\n${prices.map(e => `  • ${e.data.product_name}: $${e.data.price}`).join('\n')}\n\n`;
    }
    if (images.length > 0) {
      response += `🖼️ Images (${images.length})\n`;
    }
    if (documents.length > 0) {
      response += `📄 Documents (${documents.length})\n`;
    }
    return response;
  };

  const checkLocalCacheForPro = async (message: string, intent: any) => {
    const query = message.replace(/\b(show|find|search|get|retrieve|look|display|what|where)\b/gi, '').toLowerCase().trim();
    
    if (intent === 'intent.retrieve' && query) {
      const notes = await notesCache.getAll();
      const prices = await pricesCache.getAll();
      
      const matchedNotes = notes.filter(e => 
        e.data.content.toLowerCase().includes(query) || 
        e.data.title.toLowerCase().includes(query)
      );
      
      const matchedPrices = prices.filter(e => 
        e.data.product_name.toLowerCase().includes(query) || 
        e.data.description?.toLowerCase().includes(query)
      );

      if (matchedNotes.length > 0 || matchedPrices.length > 0) {
        let response = '';
        if (matchedNotes.length > 0) {
          response += `📝 Notes found locally:\n${matchedNotes.map(e => e.data.content).join('\n---\n')}\n\n`;
        }
        if (matchedPrices.length > 0) {
          response += `💰 Prices found locally:\n${matchedPrices.map(e => `${e.data.product_name}: $${e.data.price}`).join('\n')}`;
        }
        return response;
      }
    }

    if (intent === 'intent.list') {
      const localResult = await handleLocalList();
      if (localResult !== "📦 You have no saved items.") {
        return localResult;
      }
    }

    return null;
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
                style={[
                  styles.input,
                  {
                    height: inputHeight,
                  },
                ]}
                value={input}
                onChangeText={setInput}
                onContentSizeChange={handleInputSizeChange}
                placeholder="Save or find something..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
                maxLength={3000}
                returnKeyType="default"
                blurOnSubmit={false}
                textAlignVertical="top"
              />

              <Pressable
                style={[
                  styles.sendBtn,
                  { height: Math.max(INPUT_MIN_HEIGHT, 46) },
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
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    minWidth: 72,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 0,
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