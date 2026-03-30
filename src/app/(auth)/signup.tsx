import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { COLORS } from '@/lib/constants';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUpWithEmail, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();

  const handleSignup = async () => {
    if (!email || !password || password.length < 6) {
      Alert.alert('Error', 'Please fill email and password (6+ chars)');
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail(email, password);
      // ✅ No manual redirect — _layout guard handles it automatically
      // ✅ No need to auto sign-in — Supabase signs in after signup by default
    } catch (error) {
      Alert.alert('Signup failed', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      // ✅ No manual redirect — _layout guard handles it automatically
    } catch (error) {
      Alert.alert('Google signup failed', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join Memora</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={COLORS.textSecondary}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={[styles.input, styles.passwordInput]}
        placeholder="Password (6+ chars)"
        placeholderTextColor={COLORS.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleSignup}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Creating...' : 'Sign Up'}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.googleButton, pressed && styles.buttonPressed]}
        onPress={handleGoogle}
        disabled={loading}
      >
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.link}>Have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 16,
  },
  passwordInput: {
    marginBottom: 24,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF', // ✅ Fixed — was COLORS.text which may not contrast on primary bg
    fontSize: 17,
    fontWeight: '600',
  },
  googleButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: COLORS.card,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '500',
  },
  link: {
    color: COLORS.primary,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 16,
  },
});