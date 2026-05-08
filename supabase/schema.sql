-- ============================================================
-- MEMORA APP - Complete Supabase Schema
-- Generated from live database on 2026-05-05
-- Matches actual table structure exactly
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- ============================================================
-- 2. CUSTOM ENUM TYPES
-- ============================================================

-- storage_plan: Used in user_storage.plan
CREATE TYPE storage_plan AS ENUM (
  'free',
  'pro',
  'premium'
);

-- message_role: Used in chat_history.role
CREATE TYPE message_role AS ENUM (
  'user',
  'assistant',
  'system'
);

-- message_type: Used in chat_history.type
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

-- profiles: One row per user. Created automatically on signup via trigger.
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_pro      BOOLEAN DEFAULT false,
  updated_at  TIMESTAMP DEFAULT NOW()          -- NOTE: no timezone (matches live DB)
);

-- user_storage: Tracks how many bytes each user has stored.
CREATE TABLE IF NOT EXISTS user_storage (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  plan        storage_plan NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- user_limits: Tracks plan limits (storage cap) per user.
CREATE TABLE IF NOT EXISTS user_limits (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan           TEXT DEFAULT 'free',
  used_storage_mb NUMERIC DEFAULT 0,
  max_storage_mb  NUMERIC DEFAULT 0,           -- NOTE: defaults to 0, update to 100 if desired
  created_at     TIMESTAMP DEFAULT NOW()       -- NOTE: no timezone (matches live DB)
);

-- notes: Main user content — contacts, ideas, reminders, etc.
CREATE TABLE IF NOT EXISTS notes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Untitled Note',
  content          TEXT,
  summary          TEXT,
  tags             TEXT[] DEFAULT '{}',
  is_pinned        BOOLEAN DEFAULT false,
  is_archived      BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  category         TEXT DEFAULT 'note',
  content_hash     TEXT,
  normalized_content TEXT,
  metadata         JSONB,
  fts              TSVECTOR                    -- Full-text search vector (auto-updated via trigger)
);

-- documents: Metadata for uploaded PDFs/docs. Optionally linked to a note.
CREATE TABLE IF NOT EXISTS documents (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id           UUID REFERENCES notes(id) ON DELETE SET NULL,
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  file_size         INTEGER,
  file_type         TEXT,
  extracted_text    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  description       TEXT,
  normalized_content TEXT,
  fts               TSVECTOR
);

-- images: Metadata for uploaded photos. Optionally linked to a note.
CREATE TABLE IF NOT EXISTS images (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id           UUID REFERENCES notes(id) ON DELETE SET NULL,
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  file_size         INTEGER,
  mime_type         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  description       TEXT,
  file_type         TEXT,
  normalized_content TEXT,
  fts               TSVECTOR
);

-- product_prices: User-saved product/price data (NGN default currency).
CREATE TABLE IF NOT EXISTS product_prices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name    TEXT NOT NULL,
  price           NUMERIC NOT NULL,
  currency        TEXT DEFAULT 'NGN',
  category        TEXT,
  description     TEXT,
  normalized_content TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  fts             TSVECTOR
);

-- chat_history: Persistent chat messages per user session.
CREATE TABLE IF NOT EXISTS chat_history (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  role       message_role NOT NULL,
  type       message_type,
  content    TEXT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- chat_context: One row per user. Stores temporary AI state between messages.
CREATE TABLE IF NOT EXISTS chat_context (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message           TEXT,
  last_intent            TEXT,
  last_entities          JSONB DEFAULT '[]',
  pending_delete_matches JSONB,
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  pending_save_duplicate JSONB,

  UNIQUE(user_id)        -- One context row per user
);


-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- All data is private to the owning user.
-- ============================================================

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_storage   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_limits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_context   ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- user_storage
DROP POLICY IF EXISTS "storage_insert" ON user_storage;
DROP POLICY IF EXISTS "storage_select" ON user_storage;
DROP POLICY IF EXISTS "storage_update" ON user_storage;
CREATE POLICY "storage_insert" ON user_storage FOR INSERT WITH CHECK (true);
CREATE POLICY "storage_select" ON user_storage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "storage_update" ON user_storage FOR UPDATE USING (auth.uid() = user_id);

-- user_limits
DROP POLICY IF EXISTS "limits_insert" ON user_limits;
DROP POLICY IF EXISTS "limits_select" ON user_limits;
CREATE POLICY "limits_insert" ON user_limits FOR INSERT WITH CHECK (true);
CREATE POLICY "limits_select" ON user_limits FOR SELECT USING (auth.uid() = user_id);

-- notes
DROP POLICY IF EXISTS "notes_select" ON notes;
DROP POLICY IF EXISTS "notes_insert" ON notes;
DROP POLICY IF EXISTS "notes_update" ON notes;
DROP POLICY IF EXISTS "notes_delete" ON notes;
CREATE POLICY "notes_select" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notes_insert" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_update" ON notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notes_delete" ON notes FOR DELETE USING (auth.uid() = user_id);

-- documents
DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_select" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_update" ON documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "documents_delete" ON documents FOR DELETE USING (auth.uid() = user_id);

-- images
DROP POLICY IF EXISTS "images_select" ON images;
DROP POLICY IF EXISTS "images_insert" ON images;
DROP POLICY IF EXISTS "images_update" ON images;
DROP POLICY IF EXISTS "images_delete" ON images;
CREATE POLICY "images_select" ON images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "images_insert" ON images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "images_update" ON images FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "images_delete" ON images FOR DELETE USING (auth.uid() = user_id);

-- product_prices
DROP POLICY IF EXISTS "prices_select" ON product_prices;
DROP POLICY IF EXISTS "prices_insert" ON product_prices;
DROP POLICY IF EXISTS "prices_update" ON product_prices;
DROP POLICY IF EXISTS "prices_delete" ON product_prices;
CREATE POLICY "prices_select" ON product_prices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prices_insert" ON product_prices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prices_update" ON product_prices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "prices_delete" ON product_prices FOR DELETE USING (auth.uid() = user_id);

-- chat_history
DROP POLICY IF EXISTS "chat_history_select" ON chat_history;
DROP POLICY IF EXISTS "chat_history_insert" ON chat_history;
DROP POLICY IF EXISTS "chat_history_delete" ON chat_history;
CREATE POLICY "chat_history_select" ON chat_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chat_history_insert" ON chat_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_history_delete" ON chat_history FOR DELETE USING (auth.uid() = user_id);

-- chat_context
DROP POLICY IF EXISTS "chat_context_select" ON chat_context;
DROP POLICY IF EXISTS "chat_context_insert" ON chat_context;
DROP POLICY IF EXISTS "chat_context_update" ON chat_context;
CREATE POLICY "chat_context_select" ON chat_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chat_context_insert" ON chat_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_context_update" ON chat_context FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 5. SIGNUP TRIGGER
-- Automatically creates rows in profiles, user_storage, and
-- user_limits when a new user signs up.
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION create_user_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, is_pro, updated_at)
  VALUES (NEW.id, false, NOW())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_storage (user_id, total_bytes, plan, created_at, updated_at)
  VALUES (NEW.id, 0, 'free', NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_limits (user_id, plan, used_storage_mb, max_storage_mb, created_at)
  VALUES (NEW.id, 'free', 0, 100, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_storage();


-- ============================================================
-- 6. TIMESTAMP TRIGGERS
-- Auto-updates updated_at on every row update.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_notes_updated_at       ON notes;
DROP TRIGGER IF EXISTS update_documents_updated_at   ON documents;
DROP TRIGGER IF EXISTS update_images_updated_at      ON images;
DROP TRIGGER IF EXISTS update_user_storage_updated_at ON user_storage;
DROP TRIGGER IF EXISTS update_product_prices_updated_at ON product_prices;

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_images_updated_at
  BEFORE UPDATE ON images FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_storage_updated_at
  BEFORE UPDATE ON user_storage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_prices_updated_at
  BEFORE UPDATE ON product_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 7. STORAGE RPC FUNCTIONS
-- ============================================================

-- Increment storage after file upload
CREATE OR REPLACE FUNCTION increment_storage(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_storage (user_id, total_bytes, updated_at)
  VALUES (p_user_id, p_bytes, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_bytes = user_storage.total_bytes + p_bytes,
    updated_at = NOW();
END;
$$;

-- Decrement storage after file deletion
CREATE OR REPLACE FUNCTION decrement_storage(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE user_storage
  SET
    total_bytes = GREATEST(0, total_bytes - p_bytes),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Get storage info for a user
CREATE OR REPLACE FUNCTION get_storage_info(p_user_id UUID)
RETURNS TABLE (used_bytes BIGINT, limit_bytes BIGINT, plan_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(us.total_bytes, 0),
    CASE us.plan
      WHEN 'free'    THEN (100  * 1024 * 1024)::BIGINT
      WHEN 'pro'     THEN (10   * 1024 * 1024 * 1024)::BIGINT
      WHEN 'premium' THEN (100  * 1024 * 1024 * 1024)::BIGINT
      ELSE                (100  * 1024 * 1024)::BIGINT
    END,
    COALESCE(us.plan::text, 'free')
  FROM user_storage us
  WHERE us.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::BIGINT, (100 * 1024 * 1024)::BIGINT, 'free'::TEXT;
  END IF;
END;
$$;


-- ============================================================
-- 8. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_notes_user_id         ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_created     ON notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_category         ON notes(user_id, category);
CREATE INDEX IF NOT EXISTS idx_notes_content_hash     ON notes(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_notes_fts              ON notes USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_notes_normalized_trgm  ON notes USING gin(normalized_content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_user_id      ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_note_id      ON documents(note_id);
CREATE INDEX IF NOT EXISTS idx_documents_fts          ON documents USING gin(fts);

CREATE INDEX IF NOT EXISTS idx_images_user_id         ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_note_id         ON images(note_id);
CREATE INDEX IF NOT EXISTS idx_images_fts             ON images USING gin(fts);

CREATE INDEX IF NOT EXISTS idx_product_prices_user_id ON product_prices(user_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_fts     ON product_prices USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_product_prices_normalized_trgm ON product_prices USING gin(normalized_content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_chat_user_session      ON chat_history(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_created      ON chat_history(user_id, created_at DESC);


-- ============================================================
-- 9. STORAGE BUCKET POLICIES
-- Run AFTER creating 'documents' and 'images' buckets in dashboard
-- ============================================================

DROP POLICY IF EXISTS "Users can upload to own documents folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own images folder"    ON storage.objects;
DROP POLICY IF EXISTS "Users can view own documents"             ON storage.objects;
DROP POLICY IF EXISTS "Users can view own images"                ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents"           ON storage.objects;
DROP POLICY IF EXISTS "Users can update own images"              ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents"           ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images"              ON storage.objects;

CREATE POLICY "Users can upload to own documents folder"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload to own images folder"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own images"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own documents"
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own images"
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ============================================================
-- END OF SCHEMA
-- ============================================================