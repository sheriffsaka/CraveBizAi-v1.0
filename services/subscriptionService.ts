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

// In-memory workspace state cache synced directly from Supabase DB
export interface WorkspaceState {
  tier: SubscriptionTier;
  aiUnits: number;
  aiModeEnabled: boolean;
  invoiceCount: number;
  receiptCount: number;
  lastFreeUnitsReset: string;
  purchasedAiUnits: number;
  memberPermissions: Record<string, boolean>;
  invitedMembers: Record<string, { email: string; name: string }>;
}

const subMemoryCache: Record<string, WorkspaceState> = {};

function getOrCreateMemoryState(companyId: string): WorkspaceState {
  const isSuperAdmin = typeof window !== 'undefined' && localStorage.getItem('cravebiz_is_super_admin') === 'true';
  const activeTenantId = typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : null;
  const isCravebizInc = companyId === 'cravebiz-inc';
  const isActiveSuperAdminTenant = isSuperAdmin && (companyId === activeTenantId || !companyId);
  const defaultTier: SubscriptionTier = (isCravebizInc || isActiveSuperAdminTenant) ? 'Enterprise' : 'Free';
  const limits = TIER_LIMITS[defaultTier] || TIER_LIMITS.Free;

  if (!subMemoryCache[companyId]) {
    subMemoryCache[companyId] = {
      tier: defaultTier,
      aiUnits: limits.maxAiUnits,
      aiModeEnabled: true,
      invoiceCount: 0,
      receiptCount: 0,
      lastFreeUnitsReset: '',
      purchasedAiUnits: 0,
      memberPermissions: {},
      invitedMembers: {}
    };
  }
  return subMemoryCache[companyId];
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
    const user = await api.safeGetUser();
    const userId = user?.id;
    if (!userId) return;
    
    const state = getOrCreateMemoryState(companyId);
    
    const payload = {
      invoicesCreated: state.invoiceCount,
      receiptsCreated: state.receiptCount,
      remainingAiCredits: state.aiUnits
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
  const state = getOrCreateMemoryState(companyId);

  const payload: any = {
    tier: state.tier,
    aiModeEnabled: state.aiModeEnabled,
    memberPermissions: state.memberPermissions,
    invitedMembers: state.invitedMembers,
    invoiceCount: state.invoiceCount,
    receiptCount: state.receiptCount,
    lastFreeUnitsReset: state.lastFreeUnitsReset,
    purchasedAiUnits: state.purchasedAiUnits,
    aiUnits: state.aiUnits
  };

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
  const state = getOrCreateMemoryState(companyId);
  const lastReset = state.lastFreeUnitsReset || (currentContent?.lastFreeUnitsReset) || '';
  
  // Only trigger reset if lastReset was previously set AND is from an old month
  if (lastReset && lastReset !== currentMonthStr) {
    const savedTier = state.tier || (currentContent?.tier) || 'Free';
    const limits = TIER_LIMITS[savedTier as SubscriptionTier] || TIER_LIMITS.Free;
    
    const standardCredits = limits.maxAiUnits;
    const purchasedCredits = state.purchasedAiUnits || (currentContent?.purchasedAiUnits) || 0;
    
    const newTotalCredits = standardCredits + purchasedCredits;
    
    state.aiUnits = newTotalCredits;
    state.lastFreeUnitsReset = currentMonthStr;
    
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
    state.lastFreeUnitsReset = currentMonthStr;
  }
}

/**
 * Synchronizes subscription details from Supabase to in-memory state
 */
export async function syncSubscriptionInfoFromDb(companyId: string): Promise<void> {
  if (!companyId) return;
  const docId = getSettingsDocId(companyId);
  const state = getOrCreateMemoryState(companyId);

  // 1. Fetch canonical AI Credits balance from Supabase database via backend API
  try {
    const headers = await api.getAuthHeaders(companyId);
    const creditsRes = await fetch('/api/ai/credits', { headers });
    if (creditsRes.ok) {
      const creditsData = await creditsRes.json();
      if (typeof creditsData.remainingCredits === 'number') {
        state.aiUnits = creditsData.remainingCredits;
        if (creditsData.subscriptionPlan) {
          state.tier = creditsData.subscriptionPlan;
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
      state.invoiceCount = dbInvoiceCount;
    }

    const { count: dbReceiptCount, error: recError } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_receipt_sent', true);
    
    if (!recError && dbReceiptCount !== null) {
      state.receiptCount = dbReceiptCount;
    }
  } catch (err) {
    console.warn("Could not sync live counts from DB:", err);
  }

  // 3. Fetch workspace settings from backend proxy
  try {
    const headers = await api.getAuthHeaders(companyId);
    const response = await fetch('/api/subscription/settings', {
      headers
    });
    if (response.ok) {
      const resData = await response.json();
      const content = resData?.content;

      if (content) {
        if (content.tier) state.tier = content.tier;
        if (content.aiUnits !== undefined) state.aiUnits = content.aiUnits;
        if (content.aiModeEnabled !== undefined) state.aiModeEnabled = content.aiModeEnabled;
        if (content.lastFreeUnitsReset) state.lastFreeUnitsReset = content.lastFreeUnitsReset;
        if (content.purchasedAiUnits !== undefined) state.purchasedAiUnits = content.purchasedAiUnits;
        if (content.memberPermissions) state.memberPermissions = content.memberPermissions;
        if (content.invitedMembers) state.invitedMembers = content.invitedMembers;

        checkAndEnforceMonthlyCreditReset(companyId, content);
        window.dispatchEvent(new Event('cravebiz_subscription_change'));
        return;
      }
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

    if (!error && data && data.content) {
      const content = data.content as any;
      if (content.tier) state.tier = content.tier;
      if (content.aiUnits !== undefined) state.aiUnits = content.aiUnits;
      if (content.aiModeEnabled !== undefined) state.aiModeEnabled = content.aiModeEnabled;
      if (content.lastFreeUnitsReset) state.lastFreeUnitsReset = content.lastFreeUnitsReset;
      if (content.purchasedAiUnits !== undefined) state.purchasedAiUnits = content.purchasedAiUnits;
      if (content.memberPermissions) state.memberPermissions = content.memberPermissions;
      if (content.invitedMembers) state.invitedMembers = content.invitedMembers;

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
  const state = getOrCreateMemoryState(companyId);
  state.invoiceCount += 1;
  
  try {
    const sub = getSubscriptionInfo(companyId);
    await api.deductInvoiceQuota(companyId, sub.tier);
  } catch (err) {
    console.warn("Failed to deduct invoice quota on backend API:", err);
  }

  await saveSubscriptionInfoToDb(companyId);
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Increments the receipt count on the DB and deducts from user_receipt_usage quota
 */
export async function incrementReceiptCount(companyId: string): Promise<void> {
  if (!companyId) return;
  const state = getOrCreateMemoryState(companyId);
  state.receiptCount += 1;
  
  try {
    const sub = getSubscriptionInfo(companyId);
    await api.deductReceiptQuota(companyId, sub.tier);
  } catch (err) {
    console.warn("Failed to deduct receipt quota on backend API:", err);
  }

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
  const current = sub.invoiceCount || 0;
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
  const current = sub.receiptCount || 0;
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
    console.warn("Could not save global plans via backend proxy, updating Supabase table fallback:", err);
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
    const companyId = (typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : null) || 'cravebiz-inc';
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
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    }
  } catch (err) {
    console.warn("Could not sync global plans from backend proxy:", err);
  }
}

/**
 * Helper to get subscription details for a specific company
 */
export function getSubscriptionInfo(companyId: string): SubscriptionInfo {
  if (typeof window !== 'undefined') {
    (window as any).cravebiz_get_sub_info = getSubscriptionInfo;
  }
  const isSuperAdmin = typeof window !== 'undefined' && localStorage.getItem('cravebiz_is_super_admin') === 'true';
  const activeTenantId = typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : null;
  const isCravebizInc = companyId === 'cravebiz-inc';
  const isActiveSuperAdminTenant = isSuperAdmin && (companyId === activeTenantId || !companyId);
  const defaultTier: SubscriptionTier = (isCravebizInc || isActiveSuperAdminTenant) ? 'Enterprise' : 'Free';

  if (!companyId) {
    const limits = TIER_LIMITS[defaultTier] || TIER_LIMITS.Free;
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

  const state = getOrCreateMemoryState(companyId);
  const limits = TIER_LIMITS[state.tier] || TIER_LIMITS.Free;

  return {
    tier: state.tier,
    aiUnits: state.aiUnits < 0 ? 0 : state.aiUnits,
    maxInvoices: limits.maxInvoices,
    maxReceipts: limits.maxReceipts,
    maxUsers: limits.maxUsers,
    aiModeEnabled: state.aiModeEnabled,
    invoiceCount: state.invoiceCount,
    receiptCount: state.receiptCount
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
  const state = getOrCreateMemoryState(companyId);
  state.tier = tier;
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;

  if (aiUnits !== undefined) {
    state.aiUnits = aiUnits;
  } else {
    state.aiUnits = limits.maxAiUnits;
  }

  if (aiModeEnabled !== undefined) {
    state.aiModeEnabled = ((limits.aiAvailable || state.aiUnits > 0) && aiModeEnabled);
  }

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

  const state = getOrCreateMemoryState(companyId);
  state.aiModeEnabled = enabled;
  
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to sync AI toggle to Supabase:", err));
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
  const state = getOrCreateMemoryState(companyId);
  const sub = getSubscriptionInfo(companyId);
  
  // Free plan has no AI unless they have remaining units
  if (sub.tier === 'Free' && sub.aiUnits <= 0) {
    const msg = "AI features are not available on the Free Subscription Plan. Please upgrade your subscription tier or purchase an AI Credit Refill.";
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  if (sub.aiUnits <= 0) {
    const msg = `Your subscription AI units are depleted (0/${TIER_LIMITS[sub.tier].maxAiUnits} remaining). Please upgrade your subscription tier or contact support to recharge.`;
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  if (!sub.aiModeEnabled) {
    const msg = "AI Mode is currently turned OFF. Please turn ON AI Mode in the top header or Workspace Settings to use AI features.";
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  state.aiUnits = sub.aiUnits - 1;
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to sync AI deduction to Supabase:", err));
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
  const state = getOrCreateMemoryState(companyId);
  state.tier = tier;
  if (typeof data.aiUnits === 'number') state.aiUnits = data.aiUnits;
  state.aiModeEnabled = true;
  
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
  const state = getOrCreateMemoryState(companyId);
  if (typeof data.aiUnits === 'number') state.aiUnits = data.aiUnits;
  state.aiModeEnabled = true;
  
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Safely retrieves the Flutterwave Public Key from the environment variables,
 * falling back to the default demo key if not present.
 */
export function getFlutterwavePublicKey(): string {
  const metaEnv = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY;
  const procEnv = typeof process !== 'undefined' ? process.env?.VITE_FLUTTERWAVE_PUBLIC_KEY : undefined;
  return metaEnv || procEnv || "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X";
}

/**
 * Dynamically fetches the Flutterwave public key from the backend
 */
export async function fetchAndCacheFlutterwavePublicKey(): Promise<string> {
  try {
    const response = await fetch("/api/subscription/public-key");
    if (response.ok) {
      const data = await response.json();
      if (data.publicKey) {
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
 * Saves customized Refill Packs settings to Supabase
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
 * Syncs customized Refill Packs from database
 */
export async function syncGlobalRefillPacks(): Promise<void> {
  try {
    const companyId = (typeof window !== 'undefined' ? localStorage.getItem('cravebiz_tenant') : null) || 'cravebiz-inc';
    const headers = await api.getAuthHeaders(companyId);
    const response = await fetch('/api/admin/global-refill-packs', {
      headers
    });
    if (response.ok) {
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
        window.dispatchEvent(new Event('cravebiz_subscription_change'));
        return;
      }
    }
  } catch (err) {
    console.warn("Could not sync refill packs from backend, trying direct Supabase fallback:", err);
  }

  try {
    const { data } = await supabase
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
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    }
  } catch (dbErr) {
    console.warn("Direct Supabase refill sync fallback error:", dbErr);
  }
}

/**
 * Validates user's AI credits and permissions before an AI request is initiated on the client.
 */
export function ensureAiCreditsOrThrow(companyId: string): void {
  if (!companyId) return;
  const sub = getSubscriptionInfo(companyId);

  if (!sub.aiModeEnabled) {
    try {
      toggleAiMode(companyId, true);
    } catch (e) {
      const msg = "AI Mode is currently turned OFF. Please turn ON AI Mode in the top header or Workspace Settings to use AI features.";
      window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
      throw new Error(msg);
    }
  }

  if (sub.aiUnits <= 0) {
    const msg = sub.tier === 'Free'
      ? "You have used all your free monthly AI credits. Please upgrade your plan or purchase additional credits to continue."
      : `Your subscription AI units are depleted. Please upgrade your plan or purchase additional credits to continue.`;
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }
}

export function getMemberAiPermission(companyId: string, email: string): boolean {
  if (!companyId || !email) return true;
  const state = getOrCreateMemoryState(companyId);
  const emailLower = email.toLowerCase().trim();
  if (state.memberPermissions && state.memberPermissions[emailLower] !== undefined) {
    return state.memberPermissions[emailLower];
  }
  return true; // default true
}

export function setMemberAiPermission(companyId: string, email: string, allowed: boolean): void {
  if (!companyId || !email) return;
  const state = getOrCreateMemoryState(companyId);
  const emailLower = email.toLowerCase().trim();
  if (!state.memberPermissions) state.memberPermissions = {};
  state.memberPermissions[emailLower] = allowed;
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to save member permissions:", err));
}

export function getInvitedMemberInfo(companyId: string, userId: string): { email: string; name: string } | null {
  if (!companyId || !userId) return null;
  const state = getOrCreateMemoryState(companyId);
  return state.invitedMembers?.[userId] || null;
}

export function getAllInvitedMembers(companyId: string): Record<string, { email: string; name: string }> {
  if (!companyId) return {};
  const state = getOrCreateMemoryState(companyId);
  return state.invitedMembers || {};
}

export function setInvitedMemberInfo(companyId: string, userId: string, info: { email: string; name: string }): void {
  if (!companyId || !userId) return;
  const state = getOrCreateMemoryState(companyId);
  if (!state.invitedMembers) state.invitedMembers = {};
  state.invitedMembers[userId] = info;
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to save invited member info:", err));
}

export function removeInvitedMemberInfo(companyId: string, userId: string, email?: string): void {
  if (!companyId) return;
  const state = getOrCreateMemoryState(companyId);
  if (state.invitedMembers && userId) {
    delete state.invitedMembers[userId];
  }
  if (state.memberPermissions && email) {
    delete state.memberPermissions[email.toLowerCase().trim()];
  }
  saveSubscriptionInfoToDb(companyId).catch(err => console.warn("Failed to save updated members after removal:", err));
}



