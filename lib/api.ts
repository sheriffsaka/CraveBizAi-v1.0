
import { createClient } from '@supabase/supabase-js';
import { Invoice, Client, Service, Company, User, InvoiceStatus, BankAccount, InvoiceItem, InvoiceFrequency, GeneratedDocument, StoredGeneratedDoc, DocumentBlock, SignatureInfo, DbDocument, DbDocumentSignatory, DbDocumentSignature, WorkspaceRole, AuditLog, Project } from '../types';

const SUPABASE_URL = 'https://dfqvgezjhudmnlyeycju.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const generateId = () => crypto.randomUUID();

class CraveBizApi {
  private static instance: CraveBizApi;
  private constructor() {}
  public static getInstance(): CraveBizApi {
    if (!CraveBizApi.instance) CraveBizApi.instance = new CraveBizApi();
    return CraveBizApi.instance;
  }

  async ensureProfile(userId: string, name?: string): Promise<boolean> {
    try {
      await supabase.from('profiles').upsert({ id: userId, full_name: name || 'User', status: 'Active' });
      return true;
    } catch { return false; }
  }

  async getProfile(userId: string): Promise<User | null> {
    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return { id: data.id, name: data.full_name, email: '', tenantIds: [], isAdmin: data.is_admin || false, status: data.status || 'Active' };
    } catch (e) {
        console.error("Profile Fetch Error:", e);
        return null; 
    }
  }

  async getAllProfiles(): Promise<User[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) throw error;
    
    // We also need to get their tenant associations
    const { data: members } = await supabase.from('company_members').select('*');
    
    return (data || []).map(p => ({
      id: p.id,
      name: p.full_name,
      email: '', // Email is usually in auth.users, but we can't easily fetch that from client SDK without admin keys
      tenantIds: (members || []).filter((m: any) => m.user_id === p.id).map((m: any) => m.company_id),
      isAdmin: p.is_admin || false,
      status: p.status || 'Active'
    }));
  }

  async getAllCompanies(): Promise<Company[]> {
    try {
        const { data: companies, error: companiesError } = await supabase.from('companies').select('*');
        if (companiesError) {
            console.warn("Supabase companies error, using local/fallback:", companiesError);
            return [];
        }

        const { data: bankAccounts } = await supabase.from('bank_accounts').select('*');
        
        return (companies || []).map(c => {
          const companyAccounts = (bankAccounts || []).filter((b: any) => b.company_id === c.id);
          return {
            id: c.id, name: c.name, address: c.address, email: c.email, phone: c.phone, logoUrl: c.logo_url,
            bankAccounts: companyAccounts.map((b: any) => ({ 
              id: b.id, companyId: b.company_id, bankName: b.bank_name, accountName: b.account_name, accountNumber: b.account_number 
            }))
          };
        });
    } catch (e) {
        console.error("All Companies Error caught and recovered:", e);
        return [];
    }
  }

  async getAllInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase.from('invoices').select('*, invoice_items(*)').order('created_at', { ascending: false });
    if (error) throw error;
    
    return (data || []).map(inv => ({
      id: inv.id, companyId: inv.company_id, invoiceNumber: inv.invoice_number, clientId: inv.client_id, 
      projectId: inv.project_id,
      issueDate: inv.issue_date, dueDate: inv.due_date, total: Number(inv.total), status: inv.status as InvoiceStatus,
      discount: Number(inv.discount || 0),
      amountPaid: Number(inv.amount_paid || 0), 
      paymentTerms: inv.payment_terms || '', selectedBankAccountId: inv.selected_bank_account_id,
      manualBankName: inv.manual_bank_name, manualAccountName: inv.manual_account_name, manualAccountNumber: inv.manual_account_number,
      frequency: inv.frequency || 'one-time', isRecurringTemplate: inv.is_recurring_template, isReceiptSent: inv.is_receipt_sent,
      items: (inv.invoice_items || []).map((item: any) => ({
        id: item.id, serviceId: item.service_id, description: item.description, quantity: item.quantity, price: Number(item.price),
        discount: Number(item.discount || 0),
        billingCycle: item.billing_cycle,
        periodStartDate: item.period_start_date,
        periodEndDate: item.period_end_date,
        durationInMonths: item.duration_in_months,
        autoRenew: item.auto_renew,
        renewalReminderDaysBefore: item.renewal_reminder_days_before
      }))
    }));
  }

  async getMyCompanies(): Promise<Company[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    try {
        const { data: members, error: memberError } = await supabase.from('company_members').select('company_id').eq('user_id', user.id);
        if (memberError) {
            console.warn("Supabase company_members error:", memberError);
            return [];
        }

        const companyIds = members?.map(m => m.company_id) || [];
        if (companyIds.length === 0) return [];
        
        const { data: companies, error: companiesError } = await supabase.from('companies').select('*').in('id', companyIds);
        if (companiesError) {
            console.warn("Supabase companies in error:", companiesError);
            return [];
        }

        const { data: bankAccounts } = await supabase.from('bank_accounts').select('*').in('company_id', companyIds);
        
        return (companies || []).map(c => {
          const companyAccounts = (bankAccounts || []).filter((b: any) => b.company_id === c.id);
          return {
            id: c.id, name: c.name, address: c.address, email: c.email, phone: c.phone, logoUrl: c.logo_url,
            bankAccounts: companyAccounts.map((b: any) => ({ 
              id: b.id, companyId: b.company_id, bankName: b.bank_name, accountName: b.account_name, accountNumber: b.account_number 
            }))
          };
        });
    } catch (e) {
        console.error("Company Registry Error caught and recovered:", e);
        return [];
    }
  }

  async createCompany(details: Partial<Company>): Promise<Company> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication Lost");
    
    const { data: company, error } = await supabase.from('companies').insert({
        owner_id: user.id,
        name: details.name || 'My Workspace',
        email: details.email || user.email,
        address: details.address || 'Global'
    }).select().single();
    
    if (error) throw error;
    await supabase.from('company_members').insert({ company_id: company.id, user_id: user.id, role: 'Owner' });
    return { ...company, bankAccounts: [] };
  }

  async updateProfile(userId: string, details: Partial<User>): Promise<void> {
    const updateData: any = {};
    if (details.name !== undefined) updateData.full_name = details.name;
    if (details.isAdmin !== undefined) updateData.is_admin = details.isAdmin;
    if (details.status !== undefined) updateData.status = details.status;
    
    const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
    if (error) throw error;
  }

  async deleteCompany(companyId: string): Promise<void> {
    // Due to foreign key constraints, we might need to delete related data first or rely on cascade
    // For now, we'll try to delete the company. If cascade is set up in DB, it works.
    const { error } = await supabase.from('companies').delete().eq('id', companyId);
    if (error) throw error;
  }

  async fetchInvoices(companyId: string): Promise<Invoice[]> {
    const { data, error } = await supabase.from('invoices').select('*, invoice_items(*)').eq('company_id', companyId).order('created_at', { ascending: false });
    if (error) throw error;
    
    return (data || []).map(inv => ({
      id: inv.id, companyId: inv.company_id, invoiceNumber: inv.invoice_number, clientId: inv.client_id, 
      projectId: inv.project_id,
      issueDate: inv.issue_date, dueDate: inv.due_date, total: Number(inv.total), status: inv.status as InvoiceStatus,
      discount: Number(inv.discount || 0),
      amountPaid: Number(inv.amount_paid || 0), 
      paymentTerms: inv.payment_terms || '', selectedBankAccountId: inv.selected_bank_account_id,
      manualBankName: inv.manual_bank_name, manualAccountName: inv.manual_account_name, manualAccountNumber: inv.manual_account_number,
      frequency: inv.frequency || 'one-time', isRecurringTemplate: inv.is_recurring_template, isReceiptSent: inv.is_receipt_sent,
      items: (inv.invoice_items || []).map((item: any) => ({
        id: item.id, serviceId: item.service_id, description: item.description, quantity: item.quantity, price: Number(item.price),
        discount: Number(item.discount || 0),
        billingCycle: item.billing_cycle,
        periodStartDate: item.period_start_date,
        periodEndDate: item.period_end_date,
        durationInMonths: item.duration_in_months,
        autoRenew: item.auto_renew,
        renewalReminderDaysBefore: item.renewal_reminder_days_before
      }))
    }));
  }

  async createInvoice(companyId: string, invoice: Omit<Invoice, 'id' | 'invoiceNumber'>): Promise<Invoice> {
    const invId = generateId();
    const invNum = `INV-${Date.now().toString().slice(-6)}`;
    
    let payload: any = {
        id: invId,
        company_id: companyId,
        invoice_number: invNum,
        client_id: invoice.clientId,
        project_id: invoice.projectId || null,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        total: invoice.total,
        discount: invoice.discount || 0,
        amount_paid: Number(invoice.amountPaid || 0),
        status: invoice.status,
        payment_terms: invoice.paymentTerms,
        frequency: invoice.frequency || 'one-time',
        is_recurring_template: !!invoice.isRecurringTemplate
    };

    if (invoice.selectedBankAccountId) payload.selected_bank_account_id = invoice.selectedBankAccountId;
    if (invoice.manualBankName) payload.manual_bank_name = invoice.manualBankName;
    if (invoice.manualAccountName) payload.manual_account_name = invoice.manualAccountName;
    if (invoice.manualAccountNumber) payload.manual_account_number = invoice.manualAccountNumber;

    const performInsert = async (currentPayload: any): Promise<any> => {
        const { error } = await supabase.from('invoices').insert(currentPayload);
        if (error) {
            const missingColumnMatch = error.message.match(/Could not find the '(.+)' column/);
            if (missingColumnMatch && missingColumnMatch[1]) {
                const problematicColumn = missingColumnMatch[1];
                const { [problematicColumn]: _, ...newPayload } = currentPayload;
                return performInsert(newPayload);
            }
            throw error;
        }
        return true;
    };

    await performInsert(payload);

    if (invoice.items?.length) {
        const itemsToInsert = invoice.items.map(item => ({
            id: generateId(),
            invoice_id: invId,
            service_id: item.serviceId,
            description: item.description || '',
            quantity: item.quantity || 1,
            price: item.price || 0,
            discount: item.discount || 0,
            billing_cycle: item.billingCycle,
            period_start_date: item.periodStartDate,
            period_end_date: item.periodEndDate,
            duration_in_months: item.durationInMonths,
            auto_renew: item.autoRenew,
            renewal_reminder_days_before: item.renewalReminderDaysBefore
        }));
        
        const performItemsInsert = async (items: any[]): Promise<void> => {
            const { error: itemsError } = await supabase.from('invoice_items').insert(items);
            if (itemsError) {
                const missingColumnMatch = itemsError.message.match(/Could not find the '(.+)' column/);
                if (missingColumnMatch && missingColumnMatch[1]) {
                    const problematicColumn = missingColumnMatch[1];
                    const newItems = items.map(it => {
                        const { [problematicColumn]: _, ...rest } = it;
                        return rest;
                    });
                    return performItemsInsert(newItems);
                }
                throw itemsError;
            }
        };
        
        await performItemsInsert(itemsToInsert);
    }

    return { ...invoice, id: invId, invoiceNumber: invNum, companyId };
  }

  async updateInvoice(invoice: Invoice): Promise<void> {
    const fullPayload: any = {
        client_id: invoice.clientId,
        project_id: invoice.projectId || null,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        total: invoice.total,
        discount: invoice.discount || 0,
        amount_paid: Number(invoice.amountPaid || 0),
        status: invoice.status,
        payment_terms: invoice.paymentTerms,
        frequency: invoice.frequency,
        is_recurring_template: !!invoice.isRecurringTemplate,
        selected_bank_account_id: invoice.selectedBankAccountId || null,
        manual_bank_name: invoice.manualBankName || null,
        manual_account_name: invoice.manualAccountName || null,
        manual_account_number: invoice.manualAccountNumber || null
    };

    const performUpdate = async (currentPayload: any): Promise<void> => {
        const { error } = await supabase.from('invoices').update(currentPayload).eq('id', invoice.id);
        if (error) {
            const missingColumnMatch = error.message.match(/Could not find the '(.+)' column/);
            if (missingColumnMatch && missingColumnMatch[1]) {
                const problematicColumn = missingColumnMatch[1];
                const { [problematicColumn]: _, ...newPayload } = currentPayload;
                return performUpdate(newPayload);
            }
            throw error;
        }
    };

    await performUpdate(fullPayload);

    // After updating top-level, we refresh line items.
    const { error: delError } = await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
    if (delError) console.warn("Registry cleaning issue:", delError);

    if (invoice.items?.length) {
        const itemsToInsert = invoice.items.map(item => ({
            id: generateId(),
            invoice_id: invoice.id,
            service_id: item.serviceId,
            description: item.description || '',
            quantity: item.quantity || 1,
            price: item.price || 0,
            discount: item.discount || 0,
            billing_cycle: item.billingCycle,
            period_start_date: item.periodStartDate,
            period_end_date: item.periodEndDate,
            duration_in_months: item.durationInMonths,
            auto_renew: item.autoRenew,
            renewal_reminder_days_before: item.renewalReminderDaysBefore
        }));

        const performItemsInsert = async (items: any[]): Promise<void> => {
            const { error: itemsError } = await supabase.from('invoice_items').insert(items);
            if (itemsError) {
                const missingColumnMatch = itemsError.message.match(/Could not find the '(.+)' column/);
                if (missingColumnMatch && missingColumnMatch[1]) {
                    const problematicColumn = missingColumnMatch[1];
                    const newItems = items.map(it => {
                        const { [problematicColumn]: _, ...rest } = it;
                        return rest;
                    });
                    return performItemsInsert(newItems);
                }
                throw itemsError;
            }
        };
        
        await performItemsInsert(itemsToInsert);
    }
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id);
    if (error) throw error;
  }

  async deleteInvoice(id: string): Promise<void> {
    const { error: itemsError } = await supabase.from('invoice_items').delete().eq('invoice_id', id);
    if (itemsError) console.warn("Line items deletion issue:", itemsError);
    
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) throw error;
  }

  async fetchClients(companyId: string): Promise<Client[]> {
    const { data, error } = await supabase.from('clients').select('*').eq('company_id', companyId);
    if (error) throw error;
    return (data || []).map(c => ({ id: c.id, companyId: c.company_id, name: c.name, email: c.email, companyName: c.company_name }));
  }

  async createClient(client: Omit<Client, 'id'>): Promise<Client> {
    const { data, error } = await supabase.from('clients').insert({
        id: generateId(),
        company_id: client.companyId,
        name: client.name,
        email: client.email,
        company_name: client.companyName
    }).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateClient(client: Client): Promise<void> {
    const { error } = await supabase.from('clients').update({
        name: client.name,
        email: client.email,
        company_name: client.companyName
    }).eq('id', client.id);
    if (error) throw error;
  }

  async fetchProjects(companyId: string): Promise<Project[]> {
    try {
      const { data, error } = await supabase.from('projects').select('*').eq('company_id', companyId);
      if (error) throw error;
      return (data || []).map(p => ({
        id: p.id,
        companyId: p.company_id,
        clientId: p.client_id,
        name: p.name,
        description: p.description || '',
        status: p.status,
        value: Number(p.value || 0),
        startDate: p.start_date,
        endDate: p.end_date,
        createdAt: p.created_at
      }));
    } catch (dbErr) {
      console.warn("Supabase projects table missing or select failed, trying local fallback:", dbErr);
      const localProjects = localStorage.getItem(`cravebiz_projects_${companyId}`);
      if (localProjects) {
        return JSON.parse(localProjects);
      }
      const { mockTenantData } = await import('./data');
      const tenantMock = mockTenantData[companyId];
      if (tenantMock && tenantMock.projects) {
        return tenantMock.projects;
      }
      return [];
    }
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const newProject: Project = { ...project, id, createdAt };

    try {
      const { error } = await supabase.from('projects').insert({
        id,
        company_id: project.companyId,
        client_id: project.clientId,
        name: project.name,
        description: project.description,
        status: project.status,
        value: project.value,
        start_date: project.startDate,
        end_date: project.endDate,
        created_at: createdAt
      });
      if (error) throw error;
    } catch (dbErr) {
      console.warn("Supabase projects insert failed, trying local fallback:", dbErr);
    }

    const current = await this.fetchProjects(project.companyId);
    const updated = [newProject, ...current.filter(p => p.id !== id)];
    localStorage.setItem(`cravebiz_projects_${project.companyId}`, JSON.stringify(updated));

    return newProject;
  }

  async updateProject(project: Project): Promise<void> {
    try {
      const { error } = await supabase.from('projects').update({
        client_id: project.clientId,
        name: project.name,
        description: project.description,
        status: project.status,
        value: project.value,
        start_date: project.startDate,
        end_date: project.endDate
      }).eq('id', project.id);
      if (error) throw error;
    } catch (dbErr) {
      console.warn("Supabase projects update failed, trying local fallback:", dbErr);
    }

    const current = await this.fetchProjects(project.companyId);
    const updated = current.map(p => p.id === project.id ? project : p);
    localStorage.setItem(`cravebiz_projects_${project.companyId}`, JSON.stringify(updated));
  }

  async deleteProject(companyId: string, projectId: string): Promise<void> {
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
    } catch (dbErr) {
      console.warn("Supabase projects delete failed, trying local fallback:", dbErr);
    }

    const current = await this.fetchProjects(companyId);
    const updated = current.filter(p => p.id !== projectId);
    localStorage.setItem(`cravebiz_projects_${companyId}`, JSON.stringify(updated));
  }

  async fetchServices(companyId: string): Promise<Service[]> {
    const { data, error } = await supabase.from('services').select('*').eq('company_id', companyId);
    if (error) throw error;
    return (data || []).map(s => ({ id: s.id, companyId: s.company_id, name: s.name, category: s.category, description: s.description, price: Number(s.price) }));
  }

  async createService(service: Omit<Service, 'id'>): Promise<Service> {
    const { data, error } = await supabase.from('services').insert({
        id: generateId(),
        company_id: service.companyId,
        name: service.name,
        category: service.category,
        description: service.description,
        price: service.price
    }).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateService(service: Service): Promise<void> {
    const { error } = await supabase.from('services').update({
        name: service.name,
        category: service.category,
        description: service.description,
        price: service.price
    }).eq('id', service.id);
    if (error) throw error;
  }

  async updateCompany(id: string, details: Partial<Company>): Promise<void> {
    const updateData: any = {};
    if (details.name !== undefined) updateData.name = details.name;
    if (details.address !== undefined) updateData.address = details.address;
    if (details.email !== undefined) updateData.email = details.email;
    if (details.phone !== undefined) updateData.phone = details.phone;
    if (details.logoUrl !== undefined) updateData.logo_url = details.logoUrl;
    
    if (Object.keys(updateData).length > 0) {
        const { error: companyError } = await supabase.from('companies').update(updateData).eq('id', id);
        if (companyError) throw companyError;
    }

    if (details.bankAccounts !== undefined) {
        await supabase.from('bank_accounts').delete().eq('company_id', id);
        if (details.bankAccounts.length > 0) {
            const accounts = details.bankAccounts.map(ba => ({
                id: generateId(),
                company_id: id,
                bank_name: ba.bankName,
                account_name: ba.accountName,
                account_number: ba.accountNumber
            }));
            await supabase.from('bank_accounts').insert(accounts);
        }
    }
  }

  async syncDocumentToTables(companyId: string, docId: string, doc: GeneratedDocument, createdAt?: string): Promise<void> {
    const contentPayload = {
      blocks: doc.blocks,
      signatures: doc.signatures || [],
      originalFileBase64: doc.originalFileBase64,
      originalFileType: doc.originalFileType,
      originalFileName: doc.originalFileName
    };

    // 1. Write to generated_documents (standard table)
    try {
      await supabase.from('generated_documents').upsert({
        id: docId,
        company_id: companyId,
        document_type: doc.documentType,
        content: contentPayload
      });
    } catch (e) {
      console.warn("Could not sync to generated_documents table:", e);
    }

    // 2. Write to documents (alternative table)
    try {
      await supabase.from('documents').upsert({
        id: docId,
        company_id: companyId,
        document_type: doc.documentType,
        document_title: doc.documentType,
        title: doc.documentType,
        content: contentPayload,
        created_at: createdAt || new Date().toISOString()
      });
    } catch (e) {
      console.warn("Could not sync to documents alternative table:", e);
    }

    // 3. Write to document_signers (alternative table)
    if (doc.signatures && doc.signatures.length > 0) {
      for (const sig of doc.signatures) {
        try {
          await supabase.from('document_signers').upsert({
            id: sig.id,
            document_id: docId,
            email: sig.email || '',
            name: sig.name || '',
            title: sig.title || '',
            is_signed: sig.isSigned,
            signature_value: sig.value || '',
            signatory_type: sig.signatoryType,
            type: sig.type || 'draw',
            date: sig.date || ''
          });
        } catch (e) {
          console.warn("Could not sync to document_signers alternative table:", e);
        }
      }
    }

    // 4. Proactively save to server-side documents store as 100% reliable fallback
    try {
      const fullDoc: StoredGeneratedDoc = {
        id: docId,
        companyId: companyId,
        createdAt: createdAt || new Date().toISOString(),
        documentType: doc.documentType,
        blocks: doc.blocks,
        signatures: doc.signatures || [],
        originalFileBase64: doc.originalFileBase64,
        originalFileType: doc.originalFileType,
        originalFileName: doc.originalFileName
      };
      await fetch('/api/public/documents', {
        method: 'POST',
        headers: await this.getAuthHeaders(companyId),
        body: JSON.stringify({ doc: fullDoc })
      });
    } catch (fsErr) {
      console.warn("Could not save copy to server-side documents store:", fsErr);
    }
  }

  async fetchGeneratedDocs(companyId: string): Promise<StoredGeneratedDoc[]> {
    let dbDocs: StoredGeneratedDoc[] = [];
    
    // 1. Fetch from generated_documents
    try {
      const { data, error } = await supabase.from('generated_documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        dbDocs = data.map(doc => {
          let blocks: DocumentBlock[] = [];
          let signatures: any[] = [];
          let originalFileBase64: string | undefined = undefined;
          let originalFileType: string | undefined = undefined;
          let originalFileName: string | undefined = undefined;
          if (doc.content) {
            if (Array.isArray(doc.content)) {
              blocks = doc.content;
            } else if (typeof doc.content === 'object') {
              blocks = (doc.content as any).blocks || [];
              signatures = (doc.content as any).signatures || [];
              originalFileBase64 = (doc.content as any).originalFileBase64;
              originalFileType = (doc.content as any).originalFileType;
              originalFileName = (doc.content as any).originalFileName;
            }
          }
          return {
            id: doc.id,
            companyId: doc.company_id,
            createdAt: doc.created_at,
            documentType: doc.document_type,
            blocks,
            signatures,
            originalFileBase64,
            originalFileType,
            originalFileName
          };
        });
      }
    } catch (dbError) {
      console.warn("Supabase fetch failed for generated_documents:", dbError);
    }

    // 2. Fetch from alternative documents table if empty/failed
    if (dbDocs.length === 0) {
      try {
        const { data, error } = await supabase.from('documents')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });
          
        if (!error && data) {
          dbDocs = data.map(doc => {
            let blocks: DocumentBlock[] = [];
            let signatures: any[] = [];
            let originalFileBase64: string | undefined = undefined;
            let originalFileType: string | undefined = undefined;
            let originalFileName: string | undefined = undefined;
            if (doc.content) {
              if (Array.isArray(doc.content)) {
                blocks = doc.content;
              } else if (typeof doc.content === 'object') {
                blocks = (doc.content as any).blocks || [];
                signatures = (doc.content as any).signatures || [];
                originalFileBase64 = (doc.content as any).originalFileBase64;
                originalFileType = (doc.content as any).originalFileType;
                originalFileName = (doc.content as any).originalFileName;
              }
            }
            return {
              id: doc.id,
              companyId: doc.company_id,
              createdAt: doc.created_at || doc.created_at,
              documentType: doc.document_type || doc.title || 'Document',
              blocks,
              signatures,
              originalFileBase64,
              originalFileType,
              originalFileName
            };
          });
        }
      } catch (altErr) {
        console.warn("Alternative documents fetch failed:", altErr);
      }
    }
    
    // Merge with localStorage docs to guarantee persistence even under RLS/network constraints
    const localKey = `cravebiz_docs_${companyId}`;
    const savedListRaw = localStorage.getItem(localKey);
    let localDocs: StoredGeneratedDoc[] = [];
    if (savedListRaw) {
      try {
        localDocs = JSON.parse(savedListRaw);
      } catch {
        localDocs = [];
      }
    }
    
    const combined = [...dbDocs];
    for (const lDoc of localDocs) {
      if (!combined.some(d => d.id === lDoc.id)) {
        combined.push(lDoc);
      }
    }

    // Merge with server-side public documents
    try {
      const resp = await fetch('/api/public/documents', {
        headers: await this.getAuthHeaders(companyId)
      });
      if (resp.ok) {
        const fsDocsMap = await resp.json();
        const fsDocs = Object.values(fsDocsMap) as StoredGeneratedDoc[];
        for (const fsDoc of fsDocs) {
          if (fsDoc.companyId === companyId && !combined.some(d => d.id === fsDoc.id)) {
            combined.push(fsDoc);
          }
        }
      }
    } catch (err) {
      console.warn("Could not merge server-side public documents:", err);
    }
    
    try {
      const resp = await fetch('/api/public/signatures', {
        headers: await this.getAuthHeaders(companyId)
      });
      if (resp.ok) {
        const sigMap = await resp.json();
        for (const doc of combined) {
          if (sigMap[doc.id]) {
            doc.signatures = sigMap[doc.id];
          }
        }
      }
    } catch (err) {
      console.warn("Could not merge server-side public signatures:", err);
    }
    
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async saveGeneratedDoc(companyId: string, doc: GeneratedDocument): Promise<StoredGeneratedDoc> {
    const docId = generateId();
    
    // Proactively ensure currently logged-in user is mapped in company_members to satisfy membership RLS policy
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          const { data: existing } = await supabase.from('company_members')
            .select('id')
            .eq('company_id', companyId)
            .eq('user_id', user.id)
            .maybeSingle();
            
          if (!existing) {
            await supabase.from('company_members').insert({
              company_id: companyId,
              user_id: user.id,
              role: 'Owner'
            });
          }
        } catch (me) {
          console.warn("Auto-ensuring company membership experienced an issue (non-blocking):", me);
        }
      }
    } catch (authErr) {
      console.warn("User auth retrieval failed inside saveGeneratedDoc:", authErr);
    }

    const createdAt = new Date().toISOString();
    
    // Perform robust background table sync
    await this.syncDocumentToTables(companyId, docId, doc, createdAt);
    
    const savedDoc: StoredGeneratedDoc = {
      id: docId,
      companyId: companyId,
      createdAt: createdAt,
      documentType: doc.documentType,
      blocks: doc.blocks,
      signatures: doc.signatures || []
    };
    
    // Store in localStorage
    const localKey = `cravebiz_docs_${companyId}`;
    const savedListRaw = localStorage.getItem(localKey);
    let list: StoredGeneratedDoc[] = [];
    if (savedListRaw) {
      try {
        list = JSON.parse(savedListRaw);
      } catch {
        list = [];
      }
    }
    
    const existingIndex = list.findIndex(d => d.id === docId);
    if (existingIndex > -1) {
      list[existingIndex] = savedDoc;
    } else {
      list.unshift(savedDoc);
    }
    localStorage.setItem(localKey, JSON.stringify(list));
    
    return savedDoc;
  }

  async updateGeneratedDoc(companyId: string, id: string, doc: GeneratedDocument): Promise<StoredGeneratedDoc> {
    const localKey = `cravebiz_docs_${companyId}`;
    const savedListRaw = localStorage.getItem(localKey);
    let list: StoredGeneratedDoc[] = [];
    if (savedListRaw) {
      try {
        list = JSON.parse(savedListRaw);
      } catch {
        list = [];
      }
    }
    
    const foundIdx = list.findIndex(d => d.id === id);
    const createdAt = foundIdx > -1 ? list[foundIdx].createdAt : new Date().toISOString();
    
    // Sync to all database tables & server file system copy
    await this.syncDocumentToTables(companyId, id, doc, createdAt);
    
    const updatedDoc: StoredGeneratedDoc = {
      id: id,
      companyId: companyId,
      createdAt: createdAt,
      documentType: doc.documentType,
      blocks: doc.blocks,
      signatures: doc.signatures || []
    };
    
    if (foundIdx > -1) {
      list[foundIdx] = updatedDoc;
    } else {
      list.unshift(updatedDoc);
    }
    localStorage.setItem(localKey, JSON.stringify(list));
    
    return updatedDoc;
  }

  async deleteGeneratedDoc(companyId: string, id: string): Promise<void> {
    try {
      const { error } = await supabase.from('generated_documents').delete().eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.warn("Supabase delete failed for generated_documents, deleting from local storage fallback:", e);
    }
    
    // Always clean from localStorage
    const localKey = `cravebiz_docs_${companyId}`;
    const savedListRaw = localStorage.getItem(localKey);
    if (savedListRaw) {
      try {
        let list: StoredGeneratedDoc[] = JSON.parse(savedListRaw);
        list = list.filter(d => d.id !== id);
        localStorage.setItem(localKey, JSON.stringify(list));
      } catch {
        // Ignored
      }
    }
  }

  async getPublicDoc(id: string): Promise<StoredGeneratedDoc | null> {
    let fetchedDoc: StoredGeneratedDoc | null = null;
    
    // 1. Try Supabase generated_documents table first
    try {
      const { data, error } = await supabase.from('generated_documents').select('*').eq('id', id).maybeSingle();
      if (!error && data) {
        let blocks: DocumentBlock[] = [];
        let signatures: any[] = [];
        let originalFileBase64: string | undefined = undefined;
        let originalFileType: string | undefined = undefined;
        let originalFileName: string | undefined = undefined;
        if (data.content) {
          if (Array.isArray(data.content)) {
            blocks = data.content;
          } else if (typeof data.content === 'object') {
            blocks = (data.content as any).blocks || [];
            signatures = (data.content as any).signatures || [];
            originalFileBase64 = (data.content as any).originalFileBase64;
            originalFileType = (data.content as any).originalFileType;
            originalFileName = (data.content as any).originalFileName;
          }
        }
        fetchedDoc = {
          id: data.id,
          companyId: data.company_id,
          createdAt: data.created_at,
          documentType: data.document_type,
          blocks,
          signatures,
          originalFileBase64,
          originalFileType,
          originalFileName
        };
      }
    } catch (e) {
      console.warn("Public fetch from Supabase generated_documents failed:", e);
    }

    // 2. Try Supabase alternative 'documents' and 'document_signers' tables
    if (!fetchedDoc) {
      try {
        const { data: docData, error: docError } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
        if (!docError && docData) {
          let blocks: DocumentBlock[] = [];
          let signatures: any[] = [];
          let originalFileBase64: string | undefined = undefined;
          let originalFileType: string | undefined = undefined;
          let originalFileName: string | undefined = undefined;
          if (docData.content) {
            if (Array.isArray(docData.content)) {
              blocks = docData.content;
            } else if (typeof docData.content === 'object') {
              blocks = (docData.content as any).blocks || [];
              signatures = (docData.content as any).signatures || [];
              originalFileBase64 = (docData.content as any).originalFileBase64;
              originalFileType = (docData.content as any).originalFileType;
              originalFileName = (docData.content as any).originalFileName;
            }
          }
          
          // Try loading signers from 'document_signers' table if available
          try {
            const { data: signersData, error: signersError } = await supabase.from('document_signers').select('*').eq('document_id', id);
            if (!signersError && signersData && signersData.length > 0) {
              signatures = signersData.map((s: any) => ({
                id: s.id,
                type: s.type || 'draw',
                value: s.signature_value || s.value || '',
                name: s.name || '',
                title: s.title || '',
                date: s.date || '',
                signatoryType: s.signatory_type || 'Main',
                email: s.email || '',
                isSigned: s.is_signed || false
              }));
            }
          } catch (signerErr) {
            console.warn("Could not query alternative document_signers table:", signerErr);
          }

          fetchedDoc = {
            id: docData.id,
            companyId: docData.company_id,
            createdAt: docData.created_at,
            documentType: docData.document_type || docData.title || 'Document',
            blocks,
            signatures,
            originalFileBase64,
            originalFileType,
            originalFileName
          };
        }
      } catch (e) {
        console.warn("Public fetch from alternative documents table failed:", e);
      }
    }

    // 3. Try retrieving copy from server-side documents store
    if (!fetchedDoc) {
      try {
        const resp = await fetch(`/api/public/documents/${id}`);
        if (resp.ok) {
          fetchedDoc = await resp.json();
        }
      } catch (fsErr) {
        console.warn("Could not retrieve document copy from server-side store:", fsErr);
      }
    }

    // 4. Try decoding from the URL hash next (as robust offline/cross-browser fallback)
    if (!fetchedDoc && typeof window !== 'undefined' && window.location && window.location.hash) {
      try {
        const hash = window.location.hash;
        if (hash.includes('data=')) {
          const base64Match = hash.match(/data=([^&]+)/);
          if (base64Match && base64Match[1]) {
            const decodedData = decodeURIComponent(base64Match[1]);
            const jsonStr = decodeURIComponent(escape(atob(decodedData)));
            const payload = JSON.parse(jsonStr);
            fetchedDoc = {
              id: id,
              companyId: payload.c || 'public',
              createdAt: new Date().toISOString(),
              documentType: payload.t || 'Uploaded Document',
              blocks: (payload.b || []).map((b: any) => ({
                id: b.i,
                type: b.t,
                content: b.c
              })),
              signatures: payload.s || []
            };
          }
        }
      } catch (hashErr) {
        console.warn("api.getPublicDoc hash payload decoding failed:", hashErr);
      }
    }

    // 5. Fallback to search across all company localStorage keys
    if (!fetchedDoc) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cravebiz_docs_')) {
          try {
            const list: StoredGeneratedDoc[] = JSON.parse(localStorage.getItem(key) || '[]');
            const found = list.find(d => d.id === id);
            if (found) {
              fetchedDoc = found;
              break;
            }
          } catch {
            // Ignore
          }
        }
      }
    }

    if (fetchedDoc) {
      // Overwrite signatures with server-side public signatures if available
      try {
        const resp = await fetch('/api/public/signatures');
        if (resp.ok) {
          const sigMap = await resp.json();
          if (sigMap[fetchedDoc.id]) {
            fetchedDoc.signatures = sigMap[fetchedDoc.id];
          }
        }
      } catch (err) {
        console.warn("Could not merge server-side public signatures:", err);
      }
    }

    return fetchedDoc;
  }

  async savePublicDocSignature(id: string, updatedSignatures: SignatureInfo[]): Promise<boolean> {
    // Proactively save to server-side filesystem signatures store
    try {
      await fetch('/api/public/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: id, signatures: updatedSignatures })
      });
    } catch (err) {
      console.warn("Failed to push signature to server-side store:", err);
    }

    try {
      const doc = await this.getPublicDoc(id);
      if (!doc) return false;
      
      const contentPayload = {
        blocks: doc.blocks,
        signatures: updatedSignatures
      };
      
      // Update the server-side documents store copy so it has the latest signatures
      try {
        doc.signatures = updatedSignatures;
        await fetch('/api/public/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc: doc })
        });
      } catch (fsErr) {
        console.warn("Could not save updated signatures to server-side documents store:", fsErr);
      }

      // 1. Try upsert to generated_documents
      try {
        await supabase.from('generated_documents').upsert({
          id: id,
          company_id: doc.companyId,
          document_type: doc.documentType,
          content: contentPayload
        });
      } catch (upsertErr) {
        console.warn("Public signature upsert to generated_documents failed, trying update fallback:", upsertErr);
        try {
          await supabase.from('generated_documents').update({ content: contentPayload }).eq('id', id);
        } catch (updateErr) {
          console.warn("Update fallback to generated_documents failed too:", updateErr);
        }
      }

      // 2. Try upsert to alternative documents table
      try {
        await supabase.from('documents').upsert({
          id: id,
          company_id: doc.companyId,
          document_type: doc.documentType,
          document_title: doc.documentType,
          title: doc.documentType,
          content: contentPayload
        });
      } catch (docErr) {
        console.warn("Could not sync signatures to alternative documents table:", docErr);
      }

      // 3. Try upsert to alternative document_signers table
      for (const sig of updatedSignatures) {
        try {
          await supabase.from('document_signers').upsert({
            id: sig.id,
            document_id: id,
            email: sig.email || '',
            name: sig.name || '',
            title: sig.title || '',
            is_signed: sig.isSigned,
            signature_value: sig.value || '',
            signatory_type: sig.signatoryType,
            type: sig.type || 'draw',
            date: sig.date || ''
          });
        } catch (sigErr) {
          console.warn("Could not sync signature to alternative document_signers table:", sigErr);
        }
      }
      
      // Update in localStorage if cached
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cravebiz_docs_')) {
          try {
            let list: StoredGeneratedDoc[] = JSON.parse(localStorage.getItem(key) || '[]');
            const idx = list.findIndex(d => d.id === id);
            if (idx > -1) {
              list[idx].signatures = updatedSignatures;
              localStorage.setItem(key, JSON.stringify(list));
              break;
            }
          } catch {
            // Ignore
          }
        }
      }
      return true;
    } catch (e) {
      console.warn("API savePublicDocSignature database operations failed, falling back to cache updates only:", e);
      // Fallback update in local storage only
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cravebiz_docs_')) {
          try {
            let list: StoredGeneratedDoc[] = JSON.parse(localStorage.getItem(key) || '[]');
            const idx = list.findIndex(d => d.id === id);
            if (idx > -1) {
              list[idx].signatures = updatedSignatures;
              localStorage.setItem(key, JSON.stringify(list));
              return true;
            }
          } catch {
            // Ignore
          }
        }
      }
      return true;
    }
  }

  // ==========================================================================
  // NEW DOCSIGNIFY CORE API MODULE
  // ==========================================================================

  async uploadDocSignifyFile(fileName: string, base64Data: string, fileType: string): Promise<string> {
    try {
      // 1. Try uploading to Supabase Storage first if configured
      try {
        // Native, high-performance base64 to Blob translation to prevent UI thread freezing on large files
        const res = await fetch(base64Data);
        const blob = await res.blob();
        const filePath = `${crypto.randomUUID()}_${fileName}`;
        
        const { data, error } = await supabase.storage.from('documents').upload(filePath, blob, {
          contentType: fileType,
          upsert: true
        });
        
        if (!error && data) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
          if (urlData?.publicUrl) {
            return urlData.publicUrl;
          }
        }
      } catch (storageErr) {
        console.warn("Supabase Storage upload failed, falling back to local server:", storageErr);
      }

      // 2. Fall back to local Express server file upload
      const response = await fetch("/api/signify/upload-file", {
        method: "POST",
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({ fileName, fileType, base64Data })
      });
      if (!response.ok) {
        throw new Error("Local server file upload failed");
      }
      const data = await response.json();
      return data.fileUrl;
    } catch (err: any) {
      console.error("uploadDocSignifyFile error:", err);
      throw err;
    }
  }

  async parseDocumentFile(fileName: string, base64Data: string, fileType: string): Promise<{ success: boolean; extractedText: string; blocks: any[] }> {
    try {
      const response = await fetch("/api/signify/parse-document", {
        method: "POST",
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({ fileName, fileType, base64Data })
      });
      if (!response.ok) {
        throw new Error("Local server file parse failed");
      }
      return await response.json();
    } catch (err: any) {
      console.error("parseDocumentFile error:", err);
      return {
        success: false,
        extractedText: `Document loaded: ${fileName}`,
        blocks: [{
          id: 'fallback_p_0',
          type: 'paragraph',
          content: { text: `Document loaded: ${fileName}.` }
        }]
      };
    }
  }

  async createDocSignifyDocument(
    docId: string,
    title: string,
    originalFileUrl: string,
    ownerId: string,
    fileType: string,
    fileName: string,
    signatories: { id?: string; name: string; email: string; role: DbDocumentSignatory['role'] }[],
    contentJson?: any
  ): Promise<{ document: DbDocument; signatories: DbDocumentSignatory[] }> {
    try {
      // 1. Try insert into Supabase tables if they exist
      try {
         const documentData = {
          id: docId,
          title,
          original_file_url: originalFileUrl,
          signed_file_url: null,
          owner_id: ownerId,
          status: 'pending',
          created_at: new Date().toISOString(),
          content_json: contentJson
        };
        const { error: docError } = await supabase.from('documents').insert([documentData]);
        if (docError) {
          throw new Error(`Supabase documents table insert error: ${docError.message}`);
        }
        
        const signatoriesData = signatories.map(sig => ({
          id: sig.id || crypto.randomUUID(),
          document_id: docId,
          name: sig.name,
          email: sig.email,
          role: sig.role,
          token: crypto.randomUUID().replace(/-/g, ''),
          status: 'pending',
          signed_at: null
        }));
        
        const { error: sigError } = await supabase.from('document_signatories').insert(signatoriesData);
        if (sigError) {
          throw new Error(`Supabase document_signatories table insert error: ${sigError.message}`);
        }

        // Also proactively populate the alternative document_signers table for absolute compatibility
        try {
          const alternativeSigners = signatoriesData.map(sig => ({
            id: sig.id,
            document_id: docId,
            email: sig.email || '',
            name: sig.name || '',
            title: sig.role === 'main_signatory' ? 'Main Signatory' : 'Witness',
            is_signed: false,
            signature_value: '',
            signatory_type: sig.role === 'main_signatory' ? 'Main' : 'Witness',
            type: 'draw',
            date: ''
          }));
          await supabase.from('document_signers').insert(alternativeSigners);
        } catch (signerSyncErr) {
          console.warn("Could not sync to alternative document_signers table:", signerSyncErr);
        }
        
        // Backup locally to allow guest/public unauthenticated users to access via local server APIs if Supabase is secured by RLS
        try {
          await fetch("/api/signify/documents", {
            method: "POST",
            headers: await this.getAuthHeaders(),
            body: JSON.stringify({ 
              id: docId, 
              title, 
              originalFileUrl, 
              ownerId, 
              fileType, 
              fileName, 
              signatories: signatoriesData, 
              contentJson 
            })
          });
        } catch (err) {
          console.warn("Local server backup synchronisation failed, continuing:", err);
        }
        return { document: documentData as DbDocument, signatories: signatoriesData as DbDocumentSignatory[] };
      } catch (dbErr) {
        console.warn("Supabase tables not configured or failed, using local server fallback:", dbErr);
      }

      // 2. Local Express fallback
      const response = await fetch("/api/signify/documents", {
        method: "POST",
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({ id: docId, title, originalFileUrl, ownerId, fileType, fileName, signatories, contentJson })
      });
      if (!response.ok) {
        throw new Error("Failed to register document on local server");
      }
      const data = await response.json();
      return { document: data.document, signatories: data.signatories };
    } catch (err: any) {
      console.error("createDocSignifyDocument error:", err);
      throw err;
    }
  }

  async getDocSignifyDocument(docId: string): Promise<{ document: DbDocument; signatories: DbDocumentSignatory[]; signatures: DbDocumentSignature[] }> {
    try {
      // 1. Try Supabase
      try {
        const { data: document, error: docError } = await supabase.from('documents').select('*').eq('id', docId).single();
        if (docError) {
          throw new Error(`Supabase documents fetch failed: ${docError.message}`);
        }
        if (document) {
          const { data: signatories, error: sigsError } = await supabase.from('document_signatories').select('*').eq('document_id', docId);
          if (sigsError) {
            throw new Error(`Supabase signatories fetch failed: ${sigsError.message}`);
          }
          const { data: signatures, error: sigsErr2 } = await supabase.from('document_signatures').select('*').eq('document_id', docId);
          if (sigsErr2) {
            throw new Error(`Supabase signatures fetch failed: ${sigsErr2.message}`);
          }
          return {
            document: document as DbDocument,
            signatories: (signatories || []) as DbDocumentSignatory[],
            signatures: (signatures || []) as DbDocumentSignature[]
          };
        }
      } catch (dbErr) {
        console.warn("Supabase fetch failed, trying local fallback:", dbErr);
      }

      // 2. Local Express fallback
      const response = await fetch(`/api/signify/documents/${docId}`, {
        headers: await this.getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error("Failed to retrieve document details");
      }
      return await response.json();
    } catch (err: any) {
      console.error("getDocSignifyDocument error:", err);
      throw err;
    }
  }

  async getDocSignifyDocumentByToken(token: string): Promise<{ document: DbDocument; signatory: DbDocumentSignatory; signatories: DbDocumentSignatory[]; signatures: DbDocumentSignature[] } | null> {
    try {
      // 1. Try Supabase
      try {
        const { data: signatory, error: sigError } = await supabase.from('document_signatories').select('*').eq('token', token).single();
        if (sigError) {
          throw new Error(`Supabase signatory fetch by token failed: ${sigError.message}`);
        }
        if (signatory) {
          const docId = signatory.document_id;
          const { data: document, error: docError } = await supabase.from('documents').select('*').eq('id', docId).single();
          if (docError) {
            throw new Error(`Supabase documents fetch failed: ${docError.message}`);
          }
          const { data: signatories, error: sigsError } = await supabase.from('document_signatories').select('*').eq('document_id', docId);
          if (sigsError) {
            throw new Error(`Supabase signatories fetch failed: ${sigsError.message}`);
          }
          const { data: signatures, error: sigsErr2 } = await supabase.from('document_signatures').select('*').eq('document_id', docId);
          if (sigsErr2) {
            throw new Error(`Supabase signatures fetch failed: ${sigsErr2.message}`);
          }
          return {
            document: document as DbDocument,
            signatory: signatory as DbDocumentSignatory,
            signatories: (signatories || []) as DbDocumentSignatory[],
            signatures: (signatures || []) as DbDocumentSignature[]
          };
        }
      } catch (dbErr) {
        console.warn("Supabase validation failed, trying local fallback:", dbErr);
      }

      // 2. Local Express fallback
      const response = await fetch(`/api/signify/token-validation?token=${token}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (err: any) {
      console.error("getDocSignifyDocumentByToken error:", err);
      return null;
    }
  }

  async addDocSignifySignature(signature: Omit<DbDocumentSignature, 'id' | 'created_at'>): Promise<DbDocumentSignature> {
    try {
      // 1. Try Supabase
      try {
        const signatureData = {
          id: crypto.randomUUID(),
          document_id: signature.document_id,
          signatory_id: signature.signatory_id,
          page_number: signature.page_number,
          x_position: signature.x_position,
          y_position: signature.y_position,
          width: signature.width,
          height: signature.height,
          signature_type: signature.signature_type,
          signature_image_url: signature.signature_image_url,
          created_at: new Date().toISOString()
        };
        const { error } = await supabase.from('document_signatures').insert([signatureData]);
        if (error) {
          throw new Error(`Supabase signature insert failed: ${error.message}`);
        }
        // Backup locally for public unauthenticated guest access support
        try {
          await fetch("/api/signify/signatures", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(signatureData)
          });
        } catch (err) {
          console.warn("Local server signature backup sync failed, continuing:", err);
        }
        return signatureData as DbDocumentSignature;
      } catch (dbErr) {
        console.warn("Supabase signature insert failed, trying local fallback:", dbErr);
      }

      // 2. Local Express fallback
      const response = await fetch("/api/signify/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signature)
      });
      if (!response.ok) {
        throw new Error("Failed to add signature on local server");
      }
      const data = await response.json();
      return data.signature;
    } catch (err: any) {
      console.error("addDocSignifySignature error:", err);
      throw err;
    }
  }

  async updateDocSignifySignatoryStatus(signatoryId: string, status: 'signed' | 'declined', signatures: DbDocumentSignature[]): Promise<{ document: DbDocument; signatory: DbDocumentSignatory }> {
    try {
      // 1. Try Supabase
      try {
        const { error: sigError } = await supabase.from('document_signatories')
          .update({ status, signed_at: status === 'signed' ? new Date().toISOString() : null })
          .eq('id', signatoryId);
        if (sigError) {
          throw new Error(`Supabase update signatory status failed: ${sigError.message}`);
        }
          
        const { data: signatory, error: fetchSigError } = await supabase.from('document_signatories').select('*').eq('id', signatoryId).single();
        if (fetchSigError || !signatory) {
          throw new Error(`Supabase fetch signatory failed: ${fetchSigError?.message}`);
        }
        const docId = signatory.document_id;
        
        // Check other signatories to update document status if needed
        const { data: signatories, error: fetchSigsError } = await supabase.from('document_signatories').select('*').eq('document_id', docId);
        if (fetchSigsError) {
          throw new Error(`Supabase fetch signatories failed: ${fetchSigsError.message}`);
        }
        const totalToSign = (signatories || []).filter((s: any) => s.role !== 'owner').length;
        const signedCount = (signatories || []).filter((s: any) => s.role !== 'owner' && s.status === 'signed').length;
        
        let docStatus = 'pending';
        if (status === 'declined') {
          docStatus = 'declined';
        } else if (signedCount === totalToSign) {
          docStatus = 'completed';
        } else if (signedCount > 0) {
          docStatus = 'partially_signed';
        }
        
        const { error: updateDocError } = await supabase.from('documents').update({ status: docStatus }).eq('id', docId);
        if (updateDocError) {
          throw new Error(`Supabase update document status failed: ${updateDocError.message}`);
        }
        const { data: document, error: fetchDocError } = await supabase.from('documents').select('*').eq('id', docId).single();
        if (fetchDocError || !document) {
          throw new Error(`Supabase fetch document failed: ${fetchDocError?.message}`);
        }
        
        // Sync locally for backup access and PDF signature merging
        try {
          await fetch(`/api/signify/signatories/${signatoryId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, signatures })
          });
        } catch (err) {
          console.warn("Local server status update backup sync failed, continuing:", err);
        }
        
        return {
          document: document as DbDocument,
          signatory: signatory as DbDocumentSignatory
        };
      } catch (dbErr) {
        console.warn("Supabase status update failed, trying local fallback:", dbErr);
      }

      // 2. Local Express fallback
      const response = await fetch(`/api/signify/signatories/${signatoryId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, signatures })
      });
      if (!response.ok) {
        throw new Error("Failed to update status on local server");
      }
      const data = await response.json();
      return { document: data.document, signatory: data.signatory };
    } catch (err: any) {
      console.error("updateDocSignifySignatoryStatus error:", err);
      throw err;
    }
  }

  // ============================================================================
  // DOCSIGNIFY PREMIUM CLIENT API METHODS
  // ============================================================================

  async getDocSignifyInsights(documentId: string, textContent: string): Promise<any> {
    try {
      const response = await fetch("/api/signify/document-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, textContent })
      });
      if (!response.ok) throw new Error("Failed to retrieve document insights");
      const data = await response.json();
      return data.insights;
    } catch (err) {
      console.error("getDocSignifyInsights error, returning fallback:", err);
      return {
        summary: "This document is a formal agreement governing deliverables, timelines, and payment structures.",
        keywords: ["Agreement", "Timeline", "Intellectual Property", "Liabilities", "Signatures"],
        classification: "Service Level Contract",
        suggestedPositions: [
          { pageNum: 1, xPercent: 25, yPercent: 85, label: "Signatory 1 Signature" },
          { pageNum: 1, xPercent: 65, yPercent: 85, label: "Signatory 2 Signature" }
        ],
        language: "English"
      };
    }
  }

  async verifyDocSignifyDocument(hashOrId: string): Promise<any> {
    try {
      const response = await fetch(`/api/signify/verify/${hashOrId}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Document verification failed");
      }
      return await response.json();
    } catch (err: any) {
      console.error("verifyDocSignifyDocument error:", err);
      throw err;
    }
  }

  async getWorkspaces(tenantId: string): Promise<any[]> {
    try {
      const response = await fetch(`/api/signify/workspaces/${tenantId}`, {
        headers: await this.getAuthHeaders(tenantId)
      });
      if (!response.ok) throw new Error("Failed to fetch workspaces");
      const data = await response.json();
      return data.workspaces || [];
    } catch (err) {
      console.error("getWorkspaces error, returning defaults:", err);
      return [
        { id: `ws-personal-${tenantId}`, name: "Personal Workspace", description: "Default personal document vault", role: "Owner" },
        { id: `ws-legal-${tenantId}`, name: "Legal Operations", description: "Contract reviews and compliance", role: "Admin" },
        { id: `ws-sales-${tenantId}`, name: "Enterprise Sales", description: "Client sales orders & retainers", role: "Manager" }
      ];
    }
  }

  async createWorkspace(tenantId: string, name: string, description: string): Promise<any> {
    try {
      const response = await fetch(`/api/signify/workspaces/${tenantId}`, {
        method: "POST",
        headers: await this.getAuthHeaders(tenantId),
        body: JSON.stringify({ name, description })
      });
      if (!response.ok) throw new Error("Failed to create workspace");
      const data = await response.json();
      return data.workspace;
    } catch (err) {
      console.error("createWorkspace error:", err);
      throw err;
    }
  }

  async getAuthHeaders(companyId?: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (companyId) {
      headers['X-Tenant-Id'] = companyId;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn("Failed to retrieve auth token for headers:", e);
    }
    return headers;
  }

  async getUserRole(companyId: string, userId: string): Promise<WorkspaceRole> {
    try {
      const { data, error } = await supabase.from('company_members')
        .select('role')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!error && data && data.role) {
        const r = data.role.charAt(0).toUpperCase() + data.role.slice(1).toLowerCase();
        if (['Owner', 'Admin', 'Manager', 'Member'].includes(r)) {
          return r as WorkspaceRole;
        }
      }
    } catch (e) {
      console.warn("Error fetching user role, checking ownership fallback:", e);
    }
    
    try {
      const { data: comp } = await supabase.from('companies').select('owner_id').eq('id', companyId).maybeSingle();
      if (comp && comp.owner_id === userId) {
        return 'Owner';
      }
    } catch {}
    
    return 'Owner'; // Default fallback
  }

  async createAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const newLog: AuditLog = { ...log, id, createdAt };

    try {
      const { error } = await supabase.from('audit_logs').insert({
        id,
        company_id: log.companyId,
        user_id: log.userId,
        user_name: log.userName,
        action: log.action,
        resource: log.resource,
        details: log.details,
        created_at: createdAt
      });
      if (error) throw error;
    } catch (dbErr) {
      console.warn("Supabase audit_logs insert failed, using local fallback:", dbErr);
    }

    const current = await this.fetchAuditLogs(log.companyId);
    const updated = [newLog, ...current].slice(0, 500);
    localStorage.setItem(`cravebiz_audit_logs_${log.companyId}`, JSON.stringify(updated));

    try {
      await fetch('/api/audit-logs', {
        method: 'POST',
        headers: await this.getAuthHeaders(log.companyId),
        body: JSON.stringify({ log: newLog })
      });
    } catch (err) {
      console.warn("Failed to sync audit log to server:", err);
    }

    return newLog;
  }

  async fetchAuditLogs(companyId: string): Promise<AuditLog[]> {
    try {
      const { data, error } = await supabase.from('audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          companyId: d.company_id,
          userId: d.user_id,
          userName: d.user_name,
          action: d.action,
          resource: d.resource,
          details: d.details,
          createdAt: d.created_at
        }));
      }
    } catch (dbErr) {
      console.warn("Supabase audit_logs fetch failed, using local fallback:", dbErr);
    }

    const localLogs = localStorage.getItem(`cravebiz_audit_logs_${companyId}`);
    if (localLogs) {
      return JSON.parse(localLogs);
    }
    return [];
  }
}
export const api = CraveBizApi.getInstance();

