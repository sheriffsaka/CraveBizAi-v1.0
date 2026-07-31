import { supabase, api } from '../lib/api';

export type SubscriptionTier = 'Free' | 'Starter' | 'Growth' | 'Business' | 'Enterprise';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  aiUnits: number;
  maxInvoices: number;
  maxReceipts: number;
  maxUsers: number;
  aiModeEnabled: boolean;
  invoiceCount?: number;
  receiptCount?: number;
}

// Map tiers to limits
export const TIER_LIMITS: Record<SubscriptionTier, { maxInvoices: number; maxReceipts: number; maxAiUnits: number; maxUsers: number; aiAvailable: boolean; price: string; monthlyPriceVal: number; annualPriceVal: number; inactive?: boolean; description?: string }> = {
  Free: { 
    maxInvoices: 10, 
    maxReceipts: 10, 
    maxAiUnits: 5, 
    maxUsers: 1, 
    aiAvailable: true, 
    price: "₦0.00",
    monthlyPriceVal: 0,
    annualPriceVal: 0,
    description: "Instead of disabling AI completely, get 5 free AI Credits every month to experience all automation features."
  },
  Starter: { 
    maxInvoices: 100, 
    maxReceipts: 100, 
    maxAiUnits: 100, 
    maxUsers: 2, 
    aiAvailable: true, 
    price: "₦4,500.00",
    monthlyPriceVal: 4500,
    annualPriceVal: 45000,
    description: "Highly accessible, perfect for small shops, freelancers, POS operators, tailors, salons, and local restaurants."
  },
  Growth: { 
    maxInvoices: 999999, 
    maxReceipts: 999999, 
    maxAiUnits: 300, 
    maxUsers: 5, 
    aiAvailable: true, 
    price: "₦9,500.00",
    monthlyPriceVal: 9500,
    annualPriceVal: 95000,
    description: "Our flagship plan. Best for SMEs looking to optimize operations, automate workflow, and leverage robust CRM features."
  },
  Business: { 
    maxInvoices: 999999, 
    maxReceipts: 999999, 
    maxAiUnits: 800, 
    maxUsers: 15, 
    aiAvailable: true, 
    price: "₦19,500.00",
    monthlyPriceVal: 19500,
    annualPriceVal: 195000,
    inactive: true,
    description: "Designed for established businesses with multiple staff, inventory, accounting, CRM, and regular AI usage. (Temporarily Inactive)"
  },
  Enterprise: { 
    maxInvoices: 999999, 
    maxReceipts: 999999, 
    maxAiUnits: 2500, 
    maxUsers: 999999, 
    aiAvailable: true, 
    price: "₦49,500.00",
    monthlyPriceVal: 49500,
    annualPriceVal: 495000,
    description: "Ideal for schools, hospitals, wholesalers, manufacturing firms, and larger organizations needing dedicated, custom scale."
  }
};

// Initialize TIER_LIMITS from cached values if available in localStorage (immediate sync)
if (typeof window !== 'undefined') {
  try {
    const cached = localStorage.getItem('cravebiz_custom_tier_limits');
    if (cached) {
      const parsed = JSON.parse(cached);
      Object.keys(parsed).forEach((tierKey) => {
        const tier = tierKey as SubscriptionTier;
        if (parsed[tier]) {
          TIER_LIMITS[tier] = {
            ...TIER_LIMITS[tier],
            ...parsed[tier]
          };
        }
      });
    }
  } catch (err) {
    console.warn("Failed to load cached TIER_LIMITS:", err);
  }
}

/**
 * Helper to get deterministic valid UUID for settings documents
 */
export const getSettingsDocId = (companyId: string): string => {
  if (companyId === 'cravebiz-inc' || !companyId) {
    return '00000000-0000-0000-0000-000000000000';
  }
  let baseId = companyId;
  if (companyId.startsWith("ws-personal-")) {
    baseId = companyId.replace("ws-personal-", "");
  } else if (companyId.startsWith("ws-legal-")) {
    baseId = companyId.replace("ws-legal-", "");
  } else if (companyId.startsWith("ws-sales-")) {
    baseId = companyId.replace("ws-sales-", "");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(baseId)) {
    return '11111111-1111-1111-1111-111111111111';
  }
  return baseId;
};

export async function syncActiveUserUsageToDb(companyId: string): Promise<void> {
  try {
    const userId = localStorage.getItem('cravebiz_user_id') || '';
    if (!userId) return;
    
    const invoiceCount = parseInt(localStorage.getItem(`cravebiz_invoice_count_${companyId}`) || '0', 10);
    const receiptCount = parseInt(localStorage.getItem(`cravebiz_receipt_count_${companyId}`) || '0', 10);
    const sub = getSubscriptionInfo(companyId);
    
    const payload = {
      invoicesCreated: invoiceCount,
      receiptsCreated: receiptCount,
      remainingAiCredits: sub.aiUnits
    };
    
    // Save to user usage record in generated_documents
    const { error } = await supabase.from('generated_documents').upsert({
      id: userId,
      company_id: companyId === 'cravebiz-inc' ? null : companyId,
      document_type: 'cravebiz_user_usage',
      content: payload
    });
    
    if (error) {
      console.warn("Direct Supabase save user usage failed:", error);
    }
  } catch (err) {
    console.warn("syncActiveUserUsageToDb failed:", err);
  }
}

/**
 * Saves subscription details to database for easy cloud retrieval
 */
export async function saveSubscriptionInfoToDb(companyId: string): Promise<void> {
  if (!companyId) return;
  const docId = getSettingsDocId(companyId);
  const sub = getSubscriptionInfo(companyId);

  // Collect all user-level AI permissions from local storage for this company
  const memberPermissions: Record<string, boolean> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`cravebiz_member_ai_allowed_${companyId}_`)) {
        const email = key.replace(`cravebiz_member_ai_allowed_${companyId}_`, '');
        memberPermissions[email] = localStorage.getItem(key) === 'true';
      }
    }
  } catch (e) {
    console.warn("Could not read localstorage permissions:", e);
  }

  // Collect invited member info to sync to cloud
  const invitedMembers: Record<string, { email: string; name: string }> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`cravebiz_invited_member_info_${companyId}_`)) {
        const userId = key.replace(`cravebiz_invited_member_info_${companyId}_`, '');
        const val = localStorage.getItem(key);
        if (val) {
          invitedMembers[userId] = JSON.parse(val);
        }
      }
    }
  } catch (e) {
    console.warn("Could not read localstorage invited members:", e);
  }

  const invoiceCount = parseInt(localStorage.getItem(`cravebiz_invoice_count_${companyId}`) || '0', 10);
  const receiptCount = parseInt(localStorage.getItem(`cravebiz_receipt_count_${companyId}`) || '0', 10);
  const lastFreeUnitsReset = localStorage.getItem(`cravebiz_last_free_units_reset_${companyId}`) || '';
  const purchasedAiUnits = parseInt(localStorage.getItem(`cravebiz_purchased_units_${companyId}`) || '0', 10);

  const storedUnits = localStorage.getItem(`cravebiz_units_${companyId}`);
  const aiUnitsToSave = storedUnits !== null ? parseInt(storedUnits, 10) : undefined;

  const payload: any = {
    tier: sub.tier,
    aiModeEnabled: sub.aiModeEnabled,
    memberPermissions,
    invitedMembers,
    invoiceCount,
    receiptCount,
    lastFreeUnitsReset,
    purchasedAiUnits
  };

  if (aiUnitsToSave !== undefined) {
    payload.aiUnits = aiUnitsToSave;
  }

  try {
    const headers = await api.getAuthHeaders(companyId);
    const response = await fetch('/api/subscription/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    console.log("Successfully synced subscription settings via backend proxy.");
  } catch (err) {
    console.warn("Could not sync subscription to server via proxy, trying direct Supabase fallback:", err);
    try {
      const { error } = await supabase.from('generated_documents').upsert({
        id: docId,
        company_id: companyId === 'cravebiz-inc' ? null : docId,
        document_type: 'cravebiz_workspace_settings',
        content: payload
      });
      if (error) {
        console.warn("Direct Supabase save subscription fallback failed:", error);
      }
    } catch (fallbackErr) {
      console.warn("Direct Supabase exception:", fallbackErr);
    }
  }

  // Sync user-level usage record immediately
  syncActiveUserUsageToDb(companyId).catch(err => console.warn("User usage sync exception:", err));
}

/**
 * Ensures that free credits are reset monthly
 */
export function checkAndEnforceMonthlyCreditReset(companyId: string, currentContent?: any): void {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const lastResetKey = `cravebiz_last_free_units_reset_${companyId}`;
  const lastReset = localStorage.getItem(lastResetKey) || (currentContent?.lastFreeUnitsReset) || '';
  
  // Only trigger reset if lastReset was previously set AND is from an old month
  if (lastReset && lastReset !== currentMonthStr) {
    const savedTier = localStorage.getItem(`cravebiz_tier_${companyId}`) || (currentContent?.tier) || 'Free';
    const limits = TIER_LIMITS[savedTier as SubscriptionTier] || TIER_LIMITS.Free;
    
    const standardCredits = limits.maxAiUnits;
    const purchasedKey = `cravebiz_purchased_units_${companyId}`;
    const purchasedCredits = parseInt(localStorage.getItem(purchasedKey) || (currentContent?.purchasedAiUnits?.toString()) || '0', 10);
    
    const newTotalCredits = standardCredits + purchasedCredits;
    
    localStorage.setItem(`cravebiz_units_${companyId}`, newTotalCredits.toString());
    localStorage.setItem(lastResetKey, currentMonthStr);
    
    // Call centralized reset on Supabase DB
    api.getAuthHeaders(companyId).then(headers => {
      fetch('/api/ai/credits/reset', {
        method: 'POST',
        headers,
        body: JSON.stringify({ totalCredits: newTotalCredits, plan: savedTier })
      }).catch(err => console.warn("Failed to reset credits in Supabase DB:", err));
    }).catch(err => console.warn("Auth header error during monthly reset:", err));

    console.log(`[Monthly Credit Reset] Reset standard credits for workspace ${companyId} to ${standardCredits}. Total units: ${newTotalCredits}`);
    saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to save reset settings:", err));
  } else if (!lastReset) {
    localStorage.setItem(lastResetKey, currentMonthStr);
  }
}

/**
 * Synchronizes subscription details from Supabase to local storage
 */
export async function syncSubscriptionInfoFromDb(companyId: string): Promise<void> {
  if (!companyId) return;
  const docId = getSettingsDocId(companyId);

  // 1. Fetch canonical AI Credits balance from Supabase database via backend API
  try {
    const headers = await api.getAuthHeaders(companyId);
    const creditsRes = await fetch('/api/ai/credits', { headers });
    if (creditsRes.ok) {
      const creditsData = await creditsRes.json();
      if (typeof creditsData.remainingCredits === 'number') {
        localStorage.setItem(`cravebiz_units_${companyId}`, creditsData.remainingCredits.toString());
        if (creditsData.subscriptionPlan) {
          localStorage.setItem(`cravebiz_tier_${companyId}`, creditsData.subscriptionPlan);
        }
      }
    }
  } catch (creditErr) {
    console.warn("Could not sync canonical AI credits from Supabase DB:", creditErr);
  }

  // 2. Retrieve the latest invoice and receipt counts directly from Supabase
  try {
    const { count: dbInvoiceCount, error: invError } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);
    
    if (!invError && dbInvoiceCount !== null) {
      localStorage.setItem(`cravebiz_invoice_count_${companyId}`, dbInvoiceCount.toString());
    }

    const { count: dbReceiptCount, error: recError } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_receipt_sent', true);
    
    if (!recError && dbReceiptCount !== null) {
      localStorage.setItem(`cravebiz_receipt_count_${companyId}`, dbReceiptCount.toString());
    }
  } catch (err) {
    console.warn("Could not sync live counts from DB:", err);
  }

  // 3. Fetch workspace settings
  try {
    const headers = await api.getAuthHeaders(companyId);
    const response = await fetch('/api/subscription/settings', {
      headers
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const resData = await response.json();
    const content = resData?.content;

    if (content) {
      if (content.tier) {
        localStorage.setItem(`cravebiz_tier_${companyId}`, content.tier);
      }
      if (content.aiUnits !== undefined && !localStorage.getItem(`cravebiz_units_${companyId}`)) {
        localStorage.setItem(`cravebiz_units_${companyId}`, content.aiUnits.toString());
      }
      if (content.aiModeEnabled !== undefined) {
        localStorage.setItem(`cravebiz_aimode_${companyId}`, content.aiModeEnabled.toString());
      }
      if (content.lastFreeUnitsReset) {
        localStorage.setItem(`cravebiz_last_free_units_reset_${companyId}`, content.lastFreeUnitsReset);
      }
      if (content.purchasedAiUnits !== undefined) {
        localStorage.setItem(`cravebiz_purchased_units_${companyId}`, content.purchasedAiUnits.toString());
      }
      if (content.memberPermissions) {
        Object.entries(content.memberPermissions).forEach(([email, allowed]) => {
          localStorage.setItem(`cravebiz_member_ai_allowed_${companyId}_${email}`, String(allowed));
        });
      }
      if (content.invitedMembers) {
        Object.entries(content.invitedMembers).forEach(([userId, info]: [string, any]) => {
          localStorage.setItem(`cravebiz_invited_member_info_${companyId}_${userId}`, JSON.stringify(info));
        });
      }

      checkAndEnforceMonthlyCreditReset(companyId, content);

      window.dispatchEvent(new Event('cravebiz_subscription_change'));
      return;
    }
  } catch (err) {
    console.warn("Could not sync subscription from backend proxy, trying direct Supabase fallback:", err);
  }

  // Direct Supabase query as fallback
  try {
    const { data, error } = await supabase
      .from('generated_documents')
      .select('content')
      .eq('id', docId)
      .maybeSingle();

    if (error) {
      console.warn("Supabase direct query fallback error:", error);
      return;
    }

    if (data && data.content) {
      const content = data.content as any;
      if (content.tier) {
        localStorage.setItem(`cravebiz_tier_${companyId}`, content.tier);
      }
      if (content.aiUnits !== undefined) {
        localStorage.setItem(`cravebiz_units_${companyId}`, content.aiUnits.toString());
      }
      if (content.aiModeEnabled !== undefined) {
        localStorage.setItem(`cravebiz_aimode_${companyId}`, content.aiModeEnabled.toString());
      }
      if (content.lastFreeUnitsReset) {
        localStorage.setItem(`cravebiz_last_free_units_reset_${companyId}`, content.lastFreeUnitsReset);
      }
      if (content.purchasedAiUnits !== undefined) {
        localStorage.setItem(`cravebiz_purchased_units_${companyId}`, content.purchasedAiUnits.toString());
      }
      if (content.memberPermissions) {
        Object.entries(content.memberPermissions).forEach(([email, allowed]) => {
          localStorage.setItem(`cravebiz_member_ai_allowed_${companyId}_${email}`, String(allowed));
        });
      }
      if (content.invitedMembers) {
        Object.entries(content.invitedMembers).forEach(([userId, info]: [string, any]) => {
          localStorage.setItem(`cravebiz_invited_member_info_${companyId}_${userId}`, JSON.stringify(info));
        });
      }

      // Check and enforce monthly reset
      checkAndEnforceMonthlyCreditReset(companyId, content);

      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    }
  } catch (err) {
    console.warn("Direct Supabase query exception:", err);
  }
}

/**
 * Increments the invoice count on the DB and deducts from user_invoice_usage quota
 */
export async function incrementInvoiceCount(companyId: string): Promise<void> {
  if (!companyId) return;
  const key = `cravebiz_invoice_count_${companyId}`;
  const currentCount = parseInt(localStorage.getItem(key) || '0', 10);
  const newCount = currentCount + 1;
  localStorage.setItem(key, newCount.toString());
  
  // Call backend API to deduct 1 invoice from user_invoice_usage table in Supabase
  try {
    const sub = getSubscriptionInfo(companyId);
    await api.deductInvoiceQuota(companyId, sub.tier);
  } catch (err) {
    console.warn("Failed to deduct invoice quota on backend API:", err);
  }

  // Save in workspace settings payload
  await saveSubscriptionInfoToDb(companyId);
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Increments the receipt count on the DB and deducts from user_receipt_usage quota
 */
export async function incrementReceiptCount(companyId: string): Promise<void> {
  if (!companyId) return;
  const key = `cravebiz_receipt_count_${companyId}`;
  const currentCount = parseInt(localStorage.getItem(key) || '0', 10);
  const newCount = currentCount + 1;
  localStorage.setItem(key, newCount.toString());
  
  // Call backend API to deduct 1 receipt from user_receipt_usage table in Supabase
  try {
    const sub = getSubscriptionInfo(companyId);
    await api.deductReceiptQuota(companyId, sub.tier);
  } catch (err) {
    console.warn("Failed to deduct receipt quota on backend API:", err);
  }

  // Save in workspace settings payload
  await saveSubscriptionInfoToDb(companyId);
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Check if workspace has remaining invoice quota
 */
export async function checkCanCreateInvoice(companyId: string): Promise<{ canCreate: boolean; remaining: number; total: number; resetDate: string; reason?: string }> {
  try {
    const sub = getSubscriptionInfo(companyId);
    const usage = await api.getInvoiceUsage(companyId, sub.tier);
    if (usage && typeof usage.remainingCount === 'number') {
      const canCreate = usage.remainingCount > 0;
      return {
        canCreate,
        remaining: usage.remainingCount,
        total: usage.totalQuota,
        resetDate: usage.resetDate || new Date(Date.now() + 30 * 86400000).toISOString(),
        reason: canCreate ? undefined : `You have reached your invoice creation quota (${usage.createdCount}/${usage.totalQuota} generated). Please upgrade your plan.`
      };
    }
  } catch (e) {
    console.warn("checkCanCreateInvoice error:", e);
  }
  const sub = getSubscriptionInfo(companyId);
  const current = parseInt(localStorage.getItem(`cravebiz_invoice_count_${companyId}`) || '0', 10);
  const rem = Math.max(0, sub.maxInvoices - current);
  return {
    canCreate: rem > 0,
    remaining: rem,
    total: sub.maxInvoices,
    resetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    reason: rem > 0 ? undefined : `Monthly invoice limit reached (${current}/${sub.maxInvoices}).`
  };
}

/**
 * Check if workspace has remaining receipt quota
 */
export async function checkCanCreateReceipt(companyId: string): Promise<{ canCreate: boolean; remaining: number; total: number; resetDate: string; reason?: string }> {
  try {
    const sub = getSubscriptionInfo(companyId);
    const usage = await api.getReceiptUsage(companyId, sub.tier);
    if (usage && typeof usage.remainingCount === 'number') {
      const canCreate = usage.remainingCount > 0;
      return {
        canCreate,
        remaining: usage.remainingCount,
        total: usage.totalQuota,
        resetDate: usage.resetDate || new Date(Date.now() + 30 * 86400000).toISOString(),
        reason: canCreate ? undefined : `You have reached your receipt creation quota (${usage.createdCount}/${usage.totalQuota} issued). Please upgrade your plan.`
      };
    }
  } catch (e) {
    console.warn("checkCanCreateReceipt error:", e);
  }
  const sub = getSubscriptionInfo(companyId);
  const current = parseInt(localStorage.getItem(`cravebiz_receipt_count_${companyId}`) || '0', 10);
  const rem = Math.max(0, sub.maxReceipts - current);
  return {
    canCreate: rem > 0,
    remaining: rem,
    total: sub.maxReceipts,
    resetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    reason: rem > 0 ? undefined : `Monthly receipt limit reached (${current}/${sub.maxReceipts}).`
  };
}

/**
 * Saves customizable TIER_LIMITS settings to Supabase
 */
export async function saveGlobalPlanSettings(limits: typeof TIER_LIMITS): Promise<void> {
  try {
    const headers = await api.getAuthHeaders('cravebiz-inc');
    const response = await fetch('/api/admin/global-pricing-settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(limits)
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }
    console.log("Successfully saved global plan settings via backend proxy.");
  } catch (err) {
    console.warn("Could not save global plans via backend proxy, saving to local cache fallback:", err);
    localStorage.setItem('cravebiz_custom_tier_limits', JSON.stringify(limits));
    try {
      const rowsToInsert = Object.keys(limits).map((tierKey) => {
        const item = limits[tierKey as SubscriptionTier];
        return {
          tier: tierKey,
          price: item.price,
          max_ai_units: item.maxAiUnits,
          max_invoices: item.maxInvoices,
          max_receipts: item.maxReceipts,
          max_users: item.maxUsers,
          ai_available: item.aiAvailable !== false,
          inactive: !!item.inactive,
          description: item.description || ""
        };
      });
      await supabase.from('cravebiz_global_pricing_settings').upsert(rowsToInsert);
    } catch (dbErr) {
      console.warn("Direct Supabase table fallback exception:", dbErr);
    }
  }
}

/**
 * Syncs customizable TIER_LIMITS from Supabase / Backend Pricing Service
 */
export async function syncGlobalPlanSettings(): Promise<void> {
  try {
    const companyId = localStorage.getItem('cravebiz_tenant') || 'cravebiz-inc';
    const headers = await api.getAuthHeaders(companyId);
    const response = await fetch('/api/admin/global-pricing-settings', {
      headers
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.json();

    if (content) {
      Object.keys(content).forEach((tierKey) => {
        const tier = tierKey as SubscriptionTier;
        if (content[tier]) {
          TIER_LIMITS[tier] = {
            ...TIER_LIMITS[tier],
            ...content[tier]
          };
        }
      });
      localStorage.setItem('cravebiz_custom_tier_limits', JSON.stringify(TIER_LIMITS));
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    } else {
      const cached = localStorage.getItem('cravebiz_custom_tier_limits');
      if (cached) {
        const parsed = JSON.parse(cached);
        Object.keys(parsed).forEach((tierKey) => {
          const tier = tierKey as SubscriptionTier;
          TIER_LIMITS[tier] = {
            ...TIER_LIMITS[tier],
            ...parsed[tier]
          };
        });
      }
    }
  } catch (err) {
    console.warn("Could not sync global plans from backend proxy, loading cached local pricing:", err);
    const cached = localStorage.getItem('cravebiz_custom_tier_limits');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        Object.keys(parsed).forEach((tierKey) => {
          const tier = tierKey as SubscriptionTier;
          TIER_LIMITS[tier] = {
            ...TIER_LIMITS[tier],
            ...parsed[tier]
          };
        });
      } catch (e) {
        // ignore
      }
    }
  }
}

// Track which workspaces have had their AI mode initialized during this application session.
// This ensures they default to OFF on initial app loads/reloads as requested,
// but do not turn off on their own during the session.
const globalObj = typeof window !== 'undefined' ? (window as any) : {};

/**
 * Helper to get subscription details for a specific company
 */
export function getSubscriptionInfo(companyId: string): SubscriptionInfo {
  const isSuperAdmin = localStorage.getItem('cravebiz_is_super_admin') === 'true';
  const activeTenantId = localStorage.getItem('cravebiz_tenant');
  
  // Rule: Default to 'Free' unless:
  // 1. It is the Admin's workspace ('cravebiz-inc')
  // 2. Or the user is a Super Admin and they are accessing their current active tenant/workspace, or no companyId is specified
  const isCravebizInc = companyId === 'cravebiz-inc';
  const isActiveSuperAdminTenant = isSuperAdmin && (companyId === activeTenantId || !companyId);
  const defaultTier: SubscriptionTier = (isCravebizInc || isActiveSuperAdminTenant) ? 'Enterprise' : 'Free';

  // Initialize AI Mode to ON on initial application load exactly once
  if (companyId && !globalObj.__cravebiz_aimode_initialized) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cravebiz_aimode_')) {
        localStorage.setItem(key, 'true');
      }
    }
    localStorage.setItem(`cravebiz_aimode_${companyId}`, 'true');
    globalObj.__cravebiz_aimode_initialized = true;
  }

  if (!companyId) {
    const limits = TIER_LIMITS[defaultTier];
    return { 
      tier: defaultTier, 
      aiUnits: limits.maxAiUnits, 
      maxInvoices: limits.maxInvoices, 
      maxReceipts: limits.maxReceipts,
      maxUsers: limits.maxUsers,
      aiModeEnabled: true,
      invoiceCount: 0,
      receiptCount: 0
    };
  }

  // Retrieve saved tier or default
  let rawTier = localStorage.getItem(`cravebiz_tier_${companyId}`) || defaultTier;
  if (rawTier === 'Basic') rawTier = 'Free';
  if (rawTier === 'Standard') rawTier = 'Starter';
  const tier = rawTier as SubscriptionTier;
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;

  // Retrieve remaining units or default
  const savedUnits = localStorage.getItem(`cravebiz_units_${companyId}`);
  const aiUnits = savedUnits !== null ? parseInt(savedUnits, 10) : limits.maxAiUnits;

  // Retrieve AI mode toggle - default to 'true' if not set
  const savedAiMode = localStorage.getItem(`cravebiz_aimode_${companyId}`);
  const aiModeEnabled = (limits.aiAvailable || aiUnits > 0) && (savedAiMode !== null ? savedAiMode === 'true' : true);

  const invoiceCount = parseInt(localStorage.getItem(`cravebiz_invoice_count_${companyId}`) || '0', 10);
  const receiptCount = parseInt(localStorage.getItem(`cravebiz_receipt_count_${companyId}`) || '0', 10);

  return {
    tier,
    aiUnits: aiUnits < 0 ? 0 : aiUnits,
    maxInvoices: limits.maxInvoices,
    maxReceipts: limits.maxReceipts,
    maxUsers: limits.maxUsers,
    aiModeEnabled,
    invoiceCount,
    receiptCount
  };
}

/**
 * Saves subscription details for a specific company
 */
export function setSubscriptionInfo(
  companyId: string, 
  tier: SubscriptionTier, 
  aiUnits?: number, 
  aiModeEnabled?: boolean
) {
  if (!companyId) return;

  localStorage.setItem(`cravebiz_tier_${companyId}`, tier);
  
  if (aiUnits !== undefined) {
    localStorage.setItem(`cravebiz_units_${companyId}`, aiUnits.toString());
  } else {
    // If not specified, set to tier default
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;
    localStorage.setItem(`cravebiz_units_${companyId}`, limits.maxAiUnits.toString());
  }

  if (aiModeEnabled !== undefined) {
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;
    const currentUnits = aiUnits !== undefined ? aiUnits : (localStorage.getItem(`cravebiz_units_${companyId}`) ? parseInt(localStorage.getItem(`cravebiz_units_${companyId}`)!, 10) : 0);
    localStorage.setItem(`cravebiz_aimode_${companyId}`, ((limits.aiAvailable || currentUnits > 0) && aiModeEnabled).toString());
  }

  // Save to DB in background
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to sync sub changes to Supabase:", err));
}

/**
 * Toggles AI Mode for a workspace
 */
export function toggleAiMode(companyId: string, enabled: boolean): boolean {
  if (!companyId) return false;
  const sub = getSubscriptionInfo(companyId);
  const limits = TIER_LIMITS[sub.tier];
  
  if (!limits.aiAvailable && sub.aiUnits <= 0) {
    throw new Error(`The AI Toggle is unavailable on the ${sub.tier} Plan. Please upgrade to Starter, Growth, or Enterprise, or purchase an AI Credit Refill to enable AI.`);
  }

  localStorage.setItem(`cravebiz_aimode_${companyId}`, enabled.toString());
  
  // Save to DB in background
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to sync AI toggle to Supabase:", err));
  
  // Dispatch an event so all components update on AI mode change
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
  return enabled;
}

/**
 * Check if the tenant can generate another invoice
 */
export function canCreateInvoice(companyId: string, currentInvoiceCount: number): boolean {
  const sub = getSubscriptionInfo(companyId);
  return currentInvoiceCount < sub.maxInvoices;
}

/**
 * Deducts 1 AI Unit from the tenant subscription unit if AI Mode is enabled.
 * Throws an error if AI Mode is enabled but there are no remaining units.
 */
export function deductAiUnit(companyId: string): void {
  if (!companyId) return;
  
  // Custom owner permission check: can invited users use the AI tokens?
  const currentUserEmail = localStorage.getItem('cravebiz_current_user_email');
  if (currentUserEmail) {
    const aiAllowedStr = localStorage.getItem(`cravebiz_member_ai_allowed_${companyId}_${currentUserEmail.toLowerCase()}`);
    if (aiAllowedStr === 'false') {
      const msg = "Your user account is not authorized to use this workspace's AI tokens. Please contact the workspace owner to enable AI permissions for your account.";
      window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
      throw new Error(msg);
    }
  }

  const sub = getSubscriptionInfo(companyId);
  
  // Free plan has no AI unless they have remaining units
  if (sub.tier === 'Free' && sub.aiUnits <= 0) {
    const msg = "AI features are not available on the Free Subscription Plan. Please upgrade your subscription tier or purchase an AI Credit Refill.";
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  // Check if they have units
  if (sub.aiUnits <= 0) {
    const msg = `Your subscription AI units are depleted (0/${TIER_LIMITS[sub.tier].maxAiUnits} remaining). Please upgrade your subscription tier or contact support to recharge.`;
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  // If AI Mode is not turned on, don't allow or don't deduct (in this case, block AI because it's turned off)
  if (!sub.aiModeEnabled) {
    const msg = "AI Mode is currently turned OFF. Please turn ON AI Mode in the top header or Workspace Settings to use AI features.";
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  // Deduct 1 unit
  const newUnits = sub.aiUnits - 1;
  localStorage.setItem(`cravebiz_units_${companyId}`, newUnits.toString());
  
  // Save to DB in background
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to sync AI deduction to Supabase:", err));

  // Dispatch event for UI re-render
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Securely calls backend to upgrade subscription tier in DB
 */
export async function secureUpgradeSubscriptionOnDb(
  companyId: string,
  tier: SubscriptionTier,
  transactionId?: string,
  billingCycle?: 'monthly' | 'annual'
): Promise<void> {
  if (!companyId) return;
  const headers = await api.getAuthHeaders(companyId);
  
  const response = await fetch("/api/subscription/upgrade", {
    method: "POST",
    headers,
    body: JSON.stringify({ tier, transactionId, billingCycle })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Upgrade failed with status ${response.status}`);
  }

  const data = await response.json();
  
  // Update client-side local cache synchronously
  localStorage.setItem(`cravebiz_tier_${companyId}`, tier);
  localStorage.setItem(`cravebiz_units_${companyId}`, data.aiUnits.toString());
  localStorage.setItem(`cravebiz_aimode_${companyId}`, 'true');
  
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Securely calls backend to refill AI credits in DB
 */
export async function secureRefillCreditsOnDb(
  companyId: string,
  transactionId?: string,
  packId?: string
): Promise<void> {
  if (!companyId) return;
  const headers = await api.getAuthHeaders(companyId);
  
  const response = await fetch("/api/subscription/refill", {
    method: "POST",
    headers,
    body: JSON.stringify({ transactionId, packId })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Refill failed with status ${response.status}`);
  }

  const data = await response.json();
  
  // Update client-side local cache synchronously
  localStorage.setItem(`cravebiz_units_${companyId}`, data.aiUnits.toString());
  localStorage.setItem(`cravebiz_aimode_${companyId}`, 'true');
  
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Safely retrieves the Flutterwave Public Key from the environment variables,
 * falling back to the default demo key if not present.
 */
export function getFlutterwavePublicKey(): string {
  const cached = localStorage.getItem('cravebiz_flw_public_key');
  if (cached) return cached;
  const metaEnv = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY;
  const procEnv = typeof process !== 'undefined' ? process.env?.VITE_FLUTTERWAVE_PUBLIC_KEY : undefined;
  return metaEnv || procEnv || "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X";
}

/**
 * Dynamically fetches the Flutterwave public key from the backend and caches it
 */
export async function fetchAndCacheFlutterwavePublicKey(): Promise<string> {
  try {
    const response = await fetch("/api/subscription/public-key");
    if (response.ok) {
      const data = await response.json();
      if (data.publicKey) {
        localStorage.setItem('cravebiz_flw_public_key', data.publicKey);
        return data.publicKey;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch dynamic Flutterwave public key:", err);
  }
  return getFlutterwavePublicKey();
}

/**
 * Initiates Flutterwave checkout directly using the official Flutterwave Inline JS SDK.
 * Payment for packages, subscriptions, and AI refills uses real Flutterwave checkout without any simulated form.
 */
export function safeFlutterwaveCheckout(config: any): void {
  // Fallback to default public key if missing in config
  if (!config.public_key) {
    config.public_key = getFlutterwavePublicKey();
  }

  const launchCheckout = () => {
    if ((window as any).FlutterwaveCheckout) {
      try {
        (window as any).FlutterwaveCheckout(config);
      } catch (err: any) {
        console.error("Flutterwave checkout initiation failed:", err);
        alert("Unable to launch Flutterwave checkout: " + (err?.message || "Please check your network connection."));
      }
    } else {
      alert("Flutterwave secure payment gateway is initializing. Please try again in a few seconds.");
    }
  };

  if ((window as any).FlutterwaveCheckout) {
    launchCheckout();
  } else {
    // Dynamically load Flutterwave v3 SDK script
    const script = document.createElement('script');
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.async = true;
    script.onload = () => {
      launchCheckout();
    };
    script.onerror = () => {
      alert("Failed to load Flutterwave payment gateway script. Please verify your connection.");
    };
    document.body.appendChild(script);
  }
}

/**
 * Customizable Refill Packs configuration, syncable from DB
 */
export let REFILL_PACKS = {
  pack_100: { id: 'pack_100', amount: 1000, credits: 100, title: "100 AI Credits" },
  pack_300: { id: 'pack_300', amount: 2500, credits: 300, title: "300 AI Credits" },
  pack_1000: { id: 'pack_1000', amount: 7500, credits: 1000, title: "1000 AI Credits" },
  pack_5000: { id: 'pack_5000', amount: 30000, credits: 5000, title: "5000 AI Credits" }
};

/**
 * Saves customized Refill Packs settings to Supabase and cache
 */
export async function saveGlobalRefillPacks(packs: typeof REFILL_PACKS): Promise<void> {
  try {
    const headers = await api.getAuthHeaders('cravebiz-inc');
    const response = await fetch('/api/admin/global-refill-packs', {
      method: 'POST',
      headers,
      body: JSON.stringify(packs)
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }
    console.log("Successfully saved global refill packs via backend proxy.");
    REFILL_PACKS = { ...REFILL_PACKS, ...packs };
    localStorage.setItem('cravebiz_custom_refill_packs', JSON.stringify(REFILL_PACKS));
    window.dispatchEvent(new Event('cravebiz_subscription_change'));
  } catch (err) {
    console.warn("Could not save refill packs via backend proxy, trying direct Supabase fallback:", err);
    try {
      const { error } = await supabase.from('generated_documents').upsert({
        id: '88888888-8888-8888-8888-888888888888',
        company_id: null,
        document_type: 'cravebiz_global_refill_packs',
        content: packs
      });
      if (!error) {
        REFILL_PACKS = { ...REFILL_PACKS, ...packs };
        localStorage.setItem('cravebiz_custom_refill_packs', JSON.stringify(REFILL_PACKS));
        window.dispatchEvent(new Event('cravebiz_subscription_change'));
      } else {
        console.warn("Direct Supabase save refill packs fallback failed:", error);
      }
    } catch (dbErr) {
      console.warn("Direct Supabase fallback exception:", dbErr);
    }
  }
}

/**
 * Syncs customized Refill Packs from database/cache
 */
export async function syncGlobalRefillPacks(): Promise<void> {
  try {
    const companyId = localStorage.getItem('cravebiz_tenant') || 'cravebiz-inc';
    const headers = await api.getAuthHeaders(companyId);
    const response = await fetch('/api/admin/global-refill-packs', {
      headers
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.json();

    if (content && typeof content === 'object') {
      Object.keys(content).forEach((packKey) => {
        const pk = packKey as keyof typeof REFILL_PACKS;
        if (content[pk]) {
          REFILL_PACKS[pk] = {
            ...REFILL_PACKS[pk],
            ...content[pk]
          };
        }
      });
      localStorage.setItem('cravebiz_custom_refill_packs', JSON.stringify(REFILL_PACKS));
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    } else {
      // Look up cached in local storage
      const cached = localStorage.getItem('cravebiz_custom_refill_packs');
      if (cached) {
        const parsed = JSON.parse(cached);
        Object.keys(parsed).forEach((packKey) => {
          const pk = packKey as keyof typeof REFILL_PACKS;
          REFILL_PACKS[pk] = {
            ...REFILL_PACKS[pk],
            ...parsed[pk]
          };
        });
      }
    }
  } catch (err) {
    console.warn("Could not sync refill packs from backend, trying direct Supabase fallback:", err);
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('content')
        .eq('id', '88888888-8888-8888-8888-888888888888')
        .maybeSingle();
      if (data && data.content) {
        const content = data.content;
        Object.keys(content).forEach((packKey) => {
          const pk = packKey as keyof typeof REFILL_PACKS;
          REFILL_PACKS[pk] = {
            ...REFILL_PACKS[pk],
            ...content[pk]
          };
        });
        localStorage.setItem('cravebiz_custom_refill_packs', JSON.stringify(REFILL_PACKS));
        window.dispatchEvent(new Event('cravebiz_subscription_change'));
      }
    } catch (dbErr) {
      console.warn("Direct Supabase refill sync fallback error:", dbErr);
    }
  }
}

/**
 * Validates user's AI credits and permissions before an AI request is initiated on the client.
 */
export function ensureAiCreditsOrThrow(companyId: string): void {
  if (!companyId) return;
  const sub = getSubscriptionInfo(companyId);

  // Check custom member AI permission
  const currentUserEmail = localStorage.getItem('cravebiz_current_user_email');
  if (currentUserEmail) {
    const aiAllowedStr = localStorage.getItem(`cravebiz_member_ai_allowed_${companyId}_${currentUserEmail.toLowerCase()}`);
    if (aiAllowedStr === 'false') {
      const msg = "Your user account is not authorized to use this workspace's AI tokens. Please contact the workspace owner to enable AI permissions for your account.";
      window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
      throw new Error(msg);
    }
  }

  // Check if AI mode is turned ON
  if (!sub.aiModeEnabled) {
    try {
      toggleAiMode(companyId, true);
    } catch (e) {
      const msg = "AI Mode is currently turned OFF. Please turn ON AI Mode in the top header or Workspace Settings to use AI features.";
      window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
      throw new Error(msg);
    }
  }

  // Check credits
  if (sub.aiUnits <= 0) {
    const msg = sub.tier === 'Free'
      ? "You have used all your free monthly AI credits. Please upgrade your plan or purchase additional credits to continue."
      : `Your subscription AI units are depleted. Please upgrade your plan or purchase additional credits to continue.`;
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }
}


