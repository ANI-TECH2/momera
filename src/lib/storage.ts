import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

interface StorageAPI {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function createMockStorage(): StorageAPI {
  const store: Record<string, string> = {};
  return {
    async getItem(key: string): Promise<string | null> {
      return store[key] ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store[key] = value;
    },
    async removeItem(key: string): Promise<void> {
      delete store[key];
    },
  };
}

function createWebStorage(): StorageAPI {
  if (typeof localStorage === 'undefined') {
    return createMockStorage();
  }
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
    async removeItem(key: string): Promise<void> {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };
}

export function getStorage(): StorageAPI {
  // React Native (including Expo)
  if (Platform.OS !== 'web') {
    return AsyncStorage;
  }
  // Web
  return createWebStorage();
}

