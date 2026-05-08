# Local Storage + Supabase Sync Architecture

## Overview

This system provides **offline-first data handling** with automatic sync to Supabase when online. It's built to work seamlessly on web, iOS, and Android without causing issues.

## Key Components

### 1. **Cache Layer** (`src/lib/cache.ts`)
- Stores notes, prices, images, and documents locally
- Tracks sync status for each item
- Manages operation history (create/update/delete)
- Cross-platform: AsyncStorage on mobile, localStorage on web

### 2. **Sync Manager** (`src/lib/cacheSync.ts`)
- Auto-syncs every 30 seconds when online
- Maintains a sync queue for offline operations
- Handles push to Supabase and pull of updates
- Provides status notifications (syncing/synced/error)

### 3. **React Hooks** (`src/lib/useCached.ts`)
- `useCachedNotes()` - Fetch notes with offline support
- `useCachedPrices()` - Fetch prices with offline support
- `useCachedImages()` - Fetch images with offline support
- `useSyncStatus()` - Monitor sync/offline status
- `useOfflineWrite()` - Write to local cache (queues for sync)

### 4. **UI Components** (`src/components/SyncStatus.tsx`)
- `SyncStatusIndicator` - Visual indicator of sync status
- Shows: "Data synced", "Syncing...", "Offline", "Sync failed"

## Data Flow

### Save Operation (Online)
```
User saves note
→ Saves to local cache
→ Queues for sync
→ Auto-syncs to Supabase
→ Marks as synced
→ Shows "Data synced"
```

### Save Operation (Offline)
```
User saves note
→ Saves to local cache
→ Queues for sync
→ Shows "Offline - changes will sync later"
→ [When online]
→ Auto-syncs to Supabase
→ Shows "Data synced"
```

### Load Operation (Online)
```
App loads
→ Loads from local cache (fast)
→ Fetches fresh data from Supabase
→ Updates local cache
→ Shows merged data
```

### Load Operation (Offline)
```
App loads
→ Loads from local cache
→ Shows cached data
→ No Supabase fetch
→ Ready to edit (edits queue for later)
```

## Integration Steps

### 1. Initialize in Root Layout

```typescript
// src/app/_layout.tsx
import { useInitializeSync } from "@/components/SyncStatus";

export function RootLayoutNav() {
  useInitializeSync(); // Starts sync manager
  // ... rest of layout
}
```

### 2. Add Sync Status Indicator

```typescript
// In your root layout or header
<SyncStatusIndicator />
```

### 3. Use Hooks in Components

```typescript
import { useCachedNotes, useSyncStatus } from "@/lib/useCached";

export function ChatScreen() {
  const { notes, state, isOnline, syncStatus, refresh } = useCachedNotes();
  const { status, isOffline } = useSyncStatus();

  if (state === "loading") return <ActivityIndicator />;
  if (state === "error" && !isOffline) return <ErrorUI />;

  return (
    <View>
      {isOffline && <Text>You're offline - using cached data</Text>}
      {syncStatus === "syncing" && <Text>Syncing changes...</Text>}
      
      <FlatList
        data={notes}
        renderItem={({ item }) => <NoteItem note={item} />}
      />
    </View>
  );
}
```

### 4. Save Data Offline

```typescript
import { useOfflineWrite } from "@/lib/useCached";

export function SaveNoteButton() {
  const { saveNote } = useOfflineWrite();

  const handleSave = async () => {
    const note: Note = {
      id: generateId(),
      user_id: userId,
      title: "My Note",
      content: "Content",
      category: "note",
      is_pinned: false,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Saves locally and queues for sync
    await saveNote(note);
  };

  return <Button onPress={handleSave} />;
}
```

## Cached Data Types

```typescript
// Notes
type Note = {
  id: string;
  user_id: string;
  title: string;
  content?: string;
  tags?: string[];
  is_pinned: boolean;
  category: string;
  created_at: string;
  updated_at: string;
};

// Prices
type Price = {
  id: string;
  user_id: string;
  product_name: string;
  price: number;
  currency: string;
  category?: string;
  created_at: string;
  updated_at: string;
};

// Images
type CachedImage = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
  updated_at: string;
};

// Documents
type CachedDocument = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  created_at: string;
  updated_at: string;
};
```

## Web-Specific Handling

The system automatically detects and handles web limitations:

1. **Storage**: Uses `localStorage` instead of AsyncStorage on web
2. **Sync**: Works with standard `fetch` and `supabase-js`
3. **Offline Detection**: Listens to `window.online`/`window.offline` events
4. **Quota**: Limits cache to 500 items per type to avoid quota issues

## Performance Considerations

- **Cache Size**: Default 500 items per type (configurable)
- **Sync Interval**: 30 seconds (configurable)
- **Auto-Cleanup**: Old items removed when limit exceeded
- **Lazy Load**: Only syncs when online
- **Memory**: Uses AsyncStorage (platform-native, very efficient)

## Conflict Resolution

When the same item is edited both locally and remotely:
- **Local wins** during offline edits
- **Remote wins** on next sync (can be customized)
- Sync queue tracks operation order

## Debugging

Check sync status and cache:

```typescript
import { cacheSyncManager } from "@/lib/cacheSync";
import { notesCache, syncQueue } from "@/lib/cache";

// Get sync status
const status = await cacheSyncManager.getSyncStatus();
console.log("Sync status:", status);

// Get notes cache stats
const stats = await notesCache.getStats();
console.log("Cache stats:", stats);

// Get sync queue
const queue = await syncQueue.getQueue();
console.log("Pending syncs:", queue);

// Get unsynced items
const unsynced = await notesCache.getUnsynced();
console.log("Unsynced notes:", unsynced);
```

## Troubleshooting

**Issue**: Web app shows stale data
- **Solution**: Call `refresh()` from `useCachedNotes()` to force update

**Issue**: Offline changes not syncing
- **Solution**: Check sync queue with `await syncQueue.getQueue()`

**Issue**: Cache too large
- **Solution**: Reduce `maxItems` in `CacheManager` constructor or clear old items

**Issue**: Sync errors on web
- **Solution**: Check browser console for CORS/network errors

## Future Enhancements

- [ ] Selective sync (sync only recent items)
- [ ] Compression for large caches
- [ ] Background sync with Service Workers
- [ ] Conflict resolution UI
- [ ] Data expiration policies
- [ ] Encryption for sensitive data
