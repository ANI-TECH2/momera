import { getStorage } from "./storage";
import { Platform } from "react-native";

/**
 * Types for local cache
 */
export type CacheEntry<T> = {
  id: string;
  data: T;
  timestamp: number;
  synced: boolean;
  operation: "create" | "update" | "delete";
};

export type Note = {
  id: string;
  user_id: string;
  title: string;
  content?: string;
  summary?: string;
  tags?: string[];
  is_pinned: boolean;
  is_archived: boolean;
  category: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
};

export type Price = {
  id: string;
  user_id: string;
  product_name: string;
  price: number;
  currency: string;
  category?: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

export type CachedImage = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

export type CachedDocument = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

/**
 * Cache Manager Base
 */
class CacheManager<T extends { id: string }> {
  private prefix: string;
  private storage = getStorage();
  private maxItems: number;

  constructor(prefix: string, maxItems = 500) {
    this.prefix = prefix;
    this.maxItems = maxItems;
  }

  private key(id: string): string {
    return `${this.prefix}:${id}`;
  }

  private indexKey(): string {
    return `${this.prefix}:index`;
  }

  /**
   * Save item to local cache
   */
  async set(
    id: string,
    data: T,
    operation: "create" | "update" | "delete" = "update"
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      id,
      data,
      timestamp: Date.now(),
      synced: false,
      operation,
    };

    await this.storage.setItem(this.key(id), JSON.stringify(entry));

    // Update index
    const index = await this.getIndex();
    if (!index.includes(id)) {
      index.push(id);
      if (index.length > this.maxItems) {
        index.shift(); // Remove oldest
      }
      await this.storage.setItem(this.indexKey(), JSON.stringify(index));
    }
  }

  /**
   * Get item from cache
   */
  async get(id: string): Promise<CacheEntry<T> | null> {
    const json = await this.storage.getItem(this.key(id));
    if (!json) return null;

    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /**
   * Get all items
   */
  async getAll(): Promise<CacheEntry<T>[]> {
    const index = await this.getIndex();
    const items: CacheEntry<T>[] = [];

    for (const id of index) {
      const entry = await this.get(id);
      if (entry) items.push(entry);
    }

    return items;
  }

  /**
   * Get unsynced items (for sync queue)
   */
  async getUnsynced(): Promise<CacheEntry<T>[]> {
    const all = await this.getAll();
    return all.filter((item) => !item.synced);
  }

  /**
   * Mark item as synced
   */
  async markSynced(id: string): Promise<void> {
    const entry = await this.get(id);
    if (!entry) return;

    entry.synced = true;
    await this.storage.setItem(this.key(id), JSON.stringify(entry));
  }

  /**
   * Delete item
   */
  async delete(id: string): Promise<void> {
    await this.storage.removeItem(this.key(id));

    const index = await this.getIndex();
    const filtered = index.filter((i) => i !== id);
    await this.storage.setItem(this.indexKey(), JSON.stringify(filtered));
  }

  /**
   * Clear all
   */
  async clear(): Promise<void> {
    const index = await this.getIndex();
    for (const id of index) {
      await this.storage.removeItem(this.key(id));
    }
    await this.storage.removeItem(this.indexKey());
  }

  /**
   * Get index of all IDs
   */
  private async getIndex(): Promise<string[]> {
    const json = await this.storage.getItem(this.indexKey());
    if (!json) return [];

    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    total: number;
    synced: number;
    unsynced: number;
  }> {
    const all = await this.getAll();
    const unsynced = all.filter((item) => !item.synced).length;

    return {
      total: all.length,
      synced: all.length - unsynced,
      unsynced,
    };
  }
}

/**
 * Export cache managers
 */
export const notesCache = new CacheManager<Note>("cache:notes");
export const pricesCache = new CacheManager<Price>("cache:prices");
export const imagesCache = new CacheManager<CachedImage>("cache:images");
export const documentsCache = new CacheManager<CachedDocument>(
  "cache:documents"
);

/**
 * Sync Queue - tracks operations to sync to Supabase
 */
export class SyncQueue {
  private storage = getStorage();
  private prefix = "sync:queue";

  async add(
    operation: {
      id: string;
      type: "notes" | "prices" | "images" | "documents";
      action: "create" | "update" | "delete";
      data: any;
    }
  ): Promise<void> {
    const queue = await this.getQueue();
    queue.push({
      ...operation,
      timestamp: Date.now(),
      retries: 0,
    });

    await this.storage.setItem(this.prefix, JSON.stringify(queue));
  }

  async getQueue(): Promise<
    Array<{
      id: string;
      type: "notes" | "prices" | "images" | "documents";
      action: "create" | "update" | "delete";
      data: any;
      timestamp: number;
      retries: number;
    }>
  > {
    const json = await this.storage.getItem(this.prefix);
    if (!json) return [];

    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  async remove(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await this.storage.setItem(this.prefix, JSON.stringify(filtered));
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(this.prefix);
  }

  async getLength(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }
}

export const syncQueue = new SyncQueue();

/**
 * Offline detection
 */
export class OfflineDetector {
  private isOnline = true;
  private listeners: ((online: boolean) => void)[] = [];

  constructor() {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", () => this.setOnline(true));
      window.addEventListener("offline", () => this.setOnline(false));
    }
  }

  private setOnline(online: boolean): void {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.listeners.forEach((listener) => listener(online));
    }
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  isOffline(): boolean {
    return !this.isOnline;
  }

  getStatus(): "online" | "offline" {
    return this.isOnline ? "online" : "offline";
  }
}

export const offlineDetector = new OfflineDetector();
