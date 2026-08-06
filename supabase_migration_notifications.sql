-- Migration: Create Notifications & In-App Notifications Tables in Supabase
-- Description: Creates the missing 'notifications' and 'in_app_notifications' persistent tables with complete RLS, indexes, and triggers.
-- Author: CraveBiZ AI Engineering
-- Date: 2026-08-06
-- Idempotent: Can be executed multiple times safely without data loss.

BEGIN;

-- 1. Helper Function for Updating updated_at Timestamp
CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create public.notifications Table
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

COMMENT ON TABLE public.notifications IS 'Stores in-app user and workspace notifications permanently';
COMMENT ON COLUMN public.notifications.id IS 'Primary key identifier';
COMMENT ON COLUMN public.notifications.user_id IS 'Target user ID or authentication UID';
COMMENT ON COLUMN public.notifications.recipient_email IS 'Target recipient email address';
COMMENT ON COLUMN public.notifications.type IS 'Notification visual type: info, success, warning, error';
COMMENT ON COLUMN public.notifications.entity_type IS 'Target entity category: invoice, project, receipt, service, document, etc.';
COMMENT ON COLUMN public.notifications.entity_id IS 'Associated record ID';
COMMENT ON COLUMN public.notifications.is_read IS 'Read status indicator';

-- 3. Create public.in_app_notifications Table (Alias / Legacy Compatibility Table)
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

-- 4. Create Indexes on notifications Table
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON public.notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Create Indexes on in_app_notifications Table
CREATE INDEX IF NOT EXISTS idx_in_app_notif_user_id ON public.in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_recipient_email ON public.in_app_notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_tenant_id ON public.in_app_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_is_read ON public.in_app_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_created_at ON public.in_app_notifications(created_at DESC);

-- 5. Enable Row Level Security (RLS) & Policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on notifications" ON public.notifications;
CREATE POLICY "Allow all operations on notifications" ON public.notifications 
    FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.notifications TO anon, authenticated, service_role;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on in_app_notifications" ON public.in_app_notifications;
CREATE POLICY "Allow all operations on in_app_notifications" ON public.in_app_notifications 
    FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.in_app_notifications TO anon, authenticated, service_role;

-- 6. Set up updated_at Auto-Update Triggers
DROP TRIGGER IF EXISTS trigger_update_notifications_updated_at ON public.notifications;
CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notifications_updated_at();

DROP TRIGGER IF EXISTS trigger_update_in_app_notifications_updated_at ON public.in_app_notifications;
CREATE TRIGGER trigger_update_in_app_notifications_updated_at
    BEFORE UPDATE ON public.in_app_notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notifications_updated_at();

COMMIT;
