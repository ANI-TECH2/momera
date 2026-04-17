/**
 * chat+api.ts — Final Optimized Version
 * Fixes: Greeting Latency, Number-based Deletion, "Yes" for Updates, and Missing detectIntent
 */

import { getNlp } from "@/server/nlp/setup";
import { detectIntentCompromise, type FastIntent } from "@/server/nlp/reflex";
import { handleSave } from "@/server/handlers/save";
import { handleRetrieve } from "@/server/handlers/retrieve";
import { handleDelete, deleteRecord } from "@/server/handlers/deleteHandler";
import { handleList } from "@/server/handlers/userdataview";
import { serverSupabase } from "@/server/supabase";
import {
  replaceDuplicate,
  keepBoth,
  type PendingSaveDuplicate,
} from "@/server/handlers/save";

// --- TYPES & CONSTANTS ---
const INTENT_THRESHOLD = 0.62;
const FAST_INTENT_SCORE = 0.99;

type AppIntent =
  | "intent.save"
  | "intent.retrieve"
  | "intent.delete"
  | "intent.list"
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

type PendingDeleteMatch = {
  id: string;
  label: string;
  table: string;
};

// --- RESOLVERS ---
function resolveDeleteConfirmation(message: string, pendingMatches: PendingDeleteMatch[]): PendingDeleteMatch | null {
  const lower = message.toLowerCase().trim();
  const numMatch =
    lower.match(/^#?(\d+)$/) ||
    lower.match(/\b(first|second|third|fourth|fifth|one|two|three)\b/);

  if (numMatch) {
    const wordToNum: Record<string, number> = {
      first: 1,
      one: 1,
      second: 2,
      two: 2,
      third: 3,
      three: 3,
      fourth: 4,
      fifth: 5,
    };

    const raw = numMatch[1];
    const idx =
      wordToNum[raw] !== undefined ? wordToNum[raw] - 1 : parseInt(raw, 10) - 1;

    if (idx >= 0 && idx < pendingMatches.length) return pendingMatches[idx];
  }

  return (
    pendingMatches.find(
      (m) =>
        lower.includes(m.label.toLowerCase()) ||
        m.label.toLowerCase().includes(lower)
    ) || null
  );
}

function resolveSaveDuplicateResponse(message: string): "replace" | "keep_both" | null {
  const lower = message.toLowerCase().trim();

  if (/^(yes|yep|yeah|y|update|replace|overwrite|correct|ok|sure|do it)[\s.!]*$/i.test(lower))
    return "replace";

  if (/^(no|nope|keep both|both|different|save both|new|another)[\s.!]*$/i.test(lower))
    return "keep_both";

  return null;
}

// --- INTENT DETECTION ENGINE ---
async function detectIntent(message: string): Promise<DetectionResult> {
  const cleanMessage = normalizeMessage(message);
  const heuristicEntities = extractEntitiesHeuristic(cleanMessage);

  // Layer 1: Fast Sync (COMPROMISE)
  const fastIntent = detectIntentCompromise(cleanMessage);

  if (fastIntent) {
    console.log(
      `[FAST/COMPROMISE] matched intent="${fastIntent}" | message="${cleanMessage}"`
    );

    return {
      intent: fastIntent as AppIntent,
      score: FAST_INTENT_SCORE,
      entities: heuristicEntities,
      source: "fast",
    };
  }

  console.log("[FAST/COMPROMISE] no match → moving to NLP layer");

  // Layer 2: NLP.js
  try {
    const nlpManager = await getNlp();
    const result = await nlpManager.process("en", cleanMessage);
    const nlpScore = result.score || 0;

    console.log(
      `[NLP] processed intent="${result.intent}" score=${nlpScore.toFixed(3)}`
    );

    if (result.intent && result.intent !== "intent.none" && nlpScore >= INTENT_THRESHOLD) {
      const nlpEntities = normalizeNlpEntities(result.entities || []);

      console.log(
        `[NLP] SUCCESS accepted intent="${result.intent}" score=${nlpScore.toFixed(3)}`
      );

      return {
        intent: result.intent as AppIntent,
        score: nlpScore,
        entities: uniqueEntities([...nlpEntities, ...heuristicEntities]),
        source: "nlp",
      };
    }
  } catch (err) {
    console.warn("[NLP] Failed, falling back to heuristic", err);
  }

  // Layer 3: Heuristic Fallback
  const hIntent = inferIntentFromEntities(cleanMessage, heuristicEntities);

  console.log(
    `[HEURISTIC] fallback intent="${hIntent}" message="${cleanMessage}"`
  );

  return {
    intent: hIntent,
    score: 0.58,
    entities: heuristicEntities,
    source: hIntent ? "heuristic" : "unknown",
  };
}

// --- MAIN HANDLER ---
export async function POST(req: Request) {
  const start = Date.now();

  try {
    const body = await req.json().catch(() => null);
    const message = normalizeMessage(safeText(body?.message));

    if (!message) {
      console.log("[API] empty message rejected");
      return Response.json({ message: "Empty" }, { status: 400 });
    }

    // A. FAST PATH (Greeting / Help)
    const fastIntent = detectIntentCompromise(message);

    if (fastIntent) {
      console.log(`[FAST PATH] instant response intent="${fastIntent}"`);

      if (fastIntent === "intent.greet" || fastIntent === "intent.help") {
        return Response.json({
          type: "assistant",
          message:
            fastIntent === "intent.greet"
              ? buildGreetingMessage()
              : getGuidanceMessage(""),
          intent: fastIntent,
        });
      }
    }

    // B. AUTH
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      console.log("[AUTH] missing user token");
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }

    // C. CONTEXT CHECK
    const context = await getPendingContext(userId);

    if (context?.pending_delete_matches?.length) {
      const match = resolveDeleteConfirmation(message, context.pending_delete_matches);

      if (match) {
        console.log(`[DELETE] confirmed match="${match.label}"`);

        await clearAllPending(userId);
        const { success } = await deleteRecord(userId, {
          id: match.id,
          label: match.label,
          table: match.table as any,
        });

        return Response.json({
          type: "assistant",
          message: success
            ? `🗑️ Deleted "${match.label}"`
            : "Failed to delete.",
        });
      }
    }

    if (context?.pending_save_duplicate) {
      const choice = resolveSaveDuplicateResponse(message);

      if (choice) {
        console.log(`[SAVE DUPLICATE] user choice="${choice}"`);

        const dup = context.pending_save_duplicate as PendingSaveDuplicate;
        await clearAllPending(userId);

        if (choice === "replace") await replaceDuplicate(userId, dup);
        else
          await keepBoth(userId, {
            content: dup.newContent,
            title: dup.newTitle,
            category: dup.category,
          });

        return Response.json({ type: "assistant", message: "✅ Success!" });
      }
    }

    // D. DETECT INTENT PIPELINE
    const detection = await detectIntent(message);

    console.log(
      `[PIPELINE] final intent="${detection.intent}" source=${detection.source} time=${Date.now() - start}ms`
    );

    if (!detection.intent) {
      return Response.json({
        type: "assistant",
        message: getGuidanceMessage(message),
      });
    }

    let handlerRes;

    switch (detection.intent) {
      case "intent.save":
        handlerRes = await handleSave(message, userId, detection.entities);
        break;
      case "intent.retrieve":
        handlerRes = await handleRetrieve(message, userId, detection.entities);
        break;
      case "intent.delete":
        handlerRes = await handleDelete(message, userId, detection.entities);
        break;
      case "intent.list":
        handlerRes = await handleList(message, userId, detection.entities);
        break;
      default:
        return Response.json({
          type: "assistant",
          message: getGuidanceMessage(message),
        });
    }

    const data = await handlerRes.json();

    // E. CONTEXT SAVE
    if (data.awaiting_confirmation || data.duplicate) {
      await serverSupabase.from("chat_context").upsert(
        {
          user_id: userId,
          pending_delete_matches: data.matches || null,
          pending_save_duplicate: data.duplicate ? data : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return Response.json(data);
  } catch (err) {
    console.error("[API ERROR]", err);
    return Response.json({ message: "Error" }, { status: 500 });
  }
}

// --- UTILS ---
function normalizeMessage(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
function safeText(v: unknown) {
  return typeof v === "string" ? v : "";
}

async function getUserIdFromRequest(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const { data: { user } } = await serverSupabase.auth.getUser(auth.slice(7));
  return user?.id || null;
}

async function getPendingContext(userId: string) {
  const { data } = await serverSupabase
    .from("chat_context")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

async function clearAllPending(userId: string) {
  await serverSupabase
    .from("chat_context")
    .update({
      pending_delete_matches: null,
      pending_save_duplicate: null,
    })
    .eq("user_id", userId);
}

function uniqueEntities(entities: ExtractedEntity[]) {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.entity}:${e.sourceText.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractEntitiesHeuristic(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const phone = text.match(/(?:\+234|0)[7-9][0-1]\d{8}/g);
  if (phone)
    phone.forEach((p) =>
      entities.push({ entity: "phone", sourceText: p, value: p })
    );

  const email = text.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  );
  if (email)
    email.forEach((e) =>
      entities.push({ entity: "email", sourceText: e, value: e })
    );

  return entities;
}

function normalizeNlpEntities(items: any[]): ExtractedEntity[] {
  return items.map((i) => ({
    entity: i.entity || i.type,
    sourceText: i.sourceText || i.utteranceText,
    value: i.resolution?.value || i.sourceText,
  }));
}

function inferIntentFromEntities(text: string, entities: any[]): AppIntent | null {
  const lower = text.toLowerCase();

  if (entities.length > 0 && /\b(save|remember|keep)\b/.test(lower))
    return "intent.save";

  if (/\b(show|find|get)\b/.test(lower)) return "intent.retrieve";
  if (/\b(delete|remove)\b/.test(lower)) return "intent.delete";

  return null;
}

function buildGreetingMessage() {
  return "Hello Victor! I'm Memora. Ready to help.";
}

function getGuidanceMessage(msg: string) {
  return "Try: 'Save my note' or 'Show my items'.";
}