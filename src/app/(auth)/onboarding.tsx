import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { COLORS } from "@/lib/constants";

const STEPS = [
  {
    title: "Chat to save anything",
    description: "Just type naturally like chatting with a friend.",
    type: "chat",
  },
  {
    title: "Retrieve instantly",
    description: "Ask anything and get your saved data back fast.",
    type: "retrieve",
  },
  {
    title: "Everything stays safe",
    description: "Your data is private and always available.",
    type: "secure",
  },
];

export default function AuthOnboarding({ compact = false }: { compact?: boolean }) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const appName = Constants.expoConfig?.name || "Memora";

  const slideWidth = compact ? width * 0.7 : width;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < STEPS.length) {
      setActiveIndex(newIndex);
    }
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setActiveIndex(newIndex);
  };

  const renderVisual = (type: string) => {
    if (type === "chat") {
      return (
        <View style={styles.chatBox}>
          <View style={styles.chatBubbleUser}>
            <Text style={styles.chatText}>Save John number 08012345678</Text>
          </View>
          <View style={styles.chatBubbleBot}>
            <Text style={styles.chatText}>Saved ✔️</Text>
          </View>
        </View>
      );
    }

    if (type === "retrieve") {
      return (
        <View style={styles.chatBox}>
          <View style={styles.chatBubbleUser}>
            <Text style={styles.chatText}>John number</Text>
          </View>
          <View style={styles.chatBubbleBot}>
            <Text style={styles.chatText}>John - 08012345678</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.secureBox}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.secureText}>Encrypted & private</Text>
      </View>
    );
  };

  return (
    <View style={[styles.page, compact && styles.pageCompact]}>
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>{appName}</Text>
        <Text style={styles.pageSubtitle}>Welcome to {appName}</Text>
        <Text style={styles.stepText}>
          {activeIndex + 1} / {STEPS.length}
        </Text>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={slideWidth}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
      >
        {STEPS.map((step, index) => (
          <View key={index} style={[styles.slide, { width: slideWidth }]}>
            {/* VISUAL */}
            {renderVisual(step.type)}

            {/* TEXT */}
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.desc}>{step.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* DOTS - Show in both compact and full modes */}
      <View style={[styles.dots, compact && styles.dotsCompact]}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>

      {!compact && (
        <>
          {/* BUTTON */}
          <Pressable style={styles.button} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.buttonText}>Get Started</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 20,
    backgroundColor: COLORS.background,
  },

  topBar: {
    marginBottom: 20,
  },

  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
  },

  pageSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  stepText: {
    color: COLORS.textSecondary,
  },

  slide: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 20,
  },

  desc: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  /* CHAT UI */
  chatBox: {
    width: "100%",
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  chatBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: COLORS.primary,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },

  chatBubbleBot: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 12,
  },

  chatText: {
    color: "#fff",
  },

  /* SECURE */
  secureBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  lockIcon: {
    fontSize: 40,
    marginBottom: 10,
  },

  secureText: {
    color: COLORS.textSecondary,
  },

  /* DOTS */
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },

  dotsCompact: {
    marginTop: 12,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginHorizontal: 4,
  },

  dotActive: {
    backgroundColor: COLORS.primary,
  },

  /* BUTTON */
  button: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },

  pageCompact: {
    padding: 12,
  },
});