export const COLORS = {
  background: "#0D0F1A",
  card: "#1A1D2E",
  border: "#2A2F45",
  primary: "#7B3FE4",
  secondary: "#3FA9F5",
  text: "#FFFFFF",
  textSecondary: "#A0A6C3",
  success: "#22C55E",
  error: "#EF4444",
  warning: "#F59E0B",
};

export const SAVE_KEYWORDS = [
  "save these",
  "save this",
  "store these",
  "store this",
  "keep this",
  "keep these",
  "remember this",
  "remember these",
  "note this down",
  "note this",
  "add this",
  "add these",
  "save my",
  "store my",
  "keep my",
];

export const RETRIEVE_KEYWORDS = [
  "show me",
  "what is my",
  "find my",
  "get my",
  "retrieve my",
  "give me my",
  "who is my",
  "what did i save",
  "show my",
  "bring back",
  "look up my",
];

export const STOP_WORDS = [
  "what", "is", "my", "show", "give",
  "find", "get", "who", "the", "me",
  "retrieve", "saved", "stored", "did",
  "i", "a", "an", "of", "for", "and",
  "bring", "back", "look", "up",
];

export const FREE_STORAGE_LIMIT = 100 * 1024 * 1024; // 100MB
export const PRO_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10GB

export const INTENT_THRESHOLD = 0.5;

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || "";

