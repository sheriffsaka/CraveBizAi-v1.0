import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dfqvgezjhudmnlyeycju.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI";

const rootSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface DocumentUsageRecord {
  userId: string;
  companyId: string;
  totalQuota: number;
  remainingCount: number;
  createdCount: number;
  resetDate: string;
  createdAt?: string;
  updatedAt?: string;
}

// Local cache files for instant offline resilience
const INVOICE_CACHE_FILE = path.join(process.cwd(), "user_invoice_usage_cache.json");
const RECEIPT_CACHE_FILE = path.join(process.cwd(), "user_receipt_usage_cache.json");

function readUsageCache(file: string): Record<string, DocumentUsageRecord> {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content) || {};
    }
  } catch (e) {
    console.warn(`[Usage Cache] Error reading cache from ${file}:`, e);
  }
  return {};
}

function writeUsageCache(file: string, cache: Record<string, DocumentUsageRecord>): void {
  try {
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    console.warn(`[Usage Cache] Error writing cache to ${file}:`, e);
  }
}

export const DEFAULT_INVOICE_QUOTAS: Record<string, number> = {
  Free: 10,
  Starter: 100,
  Growth: 999999,
  Business: 999999,
  Enterprise: 999999,
};

export const DEFAULT_RECEIPT_QUOTAS: Record<string, number> = {
  Free: 10,
  Starter: 100,
  Growth: 999999,
  Business: 999999,
  Enterprise: 999999,
};

export function getDbKey(userId?: string, companyId?: string): string {
  const target = companyId || userId || "default-workspace";
  let cleanKey = target;
  if (target.startsWith("ws-personal-")) cleanKey = target.replace("ws-personal-", "");
  else if (target.startsWith("ws-legal-")) cleanKey = target.replace("ws-legal-", "");
  else if (target.startsWith("ws-sales-")) cleanKey = target.replace("ws-sales-", "");

  if (cleanKey === "cravebiz-inc") return "00000000-0000-0000-0000-000000000000";
  return cleanKey;
}

function getNextResetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/**
 * Get Invoice Usage Record per user/workspace
 */
export async function getUserInvoiceUsage(
  userId: string,
  companyId: string,
  token?: string,
  defaultTier: string = "Free"
): Promise<DocumentUsageRecord> {
  const key = getDbKey(userId, companyId);
  const quota = DEFAULT_INVOICE_QUOTAS[defaultTier] ?? 10;
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  let record: DocumentUsageRecord | null = null;

  try {
    const { data, error } = await client
      .from("user_invoice_usage")
      .select("*")
      .eq("company_id", key)
      .maybeSingle();

    if (data && !error) {
      record = {
        userId: data.user_id || userId,
        companyId: data.company_id || key,
        totalQuota: data.total_quota ?? quota,
        remainingCount: data.remaining_count ?? quota,
        createdCount: data.created_count ?? 0,
        resetDate: data.reset_date || getNextResetDate(),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch (err) {
    console.warn("[getUserInvoiceUsage] Supabase fetch error, checking cache:", err);
  }

  // Fallback to local file cache if Supabase didn't return
  if (!record) {
    const cache = readUsageCache(INVOICE_CACHE_FILE);
    if (cache[key]) {
      record = cache[key];
    }
  }

  // If still no record, initialize new record
  if (!record) {
    record = {
      userId: userId || "user",
      companyId: key,
      totalQuota: quota,
      remainingCount: quota,
      createdCount: 0,
      resetDate: getNextResetDate(),
    };
  }

  // Check for auto-reset if resetDate has elapsed
  if (record.resetDate && new Date(record.resetDate) <= new Date()) {
    record.createdCount = 0;
    record.remainingCount = record.totalQuota;
    record.resetDate = getNextResetDate();
    record.updatedAt = new Date().toISOString();
    await saveUserInvoiceUsage(record, token).catch(e => console.warn("[getUserInvoiceUsage] Auto-reset save warning:", e));
  }

  // Cache locally
  const cache = readUsageCache(INVOICE_CACHE_FILE);
  cache[key] = record;
  writeUsageCache(INVOICE_CACHE_FILE, cache);

  return record;
}

/**
 * Save / Upsert Invoice Usage Record
 */
export async function saveUserInvoiceUsage(
  record: DocumentUsageRecord,
  token?: string
): Promise<void> {
  const key = getDbKey(record.userId, record.companyId);
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  const payload = {
    user_id: record.userId,
    company_id: key,
    total_quota: record.totalQuota,
    remaining_count: record.remainingCount,
    created_count: record.createdCount,
    reset_date: record.resetDate,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await client.from("user_invoice_usage").upsert(payload, { onConflict: "user_id,company_id" });
    if (error) {
      // Try fallback to root client
      await rootSupabase.from("user_invoice_usage").upsert(payload, { onConflict: "user_id,company_id" });
    }
  } catch (e) {
    console.warn("[saveUserInvoiceUsage] DB upsert failed:", e);
  }

  // Update local cache
  const cache = readUsageCache(INVOICE_CACHE_FILE);
  cache[key] = record;
  writeUsageCache(INVOICE_CACHE_FILE, cache);
}

/**
 * Deduct 1 Invoice Quota (and prevent creation if quota is exhausted)
 */
export async function deductInvoiceQuota(
  userId: string,
  companyId: string,
  token?: string,
  defaultTier: string = "Free"
): Promise<DocumentUsageRecord> {
  const record = await getUserInvoiceUsage(userId, companyId, token, defaultTier);

  if (record.remainingCount <= 0) {
    throw new Error(`Invoice creation quota exhausted (${record.createdCount}/${record.totalQuota} created). Please upgrade your subscription plan.`);
  }

  record.createdCount += 1;
  record.remainingCount = Math.max(0, record.totalQuota - record.createdCount);
  record.updatedAt = new Date().toISOString();

  await saveUserInvoiceUsage(record, token);
  return record;
}

/**
 * Get Receipt Usage Record per user/workspace
 */
export async function getUserReceiptUsage(
  userId: string,
  companyId: string,
  token?: string,
  defaultTier: string = "Free"
): Promise<DocumentUsageRecord> {
  const key = getDbKey(userId, companyId);
  const quota = DEFAULT_RECEIPT_QUOTAS[defaultTier] ?? 10;
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  let record: DocumentUsageRecord | null = null;

  try {
    const { data, error } = await client
      .from("user_receipt_usage")
      .select("*")
      .eq("company_id", key)
      .maybeSingle();

    if (data && !error) {
      record = {
        userId: data.user_id || userId,
        companyId: data.company_id || key,
        totalQuota: data.total_quota ?? quota,
        remainingCount: data.remaining_count ?? quota,
        createdCount: data.created_count ?? 0,
        resetDate: data.reset_date || getNextResetDate(),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch (err) {
    console.warn("[getUserReceiptUsage] Supabase fetch error, checking cache:", err);
  }

  if (!record) {
    const cache = readUsageCache(RECEIPT_CACHE_FILE);
    if (cache[key]) {
      record = cache[key];
    }
  }

  if (!record) {
    record = {
      userId: userId || "user",
      companyId: key,
      totalQuota: quota,
      remainingCount: quota,
      createdCount: 0,
      resetDate: getNextResetDate(),
    };
  }

  // Check for auto-reset if resetDate has elapsed
  if (record.resetDate && new Date(record.resetDate) <= new Date()) {
    record.createdCount = 0;
    record.remainingCount = record.totalQuota;
    record.resetDate = getNextResetDate();
    record.updatedAt = new Date().toISOString();
    await saveUserReceiptUsage(record, token).catch(e => console.warn("[getUserReceiptUsage] Auto-reset save warning:", e));
  }

  const cache = readUsageCache(RECEIPT_CACHE_FILE);
  cache[key] = record;
  writeUsageCache(RECEIPT_CACHE_FILE, cache);

  return record;
}

/**
 * Save / Upsert Receipt Usage Record
 */
export async function saveUserReceiptUsage(
  record: DocumentUsageRecord,
  token?: string
): Promise<void> {
  const key = getDbKey(record.userId, record.companyId);
  const client = token ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } }) : rootSupabase;

  const payload = {
    user_id: record.userId,
    company_id: key,
    total_quota: record.totalQuota,
    remaining_count: record.remainingCount,
    created_count: record.createdCount,
    reset_date: record.resetDate,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await client.from("user_receipt_usage").upsert(payload, { onConflict: "user_id,company_id" });
    if (error) {
      await rootSupabase.from("user_receipt_usage").upsert(payload, { onConflict: "user_id,company_id" });
    }
  } catch (e) {
    console.warn("[saveUserReceiptUsage] DB upsert failed:", e);
  }

  const cache = readUsageCache(RECEIPT_CACHE_FILE);
  cache[key] = record;
  writeUsageCache(RECEIPT_CACHE_FILE, cache);
}

/**
 * Deduct 1 Receipt Quota (and prevent creation if quota is exhausted)
 */
export async function deductReceiptQuota(
  userId: string,
  companyId: string,
  token?: string,
  defaultTier: string = "Free"
): Promise<DocumentUsageRecord> {
  const record = await getUserReceiptUsage(userId, companyId, token, defaultTier);

  if (record.remainingCount <= 0) {
    throw new Error(`Receipt creation quota exhausted (${record.createdCount}/${record.totalQuota} created). Please upgrade your subscription plan.`);
  }

  record.createdCount += 1;
  record.remainingCount = Math.max(0, record.totalQuota - record.createdCount);
  record.updatedAt = new Date().toISOString();

  await saveUserReceiptUsage(record, token);
  return record;
}
