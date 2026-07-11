import { supabase } from '../lib/api';

export type SubscriptionTier = 'Free' | 'Starter' | 'Growth' | 'Enterprise';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  aiUnits: number;
  maxInvoices: number;
  maxReceipts: number;
  maxUsers: number;
  aiModeEnabled: boolean;
}

// Map tiers to limits
export const TIER_LIMITS = {
  Free: { maxInvoices: 5, maxReceipts: 5, maxAiUnits: 0, maxUsers: 1, aiAvailable: false, price: "₦0.00" },
  Starter: { maxInvoices: 20, maxReceipts: 20, maxAiUnits: 200, maxUsers: 3, aiAvailable: true, price: "₦15,000.00" },
  Growth: { maxInvoices: 50, maxReceipts: 50, maxAiUnits: 500, maxUsers: 10, aiAvailable: true, price: "₦35,000.00" },
  Enterprise: { maxInvoices: 200, maxReceipts: 2000, maxAiUnits: 1000, maxUsers: 999999, aiAvailable: true, price: "₦85,000.00" }
};

/**
 * Helper to get deterministic valid UUID for settings documents
 */
export const getSettingsDocId = (companyId: string): string => {
  if (companyId === 'cravebiz-inc' || !companyId) {
    return '00000000-0000-0000-0000-000000000000';
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return '11111111-1111-1111-1111-111111111111';
  }
  return companyId;
};

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

  try {
    const { error } = await supabase.from('generated_documents').upsert({
      id: docId,
      company_id: companyId,
      document_type: 'cravebiz_workspace_settings',
      content: {
        tier: sub.tier,
        aiUnits: sub.aiUnits,
        aiModeEnabled: sub.aiModeEnabled,
        memberPermissions
      }
    });
    if (error) {
      console.warn("Supabase upsert subscription error:", error);
    }
  } catch (err) {
    console.warn("Could not sync subscription to Supabase:", err);
  }
}

/**
 * Synchronizes subscription details from Supabase to local storage
 */
export async function syncSubscriptionInfoFromDb(companyId: string): Promise<void> {
  if (!companyId) return;
  const docId = getSettingsDocId(companyId);

  try {
    const { data, error } = await supabase
      .from('generated_documents')
      .select('content')
      .eq('id', docId)
      .maybeSingle();

    if (error) {
      console.warn("Supabase fetch subscription error:", error);
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
      if (content.memberPermissions) {
        Object.entries(content.memberPermissions).forEach(([email, allowed]) => {
          localStorage.setItem(`cravebiz_member_ai_allowed_${companyId}_${email}`, String(allowed));
        });
      }
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    }
  } catch (err) {
    console.warn("Could not sync subscription from Supabase:", err);
  }
}

/**
 * Saves customizable TIER_LIMITS settings to Supabase
 */
export async function saveGlobalPlanSettings(limits: typeof TIER_LIMITS): Promise<void> {
  try {
    const { error } = await supabase.from('generated_documents').upsert({
      id: '99999999-9999-9999-9999-999999999999',
      company_id: 'cravebiz-inc',
      document_type: 'cravebiz_global_pricing_settings',
      content: limits
    });
    if (error) {
      console.warn("Supabase save global plans error:", error);
    }
  } catch (err) {
    console.warn("Could not save global plans to Supabase:", err);
  }
}

/**
 * Syncs customizable TIER_LIMITS from Supabase
 */
export async function syncGlobalPlanSettings(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('generated_documents')
      .select('content')
      .eq('id', '99999999-9999-9999-9999-999999999999')
      .maybeSingle();

    if (error) {
      console.warn("Supabase fetch global plans error:", error);
      return;
    }

    if (data && data.content) {
      const content = data.content as any;
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
      // Check if local storage has cached limits
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
    console.warn("Could not sync global plans from Supabase:", err);
  }
}

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

  if (!companyId) {
    const limits = TIER_LIMITS[defaultTier];
    return { 
      tier: defaultTier, 
      aiUnits: limits.maxAiUnits, 
      maxInvoices: limits.maxInvoices, 
      maxReceipts: limits.maxReceipts,
      maxUsers: limits.maxUsers,
      aiModeEnabled: limits.aiAvailable 
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

  // Retrieve AI mode toggle
  const savedAiMode = localStorage.getItem(`cravebiz_aimode_${companyId}`);
  const defaultAiMode = isSuperAdmin ? 'true' : 'false';
  const aiModeEnabled = (limits.aiAvailable || aiUnits > 0) && (savedAiMode !== null ? savedAiMode === 'true' : defaultAiMode === 'true');

  return {
    tier,
    aiUnits: aiUnits < 0 ? 0 : aiUnits,
    maxInvoices: limits.maxInvoices,
    maxReceipts: limits.maxReceipts,
    maxUsers: limits.maxUsers,
    aiModeEnabled
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

  // If AI Mode is not turned on, don't allow or don't deduct (in this case, block AI because it's turned off)
  if (!sub.aiModeEnabled) {
    const msg = "AI Mode is currently turned OFF. Please turn ON AI Mode in the top header or Workspace Settings to use AI features.";
    window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
    throw new Error(msg);
  }

  // Check if they have units
  if (sub.aiUnits <= 0) {
    const msg = `Your subscription AI units are depleted (0/${TIER_LIMITS[sub.tier].maxAiUnits} remaining). Please upgrade your subscription tier or contact support to recharge.`;
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

