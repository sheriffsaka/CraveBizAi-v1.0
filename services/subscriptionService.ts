import { supabase, api } from '../lib/api';

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
  transactionId?: string
): Promise<void> {
  if (!companyId) return;
  const headers = await api.getAuthHeaders(companyId);
  
  const response = await fetch("/api/subscription/upgrade", {
    method: "POST",
    headers,
    body: JSON.stringify({ tier, transactionId })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Upgrade failed with status ${response.status}`);
  }

  const data = await response.json();
  
  // Update client-side local cache synchronously
  localStorage.setItem(`cravebiz_tier_${companyId}`, tier);
  localStorage.setItem(`cravebiz_units_${companyId}`, data.aiUnits.toString());
  localStorage.setItem(`cravebiz_aimode_${companyId}`, (tier !== 'Free').toString());
  
  window.dispatchEvent(new Event('cravebiz_subscription_change'));
}

/**
 * Securely calls backend to refill AI credits in DB
 */
export async function secureRefillCreditsOnDb(
  companyId: string,
  transactionId?: string
): Promise<void> {
  if (!companyId) return;
  const headers = await api.getAuthHeaders(companyId);
  
  const response = await fetch("/api/subscription/refill", {
    method: "POST",
    headers,
    body: JSON.stringify({ transactionId })
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
 * Intercepts FlutterwaveCheckout calls. If using the default placeholder public key,
 * triggers a polished simulation modal overlay so that users can complete payments and upgrades.
 * Otherwise, routes to the real Flutterwave secure system.
 */
export function safeFlutterwaveCheckout(config: any): void {
  const isPlaceholderKey = !config.public_key || config.public_key === "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X";

  if (!isPlaceholderKey) {
    if ((window as any).FlutterwaveCheckout) {
      (window as any).FlutterwaveCheckout(config);
    } else {
      alert("Flutterwave secure system is currently loading. Please try again in a few seconds.");
    }
    return;
  }

  // Create the simulation modal overlay
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

