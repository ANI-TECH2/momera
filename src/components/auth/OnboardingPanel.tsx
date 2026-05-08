import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "@/lib/constants";

const STEPS = [
  {
    title: "Save anything fast",
    description: "Store notes, contacts, prices, images, and documents in one private place.",
    emoji: "📝",
  },
  {
    title: "Ask and retrieve",
    description: "Search your saved data naturally and get instant replies from Memora.",
    emoji: "🔎",
  },
  {
    title: "Keep it secure",
    description: "Your data stays linked to your account and is available whenever you sign in.",
    emoji: "🔒",
  },
];

export default function OnboardingPanel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.stepCard}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{index + 1}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>{step.emoji} {step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.note}>
        Use the form below to sign in or create your account and start saving.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  steps: {
    gap: 10,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  stepDescription: {
    marginTop: 1,
    color: COLORS.textSecondary,
    lineHeight: 17,
    fontSize: 12,
  },
  note: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
