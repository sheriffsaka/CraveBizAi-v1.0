export type SubscriptionTier = 'Basic' | 'Standard' | 'Enterprise';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  aiUnits: number;
  maxInvoices: number;
  aiModeEnabled: boolean;
}

// Map tiers to limits
export const TIER_LIMITS = {
  Basic: { maxInvoices: 5, maxAiUnits: 5, aiAvailable: false },
  Standard: { maxInvoices: 20, maxAiUnits: 20, aiAvailable: true },
  Enterprise: { maxInvoices: 200, maxAiUnits: 200, aiAvailable: true }
};

/**
 * Helper to get subscription details for a specific company
 */
export function getSubscriptionInfo(companyId: string): SubscriptionInfo {
  const isSuperAdmin = localStorage.getItem('cravebiz_is_super_admin') === 'true';
  
  // Rule: Default to 'Basic' unless:
  // 1. It is the Admin's workspace ('cravebiz-inc')
  // 2. Or there is no companyId and isSuperAdmin is true (Super Admin's fallback active session)
  const isCravebizInc = companyId === 'cravebiz-inc';
  const defaultTier: SubscriptionTier = (isCravebizInc || (!companyId && isSuperAdmin)) ? 'Enterprise' : 'Basic';

  if (!companyId) {
    const limits = TIER_LIMITS[defaultTier];
    return { 
      tier: defaultTier, 
      aiUnits: limits.maxAiUnits, 
      maxInvoices: limits.maxInvoices, 
      aiModeEnabled: limits.aiAvailable 
    };
  }

  // Retrieve saved tier or default
  const tier = (localStorage.getItem(`cravebiz_tier_${companyId}`) || defaultTier) as SubscriptionTier;
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.Basic;

  // Retrieve remaining units or default
  const savedUnits = localStorage.getItem(`cravebiz_units_${companyId}`);
  const aiUnits = savedUnits !== null ? parseInt(savedUnits, 10) : limits.maxAiUnits;

  // Retrieve AI mode toggle
  const savedAiMode = localStorage.getItem(`cravebiz_aimode_${companyId}`);
  const defaultAiMode = isSuperAdmin ? 'true' : 'false';
  const aiModeEnabled = limits.aiAvailable && (savedAiMode !== null ? savedAiMode === 'true' : defaultAiMode === 'true');

  return {
    tier,
    aiUnits: aiUnits < 0 ? 0 : aiUnits,
    maxInvoices: limits.maxInvoices,
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
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.Basic;
    localStorage.setItem(`cravebiz_units_${companyId}`, limits.maxAiUnits.toString());
  }

  if (aiModeEnabled !== undefined) {
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.Basic;
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
    throw new Error(`The AI Toggle is unavailable on the ${sub.tier} Plan. Please upgrade to Standard or Enterprise, or purchase an AI Credit Refill to enable AI.`);
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
  
  const sub = getSubscriptionInfo(companyId);
  
  // Basic plan has no AI unless they have remaining units
  if (sub.tier === 'Basic' && sub.aiUnits <= 0) {
    const msg = "AI features are not available on the Basic Subscription Plan. Please upgrade to Standard or Enterprise, or purchase an AI Credit Refill.";
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
