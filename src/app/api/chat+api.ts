import { getNlp } from "@/server/nlp/setup";
import { handleSave } from "@/server/handlers/save";
import { handleRetrieve } from "@/server/handlers/retrieve";
import { serverSupabase } from "@/server/supabase";

const INTENT_THRESHOLD = 0.62;
const FAST_INTENT_SCORE = 0.99;

type AppIntent =
  | "intent.save"
  | "intent.retrieve"
  | "intent.delete"
  | "intent.greet"
  | "intent.help"
  | "intent.none";

export type ExtractedEntity = {
  entity: string;
  sourceText: string;
  value?: string;
  accuracy?: number;
};

type DetectionResult = {
  intent: AppIntent | null;
  score: number;
  entities: ExtractedEntity[];
  source: "fast" | "nlp" | "heuristic" | "unknown";
};

type ChatResponsePayload = {
  type: "assistant" | "system";
  message: string;
  [key: string]: any;
};

// ───────────────────────────────────────────────────────────────
// AUTH
// ───────────────────────────────────────────────────────────────
async function getUserIdFromRequest(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const { data: { user }, error } = await serverSupabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────
// NORMALIZATION
// ───────────────────────────────────────────────────────────────
function normalizeMessage(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .trim();
}

function normalizeLoose(input: string): string {
  return normalizeMessage(input).toLowerCase();
}

function uniqueEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  const out: ExtractedEntity[] = [];
  for (const entity of entities) {
    const key = `${entity.entity}:${entity.sourceText.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(entity);
    }
  }
  return out;
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ───────────────────────────────────────────────────────────────
// FAST INTENT DETECTION
// ───────────────────────────────────────────────────────────────
function detectIntentFast(message: string): AppIntent | null {
  const lower = normalizeLoose(message);

  const SAVE_TRIGGERS = [
    /^save\s+.+/i,
    /^remember\s+.+/i,
    /^store\s+.+/i,
    /^keep\s+.+/i,
    /^note\s+down\s+.+/i,
    /^note\s+this\s+.+/i,
    /^save\s+this\s+.+/i,
    /^remember\s+this\s+.+/i,
    /^store\s+this\s+.+/i,
  ];

  const SAVE_BLOCKLIST = [
    "save me", "save us", "save him",
    "save her", "save them", "save money", "savings",
  ];

  if (
    !SAVE_BLOCKLIST.some((item) => lower.includes(item)) &&
    SAVE_TRIGGERS.some((pattern) => pattern.test(lower))
  ) {
    return "intent.save";
  }

  const RETRIEVE_TRIGGERS = [
    /^show\s+my\s+.+/i,
    /^show\s+me\s+my\s+.+/i,
    /^find\s+my\s+.+/i,
    /^get\s+my\s+.+/i,
    /^retrieve\s+.+/i,
    /^search\s+(?:for\s+)?.+/i,
    /^what\s+is\s+my\s+.+/i,
    /^what\s+was\s+my\s+.+/i,
    /^what\s+did\s+i\s+save(?:\s+about)?\s+.+/i,
    /^do\s+i\s+have\s+.+/i,
    /^look\s+up\s+.+/i,
  ];

  // ✅ Removed bare /^find\s+.+/i — too loose, caused false retrieves

  if (RETRIEVE_TRIGGERS.some((pattern) => pattern.test(lower))) {
    return "intent.retrieve";
  }

  const DELETE_TRIGGERS = [
    /^delete\s+.+/i,
    /^remove\s+my\s+.+/i,
    /^clear\s+my\s+.+/i,
  ];

  if (DELETE_TRIGGERS.some((pattern) => pattern.test(lower))) {
    return "intent.delete";
  }

  const GREET_EXACT = [
    "hi", "hello", "hey", "hiya", "howdy",
    "good morning", "good afternoon", "good evening",
  ];

  if (
    GREET_EXACT.includes(lower) ||
    /^(hi|hey|hello)\s*[!,.]?\s*$/i.test(lower)
  ) {
    return "intent.greet";
  }

  const HELP_TRIGGERS = [
    /\bhelp\b/i,
    /what can you do/i,
    /how do i use/i,
    /how does this work/i,
    /what are your features/i,
    /what commands/i,
  ];

  if (HELP_TRIGGERS.some((pattern) => pattern.test(lower))) {
    return "intent.help";
  }

  return null;
}

// ───────────────────────────────────────────────────────────────
// ENTITY EXTRACTION
// ───────────────────────────────────────────────────────────────
function extractEntitiesHeuristic(message: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const text = normalizeMessage(message);

  const pushMatch = (entity: string, match: string) => {
    if (!match) return;
    entities.push({ entity, sourceText: match.trim(), value: match.trim(), accuracy: 0.8 });
  };

  const phoneMatches = text.match(/(?:\+234|234|0)?[7-9][0-1]\d{8}\b/g) ?? [];
  for (const match of phoneMatches) pushMatch("phone", match);

  const emailMatches = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [];
  for (const match of emailMatches) pushMatch("email", match);

  const moneyMatches = text.match(/(?:₦|\$|usd|ngn)?\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?/gi) ?? [];
  for (const match of moneyMatches) {
    if (/(₦|\$|usd|ngn)/i.test(match)) pushMatch("money", match);
  }

  const dateMatches = text.match(
    /\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi
  ) ?? [];
  for (const match of dateMatches) pushMatch("date_like", match);

  const placeMatches = text.match(
    /\b(?:port harcourt|portharcourt|lagos|abuja|ph|rivers state)\b/gi
  ) ?? [];
  for (const match of placeMatches) pushMatch("place", match);

  const keywords = [
    "password", "pin", "passcode", "otp", "email",
    "address", "contact", "number", "rent", "meeting", "note",
  ];
  for (const keyword of keywords) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(text)) pushMatch("keyword", keyword);
  }

  const stopWords = new Set([
    "save", "remember", "store", "keep", "find", "show", "get",
    "retrieve", "search", "delete", "remove", "clear", "help",
    "what", "my", "this", "that", "from", "about", "note",
    "password", "number", "contact",
  ]);

  const wordMatches = text.match(/\b[A-Za-z][a-z]{2,}\b/g) ?? [];
  for (const word of wordMatches) {
    if (!stopWords.has(word.toLowerCase())) pushMatch("name_like", word);
  }

  return uniqueEntities(entities);
}

function normalizeNlpEntities(rawEntities: any[]): ExtractedEntity[] {
  if (!Array.isArray(rawEntities)) return [];
  return uniqueEntities(
    rawEntities
      .map((item) => {
        const entity = safeText(item?.entity || item?.type);
        const sourceText = safeText(item?.sourceText || item?.utteranceText || item?.option);
        const value =
          typeof item?.resolution?.value === "string"
            ? item.resolution.value
            : typeof item?.option === "string"
            ? item.option
            : sourceText;
        if (!entity || !sourceText) return null;
        return {
          entity, sourceText, value,
          accuracy: typeof item?.accuracy === "number" ? item.accuracy
            : typeof item?.score === "number" ? item.score : 0.85,
        };
      })
      .filter(Boolean) as ExtractedEntity[]
  );
}

function inferIntentFromEntities(message: string, entities: ExtractedEntity[]): AppIntent | null {
  const lower = normalizeLoose(message);

  const hasContent =
    entities.some((e) =>
      ["phone", "email", "money", "date_like", "place", "keyword"].includes(e.entity)
    );

  // ✅ Only infer from strong entities — not name_like alone (too loose)
  if (!hasContent) return null;

  if (/\b(delete|remove|clear)\b/i.test(lower)) return "intent.delete";
  if (/\b(show|find|get|retrieve|search|lookup|look up|where|what)\b/i.test(lower)) return "intent.retrieve";
  if (/\b(save|remember|store|keep|note)\b/i.test(lower)) return "intent.save";

  return null;
}

// ───────────────────────────────────────────────────────────────
// GUIDANCE MESSAGES
// ───────────────────────────────────────────────────────────────
function getGuidanceMessage(message: string): string {
  const quoted = message ? `: *"${message}"*` : "";
  return `I'm not sure what you'd like to do${quoted}

Here are examples I understand well:

💾 **Save something**
→ *Save my password is 1234*
→ *Remember John number 08031234567*
→ *Store my rent note for next week*

🔍 **Find something**
→ *Show my notes*
→ *Find my password*
→ *What is my password?*

🗑️ **Delete something**
→ *Delete my note about passwords*

❓ **Help**
→ *help*`;
}

function buildGreetingMessage(): string {
  return `Hello! 👋 I'm Momera, your personal memory assistant.

You can ask me to:
- 💾 Save notes: *"Save my password is 1234"*
- 🔍 Find saved info: *"Show my notes"*
- 🗑️ Delete notes: *"Delete my password note"*

Type *help* to see more examples.`;
}

// ───────────────────────────────────────────────────────────────
// CONTEXT SAVING
// ───────────────────────────────────────────────────────────────
async function saveLastQueryContext(
  userId: string,
  message: string,
  intent: string,
  entities: ExtractedEntity[]
): Promise<void> {
  try {
    await serverSupabase.from("chat_context").upsert(
      {
        user_id: userId,
        last_message: message,
        last_intent: intent,
        last_entities: entities,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch (error) {
    console.warn("[Chat API] Failed to save context:", error);
  }
}

// ───────────────────────────────────────────────────────────────
// DETECT INTENT PIPELINE
// ───────────────────────────────────────────────────────────────
async function detectIntent(message: string): Promise<DetectionResult> {
  const cleanMessage = normalizeMessage(message);
  const fastIntent = detectIntentFast(cleanMessage);
  const heuristicEntities = extractEntitiesHeuristic(cleanMessage);

  if (fastIntent) {
    return { intent: fastIntent, score: FAST_INTENT_SCORE, entities: heuristicEntities, source: "fast" };
  }

  try {
    const nlp = await getNlp();
    const result = await nlp.process("en", cleanMessage);

    const nlpIntent = typeof result.intent === "string" ? (result.intent as AppIntent) : null;
    const nlpScore = typeof result.score === "number" ? result.score : 0;
    const nlpEntities = normalizeNlpEntities(Array.isArray(result.entities) ? result.entities : []);
    const mergedEntities = uniqueEntities([...nlpEntities, ...heuristicEntities]);

    if (nlpIntent && nlpIntent !== "intent.none" && nlpScore >= INTENT_THRESHOLD) {
      return { intent: nlpIntent, score: nlpScore, entities: mergedEntities, source: "nlp" };
    }

    const heuristicIntent = inferIntentFromEntities(cleanMessage, mergedEntities);
    if (heuristicIntent) {
      return { intent: heuristicIntent, score: 0.58, entities: mergedEntities, source: "heuristic" };
    }

    return { intent: null, score: nlpScore, entities: mergedEntities, source: "unknown" };
  } catch (error) {
    console.warn("[Chat API] NLP detection failed:", error);
    const heuristicIntent = inferIntentFromEntities(cleanMessage, heuristicEntities);
    if (heuristicIntent) {
      return { intent: heuristicIntent, score: 0.58, entities: heuristicEntities, source: "heuristic" };
    }
    return { intent: null, score: 0, entities: heuristicEntities, source: "unknown" };
  }
}

// ───────────────────────────────────────────────────────────────
// POST
// ───────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const message = normalizeMessage(safeText(body?.message));

    if (!message) {
      return Response.json({ type: "system", message: "Missing message" }, { status: 400 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return Response.json(
        { type: "system", message: "Please log in to continue chatting." },
        { status: 401 }
      );
    }

    console.log(`[Chat API] User: ${userId} | Message: "${message}"`);

    const detection = await detectIntent(message);

    console.log(
      `[Chat API] Intent source=${detection.source} intent=${detection.intent ?? "null"} score=${detection.score.toFixed(2)}`
    );
    console.log("[Chat API] Entities:", detection.entities);

    let responseData: ChatResponsePayload;

    if (!detection.intent) {
      return Response.json({ type: "assistant", message: getGuidanceMessage(message) });
    }

    await saveLastQueryContext(userId, message, detection.intent, detection.entities);

    // ✅ KEY FIX: Pass message string + entities directly — NOT a Request object
    if (detection.intent === "intent.save") {
      const res = await handleSave(message, userId, detection.entities);
      responseData = await res.json();
      return Response.json(responseData);
    }

    if (detection.intent === "intent.retrieve") {
      const res = await handleRetrieve(message, userId, detection.entities);
      responseData = await res.json();
      return Response.json(responseData);
    }

    if (detection.intent === "intent.delete") {
      return Response.json({
        type: "assistant",
        message: '🗑️ To delete something, please say exactly what to remove.\n\nExample: *"Delete my note about passwords"*',
        intent: detection.intent,
        entities: detection.entities,
      });
    }

    if (detection.intent === "intent.greet") {
      return Response.json({
        type: "assistant",
        message: buildGreetingMessage(),
        intent: detection.intent,
      });
    }

    if (detection.intent === "intent.help") {
      return Response.json({
        type: "assistant",
        message: getGuidanceMessage(""),
        intent: detection.intent,
      });
    }

    return Response.json({ type: "assistant", message: getGuidanceMessage(message) });

  } catch (error) {
    console.error("[Chat API] Error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────────
// GET CHAT HISTORY
// ───────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await serverSupabase
      .from("chat_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[Chat GET] Error:", error);
      return Response.json({ error: "Failed to load history" }, { status: 500 });
    }

    return Response.json({ messages: data ?? [] });
  } catch (error) {
    console.error("[Chat GET] Error:", error);
    return Response.json({ error: "Could not load chat history" }, { status: 500 });
  }
}