import { serverSupabase } from "@/server/supabase";

const FREE_LIMIT = 100 * 1024 * 1024; // 100MB

type UploadFormData = {
  get(name: string): FormDataEntryValue | null;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
      console.error("[Upload API] Auth error:", authError);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // ─── PARSE FORM DATA ──────────────────────────────────
    const formData = (await request.formData()) as unknown as UploadFormData;

    const fileEntry = formData.get("file");
    const description = String(formData.get("description") || "").trim();
    const fileType = String(formData.get("fileType") || "").trim();

    if (!fileEntry || typeof fileEntry === "string") {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }

    if (!description) {
      return Response.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    const normalizedContent = normalizeText(description);

    const file = fileEntry as File;
    const fileSize = Number(file.size || 0);
    const mimeType = file.type || "application/octet-stream";

    if (!fileSize) {
      return Response.json({ error: "Invalid file" }, { status: 400 });
    }

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

    const currentUsage = Number(usage?.total_bytes || 0);

    if (currentUsage + fileSize > FREE_LIMIT) {
      return Response.json(
        {
          error: "Storage limit reached. Upgrade your plan to upload more files.",
        },
        { status: 403 }
      );
    }

    // ─── DETERMINE BUCKET AND TABLE ───────────────────────
    const isImage =
      fileType === "image" ||
      mimeType.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name || "");

    const bucket = isImage ? "images" : "documents";
    const table = isImage ? "images" : "documents";

    // ─── BUILD SAFE FILE PATH ─────────────────────────────
    const originalName = file.name?.trim() || `file-${Date.now()}`;
    const cleanName = originalName.replace(/[^\w.\-]/g, "_");

    const fileExt = cleanName.includes(".")
      ? cleanName.split(".").pop()?.toLowerCase() || "bin"
      : isImage
      ? "jpg"
      : "bin";

    const uniqueName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;

    const filePath = `${userId}/${uniqueName}`;

    // ─── CONVERT FILE FOR SUPABASE STORAGE ────────────────
    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);

    // ─── UPLOAD FILE TO PRIVATE STORAGE ───────────────────
    const { error: uploadError } = await serverSupabase.storage
      .from(bucket)
      .upload(filePath, fileBytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Upload API] Upload error:", uploadError);
      return Response.json(
        { error: uploadError.message || "File upload failed. Please try again." },
        { status: 500 }
      );
    }

    // ─── SAVE METADATA TO DATABASE ────────────────────────
    const insertPayload = {
      user_id: userId,
      file_name: cleanName,
      file_path: filePath,
      file_type: mimeType,
      file_size: fileSize,
      description,
      normalized_content: normalizedContent,
      created_at: new Date().toISOString(),
    };

    const { data: savedDoc, error: dbError } = await serverSupabase
      .from(table)
      .insert(insertPayload)
      .select("id, file_name, file_path, file_type, file_size, description, created_at")
      .single();

    if (dbError) {
      console.error("[Upload API] DB error:", dbError);

      await serverSupabase.storage.from(bucket).remove([filePath]);

      return Response.json(
        { error: dbError.message || "Failed to save file info." },
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

    // ─── PRIVATE FILE ACCESS: RETURN SIGNED URL ───────────
    let signedUrl: string | null = null;

    const { data: signedData, error: signedUrlError } =
      await serverSupabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60); // 1 hour

    if (signedUrlError) {
      console.error("[Upload API] Signed URL error:", signedUrlError);
    } else {
      signedUrl = signedData?.signedUrl || null;
    }

    return Response.json({
      success: true,
      id: savedDoc.id,
      bucket,
      filePath,
      fileName: cleanName,
      fileType: mimeType,
      fileSize,
      description,
      signedUrl,
      message: "File saved successfully",
    });
  } catch (error: any) {
    console.error("[Upload API] Unexpected error:", error);
    return Response.json(
      { error: error?.message || "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}