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
  
  // Dispatch event for UI re-render
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}
