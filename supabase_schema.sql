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

-- ==============================================================================
-- 5. Create user_invoice_usage table for tracking invoice quota per user/workspace
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_invoice_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    total_quota INTEGER NOT NULL DEFAULT 10,
    remaining_count INTEGER NOT NULL DEFAULT 10,
    created_count INTEGER NOT NULL DEFAULT 0,
    reset_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_invoice_usage_user_company_unique UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_invoice_usage_user_company ON public.user_invoice_usage(user_id, company_id);

ALTER TABLE public.user_invoice_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all operations on user_invoice_usage" ON public.user_invoice_usage;
CREATE POLICY "Allow anon all operations on user_invoice_usage" 
ON public.user_invoice_usage FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.user_invoice_usage TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. Create user_receipt_usage table for tracking receipt quota per user/workspace
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_receipt_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    total_quota INTEGER NOT NULL DEFAULT 10,
    remaining_count INTEGER NOT NULL DEFAULT 10,
    created_count INTEGER NOT NULL DEFAULT 0,
    reset_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_receipt_usage_user_company_unique UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_receipt_usage_user_company ON public.user_receipt_usage(user_id, company_id);

ALTER TABLE public.user_receipt_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all operations on user_receipt_usage" ON public.user_receipt_usage;
CREATE POLICY "Allow anon all operations on user_receipt_usage" 
ON public.user_receipt_usage FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.user_receipt_usage TO anon, authenticated, service_role;

-- ==============================================================================
-- 7. Database RPC Functions for Invoice & Receipt Quota Checking & Deduction
-- ==============================================================================

-- Function to check invoice quota
CREATE OR REPLACE FUNCTION public.check_invoice_quota(
    p_user_id TEXT,
    p_company_id TEXT,
    p_default_quota INT DEFAULT 10
)
RETURNS TABLE (
    total_quota INT,
    remaining_count INT,
    created_count INT,
    reset_date TIMESTAMPTZ,
    has_quota BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec public.user_invoice_usage%ROWTYPE;
BEGIN
    SELECT * INTO v_rec 
    FROM public.user_invoice_usage 
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.user_invoice_usage (user_id, company_id, total_quota, remaining_count, created_count, reset_date)
        VALUES (p_user_id, p_company_id, p_default_quota, p_default_quota, 0, NOW() + INTERVAL '1 month')
        RETURNING * INTO v_rec;
    ELSIF v_rec.reset_date <= NOW() THEN
        -- Auto reset monthly quota
        UPDATE public.user_invoice_usage
        SET created_count = 0,
            remaining_count = v_rec.total_quota,
            reset_date = NOW() + INTERVAL '1 month',
            updated_at = NOW()
        WHERE id = v_rec.id
        RETURNING * INTO v_rec;
    END IF;

    RETURN QUERY SELECT 
        v_rec.total_quota,
        v_rec.remaining_count,
        v_rec.created_count,
        v_rec.reset_date,
        (v_rec.remaining_count > 0) AS has_quota;
END;
$$;

-- Function to deduct invoice quota
CREATE OR REPLACE FUNCTION public.deduct_invoice_quota(
    p_user_id TEXT,
    p_company_id TEXT,
    p_default_quota INT DEFAULT 10
)
RETURNS TABLE (
    total_quota INT,
    remaining_count INT,
    created_count INT,
    reset_date TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec public.user_invoice_usage%ROWTYPE;
BEGIN
    SELECT * INTO v_rec 
    FROM public.user_invoice_usage 
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.user_invoice_usage (user_id, company_id, total_quota, remaining_count, created_count, reset_date)
        VALUES (p_user_id, p_company_id, p_default_quota, p_default_quota, 0, NOW() + INTERVAL '1 month')
        RETURNING * INTO v_rec;
    ELSIF v_rec.reset_date <= NOW() THEN
        v_rec.created_count := 0;
        v_rec.remaining_count := v_rec.total_quota;
        v_rec.reset_date := NOW() + INTERVAL '1 month';
    END IF;

    IF v_rec.remaining_count <= 0 THEN
        RAISE EXCEPTION 'Invoice creation quota exhausted (% created of % total)', v_rec.created_count, v_rec.total_quota;
    END IF;

    UPDATE public.user_invoice_usage
    SET created_count = v_rec.created_count + 1,
        remaining_count = GREATEST(0, v_rec.total_quota - (v_rec.created_count + 1)),
        reset_date = v_rec.reset_date,
        updated_at = NOW()
    WHERE id = v_rec.id
    RETURNING * INTO v_rec;

    RETURN QUERY SELECT 
        v_rec.total_quota,
        v_rec.remaining_count,
        v_rec.created_count,
        v_rec.reset_date;
END;
$$;

-- Function to check receipt quota
CREATE OR REPLACE FUNCTION public.check_receipt_quota(
    p_user_id TEXT,
    p_company_id TEXT,
    p_default_quota INT DEFAULT 10
)
RETURNS TABLE (
    total_quota INT,
    remaining_count INT,
    created_count INT,
    reset_date TIMESTAMPTZ,
    has_quota BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec public.user_receipt_usage%ROWTYPE;
BEGIN
    SELECT * INTO v_rec 
    FROM public.user_receipt_usage 
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.user_receipt_usage (user_id, company_id, total_quota, remaining_count, created_count, reset_date)
        VALUES (p_user_id, p_company_id, p_default_quota, p_default_quota, 0, NOW() + INTERVAL '1 month')
        RETURNING * INTO v_rec;
    ELSIF v_rec.reset_date <= NOW() THEN
        UPDATE public.user_receipt_usage
        SET created_count = 0,
            remaining_count = v_rec.total_quota,
            reset_date = NOW() + INTERVAL '1 month',
            updated_at = NOW()
        WHERE id = v_rec.id
        RETURNING * INTO v_rec;
    END IF;

    RETURN QUERY SELECT 
        v_rec.total_quota,
        v_rec.remaining_count,
        v_rec.created_count,
        v_rec.reset_date,
        (v_rec.remaining_count > 0) AS has_quota;
END;
$$;

-- Function to deduct receipt quota
CREATE OR REPLACE FUNCTION public.deduct_receipt_quota(
    p_user_id TEXT,
    p_company_id TEXT,
    p_default_quota INT DEFAULT 10
)
RETURNS TABLE (
    total_quota INT,
    remaining_count INT,
    created_count INT,
    reset_date TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec public.user_receipt_usage%ROWTYPE;
BEGIN
    SELECT * INTO v_rec 
    FROM public.user_receipt_usage 
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.user_receipt_usage (user_id, company_id, total_quota, remaining_count, created_count, reset_date)
        VALUES (p_user_id, p_company_id, p_default_quota, p_default_quota, 0, NOW() + INTERVAL '1 month')
        RETURNING * INTO v_rec;
    ELSIF v_rec.reset_date <= NOW() THEN
        v_rec.created_count := 0;
        v_rec.remaining_count := v_rec.total_quota;
        v_rec.reset_date := NOW() + INTERVAL '1 month';
    END IF;

    IF v_rec.remaining_count <= 0 THEN
        RAISE EXCEPTION 'Receipt creation quota exhausted (% created of % total)', v_rec.created_count, v_rec.total_quota;
    END IF;

    UPDATE public.user_receipt_usage
    SET created_count = v_rec.created_count + 1,
        remaining_count = GREATEST(0, v_rec.total_quota - (v_rec.created_count + 1)),
        reset_date = v_rec.reset_date,
        updated_at = NOW()
    WHERE id = v_rec.id
    RETURNING * INTO v_rec;

    RETURN QUERY SELECT 
        v_rec.total_quota,
        v_rec.remaining_count,
        v_rec.created_count,
        v_rec.reset_date;
END;
$$;

-- ==============================================================================
-- 8. Create ai_usage & ai_usage_logs tables for AI feature audit tracking
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    feature_used TEXT NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 1,
    tokens_used INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Success',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_company_user ON public.ai_usage(company_id, user_id);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all operations on ai_usage" ON public.ai_usage;
CREATE POLICY "Allow anon all operations on ai_usage" ON public.ai_usage FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.ai_usage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    task_performed TEXT NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 1,
    tokens_used INTEGER DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_company_user ON public.ai_usage_logs(company_id, user_id);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all operations on ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "Allow anon all operations on ai_usage_logs" ON public.ai_usage_logs FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.ai_usage_logs TO anon, authenticated, service_role;

-- Ensure direct_cost and indirect_cost columns exist in services and invoice_items tables
ALTER TABLE IF EXISTS public.services ADD COLUMN IF NOT EXISTS direct_cost NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE IF EXISTS public.services ADD COLUMN IF NOT EXISTS indirect_cost NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE IF EXISTS public.invoice_items ADD COLUMN IF NOT EXISTS direct_cost NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE IF EXISTS public.invoice_items ADD COLUMN IF NOT EXISTS indirect_cost NUMERIC(15, 2) DEFAULT 0.00;

-- Ensure notifications & in_app_notifications tables exist
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NULL,
    recipient_email TEXT NULL,
    recipient_user_id TEXT NULL,
    tenant_id TEXT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    notification_type TEXT DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'system',
    entity_type TEXT NULL,
    entity_id TEXT NULL,
    related_entity_id TEXT NULL,
    action_url TEXT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NULL,
    recipient_email TEXT NULL,
    recipient_user_id TEXT NULL,
    tenant_id TEXT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    notification_type TEXT DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'system',
    entity_type TEXT NULL,
    entity_id TEXT NULL,
    related_entity_id TEXT NULL,
    action_url TEXT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON public.notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notif_user_id ON public.in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_recipient_email ON public.in_app_notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_tenant_id ON public.in_app_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_is_read ON public.in_app_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_created_at ON public.in_app_notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on notifications" ON public.notifications;
CREATE POLICY "Allow all operations on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.notifications TO anon, authenticated, service_role;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on in_app_notifications" ON public.in_app_notifications;
CREATE POLICY "Allow all operations on in_app_notifications" ON public.in_app_notifications FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.in_app_notifications TO anon, authenticated, service_role;


