import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dfqvgezjhudmnlyeycju.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI";

const rootSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface UserAiCredits {
  userId: string;
  tenantId: string;
  totalCredits: number;
  remainingCredits: number;
  creditsUsed: number;
  lastResetDate: string;
  subscriptionPlan: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiCreditLog {
  id?: string;
  userId: string;
  tenantId: string;
  featureUsed: string;
  creditsDeducted: number;
  timestamp: string;
  status: 'Success' | 'Failed';
  details?: string;
  tokensUsed?: number;
}

// File-based resilient local persistence cache
const CACHE_FILE = path.join(process.cwd(), "user_ai_credits_cache.json");

function readLocalCreditCache(): Record<string, UserAiCredits> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(content) || {};
    }
  } catch (e) {
    console.warn("[AI Credits Cache] Error reading local credit cache:", e);
  }
  return {};
}

function writeLocalCreditCache(cache: Record<string, UserAiCredits>): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    console.warn("[AI Credits Cache] Error writing local credit cache:", e);
  }
}

/**
 * Standard default credit limits by plan
 */
export const DEFAULT_PLAN_CREDITS: Record<string, number> = {
  Free: 5,
  Starter: 100,
  Growth: 300,
  Pro: 300,
  Business: 800,
  Enterprise: 2500,
};

/**
 * Helper to get clean database key for user/tenant
 */
export function getDbKey(userId?: string, tenantId?: string): string {
  const target = tenantId || userId || "default-user";
  let cleanKey = target;
  if (target.startsWith("ws-personal-")) cleanKey = target.replace("ws-personal-", "");
  else if (target.startsWith("ws-legal-")) cleanKey = target.replace("ws-legal-", "");
  else if (target.startsWith("ws-sales-")) cleanKey = target.replace("ws-sales-", "");

  if (cleanKey === "cravebiz-inc") return "00000000-0000-0000-0000-000000000000";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanKey)) {
    return cleanKey;
  }
  return cleanKey;
}

/**
 * Helper to get strictly valid UUID for SQL UUID columns (company_id)
 */
export function getDbUuidKey(userId?: string, tenantId?: string): string {
  const key = getDbKey(userId, tenantId);
  if (key === "00000000-0000-0000-0000-000000000000") return key;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key;
  }
  return "11111111-1111-1111-1111-111111111111";
}

/**
 * Retrieves a user's AI credits profile directly from Supabase DB.
 * Initializes the record ONLY if it does not exist yet.
 */
export async function getUserAiCredits(
  userId: string,
  tenantId: string,
  token?: string
): Promise<UserAiCredits> {
  const key = getDbKey(userId, tenantId);
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  let creditsData: UserAiCredits | null = null;

  // 1. Try fetching from Supabase 'user_ai_credits' table
  try {
    const { data, error } = await client
      .from("user_ai_credits")
      .select("*")
      .eq("user_id", key)
      .maybeSingle();

    if (data && !error) {
      creditsData = {
        userId: data.user_id || key,
        tenantId: data.tenant_id || tenantId,
        totalCredits: parseInt(String(data.total_credits ?? 5), 10),
        remainingCredits: parseInt(String(data.remaining_credits ?? 5), 10),
        creditsUsed: parseInt(String(data.credits_used ?? 0), 10),
        lastResetDate: data.last_reset_date || new Date().toISOString(),
        subscriptionPlan: data.subscription_plan || "Free",
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch (dbErr) {
    console.warn("[getUserAiCredits] user_ai_credits query failed, checking generated_documents:", dbErr);
  }

  // 2. Try fetching from Supabase 'generated_documents' (document_type = 'user_ai_credits')
  if (!creditsData) {
    try {
      const { data } = await client
        .from("generated_documents")
        .select("*")
        .eq("id", key)
        .eq("document_type", "user_ai_credits")
        .maybeSingle();

      if (data && data.content) {
        const c = data.content;
        creditsData = {
          userId: key,
          tenantId: tenantId,
          totalCredits: parseInt(String(c.totalCredits ?? 5), 10),
          remainingCredits: parseInt(String(c.remainingCredits ?? 5), 10),
          creditsUsed: parseInt(String(c.creditsUsed ?? 0), 10),
          lastResetDate: c.lastResetDate || new Date().toISOString(),
          subscriptionPlan: c.subscriptionPlan || "Free",
        };
      }
    } catch (docErr) {
      console.warn("[getUserAiCredits] generated_documents user_ai_credits fetch failed:", docErr);
    }
  }

  // 3. Fallback: check workspace settings ('cravebiz_workspace_settings') in Supabase
  let wsContent: any = null;
  const targetCompanyId = tenantId || key;
  try {
    const { data: wsDoc } = await client
      .from("generated_documents")
      .select("content")
      .or(`id.eq.${targetCompanyId},company_id.eq.${targetCompanyId}`)
      .eq("document_type", "cravebiz_workspace_settings")
      .limit(1)
      .maybeSingle();

    if (wsDoc && wsDoc.content) {
      wsContent = wsDoc.content;
    }
  } catch (wsErr) {
    console.warn("[getUserAiCredits] Could not fetch workspace settings:", wsErr);
  }

  const isCravebizInc = tenantId === "cravebiz-inc" || key === "00000000-0000-0000-0000-000000000000";
  const wsTier = wsContent?.tier || (isCravebizInc ? "Enterprise" : "Free");
  const wsPlanMax = DEFAULT_PLAN_CREDITS[wsTier] || (isCravebizInc ? 2500 : 5);
  const wsPurchased = parseInt(String(wsContent?.purchasedAiUnits ?? 0), 10);
  const wsTotal = wsPlanMax + wsPurchased;

  // If NO credit record exists anywhere in Supabase yet, create initial balance from workspace settings or defaults
  if (!creditsData) {
    const wsAiUnits = wsContent?.aiUnits !== undefined ? parseInt(String(wsContent.aiUnits), 10) : wsTotal;
    creditsData = {
      userId: key,
      tenantId: tenantId || key,
      totalCredits: wsTotal,
      remainingCredits: wsAiUnits,
      creditsUsed: 0,
      lastResetDate: new Date().toISOString(),
      subscriptionPlan: wsTier,
    };

    await saveUserAiCredits(creditsData, token);
  } else {
    // If workspace tier upgraded, update subscription plan and credit total without overriding deducted balance
    if (wsTier !== creditsData.subscriptionPlan) {
      const oldPlanMax = DEFAULT_PLAN_CREDITS[creditsData.subscriptionPlan] || 5;
      const creditDiff = wsPlanMax - oldPlanMax;
      creditsData.subscriptionPlan = wsTier;
      creditsData.totalCredits = wsTotal;
      if (creditDiff > 0) {
        creditsData.remainingCredits += creditDiff;
      }
      await saveUserAiCredits(creditsData, token);
    }
  }

  // Update local file cache for background sync reference
  const localCache = readLocalCreditCache();
  localCache[key] = creditsData;
  writeLocalCreditCache(localCache);

  return creditsData;
}

/**
 * Persists user AI credits profile to database and local cache.
 */
export async function saveUserAiCredits(
  credits: UserAiCredits,
  token?: string
): Promise<void> {
  const key = getDbKey(credits.userId, credits.tenantId);
  credits.userId = key;
  credits.updatedAt = new Date().toISOString();

  // 1. Save to local file cache first (guarantees zero data loss in runtime container)
  const localCache = readLocalCreditCache();
  localCache[key] = credits;
  writeLocalCreditCache(localCache);

  // 2. Try saving to Supabase 'user_ai_credits' table
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  try {
    const { error } = await client.from("user_ai_credits").upsert({
      user_id: key,
      tenant_id: credits.tenantId,
      total_credits: credits.totalCredits,
      remaining_credits: credits.remainingCredits,
      credits_used: credits.creditsUsed,
      last_reset_date: credits.lastResetDate,
      subscription_plan: credits.subscriptionPlan,
      updated_at: credits.updatedAt,
    });

    if (error) {
      console.warn("[saveUserAiCredits] Could not upsert into user_ai_credits table (may not exist in schema cache), syncing to generated_documents:", error.message);
    }
  } catch (err) {
    console.warn("[saveUserAiCredits] Supabase table upsert exception:", err);
  }

  // 3. Always save to Supabase 'generated_documents' (document_type = 'user_ai_credits')
  try {
    await client.from("generated_documents").upsert({
      id: key,
      company_id: key.includes("-") && key.length === 36 ? key : null,
      document_type: "user_ai_credits",
      content: {
        totalCredits: credits.totalCredits,
        remainingCredits: credits.remainingCredits,
        creditsUsed: credits.creditsUsed,
        lastResetDate: credits.lastResetDate,
        subscriptionPlan: credits.subscriptionPlan,
        updatedAt: credits.updatedAt,
      },
    });
  } catch (docErr) {
    console.warn("[saveUserAiCredits] Generated documents upsert exception:", docErr);
  }

  // 4. Sync back to 'cravebiz_workspace_settings' so subscription settings & AI credits stay 100% in sync
  try {
    const targetCompanyId = credits.tenantId || key;
    const { data: wsDoc } = await client
      .from("generated_documents")
      .select("content")
      .or(`id.eq.${targetCompanyId},company_id.eq.${targetCompanyId}`)
      .eq("document_type", "cravebiz_workspace_settings")
      .limit(1)
      .maybeSingle();

    if (wsDoc && wsDoc.content) {
      const updatedContent = {
        ...wsDoc.content,
        tier: credits.subscriptionPlan,
        aiUnits: credits.remainingCredits,
      };
      await client.from("generated_documents").upsert({
        id: targetCompanyId,
        company_id: targetCompanyId.includes("-") && targetCompanyId.length === 36 ? targetCompanyId : null,
        document_type: "cravebiz_workspace_settings",
        content: updatedContent,
      });
    }
  } catch (wsSyncErr) {
    console.warn("[saveUserAiCredits] Error syncing workspace settings aiUnits:", wsSyncErr);
  }
}

/**
 * Check if the user has enough AI credits before executing an AI request.
 */
export async function checkUserAiCredits(
  userId: string,
  tenantId: string,
  creditsRequired: number = 1,
  token?: string
): Promise<{
  allowed: boolean;
  remainingCredits: number;
  totalCredits: number;
  subscriptionPlan: string;
  errorMessage?: string;
}> {
  const credits = await getUserAiCredits(userId, tenantId, token);

  if (credits.remainingCredits < creditsRequired || credits.remainingCredits <= 0) {
    const msg = `Insufficient AI credits! You have ${credits.remainingCredits} remaining AI credits on your ${credits.subscriptionPlan} plan (Required: ${creditsRequired}). Please upgrade your subscription tier or refill AI credits to generate content.`;
    return {
      allowed: false,
      remainingCredits: credits.remainingCredits,
      totalCredits: credits.totalCredits,
      subscriptionPlan: credits.subscriptionPlan,
      errorMessage: msg,
    };
  }

  return {
    allowed: true,
    remainingCredits: credits.remainingCredits,
    totalCredits: credits.totalCredits,
    subscriptionPlan: credits.subscriptionPlan,
  };
}

/**
 * Deduct credits ONLY AFTER a successful AI response.
 * Updates user_ai_credits and writes a 'Success' log to ai_credit_logs.
 */
export async function deductUserAiCredits(
  userId: string,
  tenantId: string,
  featureUsed: string,
  creditsToDeduct: number = 1,
  tokensUsed: number = 0,
  userEmail?: string,
  userName?: string,
  token?: string
): Promise<{
  remainingCredits: number;
  totalCredits: number;
  creditsUsed: number;
}> {
  const credits = await getUserAiCredits(userId, tenantId, token);

  const newRemaining = Math.max(0, credits.remainingCredits - creditsToDeduct);
  const newUsed = credits.creditsUsed + creditsToDeduct;

  credits.remainingCredits = newRemaining;
  credits.creditsUsed = newUsed;

  // Persist updated credit balance
  await saveUserAiCredits(credits, token);

  // Log successful transaction
  await logAiCreditRequest({
    userId: userEmail || userId,
    tenantId: tenantId || userId,
    featureUsed: featureUsed,
    creditsDeducted: creditsToDeduct,
    timestamp: new Date().toISOString(),
    status: "Success",
    tokensUsed: tokensUsed,
    details: `Successfully generated response using ${featureUsed}`,
  }, token);

  return {
    remainingCredits: newRemaining,
    totalCredits: credits.totalCredits,
    creditsUsed: newUsed,
  };
}

/**
 * Log a failed AI request (0 credits deducted, status: "Failed").
 */
export async function logFailedAiRequest(
  userId: string,
  tenantId: string,
  featureUsed: string,
  errorMessage: string,
  userEmail?: string,
  token?: string
): Promise<void> {
  await logAiCreditRequest({
    userId: userEmail || userId,
    tenantId: tenantId || userId,
    featureUsed: featureUsed,
    creditsDeducted: 0,
    timestamp: new Date().toISOString(),
    status: "Failed",
    details: errorMessage,
  }, token);
}

/**
 * Writes an entry into Supabase 'ai_credit_logs', 'ai_usage_logs', and 'audit_logs' tables.
 */
export async function logAiCreditRequest(
  log: AiCreditLog,
  token?: string
): Promise<void> {
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  const dbCompanyId = getDbUuidKey(log.userId, log.tenantId);
  const taskFormatted = `${log.featureUsed} [${log.status}]`;
  const timestamp = log.timestamp || new Date().toISOString();

  // 1. Write to ai_credit_logs
  try {
    const { error } = await client.from("ai_credit_logs").insert({
      user_id: log.userId,
      company_id: dbCompanyId,
      task_performed: taskFormatted,
      tokens_used: log.tokensUsed || 0,
      credits_used: log.creditsDeducted,
      timestamp: timestamp,
    });
    if (error) {
      await rootSupabase.from("ai_credit_logs").insert({
        user_id: log.userId,
        company_id: dbCompanyId,
        task_performed: taskFormatted,
        tokens_used: log.tokensUsed || 0,
        credits_used: log.creditsDeducted,
        timestamp: timestamp,
      });
    }
  } catch (err) {
    console.warn("[logAiCreditRequest] ai_credit_logs error:", err);
  }

  // 2. Write to ai_usage_logs and ai_usage tables
  try {
    await rootSupabase.from("ai_usage_logs").insert({
      user_id: log.userId,
      company_id: dbCompanyId,
      task_performed: taskFormatted,
      tokens_used: log.tokensUsed || 0,
      credits_used: log.creditsDeducted,
      timestamp: timestamp,
    });
  } catch (err) {
    console.warn("[logAiCreditRequest] ai_usage_logs error:", err);
  }

  try {
    await rootSupabase.from("ai_usage").insert({
      user_id: log.userId,
      company_id: dbCompanyId,
      feature_used: log.featureUsed,
      credits_used: log.creditsDeducted,
      tokens_used: log.tokensUsed || 0,
      status: log.status,
      created_at: timestamp,
    });
  } catch (err) {
    console.warn("[logAiCreditRequest] ai_usage table insert exception:", err);
  }

  // 3. Write to generated_documents as fallback
  try {
    const entryId = `ledger-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    await rootSupabase.from("generated_documents").insert({
      id: entryId,
      company_id: dbCompanyId === "00000000-0000-0000-0000-000000000000" ? null : dbCompanyId,
      document_type: "cravebiz_ai_ledger_entry",
      content: {
        userId: log.userId,
        tenantId: log.tenantId,
        featureUsed: log.featureUsed,
        creditsDeducted: log.creditsDeducted,
        tokensUsed: log.tokensUsed || 0,
        status: log.status,
        timestamp: timestamp,
        details: log.details
      }
    });
  } catch (err) {
    console.warn("[logAiCreditRequest] generated_documents fallback error:", err);
  }

  // 4. ALSO create Workspace Audit Log entry in audit_logs table
  try {
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    await rootSupabase.from("audit_logs").insert({
      id: auditId,
      company_id: dbCompanyId,
      user_id: log.userId,
      user_name: log.userId,
      action: "AI_USAGE",
      resource: "AI Engine",
      details: `${log.featureUsed} (${log.status}) - ${log.creditsDeducted} credit(s) deducted.`,
      created_at: timestamp
    });
  } catch (err) {
    console.warn("[logAiCreditRequest] audit_logs error:", err);
  }
}

/**
 * Fetch AI request log history for a user/tenant.
 */
export async function getAiCreditLogs(
  userId: string,
  tenantId: string,
  limit: number = 50,
  token?: string
): Promise<AiCreditLog[]> {
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;
  const dbCompanyId = getDbUuidKey(userId, tenantId);

  const logsMap = new Map<string, AiCreditLog>();

  // 1. Fetch from ai_credit_logs
  try {
    const { data } = await client
      .from("ai_credit_logs")
      .select("*")
      .or(`company_id.eq.${dbCompanyId},user_id.eq.${userId}`)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (data) {
      data.forEach((row: any) => {
        let status: 'Success' | 'Failed' = 'Success';
        let featureName = row.task_performed || 'AI Service';

        if (featureName.includes('[Failed]')) {
          status = 'Failed';
          featureName = featureName.replace('[Failed]', '').trim();
        } else if (featureName.includes('[Success]')) {
          status = 'Success';
          featureName = featureName.replace('[Success]', '').trim();
        }

        const log: AiCreditLog = {
          id: row.id,
          userId: row.user_id,
          tenantId: row.company_id,
          featureUsed: featureName,
          creditsDeducted: row.credits_used ?? 0,
          timestamp: row.timestamp,
          status: status,
          tokensUsed: row.tokens_used,
        };
        logsMap.set(row.id || `${row.timestamp}-${row.task_performed}`, log);
      });
    }
  } catch (err) {
    console.warn("[getAiCreditLogs] ai_credit_logs query exception:", err);
  }

  // 2. Fetch from ai_usage_logs
  if (logsMap.size < limit) {
    try {
      const { data } = await rootSupabase
        .from("ai_usage_logs")
        .select("*")
        .or(`company_id.eq.${dbCompanyId},user_id.eq.${userId}`)
        .order("timestamp", { ascending: false })
        .limit(limit);

      if (data) {
        data.forEach((row: any) => {
          let status: 'Success' | 'Failed' = 'Success';
          let featureName = row.task_performed || 'AI Service';

          if (featureName.includes('[Failed]')) {
            status = 'Failed';
            featureName = featureName.replace('[Failed]', '').trim();
          } else if (featureName.includes('[Success]')) {
            status = 'Success';
            featureName = featureName.replace('[Success]', '').trim();
          }

          const key = row.id || `${row.timestamp}-${row.task_performed}`;
          if (!logsMap.has(key)) {
            logsMap.set(key, {
              id: row.id,
              userId: row.user_id,
              tenantId: row.company_id,
              featureUsed: featureName,
              creditsDeducted: row.credits_used ?? 0,
              timestamp: row.timestamp,
              status: status,
              tokensUsed: row.tokens_used,
            });
          }
        });
      }
    } catch (err) {
      console.warn("[getAiCreditLogs] ai_usage_logs query exception:", err);
    }
  }

  // 3. Fallback to generated_documents (document_type = 'cravebiz_ai_ledger_entry')
  if (logsMap.size < limit) {
    try {
      const { data } = await rootSupabase
        .from("generated_documents")
        .select("*")
        .eq("document_type", "cravebiz_ai_ledger_entry")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (data) {
        data.forEach((doc: any) => {
          const c = doc.content || {};
          const key = doc.id;
          if (!logsMap.has(key)) {
            logsMap.set(key, {
              id: doc.id,
              userId: c.userEmail || c.userId || "user",
              tenantId: doc.company_id || tenantId,
              featureUsed: c.task || c.featureUsed || "AI Service",
              creditsDeducted: c.creditsUsed ?? c.creditsDeducted ?? 0,
              timestamp: c.timestamp || doc.created_at,
              status: c.status || "Success",
              tokensUsed: c.tokensUsed,
            });
          }
        });
      }
    } catch (err) {
      console.warn("[getAiCreditLogs] generated_documents query exception:", err);
    }
  }

  const result = Array.from(logsMap.values());
  result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return result.slice(0, limit);
}

/**
 * Resets or recharges user AI credits (e.g. for subscription renewal or manual refill).
 */
export async function resetUserAiCredits(
  userId: string,
  tenantId: string,
  newTotalCredits?: number,
  newPlan?: string,
  token?: string
): Promise<UserAiCredits> {
  const current = await getUserAiCredits(userId, tenantId, token);

  const plan = newPlan || current.subscriptionPlan;
  const total = newTotalCredits !== undefined ? newTotalCredits : (DEFAULT_PLAN_CREDITS[plan] || current.totalCredits);

  const updated: UserAiCredits = {
    ...current,
    totalCredits: total,
    remainingCredits: total,
    creditsUsed: 0,
    lastResetDate: new Date().toISOString(),
    subscriptionPlan: plan,
  };

  await saveUserAiCredits(updated, token);
  return updated;
}

/**
 * REUSABLE WRAPPER FUNCTION FOR ALL AI REQUESTS
 *
 * 1. Checks user credits FIRST. If exhausted, throws a friendly error BEFORE calling Gemini.
 * 2. Executes the AI action (`action()`).
 * 3. On success: Deducts credits and logs status "Success". Returns the AI result.
 * 4. On failure: Logs status "Failed" with 0 credits deducted, then rethrows the error.
 */
export async function executeAiRequestWithCredits<T>(params: {
  userId: string;
  tenantId: string;
  featureUsed: string;
  creditsRequired?: number;
  userEmail?: string;
  userName?: string;
  token?: string;
  action: () => Promise<T>;
}): Promise<{ result: T; remainingCredits: number; totalCredits: number }> {
  const creditsRequired = params.creditsRequired || 1;

  // STEP 1: Pre-execution Credit Check
  const check = await checkUserAiCredits(params.userId, params.tenantId, creditsRequired, params.token);
  if (!check.allowed) {
    const errorMsg = check.errorMessage || "Insufficient AI credits.";
    // Log blocked/failed attempt
    await logFailedAiRequest(params.userId, params.tenantId, params.featureUsed, errorMsg, params.userEmail, params.token);
    throw new Error(errorMsg);
  }

  // STEP 2: Execute the AI Request
  let result: T;
  try {
    result = await params.action();
  } catch (aiError: any) {
    // STEP 3A: On Failure -> Log failure, DO NOT deduct credits
    const errorMsg = aiError.message || "AI Request Execution Failed";
    await logFailedAiRequest(params.userId, params.tenantId, params.featureUsed, errorMsg, params.userEmail, params.token);
    throw aiError;
  }

  // STEP 3B: On Success -> Deduct credits after successful response
  const deduction = await deductUserAiCredits(
    params.userId,
    params.tenantId,
    params.featureUsed,
    creditsRequired,
    0,
    params.userEmail,
    params.userName,
    params.token
  );

  return {
    result,
    remainingCredits: deduction.remainingCredits,
    totalCredits: deduction.totalCredits,
  };
}
