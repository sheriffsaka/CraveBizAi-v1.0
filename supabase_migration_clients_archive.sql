-- ==============================================================================
-- CraveBiZ AI - Supabase Migration: Add Archive Columns to Clients Table
-- ==============================================================================

-- 1. Add status column if not exists
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- 2. Add is_archived column if not exists
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add archived_at timestamp column if not exists
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- 4. Add archived_by column if not exists
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS archived_by TEXT NULL;

-- 5. Add deleted_at column if not exists
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 6. Create index on company_id and is_archived for fast filtering
CREATE INDEX IF NOT EXISTS idx_clients_company_archived ON public.clients(company_id, is_archived);
