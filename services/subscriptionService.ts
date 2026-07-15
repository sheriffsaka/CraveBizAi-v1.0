import { supabase, api } from '../lib/api';

export type SubscriptionTier = 'Free' | 'Starter' | 'Growth' | 'Business' | 'Enterprise';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  aiUnits: number;
  maxInvoices: number;
  maxReceipts: number;
  maxUsers: number;
  aiModeEnabled: boolean;
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

  const payload = {
    tier: sub.tier,
    aiUnits: sub.aiUnits,
    aiModeEnabled: sub.aiModeEnabled,
    memberPermissions,
    invitedMembers
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
}

/**
 * Synchronizes subscription details from Supabase to local storage
 */
export async function syncSubscriptionInfoFromDb(companyId: string): Promise<void> {
  if (!companyId) return;
  const docId = getSettingsDocId(companyId);

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
      if (content.invitedMembers) {
        Object.entries(content.invitedMembers).forEach(([userId, info]: [string, any]) => {
          localStorage.setItem(`cravebiz_invited_member_info_${companyId}_${userId}`, JSON.stringify(info));
        });
      }
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
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
    }
  } catch (err) {
    console.warn("Direct Supabase query exception:", err);
  }
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
    console.warn("Could not save global plans via backend proxy, trying direct Supabase fallback:", err);
    try {
      const { error } = await supabase.from('generated_documents').upsert({
        id: '99999999-9999-9999-9999-999999999999',
        company_id: null,
        document_type: 'cravebiz_global_pricing_settings',
        content: limits
      });
      if (error) {
        console.warn("Direct Supabase save global plans fallback also failed:", error);
      }
    } catch (dbErr) {
      console.warn("Direct Supabase fallback exception:", dbErr);
    }
  }
}

/**
 * Syncs customizable TIER_LIMITS from Supabase
 */
export async function syncGlobalPlanSettings(): Promise<void> {
  try {
    const response = await fetch('/api/admin/global-pricing-settings');
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
    console.warn("Could not sync global plans from backend proxy, trying direct Supabase fallback:", err);
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('content')
        .eq('id', '99999999-9999-9999-9999-999999999999')
        .maybeSingle();

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
    } catch (fallbackErr) {
      console.warn("Direct Supabase sync fallback failed:", fallbackErr);
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

  // Initialize AI Mode to OFF on initial application load exactly once
  if (companyId && !globalObj.__cravebiz_aimode_initialized) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cravebiz_aimode_')) {
        localStorage.setItem(key, 'false');
      }
    }
    localStorage.setItem(`cravebiz_aimode_${companyId}`, 'false');
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
      aiModeEnabled: false 
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
  const defaultAiMode = 'false';
  const aiModeEnabled = (limits.aiAvailable || aiUnits > 0) && (savedAiMode !== null ? savedAiMode === 'true' : false);

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
 * Intercepts FlutterwaveCheckout calls. If using the default placeholder public key,
 * triggers a polished simulation modal overlay so that users can complete payments and upgrades.
 * Otherwise, routes to the real Flutterwave secure system.
 */
export function safeFlutterwaveCheckout(config: any): void {
  // Determine if the key is one of our default placeholder keys or invalid/empty
  const key = config.public_key || "";
  const isPlaceholderKey = !key || 
                           key === "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X" || 
                           key.includes("e5e54eb") ||
                           key.includes("3bbbacb") ||
                           !key.startsWith("FLWPUBK");

  // If a custom/valid public key is supplied, attempt real checkout
  if (!isPlaceholderKey) {
    if ((window as any).FlutterwaveCheckout) {
      try {
        (window as any).FlutterwaveCheckout(config);
        return;
      } catch (err: any) {
        console.error("Real Flutterwave checkout initiation failed:", err);
        alert("Real Flutterwave checkout initiation failed. Falling back to payment simulator.");
      }
    } else {
      alert("Flutterwave secure library is currently loading. Please wait 2 seconds and try again.");
      return;
    }
  }

  // Fallback sandbox simulator (only if script failed to load or placeholder key is used)
  const overlay = document.createElement('div');
  overlay.id = 'flutterwave-simulator-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.65)'; // slate-900 with opacity
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '999999';
  overlay.style.fontFamily = '"Inter", sans-serif';

  // Modal Card
  const card = document.createElement('div');
  card.className = 'bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 max-w-md w-full mx-4 transform scale-95 transition-transform duration-300 ease-out animate-in fade-in zoom-in-95';
  card.style.maxHeight = '90vh';
  card.style.overflowY = 'auto';

  // Form structure
  card.innerHTML = `
    <div class="text-center mb-6">
      <div class="inline-flex items-center justify-center w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl mb-3 border border-amber-100">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <p class="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-0.5">CraveBiZ Sandbox</p>
      <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight">Payment Gateway Simulator</h3>
      <p class="text-xs text-slate-500 mt-1">Intercepted default key to prevent Flutterwave checkout errors</p>
    </div>

    <div class="space-y-4 mb-6">
      <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-left">
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-400 font-bold">Checkout Item:</span>
          <span class="text-slate-800 font-extrabold text-right">${config.customizations?.title || 'Upgrade / Settlement'}</span>
        </div>
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-400 font-bold">Description:</span>
          <span class="text-slate-600 font-medium text-right line-clamp-1">${config.customizations?.description || ''}</span>
        </div>
        <div class="flex justify-between items-center text-xs border-t border-slate-200/50 pt-1.5 mt-1">
          <span class="text-slate-400 font-bold">Total Payable:</span>
          <span class="text-primary-600 font-black text-sm">₦${Number(config.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div class="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-[11px] text-blue-900 leading-relaxed space-y-1 text-left">
        <p class="font-extrabold uppercase tracking-wide text-blue-950 text-[9px]">💡 Why am I seeing this?</p>
        <p>No valid live/test key was supplied in your environment variables. This sandbox safely handles the transaction in memory so you can test all premium workspace subscription and settlement mechanics perfectly.</p>
      </div>
    </div>

    <div class="space-y-2.5">
      <button id="sim-btn-success" class="w-full py-4 bg-emerald-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-emerald-700 transition-all shadow-md cursor-pointer">
        ✓ Simulate Successful Payment
      </button>
      <button id="sim-btn-fail" class="w-full py-4 bg-rose-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-rose-600 transition-all shadow-md cursor-pointer">
        ✗ Simulate Failed Payment
      </button>
      <button id="sim-btn-close" class="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all cursor-pointer">
        Cancel Checkout
      </button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Add event listeners
  const successBtn = card.querySelector('#sim-btn-success');
  const failBtn = card.querySelector('#sim-btn-fail');
  const closeBtn = card.querySelector('#sim-btn-close');

  successBtn?.addEventListener('click', () => {
    document.body.removeChild(overlay);
    config.callback({
      status: 'successful',
      transaction_id: 'sim-tx-' + Date.now(),
      tx_ref: config.tx_ref
    });
  });

  failBtn?.addEventListener('click', () => {
    document.body.removeChild(overlay);
    config.callback({
      status: 'failed',
      tx_ref: config.tx_ref
    });
  });

  closeBtn?.addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (typeof config.onclose === 'function') {
      config.onclose();
    }
  });
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
    const response = await fetch('/api/admin/global-refill-packs');
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


