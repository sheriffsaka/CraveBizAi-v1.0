-- ==============================================================================
-- CraveBiZ AI - Recurring Invoices & Billing Period Migration
-- ==============================================================================
-- Adds:
-- 1. period_start and period_end (DATE) on invoices to record the specific billing coverage
-- 2. generation_status (TEXT) on recurring schedules: 'pending', 'draft_ready', 'sent'
-- 3. draft_invoice_id (TEXT/UUID) pointing to auto-generated draft awaiting review

BEGIN;

-- Add billing period columns to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;

-- Add recurring generation tracking columns to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS draft_invoice_id TEXT;

-- Create indexes for efficient querying and schedule status checks
CREATE INDEX IF NOT EXISTS idx_invoices_period 
  ON public.invoices(company_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_invoices_draft_invoice_id 
  ON public.invoices(draft_invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoices_generation_status 
  ON public.invoices(company_id, generation_status);

COMMIT;
