-- ==============================================================================
-- CraveBiZ AI - Performance Optimization Migration: Database Indexes
-- ==============================================================================
-- Ensures high-speed index lookups (< 5ms) for all frequently queried columns:
-- company_id, user_id, client_id, status, is_archived, created_at

BEGIN;

-- 1. Invoices Table Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_created ON public.invoices(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_company_receipt ON public.invoices(company_id, is_receipt_sent);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_parent_id ON public.invoices(parent_invoice_id);

-- 2. Invoice Items Table Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- 3. Clients Table Indexes
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_archived ON public.clients(company_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_clients_company_status ON public.clients(company_id, status);

-- 4. Services Table Indexes
CREATE INDEX IF NOT EXISTS idx_services_company_id ON public.services(company_id);

-- 5. Projects Table Indexes
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_status ON public.projects(company_id, status);

-- 6. Company Members Table Indexes
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_company ON public.company_members(user_id, company_id);

-- 7. Companies Table Indexes
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON public.companies(owner_id);

-- 8. Bank Accounts Table Indexes
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON public.bank_accounts(company_id);

-- 9. Audit Logs Table Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- 10. Generated Documents Table Indexes
CREATE INDEX IF NOT EXISTS idx_gen_docs_company_type ON public.generated_documents(company_id, document_type);
CREATE INDEX IF NOT EXISTS idx_gen_docs_document_type ON public.generated_documents(document_type);

-- 11. In-App Notifications Table Indexes
CREATE INDEX IF NOT EXISTS idx_in_app_notif_tenant_recipient ON public.in_app_notifications(tenant_id, recipient_email, is_read);

COMMIT;
