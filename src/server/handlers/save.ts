import { serverSupabase } from "../supabase";
import {
  extractContent,
  detectCategory,
  generateHash,
  normalizeText,
} from "../helpers";
import { buildSaveReply } from "../nlp/replyBuilder";

type SaveEntity = {
  entity: string;
  sourceText: string;
  value?: string;
  accuracy?: number;
};

type SavePayload = {
  message?: string;
  entities?: SaveEntity[];
  intentScore?: number;
  intentSource?: string;
};

function isRequestLike(value: unknown): value is Request {
  return !!value && typeof value === "object" && "json" in value;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractMessageFromPayload(
  input: Request | string | SavePayload
): Promise<SavePayload> | SavePayload {
  if (typeof input === "string") {
    return { message: input };
  }

  if (isRequestLike(input)) {
    return input
      .json()
      .then((body) => (body && typeof body === "object" ? body as SavePayload : {}))
      .catch(() => ({}));
  }

  if (input && typeof input === "object") {
    return input;
  }

  return {};
}

function getBestSaveContent(message: string, entities: SaveEntity[] = []): string {
  const extracted = safeString(extractContent(message));

  if (extracted.length >= 2) return extracted;

  // fallback: rebuild from useful entities when extractContent is too weak
  const usefulEntities = entities
    .filter((item) =>
      [
        "phone",
        "email",
        "money",
        "date_like",
        "place",
        "keyword",
        "name_like",
      ].includes(item.entity)
    )
    .map((item) => safeString(item.sourceText))
    .filter(Boolean);

  if (usefulEntities.length > 0) {
    return usefulEntities.join(" ");
  }

  return extracted;
}

// ─── SAVE HANDLER ─────────────────────────────────────────────
// Supports:
// handleSave("save john 0803...", userId)
// handleSave(request, userId)
export async function handleSave(
  input: Request | string | SavePayload,
  userId: string
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to save notes." },
      { status: 401 }
    );
  }

  try {
    const payload = await extractMessageFromPayload(input);
    const message = safeString(payload.message);
    const entities = Array.isArray(payload.entities) ? payload.entities : [];

    if (!message) {
      return Response.json(
        { type: "system", message: "Missing message" },
        { status: 400 }
      );
    }

    // Step 1: Extract content
    const content = getBestSaveContent(message, entities);

    if (!content || content.length < 2) {
      return Response.json({
        type: "system",
        message:
          "What do you want me to save? Please add the content after the save keyword.\n\nExample: 'save my classmate John 08012345678'",
      });
    }

    // Step 2: Detect category
    const category = detectCategory(content);

    // Step 3: Check for duplicate
    const contentHash = generateHash(content);

    const { data: existing, error: fetchError } = await serverSupabase
      .from("notes")
      .select("id, content, created_at")
      .eq("user_id", userId)
      .eq("content_hash", contentHash)
      .maybeSingle();

    if (fetchError) {
      console.error("[Save Handler] Duplicate check error:", fetchError);
      // continue even if duplicate check fails
    }

    if (existing) {
      return Response.json({
        type: "system",
        message: `⚠️ Already saved!\n\n"${existing.content.slice(
          0,
          100
        )}"\n\nSay 'replace it' to overwrite or 'keep both' to save again.`,
        duplicate: true,
        existingId: existing.id,
      });
    }

    // Step 4: Save to database
    const normalizedContent = normalizeText(content);

    const { data: inserted, error: insertError } = await serverSupabase
      .from("notes")
      .insert({
        user_id: userId,
        content,
        title: content.slice(0, 60),
        category,
        content_hash: contentHash,
        normalized_content: normalizedContent,
        metadata: {
          entities,
          intentScore: payload.intentScore ?? null,
          intentSource: payload.intentSource ?? null,
          originalMessage: message,
        },
        created_at: new Date().toISOString(),
      })
      .select("id, content, category, created_at")
      .single();

    if (insertError) {
      console.error("[Save Handler] Insert error:", insertError);
      return Response.json(
        {
          type: "system",
          message: "❌ Failed to save. Please try again.",
        },
        { status: 500 }
      );
    }

    // Step 5: Return smart confirmation
    const reply = buildSaveReply(category, content);

    return Response.json({
      type: "save_confirm",
      message: reply,
      note: inserted ?? null,
    });
  } catch (error) {
    console.error("[Save Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}