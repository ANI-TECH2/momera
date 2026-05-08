import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./auth";
import {
  getCachedNotes,
  getCachedPrices,
  getCachedImages,
  getCachedDocuments,
  saveNoteOffline,
  savePriceOffline,
  saveImageOffline,
  saveDocumentOffline,
  deleteNoteOffline,
  deletePriceOffline,
  cacheSyncManager,
} from "./cacheSync";
import {
  Note,
  Price,
  CachedImage,
  CachedDocument,
  offlineDetector,
} from "./cache";

type LoadState = "idle" | "loading" | "loaded" | "error";

/**
 * Hook: Fetch notes (local cache with fallback to Supabase)
 */
export function useCachedNotes() {
  const { supabase } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [isOnline, setIsOnline] = useState(!offlineDetector.isOffline());
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "error">(
    "synced"
  );

  useEffect(() => {
    const unsubscribe = offlineDetector.subscribe((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = cacheSyncManager.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const loadNotes = useCallback(async () => {
    setState("loading");

    try {
      // Always try local cache first
      const cachedNotes = await getCachedNotes();

      if (cachedNotes.length > 0) {
        setNotes(cachedNotes);
        setState("loaded");
      }

      // If online, fetch from Supabase and update cache
      if (isOnline && supabase) {
        const { data, error } = await supabase
          .from("notes")
          .select("*")
          .eq("user_id", supabase.auth.user()?.id || "");

        if (error) throw error;

        if (data) {
          setNotes(data as Note[]);
          // Update local cache
          for (const note of data) {
            await saveNoteOffline(note);
          }
        }

        setState("loaded");
      } else if (cachedNotes.length === 0) {
        setState("error");
      }
    } catch (error) {
      console.error("[useCachedNotes]", error);
      setState("error");
    }
  }, [supabase, isOnline]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  return {
    notes,
    state,
    isOnline,
    syncStatus,
    refresh: loadNotes,
  };
}

/**
 * Hook: Fetch prices
 */
export function useCachedPrices() {
  const { supabase } = useAuth();
  const [prices, setPrices] = useState<Price[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [isOnline, setIsOnline] = useState(!offlineDetector.isOffline());
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "error">(
    "synced"
  );

  useEffect(() => {
    const unsubscribe = offlineDetector.subscribe((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = cacheSyncManager.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const loadPrices = useCallback(async () => {
    setState("loading");

    try {
      const cachedPrices = await getCachedPrices();

      if (cachedPrices.length > 0) {
        setPrices(cachedPrices);
        setState("loaded");
      }

      if (isOnline && supabase) {
        const { data, error } = await supabase
          .from("product_prices")
          .select("*")
          .eq("user_id", supabase.auth.user()?.id || "");

        if (error) throw error;

        if (data) {
          setPrices(data as Price[]);
          for (const price of data) {
            await savePriceOffline(price);
          }
        }

        setState("loaded");
      } else if (cachedPrices.length === 0) {
        setState("error");
      }
    } catch (error) {
      console.error("[useCachedPrices]", error);
      setState("error");
    }
  }, [supabase, isOnline]);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  return {
    prices,
    state,
    isOnline,
    syncStatus,
    refresh: loadPrices,
  };
}

/**
 * Hook: Fetch images
 */
export function useCachedImages() {
  const { supabase } = useAuth();
  const [images, setImages] = useState<CachedImage[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [isOnline, setIsOnline] = useState(!offlineDetector.isOffline());
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "error">(
    "synced"
  );

  const loadImages = useCallback(async () => {
    setState("loading");

    try {
      const cachedImages = await getCachedImages();

      if (cachedImages.length > 0) {
        setImages(cachedImages);
        setState("loaded");
      }

      if (isOnline && supabase) {
        const { data, error } = await supabase
          .from("images")
          .select("*")
          .eq("user_id", supabase.auth.user()?.id || "");

        if (error) throw error;

        if (data) {
          setImages(data as CachedImage[]);
          for (const image of data) {
            await saveImageOffline(image);
          }
        }

        setState("loaded");
      } else if (cachedImages.length === 0) {
        setState("error");
      }
    } catch (error) {
      console.error("[useCachedImages]", error);
      setState("error");
    }
  }, [supabase, isOnline]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  return {
    images,
    state,
    isOnline,
    syncStatus,
    refresh: loadImages,
  };
}

/**
 * Hook: Sync status indicator
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<"syncing" | "synced" | "error">(
    "synced"
  );
  const [isOnline, setIsOnline] = useState(!offlineDetector.isOffline());

  useEffect(() => {
    const unsubscribe = cacheSyncManager.subscribe((status) => {
      setStatus(status);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = offlineDetector.subscribe((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  return {
    status,
    isOnline,
    isOffline: !isOnline,
  };
}

/**
 * Hook: Save to cache (works offline)
 */
export function useOfflineWrite() {
  return {
    saveNote: saveNoteOffline,
    savePrice: savePriceOffline,
    saveImage: saveImageOffline,
    saveDocument: saveDocumentOffline,
    deleteNote: deleteNoteOffline,
    deletePrice: deletePriceOffline,
  };
}
