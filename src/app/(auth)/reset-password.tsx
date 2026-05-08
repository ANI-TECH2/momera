import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { Ionicons } from "@expo/vector-icons";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState<"password" | "confirm" | null>(null);

  const { supabase } = useAuth();
  const router = useRouter();

  const handleResetPassword = async () => {
    setMessage("");

    if (!password || !confirmPassword) {
      setMessage("Please enter both passwords");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      setMessage("✓ Password reset successfully! Redirecting...");
      setTimeout(() => router.replace("/(auth)/login"), 2000);
    } catch (e: any) {
      setMessage(e.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Create New Password</Text>
            <Text style={styles.subtitle}>
              Enter a strong password to secure your account
            </Text>
          </View>

          <View style={styles.card}>
            {/* PASSWORD INPUT */}
            <View
              style={[
                styles.inputWrapper,
                focused === "password" && styles.inputFocused,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={COLORS.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="New Password"
                placeholderTextColor={COLORS.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.toggleText}>
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>

            {/* CONFIRM PASSWORD INPUT */}
            <View
              style={[
                styles.inputWrapper,
                focused === "confirm" && styles.inputFocused,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={COLORS.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor={COLORS.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                onFocus={() => setFocused("confirm")}
                onBlur={() => setFocused(null)}
              />
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Text style={styles.toggleText}>
                  {showConfirmPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>

            {/* MESSAGE */}
            {message ? (
              <Text
                style={[
                  styles.message,
                  success && styles.success,
                ]}
              >
                {message}
              </Text>
            ) : null}

            {/* RESET BUTTON */}
            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Reset Password</Text>
              )}
            </Pressable>

            {/* BACK TO LOGIN */}
            <Pressable onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.link}>
                <Text style={styles.linkStrong}>Back</Text> to login
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
    justifyContent: "center",
  },

  header: {
    marginBottom: 32,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  inputFocused: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  input: {
    flex: 1,
    color: COLORS.text,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 14,
  },

  toggleText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 12,
  },

  message: {
    color: "red",
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
  },

  success: {
    color: "#10b981",
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },

  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  link: {
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  linkStrong: {
    color: COLORS.primary,
    fontWeight: "700",
  },
});
