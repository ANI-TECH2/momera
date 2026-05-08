import { serverSupabase } from "../supabase";

export async function safeInsertWithFallback<T = any>(
  table: string,
  row: Record<string, unknown> | Record<string, unknown>[],
  select: string,
  options?: { single?: boolean }
) {
  const query = serverSupabase.from(table).insert(row).select(select);
  const result = options?.single ? await query.single() : await query;

  if (!result.error) {
    return result as { data: T; error: null };
  }

  const errorMessage = result.error.message || "";
  if (
    result.error.code === "PGRST204" &&
    errorMessage.includes("normalized_content")
  ) {
    const cleanRow = Array.isArray(row)
      ? row.map((item) => {
          const { normalized_content, ...rest } = item as Record<string, unknown>;
          return rest;
        })
      : (({ normalized_content, ...rest }) => rest)(row as Record<string, unknown>);

    const retryQuery = serverSupabase.from(table).insert(cleanRow).select(select);
    return options?.single ? await retryQuery.single() : await retryQuery;
  }

  return result as { data: T | null; error: typeof result.error };
}
