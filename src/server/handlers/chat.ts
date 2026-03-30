import { serverSupabase } from "../supabase";

type ChatPayload = {
  message?: string;
  entities?: Array<{
    entity: string;
    sourceText: string;
    value?: string;
    accuracy?: number;
  }>;
  intentScore?: number;
  intentSource?: string;
};

function isRequestLike(value: unknown): value is Request {
  return !!value && typeof value === "object" && "json" in value;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function extractPayload(
  input: Request | string | ChatPayload
): Promise<ChatPayload> {
  if (typeof input === "string") {
    return { message: input };
  }

  if (isRequestLike(input)) {
    return input
      .json()
      .then((body) =>
        body && typeof body === "object" ? (body as ChatPayload) : {}
      )
      .catch(() => ({}));
  }

  return input ?? {};
}

function normalizeMessage(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function getHelpMessage(): string {
  return `Here's what I can do for you:

💾 Save anything
"save my classmate John 08012345678"

🔍 Find what you saved
"show my classmate contact"
"find John from Port Harcourt"

📄 Upload files
Tap the + button to upload docs or images

🗑️ Delete saved data
"delete my note about passwords"

🔒 Privacy
Your saved data stays linked to your account.`;
}

function getDefaultMessage(): string {
  return `I'm here to help you save and find information. 💡

Try:
• "save my [your info]" to save
• "show my [topic]" to retrieve
• Tap + to upload files
• Type "help" for examples`;
}

function isDeleteInstruction(text: string): boolean {
  return /^(delete|remove|clear)\s+.+/i.test(text);
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good morning|good afternoon|good evening)[!,.]?\s*$/i.test(
    text
  );
}

// ─── CHAT HANDLER ─────────────────────────────────────────────
// This should be used as a conversational fallback, not as main intent router.
export async function handleChat(
  input: Request | string | ChatPayload,
  userId: string
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to chat." },
      { status: 401 }
    );
  }

  try {
    const payload = await extractPayload(input);
    const message = normalizeMessage(safeString(payload.message));
    const lower = message.toLowerCase();

    if (!message) {
      return Response.json(
        { type: "system", message: "Missing message" },
        { status: 400 }
      );
    }

    if (isGreeting(message)) {
      return Response.json({
        type: "assistant",
        message:
          "Hello! 👋 I'm ready to help you save, find, and manage your notes.\n\nType *help* to see examples.",
      });
    }

    if (lower.includes("how are you")) {
      return Response.json({
        type: "assistant",
        message:
          "I'm doing great and ready to help. 😊\n\nYou can:\n💾 Save: 'save my [info]'\n🔍 Find: 'show my [topic]'\n📄 Upload: Tap the + button",
      });
    }

    if (
      lower === "help" ||
      lower.includes("what can you do") ||
      lower.includes("how do i use this") ||
      lower.includes("how does this work")
    ) {
      return Response.json({
        type: "assistant",
        message: getHelpMessage(),
      });
    }

    if (
      lower.includes("thank you") ||
      lower === "thanks" ||
      lower.includes("thanks ")
    ) {
      return Response.json({
        type: "assistant",
        message: "You're welcome! 😊 Let me know what you want to save or find.",
      });
    }

    // Only treat delete as chat help when it is clearly a delete instruction.
    // Do not trigger on normal sentences that merely contain the word.
    if (isDeleteInstruction(message)) {
      return Response.json({
        type: "assistant",
        message:
          'To delete saved data, say exactly what to remove.\n\nExample: "delete my note about passwords"',
      });
    }

    return Response.json({
      type: "assistant",
      message: getDefaultMessage(),
    });
  } catch (error) {
    console.error("[Chat Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}