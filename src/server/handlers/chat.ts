import { serverSupabase } from "../supabase";

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessage(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function getHelpMessage(): string {
  return `Here's what I can do for you:

💾 Save anything
→ *"Save my classmate John 08012345678"*

🔍 Find what you saved
→ *"Show my classmate contact"*
→ *"Find John from Port Harcourt"*

📄 Upload files
→ Tap the **+** button to upload docs or images

🗑️ Delete saved data
→ *"Delete my note about passwords"*

🔒 Privacy
Your saved data stays linked to your account only.`;
}

function getDefaultMessage(): string {
  return `I'm not sure what you mean. Here's what I can do:

💾 *"Save my [info]"* — to save
🔍 *"Show my [topic]"* — to find
📄 Tap **+** — to upload files
❓ Type *"help"* — for examples`;
}

function isDeleteInstruction(text: string): boolean {
  return /^(delete|remove|clear)\s+.+/i.test(text);
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good morning|good afternoon|good evening)[!,.]?\s*$/i.test(text);
}

// ─── CHAT HANDLER ─────────────────────────────────────────────
// Conversational fallback only — not the main intent router
export async function handleChat(message: string, userId: string) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to chat." },
      { status: 401 }
    );
  }

  try {
    const cleanMessage = normalizeMessage(safeString(message));
    const lower = cleanMessage.toLowerCase();

    if (!cleanMessage) {
      return Response.json(
        { type: "system", message: "Missing message" },
        { status: 400 }
      );
    }

    if (isGreeting(cleanMessage)) {
      return Response.json({
        type: "assistant",
        message: "Hello! 👋 I'm ready to help you save, find, and manage your notes.\n\nType *help* to see examples.",
      });
    }

    if (lower.includes("how are you")) {
      return Response.json({
        type: "assistant",
        message: "I'm doing great and ready to help. 😊\n\n💾 Save: *'save my [info]'*\n🔍 Find: *'show my [topic]'*\n📄 Upload: Tap the + button",
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

    if (isDeleteInstruction(cleanMessage)) {
      return Response.json({
        type: "assistant",
        message: '🗑️ To delete saved data, say exactly what to remove.\n\nExample: *"Delete my note about passwords"*',
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