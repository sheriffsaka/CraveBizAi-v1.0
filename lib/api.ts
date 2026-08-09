
import { createClient } from '@supabase/supabase-js';
import { Invoice, Client, Service, Company, User, InvoiceStatus, BankAccount, InvoiceItem, InvoiceFrequency, GeneratedDocument, StoredGeneratedDoc, DocumentBlock, SignatureInfo, DbDocument, DbDocumentSignatory, DbDocumentSignature, WorkspaceRole, AuditLog, Project, InAppNotification, NotificationCategory } from '../types';
import { TIER_LIMITS, SubscriptionTier } from '../services/subscriptionService';
import { getLocalNotifications, createInAppNotificationClient, markNotificationReadClient, clearLocalNotificationsClient, removeNotificationByIdClient } from '../services/notificationService';

const SUPABASE_URL = 'https://dfqvgezjhudmnlyeycju.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const safeGetUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (error.message?.includes('Refresh Token') || error.message?.includes('invalid') || error.message?.includes('not found')) {
        console.warn("[Auth] Invalid refresh token, clearing session state.");
        await supabase.auth.signOut().catch(() => {});
      }
      return null;
    }
    return data?.user || null;
  } catch (e: any) {
    console.warn("[Auth] Error getting user:", e?.message || e);
    if (e?.message?.includes('Refresh Token') || String(e).includes('Refresh Token')) {
      await supabase.auth.signOut().catch(() => {});
    }
    return null;
  }
};

export const safeGetSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (error.message?.includes('Refresh Token') || error.message?.includes('invalid') || error.message?.includes('not found')) {
        console.warn("[Auth] Invalid refresh token in session, clearing session state.");
        await supabase.auth.signOut().catch(() => {});
      }
      return null;
    }
    return data?.session || null;
  } catch (e: any) {
    console.warn("[Auth] Error getting session:", e?.message || e);
    if (e?.message?.includes('Refresh Token') || String(e).includes('Refresh Token')) {
      await supabase.auth.signOut().catch(() => {});
    }
    return null;
  }
};

const safeRandomUUID = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    try {
      return window.crypto.randomUUID();
    } catch (e) {
      // browser security sandbox fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const generateId = () => safeRandomUUID();

const cleanCompanyId = (id: string): string => {
  if (!id) return id;
  return id.replace(/^ws-(personal|legal|sales)-/, '');
};

const extractMissingColumnName = (msg: string): string | null => {
  if (!msg) return null;
  const match1 = msg.match(/Could not find the '(.+?)' column/i);
  if (match1 && match1[1]) return match1[1];
  const match2 = msg.match(/column "(.+?)"/i);
  if (match2 && match2[1]) return match2[1];
  const match3 = msg.match(/column (.+?) does not exist/i);
  if (match3 && match3[1]) return match3[1];
  return null;
};

const inFlightRequests = new Map<string, Promise<any>>();

export function dedupeRequest<T>(key: string, fetcher: () => Promise<T>, ttlMs = 1500): Promise<T> {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }
  const promise = fetcher().finally(() => {
    setTimeout(() => {
      inFlightRequests.delete(key);
    }, ttlMs);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

export function invalidateRequestCache(prefix?: string) {
  if (!prefix) {
    inFlightRequests.clear();
    return;
  }
  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(prefix)) {
      inFlightRequests.delete(key);
    }
  }
}

interface RecurringMeta {
  frequency?: InvoiceFrequency;
  nextRecurrenceDate?: string;
  nextDueDate?: string;
  lastGeneratedDate?: string;
  startDate?: string;
  endDate?: string;
  recurringStatus?: string;
  autoGenerate?: boolean;
  autoSend?: boolean;
  invoiceSchedule?: string;
}

const parsePaymentTermsMeta = (termsStr: string | null | undefined): { cleanTerms: string; meta: RecurringMeta } => {
  if (!termsStr) return { cleanTerms: '', meta: {} };
  const match = termsStr.match(/\[RECURRING_META:(.*?)\]/);
  if (!match) return { cleanTerms: termsStr, meta: {} };
  try {
    const meta = JSON.parse(match[1]);
    const cleanTerms = termsStr.replace(/\[RECURRING_META:.*?\]/, '').trim();
    return { cleanTerms, meta };
  } catch {
    return { cleanTerms: termsStr, meta: {} };
  }
};

const buildPaymentTermsWithMeta = (termsStr: string | null | undefined, meta: RecurringMeta): string => {
  const base = (termsStr || '').replace(/\[RECURRING_META:.*?\]/, '').trim();
  const hasMeta = Object.values(meta).some(v => v !== undefined && v !== null);
  if (!hasMeta) return base;
  const metaStr = JSON.stringify(meta);
  return base ? `${base} [RECURRING_META:${metaStr}]` : `[RECURRING_META:${metaStr}]`;
};

const mapDbInvoiceToInvoice = (inv: any): Invoice => {
  const { cleanTerms, meta } = parsePaymentTermsMeta(inv.payment_terms);
  const nextRecDate = inv.next_recurrence_date || inv.next_due_date || meta.nextRecurrenceDate || meta.nextDueDate || undefined;

  const total = Number(inv.total || 0);
  const rawAmountPaid = Number(inv.amount_paid || 0);
  const isFullyPaid = (inv.status === InvoiceStatus.Paid) || (total > 0 && rawAmountPaid >= total - 0.001);
  const amountPaid = isFullyPaid ? total : rawAmountPaid;
  const status = isFullyPaid ? InvoiceStatus.Paid : (inv.status as InvoiceStatus);

  return {
    id: inv.id,
    companyId: inv.company_id,
    invoiceNumber: inv.invoice_number,
    clientId: inv.client_id,
    projectId: inv.project_id || undefined,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    total,
    status,
    discount: Number(inv.discount || 0),
    amountPaid,
    paymentTerms: cleanTerms,
    selectedBankAccountId: inv.selected_bank_account_id || undefined,
    manualBankName: inv.manual_bank_name || undefined,
    manualAccountName: inv.manual_account_name || undefined,
    manualAccountNumber: inv.manual_account_number || undefined,
    frequency: (inv.frequency || meta.frequency || 'one-time') as InvoiceFrequency,
    isRecurringTemplate: inv.is_recurring_template !== undefined ? !!inv.is_recurring_template : (meta.frequency && meta.frequency !== 'one-time'),
    isReceiptSent: !!inv.is_receipt_sent,
    nextRecurrenceDate: nextRecDate,
    nextDueDate: nextRecDate,
    lastGeneratedDate: inv.last_generated_date || meta.lastGeneratedDate || undefined,
    startDate: inv.start_date || meta.startDate || inv.issue_date,
    endDate: inv.end_date || meta.endDate || undefined,
    recurringStatus: (inv.recurring_status || meta.recurringStatus || (inv.is_recurring_template ? 'active' : undefined)) as any,
    autoGenerate: inv.auto_generate !== undefined ? inv.auto_generate : (meta.autoGenerate !== undefined ? meta.autoGenerate : true),
    autoSend: inv.auto_send !== undefined ? inv.auto_send : (meta.autoSend !== undefined ? meta.autoSend : true),
    invoiceSchedule: inv.invoice_schedule || meta.invoiceSchedule || inv.frequency || undefined,
    parentInvoiceId: inv.parent_invoice_id || undefined,
    lastSentDate: inv.last_sent_date || undefined,
    items: (inv.invoice_items || []).map((item: any) => ({
      id: item.id,
      serviceId: item.service_id,
      description: item.description,
      quantity: item.quantity,
      price: Number(item.price),
      discount: Number(item.discount || 0),
      directCost: item.direct_cost !== undefined && item.direct_cost !== null ? Number(item.direct_cost) : Number(item.directCost || 0),
      indirectCost: item.indirect_cost !== undefined && item.indirect_cost !== null ? Number(item.indirect_cost) : Number(item.indirectCost || 0),
      billingCycle: item.billing_cycle,
      periodStartDate: item.period_start_date,
      periodEndDate: item.period_end_date,
      durationInMonths: item.duration_in_months,
      autoRenew: item.auto_renew,
      renewalReminderDaysBefore: item.renewal_reminder_days_before
    }))
  };
};

class CraveBizApi {
  private static instance: CraveBizApi;
  private constructor() {}
  public static getInstance(): CraveBizApi {
    if (!CraveBizApi.instance) CraveBizApi.instance = new CraveBizApi();
    return CraveBizApi.instance;
  }

  async ensureProfile(userId: string, name?: string, email?: string): Promise<{ success: boolean; error?: any }> {
    try {
      if (email) {
        const cleanEmail = email.trim().toLowerCase();
        // Since there is no 'email' column on 'profiles' in the remote DB, we search for invited placeholder ids in local storage.
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cravebiz_invited_member_info_')) {
              const savedStr = localStorage.getItem(key);
              if (savedStr) {
                try {
                  const saved = JSON.parse(savedStr);
                  if (saved && saved.email?.toLowerCase() === cleanEmail) {
                    const parts = key.split('_');
                    const oldTempId = parts[parts.length - 1]; // tempUserId is the last segment
                    
                    console.log(`[Local Sync Link] Linking placeholder user ${oldTempId} for ${cleanEmail} to real userId ${userId}`);
                    
                    // Update company_members to point to the new real userId and set status as Active (or Joined)
                    const { error: memberErr } = await supabase
                      .from('company_members')
                      .update({ user_id: userId, status: 'Active' })
                      .eq('user_id', oldTempId);

                    if (memberErr) {
                      console.warn("Failed to update company members link:", memberErr);
                    }

                    // Clean up the old placeholder profile
                    const { error: deleteErr } = await supabase.from('profiles').delete().eq('id', oldTempId);
                    if (deleteErr) {
                      console.warn("Failed to delete old placeholder profile:", deleteErr);
                    }
                  }
                } catch (e) {
                  console.warn("Failed to parse local invitation during auto-link:", e);
                }
              }
            }
          }
        } catch (storageErr) {
          console.warn("Storage access failed during link check:", storageErr);
        }

        // Cross-device server-authoritative invitation check and auto-join
        try {
          const { data: workspaces, error: wsError } = await supabase
            .from('generated_documents')
            .select('*')
            .eq('document_type', 'cravebiz_workspace_settings');

          if (!wsError && workspaces) {
            for (const ws of workspaces) {
              const content = ws.content as any;
              if (content && content.invitedMembers) {
                const matchingInviteEntry = Object.entries(content.invitedMembers).find(
                  ([_, member]: [string, any]) => member.email?.toLowerCase() === cleanEmail
                );

                if (matchingInviteEntry) {
                  const [tempId, inviteInfo]: [string, any] = matchingInviteEntry;
                  const companyId = ws.company_id || ws.id;

                  console.log(`[Cloud Invitation Link] Found pending invitation for ${cleanEmail} in workspace ${companyId}`);

                  // 1. Insert or update into company_members
                  const { error: joinErr } = await supabase
                    .from('company_members')
                    .upsert({
                      company_id: companyId,
                      user_id: userId,
                      role: (inviteInfo.role || 'member').toLowerCase(),
                      status: 'Joined'
                    }, { onConflict: 'company_id,user_id' });

                  if (joinErr) {
                    console.warn("Failed to join company from cloud invitation:", joinErr);
                  }

                  // 2. Mark as Joined in workspace settings
                  inviteInfo.status = 'Joined';
                  content.invitedMembers[tempId] = inviteInfo;

                  await supabase
                    .from('generated_documents')
                    .update({ content })
                    .eq('id', ws.id);

                  // 3. Store locally in local storage
                  localStorage.setItem(`cravebiz_invited_member_info_${companyId}_${userId}`, JSON.stringify(inviteInfo));
                  localStorage.setItem(`cravebiz_member_ai_allowed_${companyId}_${cleanEmail}`, 'true');
                }
              }
            }
          }
        } catch (inviteLinkErr) {
          console.warn("Cloud invitation checking failed, continuing anyway:", inviteLinkErr);
        }
      }

      let resolvedEmail = email || '';
      if (resolvedEmail) {
        resolvedEmail = resolvedEmail.trim().toLowerCase();
        localStorage.setItem(`cravebiz_user_email_${userId}`, resolvedEmail);
      } else {
        resolvedEmail = localStorage.getItem(`cravebiz_user_email_${userId}`) || '';
      }

      const compositeName = resolvedEmail ? `${name || 'User'} ||| ${resolvedEmail}` : (name || 'User');

      // Try to insert a brand new profile first (avoids RLS ON CONFLICT SELECT policy requirements of upsert)
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: userId,
        full_name: compositeName,
        status: 'Active',
      });

      if (!insertErr) {
        return { success: true };
      }

      // If it failed due to duplicate key (already exists), perform an update targeting the userId
      const errCode = insertErr.code;
      const errMsg = insertErr.message?.toLowerCase() || '';
      if (errCode === '23505' || errMsg.includes('duplicate') || errMsg.includes('already exists') || errMsg.includes('unique')) {
        console.log("Profile already exists or conflict detected, performing update fallback instead of insert...");
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({
            full_name: compositeName,
            status: 'Active',
          })
          .eq('id', userId);

        if (updateErr) {
          console.error("update fallback failed:", updateErr);
          return { success: false, error: updateErr };
        }
        return { success: true };
      } else {
        console.error("insert profiles failed:", insertErr);
        return { success: false, error: insertErr };
      }
    } catch (e: any) {
      console.error("ensureProfile Error:", e);
      return { success: false, error: e };
    }
  }

  async getProfile(userId: string): Promise<User | null> {
    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (!data) return null;

        let name = data.full_name || '';
        let email = '';
        if (name.includes(' ||| ')) {
          const parts = name.split(' ||| ');
          name = parts[0];
          email = parts[1];
        }

        if (!email) {
          email = localStorage.getItem(`cravebiz_user_email_${userId}`) || '';
        } else {
          localStorage.setItem(`cravebiz_user_email_${userId}`, email);
        }

        return { id: data.id, name: name, email: email, tenantIds: [], isAdmin: data.is_admin || false, status: data.status || 'Active' };
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
    
    return (data || []).map(p => {
      let name = p.full_name || '';
      let email = '';
      if (name.includes(' ||| ')) {
        const parts = name.split(' ||| ');
        name = parts[0];
        email = parts[1];
      }

      if (!email) {
        const directEmail = localStorage.getItem(`cravebiz_user_email_${p.id}`);
        if (directEmail) {
          email = directEmail;
        } else {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cravebiz_invited_member_info_') && key.endsWith(`_${p.id}`)) {
              const savedStr = localStorage.getItem(key);
              if (savedStr) {
                try {
                  const saved = JSON.parse(savedStr);
                  if (saved && saved.email) {
                    email = saved.email;
                    break;
                  }
                } catch (e) {}
              }
            }
          }
        }
      } else {
        localStorage.setItem(`cravebiz_user_email_${p.id}`, email);
      }

      const isArchived = p.is_archived || p.status === 'Archived';
      return {
        id: p.id,
        name: name,
        email: email,
        tenantIds: (members || []).filter((m: any) => m.user_id === p.id).map((m: any) => m.company_id),
        isAdmin: p.is_admin || false,
        status: p.status || (isArchived ? 'Archived' : 'Active'),
        is_archived: isArchived,
        archived_at: p.archived_at || null,
        archived_by: p.archived_by || null,
        deleted_at: p.deleted_at || null
      };
    });
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

  async fetchAiLedger(): Promise<any[]> {
    try {
      const response = await fetch('/api/admin/ai-ledger');
      if (!response.ok) throw new Error('Failed to fetch AI ledger');
      const data = await response.json();
      return data.entries || [];
    } catch (e) {
      console.error("Error in fetchAiLedger:", e);
      return [];
    }
  }

  async recordTransaction(companyId: string, details: any): Promise<void> {
    try {
      const response = await fetch('/api/subscription/record-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': companyId,
          ...(localStorage.getItem('cravebiz_auth_token') ? { 'Authorization': `Bearer ${localStorage.getItem('cravebiz_auth_token')}` } : {})
        },
        body: JSON.stringify(details)
      });
      if (!response.ok) {
        console.warn('Failed to record transaction on backend:', await response.text());
      }
    } catch (e) {
      console.warn('Backend API recordTransaction notice:', e);
    }

    try {
      const cleanCompId = cleanCompanyId(companyId);
      const transaction = {
        id: details.transactionId || generateId(),
        company_id: cleanCompId,
        type: details.type || 'payment',
        invoice_id: details.invoiceId || null,
        amount: details.amount || 0,
        status: details.status || 'successful',
        payment_method: details.paymentMethod || 'Manual Registry',
        reference: details.reference || null,
        created_at: details.paymentDate || new Date().toISOString()
      };
      try {
        await supabase.from('transactions').insert(transaction);
      } catch (e) {}
      const key = `cravebiz_tx_${cleanCompId}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(transaction);
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 200)));
    } catch (dbErr) {
      console.warn("Transaction local cache notice:", dbErr);
    }
  }

  async fetchTransactions(): Promise<any[]> {
    try {
      const response = await fetch('/api/admin/transactions');
      if (!response.ok) throw new Error('Failed to fetch transactions');
      const data = await response.json();
      return data.transactions || [];
    } catch (e) {
      console.error('Error in fetchTransactions:', e);
      return [];
    }
  }

  async getAllInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase.from('invoices').select('*, invoice_items(*)').order('created_at', { ascending: false });
    if (error) throw error;
    
    return (data || []).map(mapDbInvoiceToInvoice);
  }

  async getMyCompanies(): Promise<Company[]> {
    const user = await safeGetUser();
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
    const user = await safeGetUser();
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
    if (details.name !== undefined || details.email !== undefined) {
      const email = details.email !== undefined ? details.email : (localStorage.getItem(`cravebiz_user_email_${userId}`) || '');
      const name = details.name !== undefined ? details.name : '';
      
      if (email) {
        updateData.full_name = `${name || 'User'} ||| ${email}`;
        localStorage.setItem(`cravebiz_user_email_${userId}`, email);
      } else {
        updateData.full_name = name || 'User';
      }
    }
    if (details.isAdmin !== undefined) updateData.is_admin = details.isAdmin;
    if (details.status !== undefined) updateData.status = details.status;
    if (details.is_archived !== undefined) updateData.is_archived = details.is_archived;
    if (details.archived_at !== undefined) updateData.archived_at = details.archived_at;
    if (details.archived_by !== undefined) updateData.archived_by = details.archived_by;
    if (details.deleted_at !== undefined) updateData.deleted_at = details.deleted_at;
    
    try {
      const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
      if (error) console.warn("Supabase profile update warning:", error);
    } catch (e) {
      console.warn("Update profile catch:", e);
    }
  }

  async archiveUser(userId: string, adminUser?: { id?: string; name?: string } | null, companyId?: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const adminName = adminUser?.name || 'Administrator';
    await this.updateProfile(userId, {
      status: 'Archived',
      is_archived: true,
      archived_at: nowIso,
      archived_by: adminName
    });
    if (companyId) {
      await this.createAuditLog({
        companyId,
        userId: adminUser?.id || 'admin',
        userName: adminName,
        action: 'Archive User',
        resource: 'User',
        details: `Archived user ID ${userId}`
      }).catch(err => console.warn("Audit log error:", err));
    }
  }

  async restoreUser(userId: string, adminUser?: { id?: string; name?: string } | null, companyId?: string): Promise<void> {
    const adminName = adminUser?.name || 'Administrator';
    await this.updateProfile(userId, {
      status: 'Active',
      is_archived: false,
      archived_at: undefined,
      archived_by: undefined
    });
    if (companyId) {
      await this.createAuditLog({
        companyId,
        userId: adminUser?.id || 'admin',
        userName: adminName,
        action: 'Restore User',
        resource: 'User',
        details: `Restored user ID ${userId}`
      }).catch(err => console.warn("Audit log error:", err));
    }
  }

  async deleteUser(userId: string, adminUser?: { id?: string; name?: string } | null, companyId?: string): Promise<void> {
    const adminName = adminUser?.name || 'Administrator';
    try {
      await supabase.from('company_members').delete().eq('user_id', userId);
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) {
        await this.updateProfile(userId, { status: 'Deleted', deleted_at: new Date().toISOString() });
      }
    } catch (e) {
      await this.updateProfile(userId, { status: 'Deleted', deleted_at: new Date().toISOString() });
    }
    if (companyId) {
      await this.createAuditLog({
        companyId,
        userId: adminUser?.id || 'admin',
        userName: adminName,
        action: 'Delete User',
        resource: 'User',
        details: `Permanently deleted user ID ${userId}`
      }).catch(err => console.warn("Audit log error:", err));
    }
  }

  async deleteCompany(companyId: string): Promise<void> {
    // Due to foreign key constraints, we might need to delete related data first or rely on cascade
    // For now, we'll try to delete the company. If cascade is set up in DB, it works.
    const { error } = await supabase.from('companies').delete().eq('id', companyId);
    if (error) throw error;
  }

  async syncWorkspaceCounts(companyId: string): Promise<void> {
    try {
      const cleanCompId = cleanCompanyId(companyId);
      if (!cleanCompId) return;
      const { data } = await supabase.from('invoices').select('is_receipt_sent').eq('company_id', cleanCompId);
      if (data) {
        const { saveSubscriptionInfoToDb } = await import("../services/subscriptionService");
        await saveSubscriptionInfoToDb(cleanCompId);
        window.dispatchEvent(new Event('cravebiz_subscription_change'));
      }
    } catch (e) {
      console.warn("syncWorkspaceCounts failed:", e);
    }
  }

  async fetchInvoices(companyId: string): Promise<Invoice[]> {
    const cleanId = cleanCompanyId(companyId);
    return dedupeRequest(`invoices:${cleanId}`, async () => {
      const { data, error } = await supabase.from('invoices').select('*, invoice_items(*)').eq('company_id', cleanId).order('created_at', { ascending: false });
      if (error) throw error;

      if (data) {
        import("../services/subscriptionService").then(({ saveSubscriptionInfoToDb }) => {
          saveSubscriptionInfoToDb(cleanId).catch(err => console.warn("Background count sync failed:", err));
        }).catch(err => console.warn("Deferred import failed:", err));
      }
      
      return (data || []).map(mapDbInvoiceToInvoice);
    });
  }

  async createInvoice(companyId: string, invoice: Omit<Invoice, 'id' | 'invoiceNumber'>): Promise<Invoice> {
    invalidateRequestCache('invoices');
    const invId = generateId();
    const invNum = `INV-${Date.now().toString().slice(-6)}`;
    
    const nextRec = invoice.nextRecurrenceDate || invoice.nextDueDate || null;
    const recMeta: RecurringMeta = {
      frequency: invoice.frequency,
      nextRecurrenceDate: invoice.nextRecurrenceDate || invoice.nextDueDate,
      nextDueDate: invoice.nextDueDate || invoice.nextRecurrenceDate,
      lastGeneratedDate: invoice.lastGeneratedDate,
      startDate: invoice.startDate || invoice.issueDate,
      endDate: invoice.endDate,
      recurringStatus: invoice.recurringStatus || (invoice.isRecurringTemplate ? 'active' : 'completed'),
      autoGenerate: invoice.autoGenerate !== undefined ? invoice.autoGenerate : true,
      autoSend: invoice.autoSend,
      invoiceSchedule: invoice.invoiceSchedule || invoice.frequency
    };

    let payload: any = {
        id: invId,
        company_id: cleanCompanyId(companyId),
        invoice_number: invNum,
        client_id: invoice.clientId,
        project_id: invoice.projectId || null,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        total: invoice.total,
        discount: invoice.discount || 0,
        amount_paid: Number(invoice.amountPaid || 0),
        status: invoice.status,
        payment_terms: buildPaymentTermsWithMeta(invoice.paymentTerms, recMeta),
        frequency: invoice.frequency || 'one-time',
        is_recurring_template: !!invoice.isRecurringTemplate,
        next_recurrence_date: nextRec,
        next_due_date: nextRec,
        parent_invoice_id: invoice.parentInvoiceId || null,
        last_generated_date: invoice.lastGeneratedDate || null,
        start_date: invoice.startDate || invoice.issueDate || null,
        end_date: invoice.endDate || null,
        recurring_status: invoice.recurringStatus || (invoice.isRecurringTemplate ? 'active' : null),
        auto_generate: invoice.autoGenerate !== undefined ? invoice.autoGenerate : true,
        invoice_schedule: invoice.invoiceSchedule || invoice.frequency || null
    };

    if (invoice.selectedBankAccountId) payload.selected_bank_account_id = invoice.selectedBankAccountId;
    if (invoice.manualBankName) payload.manual_bank_name = invoice.manualBankName;
    if (invoice.manualAccountName) payload.manual_account_name = invoice.manualAccountName;
    if (invoice.manualAccountNumber) payload.manual_account_number = invoice.manualAccountNumber;

    const performInsert = async (currentPayload: any): Promise<any> => {
        Object.keys(currentPayload).forEach(key => {
            if (currentPayload[key] === undefined) delete currentPayload[key];
        });
        const { error } = await supabase.from('invoices').insert(currentPayload);
        if (error) {
            const problematicColumn = extractMissingColumnName(error.message || error.details || '');
            if (problematicColumn && problematicColumn in currentPayload) {
                console.warn(`[createInvoice] Removing missing column '${problematicColumn}' and retrying...`);
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
            direct_cost: Number(item.directCost || 0),
            indirect_cost: Number(item.indirectCost || 0),
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
                const problematicColumn = extractMissingColumnName(itemsError.message || itemsError.details || '');
                if (problematicColumn && items.some(it => problematicColumn in it)) {
                    console.warn(`[createInvoice] Removing missing column '${problematicColumn}' from items and retrying...`);
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

    this.syncWorkspaceCounts(companyId).catch(err => console.warn("Deferred count sync failed:", err));

    return { ...invoice, id: invId, invoiceNumber: invNum, companyId };
  }

  async updateInvoice(invoice: Invoice): Promise<void> {
    const nextRec = invoice.nextRecurrenceDate || invoice.nextDueDate || null;
    const recMeta: RecurringMeta = {
      frequency: invoice.frequency,
      nextRecurrenceDate: invoice.nextRecurrenceDate || invoice.nextDueDate,
      nextDueDate: invoice.nextDueDate || invoice.nextRecurrenceDate,
      lastGeneratedDate: invoice.lastGeneratedDate,
      startDate: invoice.startDate || invoice.issueDate,
      endDate: invoice.endDate,
      recurringStatus: invoice.recurringStatus || (invoice.isRecurringTemplate ? 'active' : 'completed'),
      autoGenerate: invoice.autoGenerate !== undefined ? invoice.autoGenerate : true,
      autoSend: invoice.autoSend,
      invoiceSchedule: invoice.invoiceSchedule || invoice.frequency
    };

    const fullPayload: any = {
        client_id: invoice.clientId,
        project_id: invoice.projectId || null,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        total: invoice.total,
        discount: invoice.discount || 0,
        amount_paid: Number(invoice.amountPaid || 0),
        status: invoice.status,
        payment_terms: buildPaymentTermsWithMeta(invoice.paymentTerms, recMeta),
        frequency: invoice.frequency || null,
        is_recurring_template: !!invoice.isRecurringTemplate,
        next_recurrence_date: nextRec,
        next_due_date: nextRec,
        parent_invoice_id: invoice.parentInvoiceId || null,
        last_generated_date: invoice.lastGeneratedDate || null,
        start_date: invoice.startDate || invoice.issueDate || null,
        end_date: invoice.endDate || null,
        recurring_status: invoice.recurringStatus || (invoice.isRecurringTemplate ? 'active' : null),
        auto_generate: invoice.autoGenerate !== undefined ? invoice.autoGenerate : true,
        invoice_schedule: invoice.invoiceSchedule || invoice.frequency || null,
        selected_bank_account_id: invoice.selectedBankAccountId || null,
        manual_bank_name: invoice.manualBankName || null,
        manual_account_name: invoice.manualAccountName || null,
        manual_account_number: invoice.manualAccountNumber || null,
        is_receipt_sent: !!invoice.isReceiptSent
    };

    const performUpdate = async (currentPayload: any): Promise<void> => {
        Object.keys(currentPayload).forEach(key => {
            if (currentPayload[key] === undefined) delete currentPayload[key];
        });
        const { error } = await supabase.from('invoices').update(currentPayload).eq('id', invoice.id);
        if (error) {
            const problematicColumn = extractMissingColumnName(error.message || error.details || '');
            if (problematicColumn && problematicColumn in currentPayload) {
                console.warn(`[updateInvoice] Removing missing column '${problematicColumn}' and retrying...`);
                const { [problematicColumn]: _, ...newPayload } = currentPayload;
                return performUpdate(newPayload);
            }
            console.warn("Supabase updateInvoice encountered issue, attempting minimal update fallback:", error);
            const minPayload: any = {
                amount_paid: Number(invoice.amountPaid || 0),
                status: invoice.status
            };
            const { error: minError } = await supabase.from('invoices').update(minPayload).eq('id', invoice.id);
            if (minError) {
                console.warn("Minimal invoice update also failed (non-fatal, local update active):", minError);
            }
        }
    };

    await performUpdate(fullPayload);

    try {
        const { error: delError } = await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
        if (delError) console.warn("Registry cleaning issue:", delError);
    } catch (e) {
        console.warn("Invoice items delete warning:", e);
    }

    if (invoice.items?.length) {
        const itemsToInsert = invoice.items.map(item => ({
            id: generateId(),
            invoice_id: invoice.id,
            service_id: item.serviceId,
            description: item.description || '',
            quantity: item.quantity || 1,
            price: item.price || 0,
            discount: item.discount || 0,
            direct_cost: Number(item.directCost || 0),
            indirect_cost: Number(item.indirectCost || 0),
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
                const problematicColumn = extractMissingColumnName(itemsError.message || itemsError.details || '');
                if (problematicColumn && items.some(it => problematicColumn in it)) {
                    console.warn(`[updateInvoice] Removing missing column '${problematicColumn}' from items and retrying...`);
                    const newItems = items.map(it => {
                        const { [problematicColumn]: _, ...rest } = it;
                        return rest;
                    });
                    return performItemsInsert(newItems);
                }
                console.warn("Non-fatal invoice items update warning:", itemsError);
            }
        };
        
        await performItemsInsert(itemsToInsert);
    }

    this.syncWorkspaceCounts(invoice.companyId || localStorage.getItem('cravebiz_tenant') || '').catch(err => console.warn("Deferred count sync failed:", err));
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

    const companyId = localStorage.getItem('cravebiz_tenant') || '';
    if (companyId) {
      this.syncWorkspaceCounts(companyId).catch(err => console.warn("Deferred count sync failed:", err));
    }
  }

  async fetchClients(companyId: string): Promise<Client[]> {
    const cleanId = cleanCompanyId(companyId);
    return dedupeRequest(`clients:${cleanId}`, async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('company_id', cleanId);
      if (error) throw error;
      return (data || []).map(c => {
        const isArchived = c.is_archived || c.status === 'Archived';
        return {
          id: c.id,
          companyId: c.company_id,
          name: c.name,
          email: c.email,
          companyName: c.company_name,
          status: c.status || (isArchived ? 'Archived' : 'Active'),
          is_archived: isArchived,
          archived_at: c.archived_at || null,
          archived_by: c.archived_by || null,
          deleted_at: c.deleted_at || null
        };
      });
    });
  }

  async createClient(client: Omit<Client, 'id'>): Promise<Client> {
    invalidateRequestCache('clients');
    const { data, error } = await supabase.from('clients').insert({
        id: generateId(),
        company_id: cleanCompanyId(client.companyId),
        name: client.name,
        email: client.email,
        company_name: client.companyName,
        status: 'Active',
        is_archived: false
    }).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateClient(client: Client): Promise<void> {
    invalidateRequestCache('clients');
    const updateData: any = {
      name: client.name,
      email: client.email,
      company_name: client.companyName
    };
    if (client.status) updateData.status = client.status;
    if (client.is_archived !== undefined) updateData.is_archived = client.is_archived;
    if (client.archived_at !== undefined) updateData.archived_at = client.archived_at;
    if (client.archived_by !== undefined) updateData.archived_by = client.archived_by;
    if (client.deleted_at !== undefined) updateData.deleted_at = client.deleted_at;

    const { error } = await supabase.from('clients').update(updateData).eq('id', client.id);
    if (error) console.warn("Update client warning:", error);
  }

  async archiveClient(client: Client, adminUser?: { id?: string; name?: string } | null): Promise<void> {
    invalidateRequestCache('clients');
    const nowIso = new Date().toISOString();
    const adminName = adminUser?.name || 'Administrator';
    const updated: Client = {
      ...client,
      status: 'Archived',
      is_archived: true,
      archived_at: nowIso,
      archived_by: adminName
    };
    await this.updateClient(updated);
    if (client.companyId) {
      await this.createAuditLog({
        companyId: client.companyId,
        userId: adminUser?.id || 'admin',
        userName: adminName,
        action: 'Archive Client',
        resource: 'Client',
        details: `Archived client '${client.companyName}' (${client.name})`
      }).catch(err => console.warn("Audit log error:", err));
    }
  }

  async restoreClient(client: Client, adminUser?: { id?: string; name?: string } | null): Promise<void> {
    invalidateRequestCache('clients');
    const adminName = adminUser?.name || 'Administrator';
    const updated: Client = {
      ...client,
      status: 'Active',
      is_archived: false,
      archived_at: undefined,
      archived_by: undefined
    };
    await this.updateClient(updated);
    if (client.companyId) {
      await this.createAuditLog({
        companyId: client.companyId,
        userId: adminUser?.id || 'admin',
        userName: adminName,
        action: 'Restore Client',
        resource: 'Client',
        details: `Restored client '${client.companyName}' (${client.name})`
      }).catch(err => console.warn("Audit log error:", err));
    }
  }

  async deleteClient(clientId: string): Promise<void> {
    try {
      await supabase.from('invoices').update({ client_id: null }).eq('client_id', clientId);
      await supabase.from('projects').update({ client_id: null }).eq('client_id', clientId);
    } catch (e) {
      console.warn("Disassociating client references encountered warning:", e);
    }
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    if (error) throw error;
  }

  async bulkArchiveInvoices(ids: string[], targetStatus: 'archived' | 'active' = 'archived'): Promise<void> {
    if (!ids || ids.length === 0) return;
    invalidateRequestCache('invoices');
    const { error } = await supabase.from('invoices').update({ recurring_status: targetStatus }).in('id', ids);
    if (error) {
      console.warn("bulkArchiveInvoices warning:", error);
      for (const id of ids) {
        await supabase.from('invoices').update({ recurring_status: targetStatus }).eq('id', id);
      }
    }
  }

  async bulkDeleteInvoices(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    invalidateRequestCache('invoices');
    try {
      await supabase.from('invoice_items').delete().in('invoice_id', ids);
    } catch (e) {
      console.warn("Bulk items delete warning:", e);
    }
    const { error } = await supabase.from('invoices').delete().in('id', ids);
    if (error) console.warn("bulkDeleteInvoices warning:", error);
  }

  async bulkArchiveUsers(ids: string[], targetStatus: 'archived' | 'active' = 'archived'): Promise<void> {
    if (!ids || ids.length === 0) return;
    const isArchived = targetStatus === 'archived';
    const nowIso = isArchived ? new Date().toISOString() : null;
    const { error } = await supabase.from('profiles').update({
      status: isArchived ? 'Archived' : 'Active',
      is_archived: isArchived,
      archived_at: nowIso
    }).in('id', ids);
    if (error) console.warn("bulkArchiveUsers warning:", error);
  }

  async bulkRestoreUsers(ids: string[]): Promise<void> {
    return this.bulkArchiveUsers(ids, 'active');
  }

  async bulkDeleteUsers(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    try {
      await supabase.from('company_members').delete().in('user_id', ids);
    } catch (e) {
      console.warn("bulkDeleteUsers company_members warning:", e);
    }
    const { error } = await supabase.from('profiles').delete().in('id', ids);
    if (error) {
      await supabase.from('profiles').update({ status: 'Deleted', deleted_at: new Date().toISOString() }).in('id', ids);
    }
  }

  async bulkArchiveClients(ids: string[], targetStatus: 'archived' | 'active' = 'archived'): Promise<void> {
    if (!ids || ids.length === 0) return;
    invalidateRequestCache('clients');
    const isArchived = targetStatus === 'archived';
    const nowIso = isArchived ? new Date().toISOString() : null;
    const { error } = await supabase.from('clients').update({
      status: isArchived ? 'Archived' : 'Active',
      is_archived: isArchived,
      archived_at: nowIso
    }).in('id', ids);
    if (error) console.warn("bulkArchiveClients warning:", error);
  }

  async bulkRestoreClients(ids: string[]): Promise<void> {
    return this.bulkArchiveClients(ids, 'active');
  }

  async bulkDeleteClients(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    invalidateRequestCache('clients');
    try {
      await supabase.from('invoices').update({ client_id: null }).in('client_id', ids);
    } catch (e) {
      console.warn("Unlink invoices warning:", e);
    }
    const { error } = await supabase.from('clients').delete().in('id', ids);
    if (error) console.warn("bulkDeleteClients warning:", error);
  }

  async fetchProjects(companyId: string): Promise<Project[]> {
    const cleanId = cleanCompanyId(companyId);
    return dedupeRequest(`projects:${cleanId}`, async () => {
      try {
        const { data, error } = await supabase.from('projects').select('*').eq('company_id', cleanId);
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
        console.warn("Supabase projects select failed:", dbErr);
        return [];
      }
    });
  }

  async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    invalidateRequestCache('projects');
    const id = generateId();
    const createdAt = new Date().toISOString();
    const newProject: Project = { ...project, id, createdAt };

    const { error } = await supabase.from('projects').insert({
      id,
      company_id: cleanCompanyId(project.companyId),
      client_id: project.clientId,
      name: project.name,
      description: project.description,
      status: project.status,
      value: project.value,
      start_date: project.startDate,
      end_date: project.endDate,
      created_at: createdAt
    });
    if (error) console.warn("Supabase projects insert error:", error);

    return newProject;
  }

  async updateProject(project: Project): Promise<void> {
    const { error } = await supabase.from('projects').update({
      client_id: project.clientId,
      name: project.name,
      description: project.description,
      status: project.status,
      value: project.value,
      start_date: project.startDate,
      end_date: project.endDate
    }).eq('id', project.id);
    if (error) console.warn("Supabase projects update error:", error);
  }

  async deleteProject(companyId: string, projectId: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) console.warn("Supabase projects delete error:", error);
  }

  async fetchServices(companyId: string): Promise<Service[]> {
    const cleanId = cleanCompanyId(companyId);
    return dedupeRequest(`services:${cleanId}`, async () => {
      const { data, error } = await supabase.from('services').select('*').eq('company_id', cleanId);
      if (error) throw error;
      return (data || []).map(s => ({
        id: s.id,
        companyId: s.company_id,
        name: s.name,
        packageName: s.package_name || s.packageName || '',
        category: s.category,
        description: s.description,
        price: Number(s.price),
        directCost: s.direct_cost !== undefined && s.direct_cost !== null ? Number(s.direct_cost) : (s.directCost !== undefined && s.directCost !== null ? Number(s.directCost) : 0),
        indirectCost: s.indirect_cost !== undefined && s.indirect_cost !== null ? Number(s.indirect_cost) : (s.indirectCost !== undefined && s.indirectCost !== null ? Number(s.indirectCost) : 0)
      }));
    });
  }

  async createService(service: Omit<Service, 'id'>): Promise<Service> {
    invalidateRequestCache('services');
    const newId = generateId();
    const payload: any = {
      id: newId,
      company_id: cleanCompanyId(service.companyId),
      name: service.name,
      package_name: service.packageName || '',
      category: service.category,
      description: service.description,
      price: service.price,
      direct_cost: service.directCost ?? 0,
      indirect_cost: service.indirectCost ?? 0
    };

    const performInsert = async (currentPayload: any): Promise<any> => {
      const { data, error } = await supabase.from('services').insert(currentPayload).select().maybeSingle();
      if (error) {
        const problematicColumn = extractMissingColumnName(error.message || error.details || '');
        if (problematicColumn && problematicColumn in currentPayload) {
          console.warn(`[createService] Removing missing column '${problematicColumn}' and retrying...`);
          const { [problematicColumn]: _, ...newPayload } = currentPayload;
          return performInsert(newPayload);
        }
        throw error;
      }
      return data;
    };

    try {
      const data = await performInsert(payload);
      return {
        id: data?.id || newId,
        companyId: service.companyId,
        name: service.name,
        packageName: service.packageName || '',
        category: service.category,
        description: service.description,
        price: service.price,
        directCost: data?.direct_cost !== undefined && data?.direct_cost !== null ? Number(data.direct_cost) : Number(service.directCost || 0),
        indirectCost: data?.indirect_cost !== undefined && data?.indirect_cost !== null ? Number(data.indirect_cost) : Number(service.indirectCost || 0)
      };
    } catch (dbErr) {
      console.warn("createService failed, saving fallback:", dbErr);
      throw dbErr;
    }
  }

  async updateService(service: Service): Promise<void> {
    const updateData: any = {
      name: service.name,
      package_name: service.packageName || '',
      category: service.category,
      description: service.description,
      price: service.price,
      direct_cost: service.directCost ?? 0,
      indirect_cost: service.indirectCost ?? 0
    };

    const performUpdate = async (currentPayload: any): Promise<void> => {
      const { error } = await supabase.from('services').update(currentPayload).eq('id', service.id);
      if (error) {
        const problematicColumn = extractMissingColumnName(error.message || error.details || '');
        if (problematicColumn && problematicColumn in currentPayload) {
          console.warn(`[updateService] Removing missing column '${problematicColumn}' and retrying...`);
          const { [problematicColumn]: _, ...newPayload } = currentPayload;
          return performUpdate(newPayload);
        }
        throw error;
      }
    };

    await performUpdate(updateData);
  }

  async deleteService(serviceId: string): Promise<void> {
    try {
      await supabase.from('invoice_items').update({ service_id: null }).eq('service_id', serviceId);
    } catch (e) {
      console.warn("Disassociating service from invoice_items encountered warning:", e);
    }
    const { error } = await supabase.from('services').delete().eq('id', serviceId);
    if (error) throw error;
  }

  async deleteReceipt(invoiceId: string): Promise<void> {
    const { error } = await supabase.from('invoices').update({ is_receipt_sent: false }).eq('id', invoiceId);
    if (error) throw error;

    const companyId = localStorage.getItem('cravebiz_tenant') || '';
    if (companyId) {
      this.syncWorkspaceCounts(companyId).catch(err => console.warn("Deferred count sync failed:", err));
    }
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
        const { error: delError } = await supabase.from('bank_accounts').delete().eq('company_id', id);
        if (delError) console.warn("Delete bank_accounts warning:", delError);

        if (details.bankAccounts.length > 0) {
            const accounts = details.bankAccounts.map(ba => ({
                id: safeRandomUUID(),
                company_id: id,
                bank_name: ba.bankName,
                account_name: ba.accountName,
                account_number: String(ba.accountNumber || '').trim()
            }));
            const { error: bankError } = await supabase.from('bank_accounts').insert(accounts);
            if (bankError) {
                console.error("Failed to insert bank accounts into Supabase:", bankError);
                throw bankError;
            }
        }
    }
  }

  async syncDocumentToTables(companyId: string, docId: string, doc: GeneratedDocument, createdAt?: string): Promise<void> {
    const contentPayload = {
      blocks: doc.blocks,
      signatures: doc.signatures || [],
      originalFileBase64: doc.originalFileBase64,
      originalFileType: doc.originalFileType,
      originalFileName: doc.originalFileName,
      ownerId: doc.ownerId
    };

    // 1. Write to generated_documents (standard table)
    try {
      await supabase.from('generated_documents').upsert({
        id: docId,
        company_id: cleanCompanyId(companyId),
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
        company_id: cleanCompanyId(companyId),
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
    // DocGenerator module temporarily disabled
    return [];
  }

  async saveGeneratedDoc(companyId: string, doc: GeneratedDocument): Promise<StoredGeneratedDoc> {
    const docId = generateId();
    
    // Proactively ensure currently logged-in user is mapped in company_members to satisfy membership RLS policy
    try {
      const user = await safeGetUser();
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
    
    return {
      id: docId,
      companyId: companyId,
      createdAt: createdAt,
      documentType: doc.documentType,
      blocks: doc.blocks,
      signatures: doc.signatures || [],
      ownerId: doc.ownerId
    };
  }

  async updateGeneratedDoc(companyId: string, id: string, doc: GeneratedDocument): Promise<StoredGeneratedDoc> {
    const createdAt = new Date().toISOString();
    
    // Sync to all database tables & server file system copy
    await this.syncDocumentToTables(companyId, id, doc, createdAt);
    
    return {
      id: id,
      companyId: companyId,
      createdAt: createdAt,
      documentType: doc.documentType,
      blocks: doc.blocks,
      signatures: doc.signatures || [],
      ownerId: doc.ownerId
    };
  }

  async deleteGeneratedDoc(companyId: string, id: string): Promise<void> {
    try {
      const { error } = await supabase.from('generated_documents').delete().eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.warn("Supabase delete failed for generated_documents:", e);
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

  async uploadDocSignifyFile(fileName: string, base64Data: string, fileType: string, companyId?: string): Promise<string> {
    try {
      // 1. Try uploading to Supabase Storage first if configured
      try {
        // Native, high-performance base64 to Blob translation to prevent UI thread freezing on large files
        const res = await fetch(base64Data);
        const blob = await res.blob();
        const filePath = `${safeRandomUUID()}_${fileName}`;
        
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
        headers: await this.getAuthHeaders(companyId),
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

  async parseDocumentFile(fileName: string, base64Data: string, fileType: string, companyId?: string): Promise<{ success: boolean; extractedText: string; blocks: any[] }> {
    try {
      const response = await fetch("/api/signify/parse-document", {
        method: "POST",
        headers: await this.getAuthHeaders(companyId),
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
    contentJson?: any,
    companyId?: string
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
          id: sig.id || safeRandomUUID(),
          document_id: docId,
          name: sig.name,
          email: sig.email,
          role: sig.role,
          token: safeRandomUUID().replace(/-/g, ''),
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
            headers: await this.getAuthHeaders(companyId),
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
        headers: await this.getAuthHeaders(companyId),
        body: JSON.stringify({ id: docId, title, originalFileUrl, ownerId, fileType, fileName, signatories, contentJson })
      });
      if (!response.ok) {
        let serverErr = `Failed to register document on local server (HTTP ${response.status})`;
        try {
          const responseClone = response.clone();
          const errData = await responseClone.json();
          if (errData && errData.error) {
            serverErr += `: ${errData.error}`;
          } else if (errData && errData.message) {
            serverErr += `: ${errData.message}`;
          }
        } catch (e) {
          try {
            const errTxt = await response.text();
            if (errTxt) {
              serverErr += `: ${errTxt.slice(0, 150)}`;
            }
          } catch (e2) {}
        }
        throw new Error(serverErr);
      }
      const data = await response.json();
      return { document: data.document, signatories: data.signatories };
    } catch (err: any) {
      console.error("createDocSignifyDocument error:", err);
      throw err;
    }
  }

  async getDocSignifyDocument(docId: string, companyId?: string): Promise<{ document: DbDocument; signatories: DbDocumentSignatory[]; signatures: DbDocumentSignature[] }> {
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
        headers: await this.getAuthHeaders(companyId)
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
          id: safeRandomUUID(),
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

  async getDocSignifyInsights(documentId: string, textContent: string, companyId?: string): Promise<any> {
    try {
      const response = await fetch("/api/signify/document-insights", {
        method: "POST",
        headers: await this.getAuthHeaders(companyId),
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

  async getAllDocSignifyDocuments(companyId?: string): Promise<{ document: DbDocument; signatories: DbDocumentSignatory[]; signaturesCount: number }[]> {
    try {
      const response = await fetch('/api/signify/documents', {
        headers: await this.getAuthHeaders(companyId)
      });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.documents || [];
    } catch (err) {
      console.error("getAllDocSignifyDocuments error:", err);
      return [];
    }
  }

  async deleteDocSignifyDocument(docId: string, companyId?: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/signify/documents/${docId}`, {
        method: 'DELETE',
        headers: await this.getAuthHeaders(companyId)
      });
      const data = await response.json();
      return !!data.success;
    } catch (err) {
      console.error("deleteDocSignifyDocument error:", err);
      return false;
    }
  }

  async markDocSignifyViewed(token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/signify/mark-viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      return !!data.success;
    } catch (err) {
      return false;
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
      let aiModeEnabled = 'true';
      if (typeof window !== 'undefined' && (window as any).cravebiz_get_sub_info) {
        try {
          const sub = (window as any).cravebiz_get_sub_info(companyId);
          if (sub && typeof sub.aiModeEnabled === 'boolean') {
            aiModeEnabled = sub.aiModeEnabled ? 'true' : 'false';
          }
        } catch (e) {
          // ignore
        }
      }
      headers['X-AI-Mode-Enabled'] = aiModeEnabled;
    }
    try {
      const session = await safeGetSession();
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
        company_id: cleanCompanyId(log.companyId),
        user_id: log.userId,
        user_name: log.userName,
        action: log.action,
        resource: log.resource,
        details: log.details,
        created_at: createdAt
      });
      if (error) console.warn("Supabase audit_logs insert warning:", error);
    } catch (dbErr) {
      console.warn("Supabase audit_logs insert failed:", dbErr);
    }

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
        .eq('company_id', cleanCompanyId(companyId))
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
      console.warn("Supabase audit_logs fetch failed:", dbErr);
    }

    return [];
  }

  async safeGetUser() {
    return safeGetUser();
  }

  async safeGetSession() {
    return safeGetSession();
  }

  async sendReceiptEmailDirect(payload: {
    recipientEmail: string;
    recipientName: string;
    recipientCompany?: string;
    invoiceNumber: string;
    issueDate?: string;
    paymentDate?: string;
    totalAmount: number;
    amountPaid?: number;
    currencySymbol?: string;
    items: Array<{ name: string; description?: string; quantity: number; price: number }>;
    company: { name: string; email?: string; phone?: string; address?: string; logoUrl?: string; taxId?: string };
    paymentMethod?: string;
    paymentNotes?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/send-receipt-email', {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to dispatch email directly.');
      }
      return await response.json();
    } catch (err: any) {
      console.error("sendReceiptEmailDirect error:", err);
      throw err;
    }
  }

  async sendInvoiceEmailDirect(payload: {
    recipientEmail: string;
    recipientName: string;
    recipientCompany?: string;
    invoiceNumber: string;
    issueDate?: string;
    dueDate?: string;
    totalAmount: number;
    amountPaid?: number;
    currencySymbol?: string;
    items: Array<{ name: string; description?: string; quantity: number; price: number }>;
    company: { name: string; email?: string; phone?: string; address?: string; logoUrl?: string; bankAccounts?: any[] };
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/send-invoice-email', {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to dispatch invoice email directly.');
      }
      return await response.json();
    } catch (err: any) {
      console.error("sendInvoiceEmailDirect error:", err);
      throw err;
    }
  }

  async sendUserRegistrationEmail(payload: {
    recipientEmail: string;
    recipientName?: string;
    companyName?: string;
    loginUrl?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/auth/send-registration-welcome', {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send user registration welcome email via AWS SES.');
      }
      return await response.json();
    } catch (err: any) {
      console.error("sendUserRegistrationEmail error:", err);
      throw err;
    }
  }

  async sendAccountVerificationEmail(payload: {
    recipientEmail: string;
    recipientName?: string;
    verificationCode: string;
    verificationUrl?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send account verification email via AWS SES.');
      }
      return await response.json();
    } catch (err: any) {
      console.error("sendAccountVerificationEmail error:", err);
      throw err;
    }
  }

  async sendPasswordResetEmail(payload: {
    recipientEmail: string;
    resetToken?: string;
    resetUrl: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/auth/send-password-reset', {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send password reset email via AWS SES.');
      }
      return await response.json();
    } catch (err: any) {
      console.error("sendPasswordResetEmail error:", err);
      throw err;
    }
  }

  async sendDocumentNotificationEmail(payload: {
    recipientEmail: string;
    recipientName?: string;
    documentTitle: string;
    notificationMessage: string;
    actionUrl?: string;
    senderName?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch('/api/notifications/send-document-notification', {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send document notification email via AWS SES.');
      }
      return await response.json();
    } catch (err: any) {
      console.error("sendDocumentNotificationEmail error:", err);
      throw err;
    }
  }

  async getInvoiceUsage(companyId?: string, tier: string = 'Free') {
    try {
      const headers = await this.getAuthHeaders(companyId);
      const res = await fetch(`/api/usage/invoice?tier=${encodeURIComponent(tier)}`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("getInvoiceUsage API call failed, querying Supabase directly:", e);
    }

    const targetCompId = companyId || (typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : '') || '';
    const maxQuota = TIER_LIMITS[tier as SubscriptionTier]?.maxInvoices ?? 10;

    try {
      const { count, error } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', targetCompId);

      const createdCount = (!error && typeof count === 'number') ? count : 0;
      return {
        totalQuota: maxQuota,
        remainingCount: maxQuota === 999999 ? 999999 : Math.max(0, maxQuota - createdCount),
        createdCount,
        resetDate: new Date(Date.now() + 30 * 86400000).toISOString()
      };
    } catch (dbErr) {
      console.warn("Direct Supabase query failed in getInvoiceUsage:", dbErr);
      return {
        totalQuota: maxQuota,
        remainingCount: maxQuota === 999999 ? 999999 : maxQuota,
        createdCount: 0,
        resetDate: new Date(Date.now() + 30 * 86400000).toISOString()
      };
    }
  }

  async deductInvoiceQuota(companyId?: string, tier: string = 'Free') {
    const headers = await this.getAuthHeaders(companyId);
    const res = await fetch('/api/usage/invoice/deduct', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tier })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Invoice quota exhausted');
    }
    return await res.json();
  }

  async getReceiptUsage(companyId?: string, tier: string = 'Free') {
    try {
      const headers = await this.getAuthHeaders(companyId);
      const res = await fetch(`/api/usage/receipt?tier=${encodeURIComponent(tier)}`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("getReceiptUsage API call failed, querying Supabase directly:", e);
    }

    const targetCompId = companyId || (typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : '') || '';
    const maxQuota = TIER_LIMITS[tier as SubscriptionTier]?.maxReceipts ?? 10;

    try {
      const { count, error } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', targetCompId)
        .eq('is_receipt_sent', true);

      const createdCount = (!error && typeof count === 'number') ? count : 0;
      return {
        totalQuota: maxQuota,
        remainingCount: maxQuota === 999999 ? 999999 : Math.max(0, maxQuota - createdCount),
        createdCount,
        resetDate: new Date(Date.now() + 30 * 86400000).toISOString()
      };
    } catch (dbErr) {
      console.warn("Direct Supabase query failed in getReceiptUsage:", dbErr);
      return {
        totalQuota: maxQuota,
        remainingCount: maxQuota === 999999 ? 999999 : maxQuota,
        createdCount: 0,
        resetDate: new Date(Date.now() + 30 * 86400000).toISOString()
      };
    }
  }

  async fetchInAppNotifications(params?: { tenantId?: string; recipientEmail?: string; unreadOnly?: boolean }): Promise<InAppNotification[]> {
    try {
      const headers = await this.getAuthHeaders(params?.tenantId);
      const query = new URLSearchParams();
      if (params?.tenantId) query.append('tenantId', params.tenantId);
      if (params?.recipientEmail) query.append('recipientEmail', params.recipientEmail);
      if (params?.unreadOnly) query.append('unreadOnly', 'true');

      const res = await fetch(`/api/notifications?${query.toString()}`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("fetchInAppNotifications backend fetch failed:", e);
    }
    return getLocalNotifications();
  }

  async createInAppNotification(payload: {
    tenantId?: string;
    recipientEmail?: string;
    recipientUserId?: string;
    title: string;
    message: string;
    category: NotificationCategory;
    type?: 'info' | 'success' | 'warning' | 'error';
    actionUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<InAppNotification> {
    // Create locally first for immediate responsiveness
    const localNotif = createInAppNotificationClient(payload);
    try {
      const headers = await this.getAuthHeaders(payload.tenantId);
      fetch('/api/notifications/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }).catch(e => console.warn("Failed to persist notification to server:", e));
    } catch (e) {
      console.warn("createInAppNotification network error:", e);
    }
    return localNotif;
  }

  async markInAppNotificationRead(id?: string, markAll: boolean = false): Promise<InAppNotification[]> {
    const updated = markNotificationReadClient(id, markAll);
    try {
      const headers = await this.getAuthHeaders();
      fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, markAll })
      }).catch(e => console.warn("Failed to update notification status on server:", e));
    } catch (e) {
      console.warn("markInAppNotificationRead error:", e);
    }
    return updated;
  }

  async clearInAppNotifications(): Promise<InAppNotification[]> {
    const updated = clearLocalNotificationsClient();
    try {
      const headers = await this.getAuthHeaders();
      fetch('/api/notifications/clear', {
        method: 'POST',
        headers
      }).catch(e => console.warn("Failed to clear notifications on server:", e));
    } catch (e) {
      console.warn("clearInAppNotifications error:", e);
    }
    return updated;
  }

  async deleteInAppNotification(id: string): Promise<InAppNotification[]> {
    const updated = removeNotificationByIdClient(id);
    try {
      const headers = await this.getAuthHeaders();
      fetch('/api/notifications/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id })
      }).catch(e => console.warn("Failed to delete notification on server:", e));
    } catch (e) {
      console.warn("deleteInAppNotification error:", e);
    }
    return updated;
  }

  async sendSystemAnnouncement(title: string, message: string, category: NotificationCategory = 'announcement'): Promise<{ success: boolean; count?: number }> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch('/api/notifications/announcement', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, message, category })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("sendSystemAnnouncement error:", e);
    }
    // Fallback local broadcast
    createInAppNotificationClient({
      title,
      message,
      category,
      type: 'info'
    });
    return { success: true, count: 1 };
  }

  async deductReceiptQuota(companyId?: string, tier: string = 'Free') {
    const headers = await this.getAuthHeaders(companyId);
    const res = await fetch('/api/usage/receipt/deduct', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tier })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Receipt quota exhausted');
    }
    return await res.json();
  }
}
export const api = CraveBizApi.getInstance();
export const apiService = api;

