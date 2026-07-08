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
  if (!companyId) {
    return { tier: 'Basic', aiUnits: 5, maxInvoices: 5, aiModeEnabled: false };
  }

  // Retrieve saved tier or default to 'Basic'
  const tier = (localStorage.getItem(`cravebiz_tier_${companyId}`) || 'Basic') as SubscriptionTier;
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.Basic;

  // Retrieve remaining units or default
  const savedUnits = localStorage.getItem(`cravebiz_units_${companyId}`);
  const aiUnits = savedUnits !== null ? parseInt(savedUnits, 10) : limits.maxAiUnits;

  // Retrieve AI mode toggle
  const aiModeEnabled = limits.aiAvailable && localStorage.getItem(`cravebiz_aimode_${companyId}`) === 'true';

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
    localStorage.setItem(`cravebiz_aimode_${companyId}`, (limits.aiAvailable && aiModeEnabled).toString());
  }
}

/**
 * Toggles AI Mode for a workspace
 */
export function toggleAiMode(companyId: string, enabled: boolean): boolean {
  if (!companyId) return false;
  const sub = getSubscriptionInfo(companyId);
  const limits = TIER_LIMITS[sub.tier];
  
  if (!limits.aiAvailable) {
    throw new Error(`The AI Toggle is unavailable on the ${sub.tier} Plan. Please upgrade to Standard or Enterprise to enable AI.`);
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
  
  // Basic plan has no AI
  if (sub.tier === 'Basic') {
    throw new Error("AI features are not available on the Basic Subscription Plan. Please upgrade to Standard or Enterprise.");
  }

  // If AI Mode is not turned on, don't allow or don't deduct (in this case, block AI because it's turned off)
  if (!sub.aiModeEnabled) {
    throw new Error("AI Mode is currently turned OFF. Please enable AI Mode in your Workspace Settings or Navigation Bar to use AI features.");
  }

  // Check if they have units
  if (sub.aiUnits <= 0) {
    throw new Error(`Your subscription units are depleted (0/${TIER_LIMITS[sub.tier].maxAiUnits} remaining). Please upgrade your subscription tier or contact support to recharge.`);
  }

  // Deduct 1 unit
  const newUnits = sub.aiUnits - 1;
  localStorage.setItem(`cravebiz_units_${companyId}`, newUnits.toString());
  
  // Dispatch event for UI re-render
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}
