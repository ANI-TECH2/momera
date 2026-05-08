import { serverSupabase as supabase } from "@/server/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId || !userId.trim()) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const cleanUserId = userId.trim();

    // ─── FETCH ALL USER DATA ───────────────────────────────
    const [notesRes, docsRes, imagesRes, chatsRes] = await Promise.all([
      supabase
        .from("notes")
        .select("id, content, title, category, created_at")
        .eq("user_id", cleanUserId)
        .order("created_at", { ascending: false }),

      supabase
        .from("documents")
        .select("id, file_name, description, file_type, created_at")
        .eq("user_id", cleanUserId)
        .order("created_at", { ascending: false }),

      supabase
        .from("images")
        .select("id, file_name, description, created_at")
        .eq("user_id", cleanUserId)
        .order("created_at", { ascending: false }),

      supabase
        .from("chat_history")
        .select("role, content as message, created_at")
        .eq("user_id", cleanUserId)
        .order("created_at", { ascending: true }),
    ]);

    // ─── HANDLE ERRORS ─────────────────────────────────────
    const errors = [
      notesRes.error,
      docsRes.error,
      imagesRes.error,
      chatsRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Supabase errors:", errors);
      throw new Error("Failed to fetch some data");
    }

    // ─── BUILD EXPORT OBJECT ──────────────────────────────
    const exportData = {
      app: "Memora",
      exported_at: new Date().toISOString(),
      user_id: cleanUserId,
      summary: {
        total_notes: notesRes.data?.length ?? 0,
        total_documents: docsRes.data?.length ?? 0,
        total_images: imagesRes.data?.length ?? 0,
        total_chats: chatsRes.data?.length ?? 0,
      },
      notes: notesRes.data ?? [],
      documents: docsRes.data ?? [],
      images: imagesRes.data ?? [],
      chat_history: chatsRes.data ?? [],
    };

    // ─── RETURN AS DOWNLOAD ───────────────────────────────
    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="memora-export-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);

    return Response.json(
      { error: "Export failed. Please try again." },
      { status: 500 }
    );
  }
}
