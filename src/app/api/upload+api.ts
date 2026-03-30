import { createSupabaseClient } from "@/server/supabase";

// ✅ Create supabase instance directly
const supabase = createSupabaseClient();

export async function POST(request: Request) {
  try {
    // ─── VERIFY AUTH TOKEN ────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // ─── PARSE FORM DATA ──────────────────────────────────
    // ✅ Cast to any to fix FormData.get() TypeScript error in Expo
    const formData = await request.formData() as any;
    const file = formData.get("file") as File | null;
    const description = String(formData.get("description") || '');
    const fileType = String(formData.get("fileType") || '');

    if (!file || !description) {
      return Response.json(
        { error: "Missing file or description" },
        { status: 400 }
      );
    }

    // ─── CHECK STORAGE LIMIT ──────────────────────────────
    const { data: usage } = await supabase
      .from("user_storage")
      .select("total_bytes")
      .eq("user_id", userId)
      .maybeSingle();

    const FREE_LIMIT = 100 * 1024 * 1024; // 100MB
    const currentUsage = Number(usage?.total_bytes || 0);

    if (currentUsage + file.size > FREE_LIMIT) {
      return Response.json(
        { error: "Storage limit reached. Upgrade your plan to upload more files." },
        { status: 403 }
      );
    }

    // ─── DETERMINE BUCKET AND TABLE ───────────────────────
    const isImage = fileType === "image" || file.type.startsWith("image/");
    const bucket = isImage ? "images" : "documents";
    const table = isImage ? "images" : "documents";

    // ─── UPLOAD FILE TO STORAGE ───────────────────────────
    const fileExt = file.name.split(".").pop() || "unknown";
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return Response.json(
        { error: "File upload failed. Please try again." },
        { status: 500 }
      );
    }

    // ─── SAVE METADATA TO DATABASE ────────────────────────
    const { data: savedDoc, error: dbError } = await supabase
      .from(table)
      .insert({
        user_id: userId,
        file_name: file.name,
        file_path: filePath,
        file_type: isImage ? "image" : fileExt || "other",
        file_size: file.size,
        description,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB error:", dbError);
      await supabase.storage.from(bucket).remove([filePath]);
      return Response.json(
        { error: "Failed to save file info." },
        { status: 500 }
      );
    }

    // ─── UPDATE STORAGE USAGE ─────────────────────────────
    await supabase.rpc("increment_storage", {
      p_user_id: userId,
      p_bytes: file.size,
    });

    return Response.json({
      success: true,
      id: savedDoc.id,
      message: "File saved successfully",
    });

  } catch (error) {
    console.error("Upload API error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}