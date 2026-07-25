-- ==============================================================================
-- CraveBiZ AI - Supabase Database Schema Initializer
-- Table: user_ai_credits & ai_credit_logs
-- ==============================================================================

-- 1. Create user_ai_credits table for tracking user/tenant AI credit balances
CREATE TABLE IF NOT EXISTS public.user_ai_credits (
    user_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    total_credits INTEGER NOT NULL DEFAULT 5,
    remaining_credits INTEGER NOT NULL DEFAULT 5,
    credits_used INTEGER NOT NULL DEFAULT 0,
    last_reset_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subscription_plan TEXT NOT NULL DEFAULT 'Free',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast tenant lookup
CREATE INDEX IF NOT EXISTS idx_user_ai_credits_tenant_id ON public.user_ai_credits(tenant_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_ai_credits ENABLE ROW LEVEL SECURITY;

-- Create full-access RLS policies for anonymous and authenticated access
DROP POLICY IF EXISTS "Allow anon all operations on user_ai_credits" ON public.user_ai_credits;
CREATE POLICY "Allow anon all operations on user_ai_credits" 
ON public.user_ai_credits 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 2. Create ai_credit_logs table for audit & usage history
CREATE TABLE IF NOT EXISTS public.ai_credit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    task_performed TEXT NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 1,
    tokens_used INTEGER DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user & company lookup
CREATE INDEX IF NOT EXISTS idx_ai_credit_logs_company_user ON public.ai_credit_logs(company_id, user_id);

-- Enable RLS for ai_credit_logs
ALTER TABLE public.ai_credit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all operations on ai_credit_logs" ON public.ai_credit_logs;
CREATE POLICY "Allow anon all operations on ai_credit_logs" 
ON public.ai_credit_logs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 3. Grant table permissions to anon and authenticated roles
GRANT ALL ON public.user_ai_credits TO anon, authenticated, service_role;
GRANT ALL ON public.ai_credit_logs TO anon, authenticated, service_role;

-- 4. Ensure services table has package_name column
ALTER TABLE IF EXISTS public.services ADD COLUMN IF NOT EXISTS package_name TEXT;
