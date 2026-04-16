import { serverSupabase } from "../supabase";
import { ExtractedEntity } from "@/app/api/chat+api";

type ListEntity = ExtractedEntity;

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ListSection = {
  label: string;
  count: number;
  items: ListItem[];
};

type ListItem = {
  id: string;
  display: string;       // human-readable one-line summary
  category?: string;
  created_at?: string;
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatCurrency(price: number, currency = "NGN"): string {
  const symbols: Record<string, string> = {
    NGN: "₦", USD: "$", GBP: "£", EUR: "€",
    GHS: "GH₵", KES: "KSh", ZAR: "R",
  };
  return `${symbols[currency] ?? currency}${price.toLocaleString()}`;
}

// ─── SCOPE DETECTION ──────────────────────────────────────────────────────────

type ListScope =
  | "all"
  | "notes"
  | "prices"
  | "contacts"
  | "images"
  | "documents"
  | "secure"
  | "recent";

/**
 * Reads the user's message to figure out what they want to list.
 *
 * "show all"             → all
 * "show my prices"       → prices
 * "show my contacts"     → contacts
 * "show my notes"        → notes
 * "show my images"       → images
 * "show my documents"    → documents
 * "show my passwords"    → secure
 * "show recent"          → recent (last 10 across all tables)
 */
function detectListScope(message: string): ListScope {
  const lower = message.toLowerCase();

  if (/\b(all|everything|entire|whole)\b/.test(lower)) return "all";
  if (/\b(recent|latest|last|new)\b/.test(lower)) return "recent";
  if (/\b(price|prices|cost|costs|product|products)\b/.test(lower)) return "prices";
  if (/\b(contact|contacts|phone|number|people)\b/.test(lower)) return "contacts";
  if (/\b(image|images|photo|photos|picture|pictures|pic|pics)\b/.test(lower)) return "images";
  if (/\b(document|documents|doc|docs|file|files|pdf)\b/.test(lower)) return "documents";
  if (/\b(password|passwords|pin|pins|secret|credential|secure)\b/.test(lower)) return "secure";
  if (/\b(note|notes|saved|saves|info|data)\b/.test(lower)) return "notes";

  return "all"; // default — show everything
}

// ─── FETCHERS ─────────────────────────────────────────────────────────────────

async function fetchNotes(
  userId: string,
  categoryFilter?: string,
  limit = 20
): Promise<ListItem[]> {
  let query = serverSupabase
    .from("notes")
    .select("id, title, content, category, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (categoryFilter) {
    query = query.eq("category", categoryFilter);
  }

  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: row.id,
    display: row.title || safeString(row.content).slice(0, 70) || "Untitled note",
    category: row.category,
    created_at: row.created_at,
  }));
}

async function fetchPrices(userId: string, limit = 20): Promise<ListItem[]> {
  const { data } = await serverSupabase
    .from("product_prices")
    .select("id, product_name, price, currency, category, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    display: `${row.product_name} — ${formatCurrency(row.price, row.currency ?? "NGN")}`,
    category: row.category,
    created_at: row.created_at,
  }));
}

async function fetchImages(userId: string, limit = 20): Promise<ListItem[]> {
  const { data } = await serverSupabase
    .from("images")
    .select("id, file_name, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    display: row.file_name || row.description || "Untitled image",
    created_at: row.created_at,
  }));
}

async function fetchDocuments(userId: string, limit = 20): Promise<ListItem[]> {
  const { data } = await serverSupabase
    .from("documents")
    .select("id, file_name, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    display: row.file_name || row.description || "Untitled document",
    created_at: row.created_at,
  }));
}

// ─── COUNTS ───────────────────────────────────────────────────────────────────

async function fetchCounts(userId: string): Promise<{
  notes: number;
  contacts: number;
  secure: number;
  prices: number;
  images: number;
  documents: number;
}> {
  const [notesRes, pricesRes, imagesRes, docsRes] = await Promise.all([
    serverSupabase
      .from("notes")
      .select("id, category", { count: "exact" })
      .eq("user_id", userId),
    serverSupabase
      .from("product_prices")
      .select("id", { count: "exact" })
      .eq("user_id", userId),
    serverSupabase
      .from("images")
      .select("id", { count: "exact" })
      .eq("user_id", userId),
    serverSupabase
      .from("documents")
      .select("id", { count: "exact" })
      .eq("user_id", userId),
  ]);

  const allNotes = notesRes.data ?? [];
  const contacts = allNotes.filter((n) => n.category === "contact").length;
  const secure = allNotes.filter((n) =>
    ["secure_note", "password", "credential"].includes(n.category)
  ).length;
  const notes = allNotes.length - contacts - secure;

  return {
    notes,
    contacts,
    secure,
    prices: pricesRes.count ?? 0,
    images: imagesRes.count ?? 0,
    documents: docsRes.count ?? 0,
  };
}

// ─── REPLY BUILDERS ───────────────────────────────────────────────────────────

function buildSectionedReply(sections: ListSection[]): string {
  const nonEmpty = sections.filter((s) => s.count > 0);

  if (nonEmpty.length === 0) {
    return "📦 You haven't saved anything yet.\n\nStart by saying _\"Save my number\"_ or _\"Remember coke price 300\"_.";
  }

  const emojiMap: Record<string, string> = {
    "Notes": "📝",
    "Prices": "💰",
    "Contacts": "👤",
    "Secure": "🔐",
    "Images": "🖼️",
    "Documents": "📄",
  };

  const parts = nonEmpty.map((section) => {
    const emoji = emojiMap[section.label] || "📌";
    const header = `\n${emoji} *${section.label}* (${section.count} total)`;
    
    const itemsToShow = section.items.slice(0, 10);
    const table = itemsToShow
      .map((item, idx) => {
        const when = timeAgo(item.created_at);
        const num = (idx + 1).toString().padStart(2);
        const display = item.display.slice(0, 45).padEnd(45);
        return `  ${num}. ${display} _(${when})_`;
      })
      .join("\n");
    
    const more =
      section.count > 10
        ? `\n  _... and ${section.count - 10} more items_`
        : "";
    
    return `${header}${more}${more ? "\n" : ""}\n${table}${more}`;
  });

  const total = nonEmpty.reduce((sum, s) => sum + s.count, 0);
  const divider = "═".repeat(60);
  const intro = `\n${divider}\n📊 *YOUR SAVED DATA* — Total: ${total} items\n${divider}`;
  
  return intro + parts.join("\n") + `\n\n${divider}`;
}

function buildSingleSectionReply(
  label: string,
  emoji: string,
  items: ListItem[],
  total: number
): string {
  if (items.length === 0) {
    return `${emoji} *Your ${label}*\n\nYou don't have any ${label.toLowerCase()} saved yet.\n\nStart saving by saying _"Save ..."_`;
  }

  const divider = "─".repeat(60);
  const header = `\n${emoji} *${label}* (${total} total)\n${divider}`;
  
  const table = items
    .slice(0, 20)
    .map((item, idx) => {
      const when = timeAgo(item.created_at);
      const num = (idx + 1).toString().padStart(2);
      const display = item.display.slice(0, 50).padEnd(50);
      return `  ${num}. ${display} _(${when})_`;
    })
    .join("\n");

  const more =
    total > items.length
      ? `\n\n_Showing ${items.length} of ${total} items. Say "show all my ${label.toLowerCase()}" to see more._`
      : "";

  return header + "\n" + table + more + `\n${divider}`;
}

// ─── RECENT ACROSS ALL TABLES ─────────────────────────────────────────────────

async function fetchRecent(userId: string): Promise<string> {
  const [notes, prices, images, docs] = await Promise.all([
    fetchNotes(userId, undefined, 5),
    fetchPrices(userId, 5),
    fetchImages(userId, 5),
    fetchDocuments(userId, 5),
  ]);

  type TaggedItem = ListItem & { type: string; emoji: string };

  const all: TaggedItem[] = [
    ...notes.map((n) => ({ ...n, type: "note", emoji: "📝" })),
    ...prices.map((p) => ({ ...p, type: "price", emoji: "💰" })),
    ...images.map((i) => ({ ...i, type: "image", emoji: "🖼️" })),
    ...docs.map((d) => ({ ...d, type: "document", emoji: "📄" })),
  ].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  }).slice(0, 10);

  if (all.length === 0) {
    return "📦 You haven't saved anything yet.\n\nStart by saying _\"Save my number\"_.";
  }

  const divider = "═".repeat(60);
  const header = `\n${divider}\n⏰ *Your 10 Most Recent Saves*\n${divider}`;
  
  const list = all
    .map((item, idx) => {
      const when = timeAgo(item.created_at);
      const num = (idx + 1).toString().padStart(2);
      const display = item.display.slice(0, 50).padEnd(50);
      return `  ${num}. ${item.emoji} ${display} _(${when})_`;
    })
    .join("\n");

  return header + "\n" + list + `\n${divider}`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export async function handleList(
  message: string,
  userId: string,
  entities: ListEntity[] = []
) {
  if (!userId) {
    return Response.json(
      { type: "system", message: "Please log in to view your data." },
      { status: 401 }
    );
  }

  try {
    const cleanMessage = safeString(message);
    const scope = detectListScope(cleanMessage);

    // ── Recent ────────────────────────────────────────────────────────────────
    if (scope === "recent") {
      const reply = await fetchRecent(userId);
      return Response.json({ type: "assistant", message: reply });
    }

    // ── Prices only ───────────────────────────────────────────────────────────
    if (scope === "prices") {
      const [items, counts] = await Promise.all([
        fetchPrices(userId, 20),
        fetchCounts(userId),
      ]);
      return Response.json({
        type: "assistant",
        message: buildSingleSectionReply("Prices", "💰", items, counts.prices),
        data: { prices: items },
      });
    }

    // ── Contacts only ─────────────────────────────────────────────────────────
    if (scope === "contacts") {
      const items = await fetchNotes(userId, "contact", 20);
      const counts = await fetchCounts(userId);
      return Response.json({
        type: "assistant",
        message: buildSingleSectionReply("Contacts", "👤", items, counts.contacts),
        data: { contacts: items },
      });
    }

    // ── Secure notes only ─────────────────────────────────────────────────────
    if (scope === "secure") {
      const [secureNotes, pinNotes] = await Promise.all([
        fetchNotes(userId, "secure_note", 20),
        fetchNotes(userId, "password", 10),
      ]);
      const items = [...secureNotes, ...pinNotes];
      const counts = await fetchCounts(userId);
      return Response.json({
        type: "assistant",
        message: buildSingleSectionReply("Secure Notes", "🔐", items, counts.secure),
        data: { secure: items },
      });
    }

    // ── Images only ───────────────────────────────────────────────────────────
    if (scope === "images") {
      const [items, counts] = await Promise.all([
        fetchImages(userId, 20),
        fetchCounts(userId),
      ]);
      return Response.json({
        type: "assistant",
        message: buildSingleSectionReply("Images", "🖼️", items, counts.images),
        data: { images: items },
      });
    }

    // ── Documents only ────────────────────────────────────────────────────────
    if (scope === "documents") {
      const [items, counts] = await Promise.all([
        fetchDocuments(userId, 20),
        fetchCounts(userId),
      ]);
      return Response.json({
        type: "assistant",
        message: buildSingleSectionReply("Documents", "📄", items, counts.documents),
        data: { documents: items },
      });
    }

    // ── Notes only ────────────────────────────────────────────────────────────
    if (scope === "notes") {
      const [items, counts] = await Promise.all([
        fetchNotes(userId, undefined, 20),
        fetchCounts(userId),
      ]);
      // Filter out contacts and secure notes from general notes list
      const generalNotes = items.filter(
        (n) => !["contact", "secure_note", "password", "credential"].includes(n.category ?? "")
      );
      return Response.json({
        type: "assistant",
        message: buildSingleSectionReply("Notes", "📝", generalNotes, counts.notes),
        data: { notes: generalNotes },
      });
    }

    // ── All — fetch everything and group by section ───────────────────────────
    const [counts, notes, prices, images, docs] = await Promise.all([
      fetchCounts(userId),
      fetchNotes(userId, undefined, 50),
      fetchPrices(userId, 20),
      fetchImages(userId, 20),
      fetchDocuments(userId, 20),
    ]);

    const generalNotes = notes.filter(
      (n) => !["contact", "secure_note", "password", "credential"].includes(n.category ?? "")
    );
    const contacts = notes.filter((n) => n.category === "contact");
    const secure = notes.filter((n) =>
      ["secure_note", "password", "credential"].includes(n.category ?? "")
    );

    const sections: ListSection[] = [
      { label: "Notes",      count: counts.notes,     items: generalNotes },
      { label: "Prices",     count: counts.prices,    items: prices },
      { label: "Contacts",   count: counts.contacts,  items: contacts },
      { label: "Secure",     count: counts.secure,    items: secure },
      { label: "Images",     count: counts.images,    items: images },
      { label: "Documents",  count: counts.documents, items: docs },
    ];

    return Response.json({
      type: "assistant",
      message: buildSectionedReply(sections),
      data: {
        counts,
        notes: generalNotes,
        prices,
        contacts,
        secure,
        images,
        documents: docs,
      },
    });
  } catch (error) {
    console.error("[List Handler] Unexpected error:", error);
    return Response.json(
      { type: "system", message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}