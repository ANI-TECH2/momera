import { createClient } from "@/server/supabase";
import { StatusError } from 'expo-server';

const supabase = createClient();

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");
    const table = searchParams.get("table"); // 'images' or 'documents'

    if (!userId || !id || !table || (table !== 'images' && table !== 'documents')) {
      throw new StatusError(400, 'Missing/invalid userId, id, or table');
    }

    // ─── FETCH FILE INFO ──────────────────────────────
    const { data: fileInfo } = await supabase
      .from(table)
      .select("file_path")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!fileInfo) {
      throw new StatusError(404, 'File not found');
    }

    // ─── DELETE FROM STORAGE ─────────────────────────
    const { error: storageError } = await supabase.storage
      .from(table)
      .remove([fileInfo.file_path]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      throw new StatusError(500, 'Failed to delete file from storage');
    }

    // ─── DELETE FROM DB ───────────────────────────────
    const { error: dbError } = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (dbError) {
      console.error("DB delete error:", dbError);
      throw new StatusError(500, 'Failed to delete file metadata');
    }

    // ─── UPDATE STORAGE USAGE ─────────────────────────
    await supabase.rpc("decrement_storage", {
      p_user_id: userId,
      p_bytes: 0, // Size not available here, but call anyway
    });

    return Response.json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    if (error instanceof StatusError) {
      throw error;
    }
    console.error("Delete API error:", error);
    throw new StatusError(500, 'Delete failed');
  }
}
