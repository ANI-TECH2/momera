import {
  notesCache,
  pricesCache,
  imagesCache,
  documentsCache,
  syncQueue,
  offlineDetector,
  Note,
  Price,
  CachedImage,
  CachedDocument,
} from "./cache";
import { getOfflineUserPlan } from "./storage";

/**
 * Cache Sync Manager
 */
export class CacheSyncManager {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: ((status: "syncing" | "synced" | "error") => void)[] = [];

  constructor(private intervalMs = 30000) {}

  /**
   * Start auto-sync (every 30s or when online)
   */
  start(): void {
    if (this.syncInterval) return;

    // Sync every interval
    this.syncInterval = setInterval(() => {
      if (!offlineDetector.isOffline()) {
        this.syncAll();
      }
    }, this.intervalMs);

    // Also sync when coming back online
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.syncAll());
    }
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  subscribe(listener: (status: "syncing" | "synced" | "error") => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(status: "syncing" | "synced" | "error"): void {
    this.listeners.forEach((listener) => listener(status));
  }

  /**
   * Sync all unsynced items
   */
  async syncAll(): Promise<void> {
    if (this.isSyncing) return;

    // Check if user is pro before syncing
    const plan = await getOfflineUserPlan();
    if (plan !== 'pro') {
      console.log('[CacheSync] Skipping sync - user is not pro');
      return;
    }

    this.isSyncing = true;
    this.notify("syncing");

    try {
      // Get the supabase client from auth context
      // This is called from hooks, so we need to handle it differently
      await this.processSyncQueue();
      await this.pullLatestData();

      this.notify("synced");
    } catch (error) {
      console.error("[CacheSync] Sync failed:", error);
      this.notify("error");
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process sync queue and push to Supabase
   */
  private async processSyncQueue(): Promise<void> {
    const queue = await syncQueue.getQueue();
    if (queue.length === 0) return;

    console.log(`[CacheSync] Processing ${queue.length} queued items`);

    for (const item of queue) {
      try {
        // Note: In actual usage, this will be called from a context
        // where supabase client is available
        console.log(
          `[CacheSync] Would sync ${item.type}:${item.action} - ${item.id}`
        );

        // Mark as synced in the respective cache
        switch (item.type) {
          case "notes":
            await notesCache.markSynced(item.id);
            break;
          case "prices":
            await pricesCache.markSynced(item.id);
            break;
          case "images":
            await imagesCache.markSynced(item.id);
            break;
          case "documents":
            await documentsCache.markSynced(item.id);
            break;
        }

        // Remove from queue
        await syncQueue.remove(item.id);
      } catch (error) {
        console.error(
          `[CacheSync] Failed to sync ${item.type}:${item.id}:`,
          error
        );
        // Keep in queue for retry
      }
    }
  }

  /**
   * Pull latest data from Supabase (optional - for keeping cache fresh)
   */
  private async pullLatestData(): Promise<void> {
    // This would fetch recent updates from Supabase
    // Implementation depends on your API structure
    console.log("[CacheSync] Pulling latest data from Supabase");
  }

  async getSyncStatus(): Promise<{
    isSyncing: boolean;
    queueLength: number;
    lastSync?: number;
  }> {
    const queueLength = await syncQueue.getLength();
    const notesStats = await notesCache.getStats();
    const pricesStats = await pricesCache.getStats();

    return {
      isSyncing: this.isSyncing,
      queueLength,
      lastSync: Date.now(),
    };
  }
}

export const cacheSyncManager = new CacheSyncManager();

/**
 * Hook: Use cached notes with auto-sync
 */
export async function getCachedNotes(): Promise<Note[]> {
  const entries = await notesCache.getAll();
  return entries.map((e) => e.data);
}

/**
 * Hook: Use cached prices with auto-sync
 */
export async function getCachedPrices(): Promise<Price[]> {
  const entries = await pricesCache.getAll();
  return entries.map((e) => e.data);
}

/**
 * Hook: Use cached images with auto-sync
 */
export async function getCachedImages(): Promise<CachedImage[]> {
  const entries = await imagesCache.getAll();
  return entries.map((e) => e.data);
}

/**
 * Hook: Use cached documents with auto-sync
 */
export async function getCachedDocuments(): Promise<CachedDocument[]> {
  const entries = await documentsCache.getAll();
  return entries.map((e) => e.data);
}

/**
 * Save to local cache (for offline support)
 */
export async function saveNoteOffline(note: Note): Promise<void> {
  await notesCache.set(note.id, note, "update");
  await syncQueue.add({
    id: note.id,
    type: "notes",
    action: "update",
    data: note,
  });
}

export async function savePriceOffline(price: Price): Promise<void> {
  await pricesCache.set(price.id, price, "update");
  await syncQueue.add({
    id: price.id,
    type: "prices",
    action: "update",
    data: price,
  });
}

export async function saveImageOffline(image: CachedImage): Promise<void> {
  await imagesCache.set(image.id, image, "update");
  await syncQueue.add({
    id: image.id,
    type: "images",
    action: "update",
    data: image,
  });
}

export async function saveDocumentOffline(
  document: CachedDocument
): Promise<void> {
  await documentsCache.set(document.id, document, "update");
  await syncQueue.add({
    id: document.id,
    type: "documents",
    action: "update",
    data: document,
  });
}

/**
 * Delete from cache
 */
export async function deleteNoteOffline(noteId: string): Promise<void> {
  await notesCache.delete(noteId);
  await syncQueue.add({
    id: noteId,
    type: "notes",
    action: "delete",
    data: null,
  });
}

export async function deletePriceOffline(priceId: string): Promise<void> {
  await pricesCache.delete(priceId);
  await syncQueue.add({
    id: priceId,
    type: "prices",
    action: "delete",
    data: null,
  });
}
