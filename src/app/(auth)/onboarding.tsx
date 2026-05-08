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
    padding: 16,
    backgroundColor: COLORS.background,
  },

  topBar: {
    marginBottom: 12,
  },

  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },

  pageSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  stepText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },

  slide: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 12,
  },

  desc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },

  /* CHAT UI */
  chatBox: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  chatBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: COLORS.primary,
    padding: 8,
    borderRadius: 10,
    marginBottom: 6,
  },

  chatBubbleBot: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    padding: 8,
    borderRadius: 10,
  },

  chatText: {
    color: "#fff",
    fontSize: 12,
  },

  /* SECURE */
  secureBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  lockIcon: {
    fontSize: 32,
    marginBottom: 8,
  },

  secureText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  /* DOTS */
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
  },

  dotsCompact: {
    marginTop: 8,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginHorizontal: 3,
  },

  dotActive: {
    backgroundColor: COLORS.primary,
  },

  /* BUTTON */
  button: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  pageCompact: {
    padding: 8,
  }
});