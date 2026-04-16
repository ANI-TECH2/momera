-- ============================================================
-- NoteGenerator App - Complete Supabase Schema
-- All data is private to user_id with Row Level Security (RLS)
-- ============================================================

-- ============================================================
-- 1. ENABLE EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================================
-- 2. CUSTOM ENUM TYPES
-- ============================================================

-- Note categories for organizing saved content
CREATE TYPE note_category AS ENUM (
  'contact',
  'idea', 
  'reminder',
  'receipt',
  'note',
  'other'
);

-- File types for uploaded documents
CREATE TYPE file_type AS ENUM (
  'pdf',
  'image',
  'doc',
  'other'
);

-- Storage plan tiers
CREATE TYPE storage_plan AS ENUM (
  'free',
  'pro',
  'premium'
);

-- Message roles for chat history
CREATE TYPE message_role AS ENUM (
  'user',
  'assistant',
  'system'
);

-- Message types for chat classification
CREATE TYPE message_type AS ENUM (
  'text',
  'system',
  'assistant',
  'save_confirm',
  'retrieve_result',
  'file_card',
  'not_found'
);

-- ============================================================
-- 3. CORE TABLES
-- ============================================================

-- Notes table: Stores text-based notes, contacts, ideas, reminders
CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category note_category NOT NULL DEFAULT 'note',
  content_hash TEXT NOT NULL, -- For duplicate detection
  normalized_content TEXT, -- Lowercase, trimmed for search
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique content per user (prevent duplicates)
  UNIQUE(user_id, content_hash)
);

-- Documents table: Stores metadata for uploaded PDFs, docs, etc.
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Storage bucket path: user_id/filename
  description TEXT NOT NULL,
  file_type file_type NOT NULL DEFAULT 'other',
  file_size BIGINT, -- Size in bytes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Images table: Stores metadata for uploaded photos/pictures
CREATE TABLE IF NOT EXISTS images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Storage bucket path: user_id/filename
  description TEXT NOT NULL,
  file_size BIGINT, -- Size in bytes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User storage tracking: Tracks per-user storage usage
CREATE TABLE IF NOT EXISTS user_storage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  plan storage_plan NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat history table: Optional persistent chat storage
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT, -- For grouping conversations
  role message_role NOT NULL,
  type message_type,
  content TEXT NOT NULL,
  metadata JSONB, -- Flexible storage for file cards, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat context table: Stores temporary state for pending confirmations
CREATE TABLE IF NOT EXISTS chat_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message TEXT, -- Last user message for context
  last_intent TEXT, -- Last detected intent
  last_entities JSONB, -- Extracted entities from last message
  pending_delete_matches JSONB, -- Pending delete matches waiting for user confirmation
  pending_save_duplicate JSONB, -- Pending save duplicate waiting for user confirmation
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS) - MAKES ALL DATA PRIVATE TO USER
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_context ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners (bypass only with SECURITY DEFINER)
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE images FORCE ROW LEVEL SECURITY;
ALTER TABLE user_storage FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_history FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_context FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------
-- RLS POLICIES FOR notes TABLE
-- -----------------------------------------------------------

-- Users can only view their own notes
CREATE POLICY "Users can view own notes" 
  ON notes FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert notes for themselves
CREATE POLICY "Users can insert own notes" 
  ON notes FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own notes
CREATE POLICY "Users can update own notes" 
  ON notes FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can only delete their own notes
CREATE POLICY "Users can delete own notes" 
  ON notes FOR DELETE 
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- RLS POLICIES FOR documents TABLE
-- -----------------------------------------------------------

-- Users can only view their own documents
CREATE POLICY "Users can view own documents" 
  ON documents FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert documents for themselves
CREATE POLICY "Users can insert own documents" 
  ON documents FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own documents
CREATE POLICY "Users can update own documents" 
  ON documents FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can only delete their own documents
CREATE POLICY "Users can delete own documents" 
  ON documents FOR DELETE 
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- RLS POLICIES FOR images TABLE
-- -----------------------------------------------------------

-- Users can only view their own images
CREATE POLICY "Users can view own images" 
  ON images FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert images for themselves
CREATE POLICY "Users can insert own images" 
  ON images FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own images
CREATE POLICY "Users can update own images" 
  ON images FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can only delete their own images
CREATE POLICY "Users can delete own images" 
  ON images FOR DELETE 
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- RLS POLICIES FOR user_storage TABLE
-- -----------------------------------------------------------

-- Users can only view their own storage info
CREATE POLICY "Users can view own storage" 
  ON user_storage FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert storage for themselves
CREATE POLICY "Users can insert own storage" 
  ON user_storage FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own storage
CREATE POLICY "Users can update own storage" 
  ON user_storage FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can only delete their own storage
CREATE POLICY "Users can delete own storage" 
  ON user_storage FOR DELETE 
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- RLS POLICIES FOR chat_history TABLE
-- -----------------------------------------------------------

-- Users can only view their own chat history
CREATE POLICY "Users can view own chat history" 
  ON chat_history FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert chat messages for themselves
CREATE POLICY "Users can insert own chat" 
  ON chat_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own chat messages
CREATE POLICY "Users can update own chat" 
  ON chat_history FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can only delete their own chat messages
CREATE POLICY "Users can delete own chat" 
  ON chat_history FOR DELETE 
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- RLS POLICIES FOR chat_context TABLE
-- -----------------------------------------------------------

-- Users can only view their own chat context
CREATE POLICY "Users can view own chat context" 
  ON chat_context FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert chat context for themselves
CREATE POLICY "Users can insert own chat context" 
  ON chat_context FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own chat context
CREATE POLICY "Users can update own chat context" 
  ON chat_context FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can only delete their own chat context
CREATE POLICY "Users can delete own chat context" 
  ON chat_context FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. STORAGE BUCKET POLICIES (For documents and images buckets)
-- ============================================================

-- Note: Run these after creating buckets in Supabase Dashboard
-- or use supabase.storage.createBucket() in your app

-- Policy: Users can only upload to their own folder
CREATE POLICY "Users can upload to own documents folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload to own images folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can only view their own files
CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can only update their own files
CREATE POLICY "Users can update own documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users can only delete their own files
CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 6. RPC FUNCTIONS (For storage tracking)
-- ============================================================

-- Function: Increment user storage usage
-- Called after successful file upload
CREATE OR REPLACE FUNCTION increment_storage(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS to update any user's storage
AS $$
BEGIN
  INSERT INTO user_storage (user_id, total_bytes, updated_at)
  VALUES (p_user_id, p_bytes, NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    total_bytes = user_storage.total_bytes + p_bytes,
    updated_at = NOW();
END;
$$;

-- Function: Decrement user storage usage
-- Called after file deletion
CREATE OR REPLACE FUNCTION decrement_storage(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS to update any user's storage
AS $$
BEGIN
  UPDATE user_storage 
  SET 
    total_bytes = GREATEST(0, total_bytes - p_bytes),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Function: Get user storage info with limit
-- Returns used bytes, limit based on plan, and plan name
CREATE OR REPLACE FUNCTION get_storage_info(p_user_id UUID)
RETURNS TABLE (
  used_bytes BIGINT,
  limit_bytes BIGINT,
  plan_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(us.total_bytes, 0) as used_bytes,
    CASE us.plan
      WHEN 'free' THEN 100 * 1024 * 1024      -- 100MB
      WHEN 'pro' THEN 10 * 1024 * 1024 * 1024 -- 10GB
      WHEN 'premium' THEN 100 * 1024 * 1024 * 1024 -- 100GB
      ELSE 100 * 1024 * 1024 -- Default 100MB
    END as limit_bytes,
    COALESCE(us.plan::text, 'free') as plan_name
  FROM user_storage us
  WHERE us.user_id = p_user_id;
  
  -- Return default if user has no storage record
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      0::BIGINT as used_bytes,
      (100 * 1024 * 1024)::BIGINT as limit_bytes,
      'free'::TEXT as plan_name;
  END IF;
END;
$$;

-- ============================================================
-- 7. INDEXES (For performance)
-- ============================================================

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_category ON notes(user_id, category);
CREATE INDEX IF NOT EXISTS idx_notes_content_hash ON notes(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_notes_normalized_trgm ON notes USING gin (normalized_content gin_trgm_ops);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_description_trgm ON documents USING gin (description gin_trgm_ops);

-- Images indexes
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_user_created ON images(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_description_trgm ON images USING gin (description gin_trgm_ops);

-- Chat history indexes
CREATE INDEX IF NOT EXISTS idx_chat_user_session ON chat_history(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_created ON chat_history(user_id, created_at DESC);

-- ============================================================
-- 8. TRIGGERS (Auto-update timestamps)
-- ============================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_images_updated_at
  BEFORE UPDATE ON images
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_storage_updated_at
  BEFORE UPDATE ON user_storage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. SAMPLE QUERIES (For reference)
-- ============================================================

/*
-- Search notes by content (case-insensitive)
SELECT * FROM notes 
WHERE user_id = auth.uid() 
  AND normalized_content ILIKE '%keyword%'
ORDER BY created_at DESC 
LIMIT 5;

-- Search documents by description
SELECT * FROM documents 
WHERE user_id = auth.uid() 
  AND description ILIKE '%keyword%'
ORDER BY created_at DESC 
LIMIT 5;

-- Get storage usage
SELECT * FROM get_storage_info(auth.uid());

-- Check for duplicate content
SELECT * FROM notes 
WHERE user_id = auth.uid() 
  AND content_hash = 'hash_here';

-- Get recent chat history
SELECT * FROM chat_history 
WHERE user_id = auth.uid() 
ORDER BY created_at DESC 
LIMIT 50;
*/

-- ============================================================
-- END OF SCHEMA
-- ============================================================
