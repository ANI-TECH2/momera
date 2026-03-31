import { serverSupabase } from "@/server/supabase";

export async function POST(request: Request) {
  try {
    // ─── VERIFY AUTH TOKEN ────────────────────────────────
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // ─── PARSE FORM DATA ──────────────────────────────────
    // ✅ Cast to any — Expo Router API routes FormData TS limitation
    const formData = await request.formData() as any;
    const fileEntry = formData.get("file");
    const description = String(formData.get("description") || "").trim();
    const fileType = String(formData.get("fileType") || "").trim();

    if (!fileEntry || typeof fileEntry === "string" || !description) {
      return Response.json(
        { error: "Missing file or description" },
        { status: 400 }
      );
    }

    const file = fileEntry as File;
    const fileSize = Number(file.size || 0);
    const mimeType = file.type || "application/octet-stream";

    // ─── CHECK STORAGE LIMIT ──────────────────────────────
    const { data: usage, error: usageError } = await serverSupabase
      .from("user_storage")
      .select("total_bytes")
      .eq("user_id", userId)
      .maybeSingle();

    if (usageError) {
      console.error("[Upload API] Storage usage error:", usageError);
      return Response.json(
        { error: "Could not verify storage usage." },
        { status: 500 }
      );
    }

    const FREE_LIMIT = 100 * 1024 * 1024; // 100MB
    const currentUsage = Number(usage?.total_bytes || 0);

    if (currentUsage + fileSize > FREE_LIMIT) {
      return Response.json(
        { error: "Storage limit reached. Upgrade your plan to upload more files." },
        { status: 403 }
      );
    }

    // ─── DETERMINE BUCKET AND TABLE ───────────────────────
    const isImage = fileType === "image" || mimeType.startsWith("image/");
    const bucket = isImage ? "images" : "documents";
    const table = isImage ? "images" : "documents";

    // ─── UPLOAD FILE TO STORAGE ───────────────────────────
    const fileName = file.name || `file-${Date.now()}`;
    const fileExt = fileName.includes(".")
      ? fileName.split(".").pop()?.toLowerCase() || "unknown"
      : "unknown";

    const filePath = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;

    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await serverSupabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Upload API] Upload error:", uploadError);
      return Response.json(
        { error: "File upload failed. Please try again." },
        { status: 500 }
      );
    }

    // ─── SAVE METADATA TO DATABASE ────────────────────────
    const { data: savedDoc, error: dbError } = await serverSupabase
      .from(table)
      .insert({
        user_id: userId,
        file_name: fileName,
        file_path: filePath,
        file_type: isImage ? "image" : fileExt || "other",
        file_size: fileSize,
        description,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("[Upload API] DB error:", dbError);
      await serverSupabase.storage.from(bucket).remove([filePath]);
      return Response.json(
        { error: "Failed to save file info." },
        { status: 500 }
      );
    }

    // ─── UPDATE STORAGE USAGE ─────────────────────────────
    const { error: rpcError } = await serverSupabase.rpc("increment_storage", {
      p_user_id: userId,
      p_bytes: fileSize,
    });

    if (rpcError) {
      console.error("[Upload API] increment_storage error:", rpcError);
    }

    return Response.json({
      success: true,
      id: savedDoc.id,
      message: "File saved successfully",
    });

  } catch (error) {
    console.error("[Upload API] Unexpected error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}