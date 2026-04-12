import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingType, setLoadingType] = useState<"email" | "google" | null>(null);

  const { signInWithEmail, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();

  const isLoading = loadingType !== null;

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }

    setLoadingType("email");

    try {
      await signInWithEmail(cleanEmail, cleanPassword);
    } catch (error) {
      Alert.alert("Login failed", (error as Error).message || "Unable to sign in.");
    } finally {
      setLoadingType(null);
    }
  };

  const handleGoogle = async () => {
    setLoadingType("google");

    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert(
        "Google login failed",
        (error as Error).message || "Unable to continue with Google."
      );
    } finally {
      setLoadingType(null);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Preparing your workspace...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>MEMORA</Text>
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to access your private notes, saved memories, prices, images, and documents.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sign in to your account</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || isLoading) && styles.buttonPressed,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {loadingType === "email" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              (pressed || isLoading) && styles.buttonPressed,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleGoogle}
            disabled={isLoading}
          >
            {loadingType === "google" ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </Pressable>

          <Text style={styles.privacyText}>
            Your saved data stays linked to your account so you can chat with it anytime.
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/(auth)/signup")}
          disabled={isLoading}
          style={({ pressed }) => [styles.footerLinkWrap, pressed && styles.buttonPressed]}
        >
          <Text style={styles.link}>
            Don&apos;t have an account? <Text style={styles.linkStrong}>Sign up</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  hero: {
    marginBottom: 28,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 12,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  googleButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  privacyText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  footerLinkWrap: {
    alignItems: "center",
  },
  link: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: "center",
  },
  linkStrong: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 16,
    marginTop: 14,
  },
});