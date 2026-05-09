/**
 * reflex.ts — Layer 1 (Reflex)
 * Optimized for price retrieval and common importation/coding queries.
 */

import nlp from "compromise";

export type FastIntent =
  | "intent.save"
  | "intent.retrieve"
  | "intent.delete"
  | "intent.list"
  | "intent.greet"
  | "intent.help";

// Words that match the SAVE pattern but are NOT a data-save command
const SAVE_BLOCKLIST =
  /\b(save\s+(me|us|him|her|them|my\s+(life|soul|day|money|time|energy))|savings?)\b/i;

// Only fire LIST when user explicitly wants everything
const LIST_PATTERN =
  /\b(list\s+(all|my)|show\s+all|view\s+all|all\s+my|display\s+all|show\s+everything|everything\s+i\s+(have|saved))\b/i;

export function detectIntentCompromise(message: string): FastIntent | null {
  const lowerMsg = message.toLowerCase().trim();
  const doc = nlp(lowerMsg);

  // 1. DELETE — Checked first (destructive)
  if (doc.has("(delete|remove|erase|drop|wipe|purge|clear|get rid of|forget about|forget)")) {
    return "intent.delete";
  }

  // 2. LIST — Must come before RETRIEVE
  if (LIST_PATTERN.test(lowerMsg)) {
    return "intent.list";
  }

  // 3. RETRIEVE (Updated for Prices & Rates)
  // Added: "how much", "price", "cost", "rate", "amount", "image", "photo", "document", "file"
  if (
    doc.has("(find|show|search|lookup|look up|retrieve|fetch|get|remind me|recall|tell me|where is)") ||
    doc.has("(what is|what was|what's|do i have)") ||
    doc.has("(image|photo|picture|document|file|screenshot)") ||
    /^(how\s+much|price\s+of|cost\s+of|rate\s+of|amount\s+for)\b/i.test(lowerMsg) ||
    /\b(price|cost|rate|how\s+much|image|photo|picture|document|file)\b/i.test(lowerMsg)
  ) {
    return "intent.retrieve";
  }

  // 4. SAVE
  if (doc.has("(save|remember|store|keep|note|record|add|create|write down|jot down)")) {
    if (!SAVE_BLOCKLIST.test(lowerMsg)) {
      return "intent.save";
    }
  }

  // 5. GREET
  if (doc.has("(hi|hello|hey|hiya|howdy|good morning|good evening|good afternoon|sup|yo)")) {
    return "intent.greet";
  }

  // 6. HELP
  if (doc.has("(help|commands|features|how do i|what can you|guide|tutorial|instructions)")) {
    return "intent.help";
  }

  return null;
}