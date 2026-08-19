-- ==============================================================================
-- Migration: Fix UUID type constraints for DocSignify (document_signatures, documents, document_signers, signed_documents)
--
-- WHY THIS MIGRATION EXISTS
-- --------------------------------------------------------------------------
-- DocSignify supports string-based document identifiers (e.g. "doc_837465",
-- "doc-1740000000", custom slugs, or UUIDs).
-- If document_id or signatory_id is typed strictly as Postgres UUID, inserting
-- or re-signing documents with custom string IDs throws:
-- "invalid input syntax for type uuid: 'doc_837465'" (error code 22P02).
--
-- This script alters existing columns to TEXT (or creates the tables with TEXT
-- IDs if they do not already exist), enabling seamless compatibility with all ID formats.
-- ==============================================================================

-- 1. Table: document_signatures
CREATE TABLE IF NOT EXISTS public.document_signatures (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    document_id TEXT NOT NULL,
    signatory_id TEXT NOT NULL,
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

-- If document_signatures was previously created with UUID columns, convert them to TEXT:
DO $$
BEGIN
    ALTER TABLE public.document_signatures ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE public.document_signatures ALTER COLUMN document_id TYPE TEXT USING document_id::text;
    ALTER TABLE public.document_signatures ALTER COLUMN signatory_id TYPE TEXT USING signatory_id::text;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_signatures_document_id ON public.document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signatory_id ON public.document_signatures(signatory_id);

-- One placement per signatory+page - re-signing replaces the row cleanly
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_signatures_unique_placement
    ON public.document_signatures(document_id, signatory_id, page_number);

ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on document_signatures" ON public.document_signatures;
CREATE POLICY "Allow all operations on document_signatures" ON public.document_signatures FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.document_signatures TO anon, authenticated, service_role;


-- 2. Table: signed_documents
CREATE TABLE IF NOT EXISTS public.signed_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NULL,
    company_id TEXT NULL,
    document_name TEXT NOT NULL DEFAULT 'Document.pdf',
    document_type TEXT NOT NULL DEFAULT 'Agreement',
    original_file_url TEXT NULL,
    signed_file_url TEXT NULL,
    storage_path TEXT NULL,
    signature_data JSONB DEFAULT '[]'::jsonb,
    signatories JSONB DEFAULT '[]'::jsonb,
    content_json JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    ALTER TABLE public.signed_documents ALTER COLUMN id TYPE TEXT USING id::text;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_signed_documents_user_id ON public.signed_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_company_id ON public.signed_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_status ON public.signed_documents(status);

ALTER TABLE public.signed_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on signed_documents" ON public.signed_documents;
CREATE POLICY "Allow all operations on signed_documents" ON public.signed_documents FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.signed_documents TO anon, authenticated, service_role;


-- 3. Table: documents
CREATE TABLE IF NOT EXISTS public.documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id TEXT NULL,
    creator_id TEXT NULL,
    file_name TEXT NOT NULL DEFAULT 'Document.pdf',
    document_type TEXT NOT NULL DEFAULT 'Agreement',
    status TEXT NOT NULL DEFAULT 'pending',
    storage_path TEXT NULL,
    file_size NUMERIC NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    ALTER TABLE public.documents ALTER COLUMN id TYPE TEXT USING id::text;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_company_id ON public.documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_creator_id ON public.documents(creator_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on documents" ON public.documents;
CREATE POLICY "Allow all operations on documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.documents TO anon, authenticated, service_role;


-- 4. Table: document_signers
CREATE TABLE IF NOT EXISTS public.document_signers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    document_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'main_signatory',
    status TEXT NOT NULL DEFAULT 'pending',
    signed_at TIMESTAMPTZ NULL,
    signature_value TEXT NULL,
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    ALTER TABLE public.document_signers ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE public.document_signers ALTER COLUMN document_id TYPE TEXT USING document_id::text;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_signers_document_id ON public.document_signers(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_email ON public.document_signers(email);
CREATE INDEX IF NOT EXISTS idx_document_signers_status ON public.document_signers(status);

ALTER TABLE public.document_signers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on document_signers" ON public.document_signers;
CREATE POLICY "Allow all operations on document_signers" ON public.document_signers FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.document_signers TO anon, authenticated, service_role;
