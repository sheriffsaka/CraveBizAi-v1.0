-- Migration: Add Direct Cost and Indirect Cost Columns to Services and Invoice Items
-- Description: Safely adds direct_cost and indirect_cost numeric columns to the services and invoice_items tables.
-- Author: CraveBiZ AI Engineering
-- Date: 2026-08-06
-- Idempotent: Can be executed multiple times safely without loss of data.

BEGIN;

-- 1. Ensure direct_cost column exists on services table with NUMERIC(15, 2) and default 0.00
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'services' 
          AND column_name = 'direct_cost'
    ) THEN
        ALTER TABLE public.services ADD COLUMN direct_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
        COMMENT ON COLUMN public.services.direct_cost IS 'Direct cost associated with producing or supplying the service';
    END IF;
END $$;

-- 2. Ensure indirect_cost column exists on services table with NUMERIC(15, 2) and default 0.00
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'services' 
          AND column_name = 'indirect_cost'
    ) THEN
        ALTER TABLE public.services ADD COLUMN indirect_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
        COMMENT ON COLUMN public.services.indirect_cost IS 'Indirect overhead cost allocated to the service';
    END IF;
END $$;

-- 3. Ensure existing NULL values in services table are backfilled with 0.00
UPDATE public.services 
SET direct_cost = 0.00 
WHERE direct_cost IS NULL;

UPDATE public.services 
SET indirect_cost = 0.00 
WHERE indirect_cost IS NULL;

-- 4. Ensure direct_cost column exists on invoice_items table with NUMERIC(15, 2) and default 0.00
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'invoice_items' 
          AND column_name = 'direct_cost'
    ) THEN
        ALTER TABLE public.invoice_items ADD COLUMN direct_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
        COMMENT ON COLUMN public.invoice_items.direct_cost IS 'Snapshot direct cost per unit for historical financial reporting';
    END IF;
END $$;

-- 5. Ensure indirect_cost column exists on invoice_items table with NUMERIC(15, 2) and default 0.00
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'invoice_items' 
          AND column_name = 'indirect_cost'
    ) THEN
        ALTER TABLE public.invoice_items ADD COLUMN indirect_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
        COMMENT ON COLUMN public.invoice_items.indirect_cost IS 'Snapshot indirect cost per unit for historical financial reporting';
    END IF;
END $$;

-- 6. Backfill NULL values in invoice_items table
UPDATE public.invoice_items 
SET direct_cost = 0.00 
WHERE direct_cost IS NULL;

UPDATE public.invoice_items 
SET indirect_cost = 0.00 
WHERE indirect_cost IS NULL;

COMMIT;
