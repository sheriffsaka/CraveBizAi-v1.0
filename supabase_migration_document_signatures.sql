-- ==============================================================================
-- Migration: document_signatures table
--
-- WHY THIS MIGRATION EXISTS
-- --------------------------------------------------------------------------
-- The DocSignify workflow previously stored each signer's placed signature
-- (page number, x/y position, size, and the signature image itself) only in
-- an in-memory JS object (`memoryStore.signatures`) inside services/signifyService.ts.
--
-- Because the app runs on serverless functions (Vercel), that in-memory store
-- is NOT guaranteed to persist between separate requests/invocations. In
-- practice this meant: when Signer A (e.g. the document owner) signed, then
-- Signer B (the invited signer) signed later in a different invocation, the
-- final PDF merge step only had access to Signer B's signature - Signer A's
-- signature was silently dropped from the completed document, even though
-- their "signed" status was correctly saved.
--
-- This table gives every placed signature a durable home in Postgres so the
-- final merge step (and the document editor / signing portal on reload) can
-- always retrieve the full, correct set of signatures for a document,
-- regardless of which serverless instance handled which request.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.document_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    signatory_id UUID NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    x_position NUMERIC NOT NULL,
    y_position NUMERIC NOT NULL,
    width NUMERIC NULL,
    height NUMERIC NULL,
    signature_type TEXT NOT NULL DEFAULT 'draw',
    signature_image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_signatures_document_id ON public.document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signatory_id ON public.document_signatures(signatory_id);

-- One "live" placement per signatory+page - re-signing replaces the row
-- instead of accumulating duplicate overlapping signature images.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_signatures_unique_placement
    ON public.document_signatures(document_id, signatory_id, page_number);

ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on document_signatures" ON public.document_signatures;
CREATE POLICY "Allow all operations on document_signatures" ON public.document_signatures FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.document_signatures TO anon, authenticated, service_role;
