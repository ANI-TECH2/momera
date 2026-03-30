export type MessageRole = "user" | "assistant" | "system";

export type MessageType =
  | "text"
  | "system"
  | "assistant"
  | "save_confirm"
  | "retrieve_result"
  | "file_card"
  | "not_found";

export type NoteCategory =
  | "contact"
  | "idea"
  | "reminder"
  | "receipt"
  | "note"
  | "other";

export type FileType = "pdf" | "image" | "doc" | "other";

export interface UserMetadata {
  full_name?: string;
  avatar_url?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  message: string;
  fileCard?: FileCard;
  createdAt: string;
}

export interface FileCard {
  id: string;
  fileName: string;
  description: string;
  fileType: FileType;
  filePath: string;
  signedUrl?: string;
  createdAt: string;
}

export interface Note {
  id: string;
  userId: string;
  content: string;
  title: string;
  category: NoteCategory;
  createdAt: string;
}

export interface Document {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  description: string;
  fileType: FileType;
  createdAt: string;
}

export interface StorageImage {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  description: string;
  createdAt: string;
}

export interface ApiResponse {
  type: MessageType;
  message: string;
  fileCard?: FileCard;
  error?: string;
}

export interface IntentResult {
  intent: string;
  score: number;
}

export interface UserStorageInfo {
  used: number;
  limit: number;
  plan: "free" | "pro" | "premium";
}

