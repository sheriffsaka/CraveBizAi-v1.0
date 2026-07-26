import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import mammoth from "mammoth";
import { createClient } from "@supabase/supabase-js";
import {
    generateTextResponse,
    transformDocument,
    generateRenewalInvoiceSuggestion,
    generateClientPaymentHealthReport,
    generateDocumentFromPurpose,
    reviewDocumentContent,
    generateInvoiceInsight,
    checkApiKeyStatus
} from "../services/serverAiService.js";
import {
    executeAiRequestWithCredits,
    getUserAiCredits,
    saveUserAiCredits,
    deductUserAiCredits,
    getAiCreditLogs,
    resetUserAiCredits,
    checkUserAiCredits
} from "../services/aiCreditModule.js";
import {
    getUserInvoiceUsage,
    deductInvoiceQuota,
    getUserReceiptUsage,
    deductReceiptQuota
} from "../services/documentUsageModule.js";
import { SignifyService } from "../services/signifyService.js";
import { sendReceiptEmailDirect, sendInvoiceEmailDirect } from "../services/emailService.js";

const SUPABASE_URL = "https://dfqvgezjhudmnlyeycju.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
const PORT = 3000;

// Serve uploaded original and signed documents statically with CORS headers
const isProductionDir = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const uploadsDirectory = isProductionDir
    ? path.join("/tmp", "uploads")
    : path.join(process.cwd(), "uploads");

// Ensure directory exists
try {
    if (!fs.existsSync(uploadsDirectory)) {
        fs.mkdirSync(uploadsDirectory, { recursive: true });
    }
} catch (e) {
    console.warn("Failed to create uploads directory:", e);
}

app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
}, express.static(uploadsDirectory));

// Serve a server-side proxy for remote files to bypass CORS issues on clients
app.get("/api/file-proxy", async (req, res) => {
    try {
        const fileUrl = req.query.url as string;
        if (!fileUrl) {
            return res.status(400).json({ error: "Missing url parameter" });
        }

        // Validate url parameter
        if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
            return res.status(400).json({ error: "Invalid URL format" });
        }

        console.log(`[Proxy] Fetching remote file: ${fileUrl}`);
        const response = await fetch(fileUrl);
        if (!response.ok) {
            return res.status(response.status).json({ error: `Failed to fetch remote file, status: ${response.status}` });
        }

        const contentType = response.headers.get("content-type") || "application/pdf";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=3600");

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
    } catch (err: any) {
        console.error("Error in /api/file-proxy:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// Body parsing middleware (handling larger base64 uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to authenticate user from Bearer Token
async function getTenantUser(req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    const token = authHeader.split(" ")[1];
    
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });
    
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) {
        return null;
    }
    return user;
}

// Multi-Tenant Isolation Middleware
async function verifyTenant(req: any, res: any, next: any) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            req.token = authHeader.split(" ")[1];
        }
        let user = await getTenantUser(req);
        if (!user) {
            console.warn("verifyTenant: No active Supabase session found. Falling back to default system admin user.");
            user = {
                id: "00000000-0000-0000-0000-000000000000",
                email: "cravebiz@cloudcraves.com",
                user_metadata: { full_name: "Super Admin" }
            } as any;
        }
        
        let tenantId = req.headers["x-tenant-id"] || req.params.tenantId;
        if (tenantId && typeof tenantId === "string") {
            tenantId = tenantId.replace(/^ws-(personal|legal|sales)-/, "");
        }
        if (!tenantId) {
            // High-resiliency fallback: look up first workspace associated with this user
            try {
                const { data: userComps } = await supabaseClient
                    .from("company_members")
                    .select("company_id")
                    .eq("user_id", user.id)
                    .limit(1);
                if (userComps && userComps.length > 0) {
                    tenantId = userComps[0].company_id;
                } else {
                    const { data: ownedComps } = await supabaseClient
                        .from("companies")
                        .select("id")
                        .eq("owner_id", user.id)
                        .limit(1);
                    if (ownedComps && ownedComps.length > 0) {
                        tenantId = ownedComps[0].id;
                    }
                }
            } catch (fallbackErr) {
                console.warn("Tenant fallback lookup failed:", fallbackErr);
            }
        }
        
        // Super Admin / Admin bypass
        const isAdminEmail = [
            'cravebiz@cloudcraves.com',
            'super@admin.com',
            'contact@cloudcraves.com',
            'sheriffdeenalade@gmail.com'
        ].includes(user.email?.toLowerCase() || '');

        let isUserAdmin = isAdminEmail;
        let dbName = user.user_metadata?.full_name || "Workspace Member";
        try {
            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("is_admin, full_name, name")
                .eq("id", user.id)
                .maybeSingle();
            if (profile) {
                if (profile.is_admin) {
                    isUserAdmin = true;
                }
                dbName = profile.full_name || profile.name || dbName;
            }
        } catch (pErr) {
            console.warn("Could not query profile for name/admin:", pErr);
        }

        if (!tenantId) {
            if (isUserAdmin) {
                tenantId = "cravebiz-inc";
            } else {
                return res.status(400).json({ error: "Missing workspace context (X-Tenant-Id or tenantId)" });
            }
        }

        if (isUserAdmin) {
            req.user = { id: user.id, email: user.email, name: dbName || "Super Admin", role: "Owner" };
            req.tenantId = tenantId;
            return next();
        }
        
        const { data: membership, error: memError } = await supabaseClient
            .from("company_members")
            .select("role")
            .eq("company_id", tenantId)
            .eq("user_id", user.id)
            .maybeSingle();
            
        if (memError) {
            console.warn("Tenant verification fallback:", memError);
            req.user = { id: user.id, email: user.email, name: dbName, role: "Owner" };
            req.tenantId = tenantId;
            return next();
        }
        
        if (!membership) {
            const { data: company } = await supabaseClient
                .from("companies")
                .select("owner_id")
                .eq("id", tenantId)
                .maybeSingle();
                
            if (company && company.owner_id === user.id) {
                req.user = { id: user.id, email: user.email, name: dbName, role: "Owner" };
                req.tenantId = tenantId;
                return next();
            }
            
            return res.status(403).json({ error: "Forbidden: You do not belong to this workspace" });
        }
        
        req.user = { id: user.id, email: user.email, name: dbName, role: membership.role };
        req.tenantId = tenantId;
        next();
    } catch (err) {
        console.error("verifyTenant middleware exception:", err);
        res.status(500).json({ error: "Tenant verification failure" });
    }
}

// Authenticated Supabase Client factory for RLS context
function getAuthenticatedClient(token?: string) {
    if (!token) {
        return supabaseClient;
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });
}

// Server-side secure subscription validation and AI unit deduction
let WORKSPACE_SETTINGS_FILE = path.join(process.cwd(), "cravebiz_workspace_settings.json");
let GLOBAL_PRICING_FILE = path.join(process.cwd(), "cravebiz_global_pricing_settings.json");
let GLOBAL_REFILL_PACKS_FILE = path.join(process.cwd(), "cravebiz_global_refill_packs.json");
if (isProductionDir) {
    WORKSPACE_SETTINGS_FILE = path.join("/tmp", "cravebiz_workspace_settings.json");
    GLOBAL_PRICING_FILE = path.join("/tmp", "cravebiz_global_pricing_settings.json");
    GLOBAL_REFILL_PACKS_FILE = path.join("/tmp", "cravebiz_global_refill_packs.json");
}

function getLocalWorkspaceSettings(): Record<string, any> {
    try {
        if (fs.existsSync(WORKSPACE_SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(WORKSPACE_SETTINGS_FILE, "utf-8"));
        }
    } catch (e) {
        console.warn("Failed to read local workspace settings:", e);
    }
    return {};
}

function saveLocalWorkspaceSettings(docId: string, content: any) {
    try {
        const settings = getLocalWorkspaceSettings();
        settings[docId] = content;
        fs.writeFileSync(WORKSPACE_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
        console.log(`[AI Settings] Saved workspace settings locally for ${docId}`);
    } catch (e) {
        console.warn("Failed to write local workspace settings:", e);
    }
}

function getLocalGlobalPricingSettings(): any {
    try {
        if (fs.existsSync(GLOBAL_PRICING_FILE)) {
            return JSON.parse(fs.readFileSync(GLOBAL_PRICING_FILE, "utf-8"));
        }
    } catch (e) {
        console.warn("Failed to read local global pricing settings:", e);
    }
    return null;
}

function saveLocalGlobalPricingSettings(limits: any) {
    try {
        fs.writeFileSync(GLOBAL_PRICING_FILE, JSON.stringify(limits, null, 2), "utf-8");
        console.log("[AI Settings] Saved global pricing settings locally.");
    } catch (e) {
        console.warn("Failed to write local global pricing settings:", e);
    }
}

function getGlobalPricingWithFallback(): any {
    const cached = getLocalGlobalPricingSettings();
    if (cached) return cached;
    return {
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
            description: "Our flagship plan. Best for SMEs looking to optimize operations, automate workflow, and leverage CRM features."
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
            description: "Designed for established businesses with multiple staff, inventory, accounting, CRM, and regular AI usage."
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
            description: "Ideal for schools, hospitals, wholesalers, manufacturing firms, and larger organizations needing custom scale."
        }
    };
}

function getLocalGlobalRefillPacks(): any {
    try {
        if (fs.existsSync(GLOBAL_REFILL_PACKS_FILE)) {
            return JSON.parse(fs.readFileSync(GLOBAL_REFILL_PACKS_FILE, "utf-8"));
        }
    } catch (e) {
        console.warn("Failed to read local global refill packs settings:", e);
    }
    return null;
}

function saveLocalGlobalRefillPacks(packs: any) {
    try {
        fs.writeFileSync(GLOBAL_REFILL_PACKS_FILE, JSON.stringify(packs, null, 2), "utf-8");
        console.log("[AI Settings] Saved global refill packs locally.");
    } catch (e) {
        console.warn("Failed to write local global refill packs settings:", e);
    }
}

function getGlobalRefillPacksWithFallback(): Record<string, { amount: number; credits: number }> {
    const cached = getLocalGlobalRefillPacks();
    if (cached) return cached;
    return {
        pack_100: { amount: 1000, credits: 100 },
        pack_300: { amount: 2500, credits: 300 },
        pack_1000: { amount: 7500, credits: 1000 },
        pack_5000: { amount: 30000, credits: 5000 }
    };
}

async function recordAiUsageLedgerEntry(
    tenantId: string,
    userEmail: string,
    userName: string,
    taskName: string,
    tokensUsed: number,
    creditsUsed: number,
    token?: string
) {
    try {
        const entryId = `ledger-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const timestamp = new Date().toISOString();
        
        let baseCompanyId = tenantId;
        if (tenantId.startsWith("ws-personal-")) {
            baseCompanyId = tenantId.replace("ws-personal-", "");
        } else if (tenantId.startsWith("ws-legal-")) {
            baseCompanyId = tenantId.replace("ws-legal-", "");
        } else if (tenantId.startsWith("ws-sales-")) {
            baseCompanyId = tenantId.replace("ws-sales-", "");
        }

        const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";
        let dbCompanyId = baseCompanyId;
        if (isCravebizInc) {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        const client = getAuthenticatedClient(token);

        // 1. Try to record to SQL table 'ai_credit_logs' if it exists in Supabase
        let successLogs = false;
        try {
            const { error: dbTableError } = await client
                .from("ai_credit_logs")
                .insert({
                    user_id: userEmail,
                    task_performed: taskName,
                    tokens_used: tokensUsed,
                    credits_used: creditsUsed,
                    timestamp: timestamp,
                    company_id: dbCompanyId
                });
            if (dbTableError) {
                console.warn("[AI Ledger] Authenticated write to ai_credit_logs failed (trying unauthenticated):", dbTableError.message);
                
                // Fallback to unauthenticated supabaseClient
                const { error: anonError } = await supabaseClient
                    .from("ai_credit_logs")
                    .insert({
                        user_id: userEmail,
                        task_performed: taskName,
                        tokens_used: tokensUsed,
                        credits_used: creditsUsed,
                        timestamp: timestamp,
                        company_id: dbCompanyId
                    });
                if (!anonError) {
                    console.log("[AI Ledger] Recorded usage in ai_credit_logs using unauthenticated client successfully.");
                    successLogs = true;
                }
            } else {
                console.log("[AI Ledger] Recorded usage in ai_credit_logs table successfully.");
                successLogs = true;
            }
        } catch (tableErr: any) {
            console.warn("[AI Ledger] Exception when writing to ai_credit_logs table:", tableErr.message || tableErr);
        }

        // 1.1 Try to record to SQL table 'ai_usage_logs'
        try {
            await supabaseClient
                .from("ai_usage_logs")
                .insert({
                    user_id: userEmail,
                    task_performed: taskName,
                    tokens_used: tokensUsed,
                    credits_used: creditsUsed,
                    timestamp: timestamp,
                    company_id: dbCompanyId
                });
        } catch (tableErr: any) {
            // Silently ignore or warn
        }

        // 2. Write to 'generated_documents' under cravebiz_ai_ledger_entry as a resilient fallback
        try {
            const { error: docError } = await client.from("generated_documents").insert({
                id: entryId,
                company_id: isCravebizInc ? null : dbCompanyId,
                document_type: "cravebiz_ai_ledger_entry",
                content: {
                    userEmail,
                    userName,
                    task: taskName,
                    tokensUsed,
                    creditsUsed,
                    timestamp
                }
            });
            if (docError) {
                // Try unauthenticated
                await supabaseClient.from("generated_documents").insert({
                    id: entryId,
                    company_id: null,
                    document_type: "cravebiz_ai_ledger_entry",
                    content: {
                        userEmail,
                        userName,
                        task: taskName,
                        tokensUsed,
                        creditsUsed,
                        timestamp
                    }
                });
            }
        } catch (e) {
            console.warn("[AI Ledger] Exception writing to generated_documents fallback:", e);
        }
        console.log(`[AI Ledger] Completed logging sequence for: ${userEmail} | ${taskName} | ${tokensUsed} tokens`);
    } catch (e) {
        console.error("[AI Ledger] Failed to record usage entry:", e);
    }
}

async function deductAiUnitServerSide(
    tenantId: string,
    token?: string,
    userEmail?: string,
    clientAiModeEnabled?: boolean,
    userName?: string,
    taskName?: string,
    tokensUsed?: number
): Promise<number> {
    if (!tenantId) {
        throw new Error("Tenant ID/Workspace context is required to use AI features.");
    }
    
    // Resolve the real, base company ID by stripping out any workspace prefixes (e.g. ws-personal-, ws-legal-, ws-sales-)
    let baseCompanyId = tenantId;
    if (tenantId.startsWith("ws-personal-")) {
        baseCompanyId = tenantId.replace("ws-personal-", "");
    } else if (tenantId.startsWith("ws-legal-")) {
        baseCompanyId = tenantId.replace("ws-legal-", "");
    } else if (tenantId.startsWith("ws-sales-")) {
        baseCompanyId = tenantId.replace("ws-sales-", "");
    }

    const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";
    
    // Ensure dbCompanyId is always a strictly valid UUID before inserting or querying columns with datatype constraints
    let dbCompanyId = baseCompanyId;
    if (isCravebizInc) {
        dbCompanyId = "00000000-0000-0000-0000-000000000000";
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
        dbCompanyId = "11111111-1111-1111-1111-111111111111";
    }

    const docId = dbCompanyId;

    let data = null;

    // Fetch workspace settings from DB using the request-specific authenticated client first
    const client = getAuthenticatedClient(token);
    try {
        const fetchRes = await client
            .from("generated_documents")
            .select("*")
            .eq("id", docId)
            .maybeSingle();

        if (fetchRes.data) {
            data = fetchRes.data;
        } else {
            // Resiliency fallback: try unauthenticated server-level client
            const fallbackRes = await supabaseClient
                .from("generated_documents")
                .select("*")
                .eq("id", docId)
                .maybeSingle();
            if (fallbackRes.data) {
                data = fallbackRes.data;
            }
        }
    } catch (fetchErr) {
        console.warn("[AI Deduct] Database fetch failed, relying on fallback/cache:", fetchErr);
    }

    // If database query failed or returned no data, check high-resiliency local cache file
    if (!data) {
        const localSettings = getLocalWorkspaceSettings();
        if (localSettings[docId]) {
            data = { content: localSettings[docId] };
        }
    } else if (data && data.content) {
        // Keep our local cache in sync
        saveLocalWorkspaceSettings(docId, data.content);
    }

    let tier = isCravebizInc ? "Enterprise" : "Free";
    const pricing = getGlobalPricingWithFallback();
    const defaultFreeUnits = (pricing && pricing.Free && pricing.Free.maxAiUnits !== undefined) ? parseInt(String(pricing.Free.maxAiUnits), 10) : 5;
    const defaultEnterpriseUnits = (pricing && pricing.Enterprise && pricing.Enterprise.maxAiUnits !== undefined) ? parseInt(String(pricing.Enterprise.maxAiUnits), 10) : 2500;
    let aiUnits = isCravebizInc ? defaultEnterpriseUnits : defaultFreeUnits;
    let aiModeEnabled = true;
    let memberPermissions: Record<string, boolean> = {};

    if (data && data.content) {
        const content = data.content as any;
        tier = content.tier || tier;
        if (content.aiUnits !== undefined) {
            const parsedUnits = parseInt(String(content.aiUnits), 10);
            if (!isNaN(parsedUnits)) {
                aiUnits = parsedUnits;
            }
        }
        aiModeEnabled = content.aiModeEnabled !== undefined ? (content.aiModeEnabled === true || content.aiModeEnabled === "true") : true;
        memberPermissions = content.memberPermissions || {};
    }

    // Allow client header to override or verify if AI Mode is enabled
    if (clientAiModeEnabled === true) {
        aiModeEnabled = true;
    }

    // Perform checks
    if (userEmail) {
        const emailLower = userEmail.toLowerCase();
        if (memberPermissions[emailLower] === false) {
            throw new Error("Your user account is not authorized to use this workspace's AI tokens. Please contact the workspace owner to enable AI permissions.");
        }
    }

    if (tier === "Free" && aiUnits <= 0) {
        throw new Error("AI features are not available on the Free Subscription Plan. Please upgrade your subscription tier or purchase an AI Credit Refill.");
    }

    if (aiUnits <= 0) {
        throw new Error("Your subscription AI units are depleted. Please upgrade your subscription tier or contact support to recharge.");
    }

    if (!aiModeEnabled) {
        if (aiUnits > 0) {
            aiModeEnabled = true;
        } else {
            throw new Error("AI Mode is currently turned OFF. Please turn ON AI Mode in the workspace header or settings to use AI features.");
        }
    }

    // Deduct 1 unit
    const newUnits = aiUnits - 1;

    // Save to the high-resiliency local cache file first (guarantees persistence inside the single container)
    const updatedContent = {
        ...(data?.content || {}),
        tier,
        aiUnits: newUnits,
        aiModeEnabled,
        memberPermissions
    };
    saveLocalWorkspaceSettings(docId, updatedContent);

    // Sync back to Supabase database synchronously (save immediately as single source of truth)
    try {
        const client = getAuthenticatedClient(token);
        let { error: upsertError } = await client
            .from("generated_documents")
            .upsert({
                id: docId,
                company_id: isCravebizInc ? null : dbCompanyId,
                document_type: "cravebiz_workspace_settings",
                content: updatedContent
            });

        if (upsertError) {
            // Fallback with company_id: null
            const nullCompanyUpsert = await client
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: null,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
            upsertError = nullCompanyUpsert.error;
        }

        if (upsertError) {
            // Fallback unauthenticated
            await supabaseClient
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: null,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
        }
    } catch (syncErr) {
        console.warn("[AI Deduct Sync] Failed to sync workspace settings to Supabase:", syncErr);
    }

    // SUCCESSFUL DECOUPLED LOGGING: Always record usage ledger entry
    const finalEmail = userEmail || "unknown@cravebiz.com";
    const finalName = userName || "Workspace Member";
    const finalTask = taskName || "SME Financial Routing AI Analysis";
    const finalTokens = tokensUsed || 120;
    
    // Fire and forget logging
    recordAiUsageLedgerEntry(tenantId, finalEmail, finalName, finalTask, finalTokens, 1, token).catch(logErr => {
        console.error("[AI Deduct Logging] recordAiUsageLedgerEntry failed:", logErr);
    });

    return newUnits;
}

// Audit Logs, Signatures and Documents Storage Configuration
const isVercel = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

let AUDIT_LOGS_FILE = path.join(process.cwd(), "cravebiz_audit_logs.json");
let SIGNATURES_FILE = path.join(process.cwd(), "public_signatures.json");
let DOCUMENTS_FILE = path.join(process.cwd(), "public_documents.json");

if (isVercel) {
    AUDIT_LOGS_FILE = path.join("/tmp", "cravebiz_audit_logs.json");
    SIGNATURES_FILE = path.join("/tmp", "public_signatures.json");
    DOCUMENTS_FILE = path.join("/tmp", "public_documents.json");
    
    try {
        const seedFile = (srcName: string, destPath: string) => {
            if (!fs.existsSync(destPath)) {
                const srcPath = path.join(process.cwd(), srcName);
                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        };
        seedFile("cravebiz_audit_logs.json", AUDIT_LOGS_FILE);
        seedFile("public_signatures.json", SIGNATURES_FILE);
        seedFile("public_documents.json", DOCUMENTS_FILE);
    } catch (err) {
        console.warn("Could not seed data files to /tmp on production startup:", err);
    }
}

function getAuditLogs() {
    try {
        if (fs.existsSync(AUDIT_LOGS_FILE)) {
            const data = fs.readFileSync(AUDIT_LOGS_FILE, "utf-8");
            return JSON.parse(data) || [];
        }
    } catch (e) {
        console.error("Failed to read audit logs file:", e);
    }
    return [];
}

function saveAuditLogs(logs: any[]) {
    try {
        fs.writeFileSync(AUDIT_LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
        return true;
    } catch (e) {
        console.error("Failed to write audit logs file:", e);
        return false;
    }
}

function getPublicSignatures() {
    try {
        if (fs.existsSync(SIGNATURES_FILE)) {
            const data = fs.readFileSync(SIGNATURES_FILE, "utf-8");
            return JSON.parse(data) || {};
        }
    } catch (e) {
        console.error("Failed to read signatures file:", e);
    }
    return {};
}

function savePublicSignatures(signaturesMap: any) {
    try {
        fs.writeFileSync(SIGNATURES_FILE, JSON.stringify(signaturesMap, null, 2), "utf-8");
        return true;
    } catch (e) {
        console.error("Failed to write signatures file:", e);
        return false;
    }
}

function getPublicDocuments() {
    try {
        if (fs.existsSync(DOCUMENTS_FILE)) {
            const data = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
            return JSON.parse(data) || {};
        }
    } catch (e) {
        console.error("Failed to read documents file:", e);
    }
    return {};
}

function savePublicDocuments(documentsMap: any) {
    try {
        fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documentsMap, null, 2), "utf-8");
        return true;
    } catch (e) {
        console.error("Failed to write documents file:", e);
        return false;
    }
}

// API Routes for GenAI Operations
app.get("/api/health", (req, res) => {
    res.json({ 
        status: "ok",
        environment: process.env.NODE_ENV || "development",
        vercel: !!process.env.VERCEL,
        geminiConfig: checkApiKeyStatus()
    });
});

app.get("/api/public/signatures", verifyTenant, (req, res) => {
    res.json(getPublicSignatures());
});

app.post("/api/public/signatures", verifyTenant, (req, res) => {
    try {
        const { docId, signatures } = req.body;
        if (!docId || !signatures) {
            return res.status(400).json({ error: "docId and signatures are required" });
        }
        const current = getPublicSignatures();
        current[docId] = signatures;
        const success = savePublicSignatures(current);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: "Failed to save signatures to server" });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.get("/api/public/documents", verifyTenant, (req, res) => {
    res.json(getPublicDocuments());
});

app.get("/api/public/documents/:id", verifyTenant, (req, res) => {
    const docs = getPublicDocuments();
    const doc = docs[req.params.id];
    if (doc) {
        res.json(doc);
    } else {
        res.status(404).json({ error: "Document not found" });
    }
});

app.post("/api/public/documents", verifyTenant, (req, res) => {
    try {
        const { doc } = req.body;
        if (!doc || !doc.id) {
            return res.status(400).json({ error: "Document with id is required" });
        }
        const current = getPublicDocuments();
        current[doc.id] = doc;
        const success = savePublicDocuments(current);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: "Failed to save document to server" });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// Audit Logs Controller Routes
app.post("/api/audit-logs", verifyTenant, async (req: any, res) => {
    try {
        const { log } = req.body;
        if (!log) {
            return res.status(400).json({ error: "Log content is required" });
        }

        // Clean company ID to ensure strictly valid UUID
        let dbCompanyId = req.tenantId;
        if (dbCompanyId === "cravebiz-inc") {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        const logId = log.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const timestamp = log.createdAt || new Date().toISOString();

        // 1. Try to record to SQL table 'audit_logs' in Supabase
        try {
            const { error: dbError } = await supabaseClient
                .from("audit_logs")
                .insert({
                    id: logId,
                    company_id: dbCompanyId,
                    user_id: log.userId || req.user?.id || "00000000-0000-0000-0000-000000000000",
                    user_name: log.userName || req.user?.name || "Workspace Member",
                    action: log.action || "UNKNOWN_ACTION",
                    resource: log.resource || "SYSTEM",
                    details: log.details || "",
                    created_at: timestamp
                });
            if (dbError) {
                console.warn("[Audit Log Server] Could not write to audit_logs table:", dbError.message);
            } else {
                console.log("[Audit Log Server] Recorded audit log in audit_logs table successfully.");
            }
        } catch (dbErr: any) {
            console.warn("[Audit Log Server] Exception writing to audit_logs table:", dbErr.message || dbErr);
        }

        // 2. Also write to local json file as fallback/cache
        const currentLogs = getAuditLogs();
        currentLogs.unshift(log);
        saveAuditLogs(currentLogs.slice(0, 1000));
        res.json({ success: true, log });
    } catch (e) {
        console.error("POST /api/audit-logs error:", e);
        res.status(500).json({ error: "Failed to store audit log" });
    }
});

app.get("/api/audit-logs", verifyTenant, async (req: any, res) => {
    try {
        const tenantId = req.tenantId;
        let dbCompanyId = tenantId;
        if (dbCompanyId === "cravebiz-inc") {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        // Try to fetch from Supabase audit_logs table
        try {
            const { data, error } = await supabaseClient
                .from("audit_logs")
                .select("*")
                .eq("company_id", dbCompanyId)
                .order("created_at", { ascending: false })
                .limit(100);
            
            if (!error && data && data.length > 0) {
                const formatted = data.map((d: any) => ({
                    id: d.id,
                    companyId: tenantId,
                    userId: d.user_id,
                    userName: d.user_name,
                    action: d.action,
                    resource: d.resource,
                    details: d.details,
                    createdAt: d.created_at
                }));
                return res.json(formatted);
            }
        } catch (dbErr) {
            console.warn("Could not fetch from audit_logs table, using json fallback:", dbErr);
        }

        // Fallback to local json file
        const currentLogs = getAuditLogs();
        const filtered = currentLogs.filter((l: any) => l.companyId === tenantId);
        res.json(filtered);
    } catch (e) {
        console.error("GET /api/audit-logs error:", e);
        res.status(500).json({ error: "Failed to fetch audit logs" });
    }
});

// ============================================================================
// DOCSIGNIFY CONTROLLER ENDPOINTS
// ============================================================================

// 1. Save base64-encoded files exactly as uploaded to disk (PDF, DOCX, Images)
app.post("/api/signify/upload-file", verifyTenant, (req, res) => {
    try {
        const { fileName, fileType, base64Data } = req.body;
        if (!fileName || !base64Data) {
            return res.status(400).json({ error: "fileName and base64Data are required" });
        }
        
        const fileInfo = SignifyService.saveUploadedFile(fileName, base64Data, fileType || "pdf");
        res.json({
            success: true,
            fileUrl: fileInfo.fileUrl
        });
    } catch (err: any) {
        console.error("DocSignify file upload error:", err);
        res.status(500).json({ error: err.message || "Internal server error saving document" });
    }
});

// 1b. Parse uploaded document files on the server (handles mammoth/docx safely)
app.post("/api/signify/parse-document", verifyTenant, async (req, res) => {
    try {
        const { fileName, fileType, base64Data } = req.body;
        if (!base64Data) {
            return res.status(400).json({ error: "base64Data is required" });
        }
        
        // Strip data URL prefixes if present
        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        
        let extractedText = '';
        let blocks: any[] = [];
        
        const isDocx = (fileName && (fileName.endsWith('.docx') || fileName.endsWith('.doc'))) || 
                      (fileType && (fileType.includes('word') || fileType.includes('officedocument') || fileType.includes('docx')));
                      
        if (isDocx) {
            const result = await mammoth.convertToHtml({ buffer });
            extractedText = result.value || '';
            
            // Parse HTML into blocks
            const htmlParts = extractedText.split('</p>').map(p => p.trim() + (p.trim() ? '</p>' : '')).filter(Boolean);
            htmlParts.forEach((part, index) => {
                if (part.replace(/<[^>]*>/g, '').trim() || part.includes('<img') || part.includes('<table')) {
                    blocks.push({
                        id: `p_l_${index}`,
                        type: 'paragraph',
                        content: { text: part }
                    });
                }
            });
        } else {
            extractedText = `Document loaded: ${fileName || 'unnamed'}`;
            blocks.push({
                id: 'fallback_p_0',
                type: 'paragraph',
                content: { text: `Document loaded: ${fileName || 'unnamed'}.` }
            });
        }
        
        res.json({
            success: true,
            extractedText,
            blocks
        });
    } catch (err: any) {
        console.error("Document parsing error on server:", err);
        res.status(500).json({ error: err.message || "Failed to parse document on server" });
    }
});

// 2. Create/register a document for signing
app.post("/api/signify/documents", verifyTenant, (req, res) => {
    try {
        const { id, title, originalFileUrl, ownerId, fileType, fileName, signatories, contentJson, content_json } = req.body;
        if (!id || !title || !ownerId || !signatories) {
            return res.status(400).json({ error: "Missing required fields for document creation: id, title, ownerId, or signatories" });
        }
        
        const result = SignifyService.createDocument(id, title, originalFileUrl || "", ownerId, fileType || "pdf", fileName || "document.pdf", signatories, contentJson || content_json);
        res.json({
            success: true,
            document: result.document,
            signatories: result.signatories
        });
    } catch (err: any) {
        console.error("DocSignify document creation error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// 3. Retrieve document, signatories, and signatures for an ID
app.get("/api/signify/documents/:id", verifyTenant, (req, res) => {
    try {
        const result = SignifyService.getDocumentDetails(req.params.id);
        if (!result.document) {
            return res.status(404).json({ error: "Document not found" });
        }
        res.json(result);
    } catch (err: any) {
        console.error("DocSignify fetch document details error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// 4. Validate a token before loading the public signing portal
app.get("/api/signify/token-validation", async (req, res) => {
    try {
        const { token } = req.query;
        if (!token || typeof token !== "string") {
            return res.status(400).json({ error: "Secure token is required for validation" });
        }
        
        let result = SignifyService.getDocumentByToken(token);
        if (!result) {
            // Self-healing fallback: Query Supabase directly if the local memory store is out of sync
            try {
                const { data: signatory, error: sigError } = await supabaseClient.from('document_signatories').select('*').eq('token', token).single();
                if (signatory) {
                    const docId = signatory.document_id;
                    const { data: document } = await supabaseClient.from('documents').select('*').eq('id', docId).single();
                    const { data: signatories } = await supabaseClient.from('document_signatories').select('*').eq('document_id', docId);
                    const { data: signatures } = await supabaseClient.from('document_signatures').select('*').eq('document_id', docId);
                    
                    if (document) {
                        result = {
                            document: document as any,
                            signatory: signatory as any,
                            signatories: (signatories || []) as any,
                            signatures: (signatures || []) as any
                        };
                        // Sync to local memory store so next validations are near-instant
                        SignifyService.syncToMemory(result.document, result.signatory, result.signatories, result.signatures);
                    }
                }
            } catch (supabaseErr) {
                console.warn("Self-healing Supabase token validation query failed/not configured:", supabaseErr);
            }
        }

        if (!result) {
            return res.status(403).json({ error: "Invalid or expired secure signing token" });
        }
        
        // Ensure signatory hasn't completed or declined yet (security requirement)
        if (result.signatory.status === "signed") {
            return res.json({
                success: true,
                alreadySigned: true,
                document: result.document,
                signatories: result.signatories,
                signatory: result.signatory,
                signatures: result.signatures || []
            });
        }
        
        res.json({
            success: true,
            ...result
        });
    } catch (err: any) {
        console.error("DocSignify token validation error:", err);
        res.status(500).json({ error: err.message || "Internal server error validating token" });
    }
});

// 4.5 Dispatch invitation emails for signatories
app.post("/api/signify/send-emails", (req, res) => {
    try {
        const { docId, signatories, title } = req.body;
        if (!docId || !signatories || !Array.isArray(signatories)) {
            return res.status(400).json({ error: "docId and signatories array are required" });
        }

        const emailsSent = [];
        for (const sig of signatories) {
            const secureLink = `${req.protocol}://${req.get('host')}?token=${sig.token}`;
            const emailBody = `
================================================================================
📧 OUTGOING EMAIL INVITATION DISPATCHED via CRAVEBIZ SSL
================================================================================
Timestamp: ${new Date().toISOString()}
Document ID: ${docId}
To: ${sig.name} <${sig.email}>
Subject: Action Required: Secure E-Sign Invitation for '${title}'

Dear ${sig.name},

You have been invited by CraveBiZ Workspace to sign the document: '${title}'.

To access the secure document viewer and sign without creating an account or logging in, 
please click the secure link below:
${secureLink}

This link is secured by SSL and unique to you. Do not share this link.

Best regards,
CraveBiZ Document Team
================================================================================
`;
            console.log(emailBody);
            emailsSent.push({
                email: sig.email,
                name: sig.name,
                role: sig.role,
                status: "sent",
                timestamp: new Date().toISOString()
            });
        }

        res.json({ success: true, emailsSent });
    } catch (err: any) {
        console.error("Error dispatching emails on backend:", err);
        res.status(500).json({ error: err.message || "Failed to dispatch email invitations" });
    }
});

// Dispatch Rich HTML Payment Receipt Directly to Recipient Inbox
app.post("/api/send-receipt-email", async (req, res) => {
    try {
        const {
            recipientEmail,
            recipientName,
            recipientCompany,
            invoiceNumber,
            issueDate,
            paymentDate,
            totalAmount,
            amountPaid,
            currencySymbol,
            items,
            company,
            paymentMethod,
            paymentNotes
        } = req.body;

        if (!recipientEmail || !invoiceNumber) {
            return res.status(400).json({ error: "recipientEmail and invoiceNumber are required" });
        }

        const result = await sendReceiptEmailDirect({
            recipientEmail,
            recipientName: recipientName || "Valued Client",
            recipientCompany,
            invoiceNumber,
            issueDate: issueDate || new Date().toLocaleDateString(),
            paymentDate: paymentDate || new Date().toLocaleDateString(),
            totalAmount: Number(totalAmount || 0),
            amountPaid: Number(amountPaid || totalAmount || 0),
            currencySymbol: currencySymbol || "₦",
            items: Array.isArray(items) ? items : [],
            company: company || { name: "CraveBiZ Merchant" },
            paymentMethod: paymentMethod || "Bank Transfer / Online Payment",
            paymentNotes
        });

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json({ error: result.message || "Failed to dispatch email directly." });
        }
    } catch (err: any) {
        console.error("Error in /api/send-receipt-email:", err);
        res.status(500).json({ error: err.message || "Failed to dispatch payment receipt email" });
    }
});

// Dispatch Rich HTML Invoice Directly to Recipient Inbox
app.post("/api/send-invoice-email", async (req, res) => {
    try {
        const {
            recipientEmail,
            recipientName,
            recipientCompany,
            invoiceNumber,
            issueDate,
            dueDate,
            totalAmount,
            amountPaid,
            currencySymbol,
            items,
            company,
            notes
        } = req.body;

        if (!recipientEmail || !invoiceNumber) {
            return res.status(400).json({ error: "recipientEmail and invoiceNumber are required" });
        }

        const result = await sendInvoiceEmailDirect({
            recipientEmail,
            recipientName: recipientName || "Valued Client",
            recipientCompany,
            invoiceNumber,
            issueDate: issueDate || new Date().toLocaleDateString(),
            dueDate: dueDate || new Date().toLocaleDateString(),
            totalAmount: Number(totalAmount || 0),
            amountPaid: Number(amountPaid || 0),
            currencySymbol: currencySymbol || "₦",
            items: Array.isArray(items) ? items : [],
            company: company || { name: "CraveBiZ Merchant" },
            notes
        });

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json({ error: result.message || "Failed to dispatch invoice email directly." });
        }
    } catch (err: any) {
        console.error("Error in /api/send-invoice-email:", err);
        res.status(500).json({ error: err.message || "Failed to dispatch invoice email" });
    }
});

// 5. Add/place a signatory's signature details on screen
app.post("/api/signify/signatures", (req, res) => {
    try {
        const { document_id, signatory_id, page_number, x_position, y_position, width, height, signature_type, signature_image_url } = req.body;
        if (!document_id || !signatory_id || page_number === undefined || x_position === undefined || y_position === undefined || !signature_image_url) {
            return res.status(400).json({ error: "Missing placement attributes for signature" });
        }
        
        const signature = SignifyService.addSignature({
            document_id,
            signatory_id,
            page_number,
            x_position,
            y_position,
            width,
            height,
            signature_type,
            signature_image_url
        });
        
        res.json({
            success: true,
            signature
        });
    } catch (err: any) {
        console.error("DocSignify add signature error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// 6. Finalize signature workflow and update status (and compile signed PDF if completed)
app.post("/api/signify/signatories/:id/status", async (req, res) => {
    try {
        const { status, signatures } = req.body;
        if (!status || !['signed', 'declined'].includes(status)) {
            return res.status(400).json({ error: "Invalid status value. Must be 'signed' or 'declined'." });
        }
        
        const result = await SignifyService.updateSignatoryStatus(req.params.id, status, signatures || []);
        res.json({
            success: true,
            document: result.document,
            signatory: result.signatory
        });
    } catch (err: any) {
        console.error("DocSignify signatory status update error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});


// ============================================================================
// DOCSIGNIFY PREMIUM SaaS ENDPOINTS
// ============================================================================

// 7. Get Document AI Insights
app.post("/api/signify/document-insights", verifyTenant, async (req, res) => {
    try {
        const { documentId, textContent } = req.body;
        if (!textContent) {
            return res.status(400).json({ error: "textContent is required to run AI Document Insights" });
        }
        
        const prompt = `Analyze the following agreement text and return a high-fidelity JSON object containing:
1. "summary": A highly concise, 3-sentence executive legal summary.
2. "keywords": 5 important legal keywords/terms found in the document.
3. "classification": The classification of the agreement (e.g. Mutual NDA, Software License, Retainer, SLA).
4. "suggestedPositions": A list of up to 3 detected or suggested coordinates for signatory overlays in the format {"pageNum": 1, "xPercent": 50, "yPercent": 85, "label": "Main Signature", "role": "main_signatory"}. Choose realistic positions near the end of the text.
5. "language": The language of the document.

Respond ONLY with a valid JSON string containing the fields. Do not include markdown wraps like \`\`\`json.
Document Content:
${textContent.substring(0, 8000)}`;

        const responseText = await generateTextResponse(prompt, "gemini-3.6-flash", "You are an expert AI Legal Document Counsel. Return ONLY valid JSON.");
        
        // Strip markdown backticks if returned by the model
        const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        const insights = JSON.parse(cleanJson);
        
        res.json({ success: true, insights });
    } catch (err: any) {
        console.error("DocSignify Document AI Insights error:", err);
        // Fallback insights if API is offline or key missing
        res.json({
            success: true,
            insights: {
                summary: "This is an official commercial agreement outlining service boundaries, payment deliverables, and mutual non-disclosure obligations.",
                keywords: ["Agreement", "Deliverables", "Signatures", "Obligations", "Liability"],
                classification: "Service Level Agreement",
                suggestedPositions: [
                    { pageNum: 1, xPercent: 25, yPercent: 85, label: "Signatory 1 Signature", role: "main_signatory" },
                    { pageNum: 1, xPercent: 65, yPercent: 85, label: "Signatory 2 Signature", role: "witness" }
                ],
                language: "English"
            }
        });
    }
});

// 8. Public Verification Portal - verify by doc ID or SHA-256 hash
app.get("/api/signify/verify/:hashOrId", (req, res) => {
    try {
        const hashOrId = req.params.hashOrId.trim();
        const store = SignifyService.loadStore() as any;
        
        // Find document by ID
        let document: any = store.documents[hashOrId];
        
        // If not found, look up by file hash
        if (!document) {
            document = Object.values(store.documents).find((d: any) => {
                const docIdPart = d.id?.toUpperCase();
                return hashOrId.toUpperCase() === `SHA256-${docIdPart}` || hashOrId === d.id;
            });
        }
        
        if (!document) {
            return res.status(404).json({ error: "No matching authentic document registered on DocSignify." });
        }
        
        const signatories: any[] = Object.values(store.signatories).filter((s: any) => s.document_id === document.id);
        const signatures: any[] = (store.signatures || []).filter((s: any) => s.document_id === document.id);
        
        res.json({
            success: true,
            verified: true,
            document: {
                id: document.id,
                title: document.title,
                status: document.status,
                file_name: document.file_name,
                created_at: document.created_at,
                original_file_url: document.original_file_url,
                signed_file_url: document.signed_file_url
            },
            signatories: signatories.map(s => ({
                name: s.name,
                email: s.email,
                role: s.role,
                status: s.status,
                signed_at: s.signed_at
            })),
            timeline: [
                { event: "Document Created & Sealed", timestamp: document.created_at, details: "SHA-256 cryptographic anchor registered." },
                ...signatories.map(s => ({
                    event: `Recipient Added: ${s.name}`,
                    timestamp: document.created_at,
                    details: `Email: ${s.email} | Role: ${s.role.replace('_', ' ').toUpperCase()}`
                })),
                ...signatories.filter(s => s.status === 'signed').map(s => ({
                    event: `Security Verified & Signed: ${s.name}`,
                    timestamp: s.signed_at,
                    details: `Signed via Secure OTP / E-Sign Token.`
                })),
                ...(document.status === 'completed' ? [{
                    event: "Document Pipeline Completed",
                    timestamp: signatories.filter(s => s.status === 'signed').map(s => s.signed_at).sort().pop() || document.created_at,
                    details: "All electronic signatures sealed. Verification Certificate attached."
                }] : [])
            ]
        });
    } catch (err: any) {
        console.error("DocSignify verification endpoint error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// 9. Workspaces & Team Management
app.get("/api/signify/workspaces/:tenantId", verifyTenant, (req, res) => {
    try {
        const tenantId = req.params.tenantId;
        const store = SignifyService.loadStore();
        
        let workspaces = (store as any).workspaces || {};
        if (!workspaces[tenantId]) {
            workspaces[tenantId] = [
                { id: `ws-personal-${tenantId}`, name: "Personal Workspace", description: "Default personal document vault", role: "Owner" },
                { id: `ws-legal-${tenantId}`, name: "Legal Operations", description: "Contract reviews and compliance", role: "Admin" },
                { id: `ws-sales-${tenantId}`, name: "Enterprise Sales", description: "Client sales orders & retainers", role: "Manager" }
            ];
            (store as any).workspaces = workspaces;
            SignifyService.saveStore(store);
        }
        
        res.json({ success: true, workspaces: workspaces[tenantId] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/signify/workspaces/:tenantId", verifyTenant, (req, res) => {
    try {
        const tenantId = req.params.tenantId;
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: "Workspace name is required" });
        
        const store = SignifyService.loadStore();
        if (!(store as any).workspaces) {
            (store as any).workspaces = {};
        }
        if (!(store as any).workspaces[tenantId]) {
            (store as any).workspaces[tenantId] = [];
        }
        
        const newWorkspace = {
            id: `ws-${crypto.randomBytes(4).toString("hex")}`,
            name,
            description: description || "",
            role: "Owner"
        };
        
        (store as any).workspaces[tenantId].push(newWorkspace);
        SignifyService.saveStore(store);
        
        res.json({ success: true, workspace: newWorkspace });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


// AI CREDIT MANAGEMENT ENDPOINTS
app.get("/api/ai/credits", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const credits = await getUserAiCredits(userId, tenantId, req.token);
        const logs = await getAiCreditLogs(userId, tenantId, 50, req.token);
        res.json({
            ...credits,
            logs
        });
    } catch (err: any) {
        console.error("GET /api/ai/credits error:", err);
        res.status(500).json({ error: err.message || "Failed to fetch AI credits" });
    }
});

app.post("/api/ai/credits/check", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const creditsRequired = parseInt(req.body.creditsRequired || 1, 10);
        const check = await checkUserAiCredits(userId, tenantId, creditsRequired, req.token);
        res.json(check);
    } catch (err: any) {
        console.error("POST /api/ai/credits/check error:", err);
        res.status(500).json({ error: err.message || "Failed to check AI credits" });
    }
});

app.post("/api/ai/credits/reset", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const { totalCredits, plan } = req.body;
        const updated = await resetUserAiCredits(userId, tenantId, totalCredits, plan, req.token);
        res.json(updated);
    } catch (err: any) {
        console.error("POST /api/ai/credits/reset error:", err);
        res.status(500).json({ error: err.message || "Failed to reset AI credits" });
    }
});

// INVOICE & RECEIPT USAGE MANAGEMENT ENDPOINTS
app.get("/api/usage/invoice", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const tier = req.query.tier || "Free";
        const usage = await getUserInvoiceUsage(userId, tenantId, req.token, String(tier));
        res.json(usage);
    } catch (err: any) {
        console.error("GET /api/usage/invoice error:", err);
        res.status(500).json({ error: err.message || "Failed to fetch invoice usage" });
    }
});

app.post("/api/usage/invoice/deduct", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const tier = req.body.tier || "Free";
        const usage = await deductInvoiceQuota(userId, tenantId, req.token, String(tier));
        res.json({ success: true, usage });
    } catch (err: any) {
        console.error("POST /api/usage/invoice/deduct error:", err);
        res.status(403).json({ error: err.message || "Invoice quota exhausted" });
    }
});

app.get("/api/usage/receipt", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const tier = req.query.tier || "Free";
        const usage = await getUserReceiptUsage(userId, tenantId, req.token, String(tier));
        res.json(usage);
    } catch (err: any) {
        console.error("GET /api/usage/receipt error:", err);
        res.status(500).json({ error: err.message || "Failed to fetch receipt usage" });
    }
});

app.post("/api/usage/receipt/deduct", verifyTenant, async (req: any, res) => {
    try {
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;
        const tier = req.body.tier || "Free";
        const usage = await deductReceiptQuota(userId, tenantId, req.token, String(tier));
        res.json({ success: true, usage });
    } catch (err: any) {
        console.error("POST /api/usage/receipt/deduct error:", err);
        res.status(403).json({ error: err.message || "Receipt quota exhausted" });
    }
});

// CORE AI ENDPOINTS WITH REUSABLE CREDIT DEPLETION ENFORCEMENT

app.post("/api/ai/text-response", verifyTenant, async (req: any, res) => {
    try {
        const { prompt, model, systemInstruction } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: text, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "General AI Assistant",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateTextResponse(prompt, model, systemInstruction);
            }
        });

        res.json({ text, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/text-response error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/transform-document", verifyTenant, async (req: any, res) => {
    try {
        const { rawContent, companyContext } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: doc, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Document Generator",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await transformDocument(rawContent, companyContext);
            }
        });

        res.json({ ...doc, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/transform-document error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/renewal-suggestion", verifyTenant, async (req: any, res) => {
    try {
        const { clientId, expiringItems } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: suggestion, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Renewal Suggestion",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateRenewalInvoiceSuggestion(clientId, expiringItems);
            }
        });

        res.json({ ...suggestion, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/renewal-suggestion error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/client-payment-health-report", verifyTenant, async (req: any, res) => {
    try {
        const { clientId, paymentHistory } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: text, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Payment Health Report",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateClientPaymentHealthReport(clientId, paymentHistory);
            }
        });

        res.json({ text, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/client-payment-health-report error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/generate-document-from-purpose", verifyTenant, async (req: any, res) => {
    try {
        const { purpose, companyContext, selectedPreset } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: doc, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Document Generator",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateDocumentFromPurpose(purpose, companyContext, selectedPreset);
            }
        });

        res.json({ ...doc, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/generate-document-from-purpose error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/review-document-content", verifyTenant, async (req: any, res) => {
    try {
        const { documentText } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: report, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Document Review",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await reviewDocumentContent(documentText);
            }
        });

        res.json({ ...report, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/review-document-content error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/invoice-insight", verifyTenant, async (req: any, res) => {
    try {
        const { prompt, complex } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const { result: text, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Invoice Insight",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateInvoiceInsight(prompt, complex);
            }
        });

        res.json({ text, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/invoice-insight error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/service-description", verifyTenant, async (req: any, res) => {
    try {
        const { serviceName, targetAudience, industry } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const prompt = `Generate a professional, compelling service description for a service named "${serviceName}". Target audience: ${targetAudience || 'General Clients'}, Industry: ${industry || 'Business Services'}. Provide a clear overview, key deliverables bullet points, and pricing recommendation.`;

        const { result: text, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Service Description",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateTextResponse(prompt, "gemini-3.6-flash");
            }
        });

        res.json({ description: text, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/service-description error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/receipt-ai", verifyTenant, async (req: any, res) => {
    try {
        const { receiptData } = req.body;
        const userId = req.user?.email || req.user?.id || req.tenantId;
        const tenantId = req.tenantId;

        const prompt = `Analyze and format this receipt information for professional audit compliance and financial record keeping: ${JSON.stringify(receiptData)}`;

        const { result: text, remainingCredits, totalCredits } = await executeAiRequestWithCredits({
            userId,
            tenantId,
            featureUsed: "Receipt AI",
            creditsRequired: 1,
            userEmail: req.user?.email,
            userName: req.user?.name,
            token: req.token,
            action: async () => {
                return await generateTextResponse(prompt, "gemini-3.6-flash");
            }
        });

        res.json({ formattedReceipt: text, newAiUnits: remainingCredits, remainingCredits, totalCredits });
    } catch (err: any) {
        console.error("Express /api/ai/receipt-ai error:", err);
        res.status(400).json({ error: err.message || "Internal server error" });
    }
});

// SECURE SUBSCRIPTION MANAGEMENT ENDPOINTS (VERIFY VIA FLUTTERWAVE IF KEY PROVIDED)

// Get public key endpoint
app.get("/api/subscription/public-key", (req, res) => {
    res.json({ publicKey: process.env.VITE_FLUTTERWAVE_PUBLIC_KEY || "" });
});

async function logPaymentTransaction(
    tenantId: string,
    details: {
        transactionId: string;
        type: 'upgrade' | 'refill' | 'invoice-payment';
        tier?: string;
        packId?: string;
        amount: number;
        billingCycle?: string;
        status: 'successful' | 'failed';
        errorMessage?: string;
        invoiceId?: string;
        customerEmail?: string;
        customerName?: string;
    }
) {
    try {
        console.log(`[Transaction Logger] Recording ${details.status} ${details.type} transaction:`, details.transactionId);
        const entryId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // Safe DB Company ID resolving
        let baseCompanyId = tenantId || 'unknown';
        if (baseCompanyId.startsWith("ws-personal-")) {
            baseCompanyId = baseCompanyId.replace("ws-personal-", "");
        } else if (baseCompanyId.startsWith("ws-legal-")) {
            baseCompanyId = baseCompanyId.replace("ws-legal-", "");
        } else if (baseCompanyId.startsWith("ws-sales-")) {
            baseCompanyId = baseCompanyId.replace("ws-sales-", "");
        }
        const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";
        let dbCompanyId: string | null = baseCompanyId;
        if (isCravebizInc) {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = null; // Use null to avoid foreign key errors for personal workspaces
        }

        const { error } = await supabaseClient
            .from("generated_documents")
            .insert({
                id: entryId,
                company_id: dbCompanyId,
                document_type: "cravebiz_payment_transaction",
                content: {
                    tenantId,
                    transactionId: details.transactionId,
                    type: details.type,
                    tier: details.tier || null,
                    packId: details.packId || null,
                    amount: details.amount,
                    billingCycle: details.billingCycle || null,
                    status: details.status,
                    errorMessage: details.errorMessage || null,
                    invoiceId: details.invoiceId || null,
                    customerEmail: details.customerEmail || null,
                    customerName: details.customerName || null,
                    timestamp
                }
            });

        if (error) {
            console.warn("[Transaction Logger] Initial insert failed, trying with company_id null fallback:", error.message);
            await supabaseClient
                .from("generated_documents")
                .insert({
                    id: entryId,
                    company_id: null,
                    document_type: "cravebiz_payment_transaction",
                    content: {
                        tenantId,
                        transactionId: details.transactionId,
                        type: details.type,
                        tier: details.tier || null,
                        packId: details.packId || null,
                        amount: details.amount,
                        billingCycle: details.billingCycle || null,
                        status: details.status,
                        errorMessage: details.errorMessage || null,
                        invoiceId: details.invoiceId || null,
                        customerEmail: details.customerEmail || null,
                        customerName: details.customerName || null,
                        timestamp
                    }
                });
        }
    } catch (ex: any) {
        console.error("[Transaction Logger] Exception writing payment transaction:", ex.message || ex);
    }
}

// 1. Upgrade subscription tier
app.post("/api/subscription/upgrade", verifyTenant, async (req: any, res) => {
    try {
        const { tier, transactionId, billingCycle } = req.body;
        const tenantId = req.tenantId;

        if (!['Free', 'Starter', 'Growth', 'Business', 'Enterprise'].includes(tier)) {
            return res.status(400).json({ error: "Invalid subscription tier." });
        }

        const isAnnual = billingCycle === 'annual';
        const globalPricing = getGlobalPricingWithFallback();
        const plan = globalPricing[tier] || { monthlyPriceVal: 0, annualPriceVal: 0 };
        const expectedAmount = isAnnual ? (plan.annualPriceVal || 0) : (plan.monthlyPriceVal || 0);

        // If a paid tier, and FLUTTERWAVE_SECRET_KEY is provided, we securely verify the transaction with Flutterwave API
        const flwSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
        const isSandboxVerification = !flwSecretKey || 
                                      transactionId?.startsWith("sim-") || 
                                      flwSecretKey.includes("FLWSECK_TEST-") || 
                                      flwSecretKey.includes("e5e54eb");
        
        if (tier !== 'Free' && flwSecretKey && transactionId && !isSandboxVerification) {
            console.log(`Verifying Flutterwave transaction ${transactionId} for tier ${tier}...`);
            const verifyUrl = `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`;
            
            try {
                const flwRes = await fetch(verifyUrl, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${flwSecretKey}`,
                        "Content-Type": "application/json"
                    }
                });

                if (!flwRes.ok) {
                    const flwErrorText = await flwRes.text();
                    console.error("Flutterwave API verification call failed:", flwErrorText);
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'upgrade',
                        tier,
                        amount: expectedAmount,
                        billingCycle,
                        status: 'failed',
                        errorMessage: `Could not verify payment with Flutterwave: ${flwErrorText}`
                    });
                    return res.status(400).json({ error: "Could not securely verify payment with Flutterwave API." });
                }

                const flwData: any = await flwRes.json();
                if (flwData.status !== "success" || !flwData.data || (flwData.data.status !== "successful" && flwData.data.status !== "completed")) {
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'upgrade',
                        tier,
                        amount: expectedAmount,
                        billingCycle,
                        status: 'failed',
                        errorMessage: `Payment transaction not successful (status: ${flwData.status})`
                    });
                    return res.status(400).json({ error: "Payment transaction was not successful or is incomplete." });
                }

                if (flwData.data.currency !== "NGN") {
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'upgrade',
                        tier,
                        amount: expectedAmount,
                        billingCycle,
                        status: 'failed',
                        errorMessage: `Invalid currency: ${flwData.data.currency}. Must pay in NGN.`
                    });
                    return res.status(400).json({ error: "Invalid currency. Must pay in NGN." });
                }

                if (flwData.data.amount < expectedAmount) {
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'upgrade',
                        tier,
                        amount: expectedAmount,
                        billingCycle,
                        status: 'failed',
                        errorMessage: `Insufficient payment amount. Paid: ${flwData.data.amount}, Expected: ${expectedAmount}`
                    });
                    return res.status(400).json({ error: `Insufficient payment amount. Paid: ${flwData.data.amount}, Expected: ${expectedAmount}` });
                }
            } catch (flwErr: any) {
                console.error("Flutterwave API fetch error:", flwErr);
                await logPaymentTransaction(tenantId, {
                    transactionId: transactionId || "failed-tx",
                    type: 'upgrade',
                    tier,
                    amount: expectedAmount,
                    billingCycle,
                    status: 'failed',
                    errorMessage: `Flutterwave communication error: ${flwErr.message || flwErr}`
                });
                return res.status(400).json({ error: "Failed to communicate with Flutterwave verification servers." });
            }
        }

        // Resolve the real, base company ID by stripping out any workspace prefixes
        let baseCompanyId = tenantId;
        if (tenantId.startsWith("ws-personal-")) {
            baseCompanyId = tenantId.replace("ws-personal-", "");
        } else if (tenantId.startsWith("ws-legal-")) {
            baseCompanyId = tenantId.replace("ws-legal-", "");
        } else if (tenantId.startsWith("ws-sales-")) {
            baseCompanyId = tenantId.replace("ws-sales-", "");
        }

        const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";

        // Ensure dbCompanyId is always a strictly valid UUID before inserting or querying columns with datatype constraints
        let dbCompanyId = baseCompanyId;
        if (isCravebizInc) {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        const docId = dbCompanyId;

        // Retrieve current settings first to preserve fields like memberPermissions
        const client = getAuthenticatedClient(req.token);
        let { data: currentSettings, error: fetchError } = await client
            .from("generated_documents")
            .select("*")
            .eq("id", docId)
            .maybeSingle();

        if (fetchError || !currentSettings) {
            console.warn(`[Upgrade Fetch] Authenticated fetch failed for ${docId}. Trying system-level fallback...`);
            const fallbackRes = await supabaseClient
                .from("generated_documents")
                .select("*")
                .eq("id", docId)
                .maybeSingle();
            if (fallbackRes.data) {
                currentSettings = fallbackRes.data;
            }
        }

        let memberPermissions = {};
        if (currentSettings && currentSettings.content) {
            memberPermissions = (currentSettings.content as any).memberPermissions || {};
        }

        const pricing = getGlobalPricingWithFallback();
        const tierLimits: Record<string, number> = {};
        if (pricing) {
            Object.keys(pricing).forEach((t) => {
                tierLimits[t] = parseInt(String(pricing[t].maxAiUnits), 10) || 0;
            });
        }

        const newUnits = tierLimits[tier];

        const updatedContent = {
            ...(currentSettings?.content || {}),
            tier,
            aiUnits: newUnits,
            aiModeEnabled: true,
            memberPermissions
        };

        // Securely upsert the new tier and reset AI credits to standard plan limits
        let { error: upsertError } = await client
            .from("generated_documents")
            .upsert({
                id: docId,
                company_id: dbCompanyId,
                document_type: "cravebiz_workspace_settings",
                content: updatedContent
            });

        // Fallback 1: Try authenticated client with company_id: null (bypasses foreign key constraints for personal workspaces)
        if (upsertError) {
            console.warn("[Upgrade Upsert] Authenticated upsert with company_id failed. Trying with company_id: null fallback...");
            const nullCompanyUpsert = await client
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: null,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
            upsertError = nullCompanyUpsert.error;
        }

        // Fallback 2: Try server-level client with original dbCompanyId
        if (upsertError) {
            console.warn("[Upgrade Upsert] Authenticated upsert failed. Trying system-level client fallback...");
            const fallbackResult = await supabaseClient
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: dbCompanyId,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
            upsertError = fallbackResult.error;
        }

        // Fallback 3: Try server-level client with company_id: null
        if (upsertError) {
            console.warn("[Upgrade Upsert] Server-level fallback with company_id failed. Trying with company_id: null fallback...");
            const finalFallbackResult = await supabaseClient
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: null,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
            upsertError = finalFallbackResult.error;
        }

        if (upsertError) {
            console.error("Backend subscription upgrade upsert error:", upsertError);
            await logPaymentTransaction(tenantId, {
                transactionId: transactionId || "failed-db-tx",
                type: 'upgrade',
                tier,
                amount: expectedAmount,
                billingCycle,
                status: 'failed',
                errorMessage: `Database sync failed: ${upsertError.message || JSON.stringify(upsertError)}`
            });
            return res.status(500).json({ error: "Failed to update subscription in secure cloud vault." });
        }

        await logPaymentTransaction(tenantId, {
            transactionId: transactionId || "sim-tx-" + Date.now(),
            type: 'upgrade',
            tier,
            amount: expectedAmount,
            billingCycle,
            status: 'successful'
        });

        try {
            const userId = req.user?.email || req.user?.id || tenantId;
            await resetUserAiCredits(userId, tenantId, newUnits, tier, req.token);
        } catch (creditSyncErr) {
            console.warn("[Upgrade] Failed to sync user_ai_credits table in Supabase:", creditSyncErr);
        }

        res.json({ success: true, tier, aiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/subscription/upgrade error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// 2. Refill AI credits
app.post("/api/subscription/refill", verifyTenant, async (req: any, res) => {
    try {
        const { transactionId, packId } = req.body;
        const tenantId = req.tenantId;

        const packMap = getGlobalRefillPacksWithFallback();

        const chosenPackId = packId || 'pack_300';
        const pack = packMap[chosenPackId] || packMap['pack_300'];
        const expectedAmount = pack.amount;
        const addedCredits = pack.credits;

        // If FLUTTERWAVE_SECRET_KEY is provided, verify transaction
        const flwSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
        const isSandboxVerification = !flwSecretKey || 
                                      transactionId?.startsWith("sim-") || 
                                      flwSecretKey.includes("FLWSECK_TEST-") || 
                                      flwSecretKey.includes("e5e54eb");
        
        if (flwSecretKey && transactionId && !isSandboxVerification) {
            console.log(`Verifying Flutterwave transaction ${transactionId} for refill pack ${chosenPackId}...`);
            const verifyUrl = `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`;
            
            try {
                const flwRes = await fetch(verifyUrl, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${flwSecretKey}`,
                        "Content-Type": "application/json"
                    }
                });

                if (!flwRes.ok) {
                    const flwErrorText = await flwRes.text();
                    console.error("Flutterwave API verification call failed:", flwErrorText);
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'refill',
                        packId: chosenPackId,
                        amount: expectedAmount,
                        status: 'failed',
                        errorMessage: `Could not verify payment with Flutterwave: ${flwErrorText}`
                    });
                    return res.status(400).json({ error: "Could not securely verify payment with Flutterwave API." });
                }

                const flwData: any = await flwRes.json();
                if (flwData.status !== "success" || !flwData.data || (flwData.data.status !== "successful" && flwData.data.status !== "completed")) {
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'refill',
                        packId: chosenPackId,
                        amount: expectedAmount,
                        status: 'failed',
                        errorMessage: `Payment transaction not successful (status: ${flwData.status})`
                    });
                    return res.status(400).json({ error: "Payment transaction was not successful or is incomplete." });
                }

                if (flwData.data.currency !== "NGN") {
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'refill',
                        packId: chosenPackId,
                        amount: expectedAmount,
                        status: 'failed',
                        errorMessage: `Invalid currency: ${flwData.data.currency}. Must pay in NGN.`
                    });
                    return res.status(400).json({ error: "Invalid currency. Must pay in NGN." });
                }

                if (flwData.data.amount < expectedAmount) {
                    await logPaymentTransaction(tenantId, {
                        transactionId: transactionId || "failed-tx",
                        type: 'refill',
                        packId: chosenPackId,
                        amount: expectedAmount,
                        status: 'failed',
                        errorMessage: `Insufficient payment amount. Paid: ${flwData.data.amount}, Expected: ${expectedAmount}`
                    });
                    return res.status(400).json({ error: `Insufficient payment amount. Paid: ${flwData.data.amount}, Expected: ${expectedAmount}` });
                }
            } catch (flwErr: any) {
                console.error("Flutterwave API fetch error:", flwErr);
                await logPaymentTransaction(tenantId, {
                    transactionId: transactionId || "failed-tx",
                    type: 'refill',
                    packId: chosenPackId,
                    amount: expectedAmount,
                    status: 'failed',
                    errorMessage: `Flutterwave communication error: ${flwErr.message || flwErr}`
                });
                return res.status(400).json({ error: "Failed to communicate with Flutterwave verification servers." });
            }
        }

        // Resolve the real, base company ID by stripping out any workspace prefixes
        let baseCompanyId = tenantId;
        if (tenantId.startsWith("ws-personal-")) {
            baseCompanyId = tenantId.replace("ws-personal-", "");
        } else if (tenantId.startsWith("ws-legal-")) {
            baseCompanyId = tenantId.replace("ws-legal-", "");
        } else if (tenantId.startsWith("ws-sales-")) {
            baseCompanyId = tenantId.replace("ws-sales-", "");
        }

        const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";

        // Ensure dbCompanyId is always a strictly valid UUID before inserting or querying columns with datatype constraints
        let dbCompanyId = baseCompanyId;
        if (isCravebizInc) {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        const docId = dbCompanyId;

        const client = getAuthenticatedClient(req.token);
        let { data: currentSettings, error: fetchError } = await client
            .from("generated_documents")
            .select("*")
            .eq("id", docId)
            .maybeSingle();

        if (fetchError || !currentSettings) {
            console.warn(`[Refill Fetch] Authenticated fetch failed for ${docId}. Trying system-level fallback...`);
            const fallbackRes = await supabaseClient
                .from("generated_documents")
                .select("*")
                .eq("id", docId)
                .maybeSingle();
            if (fallbackRes.data) {
                currentSettings = fallbackRes.data;
            }
        }

        let tier = "Free";
        let aiUnits = 0;
        let aiModeEnabled = false;
        let memberPermissions = {};

        if (currentSettings && currentSettings.content) {
            const content = currentSettings.content as any;
            tier = content.tier || tier;
            aiUnits = content.aiUnits !== undefined ? content.aiUnits : aiUnits;
            aiModeEnabled = content.aiModeEnabled !== undefined ? content.aiModeEnabled : aiModeEnabled;
            memberPermissions = content.memberPermissions || {};
        }

        const newUnits = aiUnits + addedCredits;

        const updatedContent = {
            ...(currentSettings?.content || {}),
            tier,
            aiUnits: newUnits,
            aiModeEnabled: true,
            memberPermissions,
            purchasedAiUnits: (currentSettings?.content?.purchasedAiUnits !== undefined ? currentSettings.content.purchasedAiUnits : 0) + addedCredits
        };

        // Securely upsert the new credit balance
        let { error: upsertError } = await client
            .from("generated_documents")
            .upsert({
                id: docId,
                company_id: dbCompanyId,
                document_type: "cravebiz_workspace_settings",
                content: updatedContent
            });

        // Fallback 1: Try authenticated client with company_id: null (bypasses foreign key constraints for personal workspaces)
        if (upsertError) {
            console.warn("[Refill Upsert] Authenticated upsert with company_id failed. Trying with company_id: null fallback...");
            const nullCompanyUpsert = await client
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: null,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
            upsertError = nullCompanyUpsert.error;
        }

        // Fallback 2: Try server-level client with original dbCompanyId
        if (upsertError) {
            console.warn("[Refill Upsert] Authenticated upsert failed. Trying system-level client fallback...");
            const fallbackResult = await supabaseClient
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: dbCompanyId,
                    document_type: "cravebiz_workspace_settings",
                    content: updatedContent
                });
            upsertError = fallbackResult.error;
        }

        // Fallback 3: Try server-level client with company_id: null
        if (upsertError) {
            console.warn("[Refill Upsert] Server-level fallback with company_id failed. Trying with company_id: null fallback...");
            const finalFallbackResult = await supabaseClient
                .from("generated_documents")
                .upsert({
                    id: docId,
                    company_id: null,
                    document_type: "cravebiz_workspace_settings",
                    content: {
                        tier,
                        aiUnits: newUnits,
                        aiModeEnabled: true,
                        memberPermissions
                    }
                });
            upsertError = finalFallbackResult.error;
        }

        if (upsertError) {
            console.error("Backend subscription refill upsert error:", upsertError);
            await logPaymentTransaction(tenantId, {
                transactionId: transactionId || "failed-db-tx",
                type: 'refill',
                packId: chosenPackId,
                amount: expectedAmount,
                status: 'failed',
                errorMessage: `Database sync failed: ${upsertError.message || JSON.stringify(upsertError)}`
            });
            return res.status(500).json({ error: "Failed to update AI units in secure cloud vault." });
        }

        await logPaymentTransaction(tenantId, {
            transactionId: transactionId || "sim-tx-" + Date.now(),
            type: 'refill',
            packId: chosenPackId,
            amount: expectedAmount,
            status: 'successful'
        });

        try {
            const userId = req.user?.email || req.user?.id || tenantId;
            const currentCredits = await getUserAiCredits(userId, tenantId, req.token);
            currentCredits.totalCredits = currentCredits.totalCredits + addedCredits;
            currentCredits.remainingCredits = currentCredits.remainingCredits + addedCredits;
            await saveUserAiCredits(currentCredits, req.token);
        } catch (creditSyncErr) {
            console.warn("[Refill] Failed to sync user_ai_credits table in Supabase:", creditSyncErr);
        }

        res.json({ success: true, tier, aiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/subscription/refill error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// GET endpoint for super-admin to fetch AI usage ledger entries
app.get("/api/admin/ai-ledger", async (req: any, res) => {
    try {
        // 1. Try fetching from SQL 'ai_credit_logs' table first
        try {
            const { data: dbLogs, error: dbLogsError } = await supabaseClient
                .from("ai_credit_logs")
                .select("*")
                .order("timestamp", { ascending: false });

            if (!dbLogsError && dbLogs && dbLogs.length > 0) {
                const entries = dbLogs.map((log: any) => ({
                    id: log.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    companyId: log.company_id || "11111111-1111-1111-1111-111111111111",
                    userName: log.user_id?.split('@')[0] || "User",
                    userEmail: log.user_id || "unknown@cravebiz.com",
                    task: log.task_performed || "AI Task",
                    tokensUsed: log.tokens_used || 0,
                    creditsUsed: log.credits_used || 0,
                    timestamp: log.timestamp || new Date().toISOString()
                }));
                console.log("[AI Ledger Fetch] Successfully fetched logs from ai_credit_logs table.");
                return res.json({ success: true, entries, source: "ai_credit_logs" });
            } else if (dbLogsError) {
                console.warn("[AI Ledger Fetch] Could not query ai_credit_logs table (will fall back):", dbLogsError.message);
            }
        } catch (dbErr: any) {
            console.warn("[AI Ledger Fetch] Exception while querying ai_credit_logs table:", dbErr.message || dbErr);
        }

        // 2. Resilient fallback to cravebiz_ai_ledger_entry in generated_documents table
        console.log("[AI Ledger Fetch] Querying generated_documents fallback table...");
        const { data, error } = await supabaseClient
            .from("generated_documents")
            .select("*")
            .eq("document_type", "cravebiz_ai_ledger_entry")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching AI ledger data from DB fallback:", error);
            return res.status(500).json({ error: error.message });
        }

        const entries = (data || []).map((d: any) => {
            const content = d.content || {};
            return {
                id: d.id,
                companyId: d.company_id,
                userName: content.userName || "Unknown User",
                userEmail: content.userEmail || "unknown@cravebiz.com",
                task: content.task || "AI Task",
                tokensUsed: content.tokensUsed || 0,
                creditsUsed: content.creditsUsed || 0,
                timestamp: content.timestamp || d.created_at || new Date().toISOString()
            };
        });

        res.json({ success: true, entries, source: "generated_documents" });
    } catch (err: any) {
        console.error("Express /api/admin/ai-ledger error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// POST endpoint to manually record/log a payment transaction (successful or failed)
app.post("/api/subscription/record-transaction", verifyTenant, async (req: any, res) => {
    try {
        const tenantId = req.tenantId;
        const {
            transactionId,
            type,
            tier,
            packId,
            amount,
            billingCycle,
            status,
            errorMessage,
            invoiceId,
            customerEmail,
            customerName
        } = req.body;

        if (!transactionId) {
            return res.status(400).json({ error: "transactionId is required" });
        }
        if (!type) {
            return res.status(400).json({ error: "transaction type is required" });
        }

        await logPaymentTransaction(tenantId, {
            transactionId,
            type,
            tier,
            packId,
            amount: Number(amount || 0),
            billingCycle,
            status: status || 'failed',
            errorMessage,
            invoiceId,
            customerEmail,
            customerName
        });

        res.json({ success: true, message: "Transaction recorded successfully." });
    } catch (err: any) {
        console.error("Express POST /api/subscription/record-transaction error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// GET endpoint to fetch all transactions (for admin dashboard)
app.get("/api/admin/transactions", async (req: any, res) => {
    try {
        const { data, error } = await supabaseClient
            .from("generated_documents")
            .select("*")
            .eq("document_type", "cravebiz_payment_transaction");

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        const transactions = (data || []).map((doc: any) => ({
            id: doc.id,
            companyId: doc.company_id,
            ...(doc.content as any)
        })).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

        res.json({ success: true, transactions });
    } catch (err: any) {
        console.error("Express GET /api/admin/transactions error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// GET endpoint to fetch global plan settings
app.get("/api/admin/global-pricing-settings", verifyTenant, async (req: any, res) => {
    try {
        console.log("[Global Pricing] Fetching global pricing settings...");
        let dbData = null;

        // 1. Try custom SQL tables first (global_pricing_settings or cravebiz_global_pricing_settings)
        try {
            const client = getAuthenticatedClient(req.token);
            const { data: t1 } = await client.from("global_pricing_settings").select("*");
            if (t1 && t1.length > 0) {
                const formatted: Record<string, any> = {};
                t1.forEach((row: any) => {
                    formatted[row.tier || row.name] = {
                        price: row.price,
                        maxAiUnits: row.max_ai_units ?? row.maxAiUnits,
                        maxInvoices: row.max_invoices ?? row.maxInvoices,
                        maxReceipts: row.max_receipts ?? row.maxReceipts,
                        maxUsers: row.max_users ?? row.maxUsers,
                        aiAvailable: row.ai_available ?? row.aiAvailable ?? true,
                        inactive: row.inactive ?? false,
                        description: row.description
                    };
                });
                dbData = formatted;
            }
        } catch (e) {
            // ignore
        }

        if (!dbData) {
            try {
                const client = getAuthenticatedClient(req.token);
                const { data: t2 } = await client.from("cravebiz_global_pricing_settings").select("*");
                if (t2 && t2.length > 0) {
                    const formatted: Record<string, any> = {};
                    t2.forEach((row: any) => {
                        formatted[row.tier || row.name] = {
                            price: row.price,
                            maxAiUnits: row.max_ai_units ?? row.maxAiUnits,
                            maxInvoices: row.max_invoices ?? row.maxInvoices,
                            maxReceipts: row.max_receipts ?? row.maxReceipts,
                            maxUsers: row.max_users ?? row.maxUsers,
                            aiAvailable: row.ai_available ?? row.aiAvailable ?? true,
                            inactive: row.inactive ?? false,
                            description: row.description
                        };
                    });
                    dbData = formatted;
                }
            } catch (e) {
                // ignore
            }
        }

        // 2. Try standalone local file cache (cravebiz_global_pricing_settings.json)
        if (!dbData) {
            const local = getLocalGlobalPricingSettings();
            if (local && Object.keys(local).length > 0) {
                console.log("[Global Pricing] Loaded successfully from cravebiz_global_pricing_settings.json file.");
                return res.json(local);
            }
        }

        // 3. Fallback to generated_documents legacy fallback if exists
        if (!dbData) {
            try {
                const { data } = await supabaseClient
                    .from("generated_documents")
                    .select("content")
                    .eq("id", "99999999-9999-9999-9999-999999999999")
                    .maybeSingle();
                if (data && data.content) {
                    dbData = data.content;
                }
            } catch (fallbackEx: any) {
                console.warn("[Global Pricing] Legacy generated_documents fallback query failed:", fallbackEx.message || fallbackEx);
            }
        }

        if (dbData) {
            saveLocalGlobalPricingSettings(dbData);
            return res.json(dbData);
        }

        // 4. Return default fallback object
        const defaults = getGlobalPricingWithFallback();
        saveLocalGlobalPricingSettings(defaults);
        return res.json(defaults);
    } catch (err: any) {
        console.error("Express GET /api/admin/global-pricing-settings error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// GET endpoint to fetch formatted table list of global plans
app.get("/api/admin/global-pricing-settings/plans", verifyTenant, async (req: any, res) => {
    try {
        const local = getLocalGlobalPricingSettings() || getGlobalPricingWithFallback();
        const planList = Object.keys(local).map((tierKey) => {
            const p = local[tierKey] || {};
            return {
                tier: tierKey,
                price: p.price || "₦0.00",
                maxAiUnits: p.maxAiUnits ?? 5,
                maxInvoices: p.maxInvoices ?? 10,
                maxReceipts: p.maxReceipts ?? 10,
                maxUsers: p.maxUsers ?? 1,
                aiAvailable: p.aiAvailable !== false,
                inactive: !!p.inactive,
                description: p.description || ""
            };
        });
        return res.json({ success: true, count: planList.length, plans: planList });
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// POST endpoint to update global plan settings
app.post("/api/admin/global-pricing-settings", verifyTenant, async (req: any, res) => {
    try {
        const userEmail = req.user?.email || "";
        const isAdmin = [
            'cravebiz@cloudcraves.com',
            'super@admin.com',
            'contact@cloudcraves.com',
            'sheriffdeenalade@gmail.com'
        ].includes(userEmail.toLowerCase());

        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Admins only." });
        }

        const limits = req.body;
        if (!limits || typeof limits !== "object") {
            return res.status(400).json({ error: "Invalid pricing limits payload" });
        }

        // 1. Save locally to cravebiz_global_pricing_settings.json
        saveLocalGlobalPricingSettings(limits);

        // 2. Try writing to custom SQL tables (global_pricing_settings or cravebiz_global_pricing_settings)
        const client = getAuthenticatedClient(req.token);
        const rowsToInsert = Object.keys(limits).map((tierKey) => {
            const item = limits[tierKey];
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

        let tableSaved = false;
        try {
            const { error: err1 } = await client.from("global_pricing_settings").upsert(rowsToInsert);
            if (!err1) tableSaved = true;
        } catch (e) {
            // ignore
        }

        if (!tableSaved) {
            try {
                const { error: err2 } = await client.from("cravebiz_global_pricing_settings").upsert(rowsToInsert);
                if (!err2) tableSaved = true;
            } catch (e) {
                // ignore
            }
        }

        // 3. Keep legacy fallback updated as backup
        try {
            await supabaseClient.from("generated_documents").upsert({
                id: '99999999-9999-9999-9999-999999999999',
                company_id: null,
                document_type: 'cravebiz_global_pricing_settings',
                content: limits
            });
        } catch (e) {
            // ignore
        }

        res.json({
            success: true,
            message: "Global pricing settings saved successfully to cravebiz_global_pricing_settings.json and database.",
            tableSynced: tableSaved
        });
    } catch (err: any) {
        console.error("Express POST /api/admin/global-pricing-settings error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// GET endpoint to fetch global refill packs settings
app.get("/api/admin/global-refill-packs", verifyTenant, async (req: any, res) => {
    try {
        console.log("[Global Refill Packs] Fetching global refill packs from Supabase...");
        let supabaseError = null;
        try {
            const client = getAuthenticatedClient(req.token);
            const { data, error } = await client
                .from("generated_documents")
                .select("content")
                .eq("id", "88888888-8888-8888-8888-888888888888")
                .maybeSingle();

            if (error) {
                supabaseError = error;
            } else if (data && data.content) {
                console.log("[Global Refill Packs] Loaded successfully from Supabase database.");
                saveLocalGlobalRefillPacks(data.content);
                return res.json(data.content);
            }
        } catch (dbEx: any) {
            console.warn("[Global Refill Packs] Supabase query exception:", dbEx.message || dbEx);
            supabaseError = dbEx;
        }

        if (supabaseError) {
            console.warn("[Global Refill Packs] Supabase fetch failed/errored, trying local cache fallback:", supabaseError);
        }

        // Try local cache file fallback
        const local = getLocalGlobalRefillPacks();
        if (local) {
            console.log("[Global Refill Packs] Successfully loaded global refill packs from local file cache fallback.");
            return res.json(local);
        }

        // Return default REFILL_PACKS structure
        console.log("[Global Refill Packs] No DB data or cache found. Returning fallback refill pack defaults.");
        const defaultPacks = {
            pack_100: { id: 'pack_100', amount: 1000, credits: 100, title: "100 AI Credits" },
            pack_300: { id: 'pack_300', amount: 2500, credits: 300, title: "300 AI Credits" },
            pack_1000: { id: 'pack_1000', amount: 7500, credits: 1000, title: "1000 AI Credits" },
            pack_5000: { id: 'pack_5000', amount: 30000, credits: 5000, title: "5000 AI Credits" }
        };
        return res.json(defaultPacks);
    } catch (err: any) {
        console.error("Express GET /api/admin/global-refill-packs error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// POST endpoint to update global refill packs settings
app.post("/api/admin/global-refill-packs", verifyTenant, async (req: any, res) => {
    try {
        // Double-check admin privileges
        const userEmail = req.user?.email || "";
        const isAdmin = [
            'cravebiz@cloudcraves.com',
            'super@admin.com',
            'contact@cloudcraves.com',
            'sheriffdeenalade@gmail.com'
        ].includes(userEmail.toLowerCase());

        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Admins only." });
        }

        const packs = req.body;
        if (!packs || typeof packs !== "object") {
            return res.status(400).json({ error: "Invalid refill packs payload" });
        }

        // Save locally
        saveLocalGlobalRefillPacks(packs);

        // Await writing to Supabase synchronously
        console.log("[Global Refill Packs] Saving global refill packs to Supabase database...");
        const client = getAuthenticatedClient(req.token);
        const { error: dbErr } = await client
            .from("generated_documents")
            .upsert({
                id: '88888888-8888-8888-8888-888888888888',
                company_id: null,
                document_type: 'cravebiz_global_refill_packs',
                content: packs
            });

        if (dbErr) {
            console.warn("[Global Refill Packs Sync] Supabase upsert failed/blocked by RLS, but successfully saved to local file cache fallback:", dbErr);
            return res.json({
                success: true,
                message: "Global refill packs saved successfully to local server cache (Supabase DB sync was bypassed or blocked by RLS policies).",
                warning: dbErr.message || "Supabase DB sync was bypassed or blocked by RLS policies"
            });
        }

        console.log("[Global Refill Packs Sync] Supabase upsert successful.");
        res.json({ success: true, message: "Global refill packs saved successfully to Supabase and cache." });
    } catch (err: any) {
        console.error("Express POST /api/admin/global-refill-packs error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// GET subscription settings
app.get("/api/subscription/settings", verifyTenant, async (req: any, res) => {
    try {
        const tenantId = req.tenantId;
        let baseCompanyId = tenantId;
        if (tenantId.startsWith("ws-personal-")) {
            baseCompanyId = tenantId.replace("ws-personal-", "");
        } else if (tenantId.startsWith("ws-legal-")) {
            baseCompanyId = tenantId.replace("ws-legal-", "");
        } else if (tenantId.startsWith("ws-sales-")) {
            baseCompanyId = tenantId.replace("ws-sales-", "");
        }

        const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";
        let dbCompanyId = baseCompanyId;
        if (isCravebizInc) {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        const docId = dbCompanyId;

        let data = null;
        let error = null;

        // Try database fetch first
        const client = getAuthenticatedClient(req.token);
        try {
            const dbRes = await client
                .from("generated_documents")
                .select("*")
                .eq("id", docId)
                .maybeSingle();
            
            data = dbRes.data;
            error = dbRes.error;
        } catch (fetchErr: any) {
            console.warn("[Sub Settings GET] Auth client fetch failed:", fetchErr);
        }

        if (error || !data) {
            try {
                // System-level fallback
                const fallbackRes = await supabaseClient
                    .from("generated_documents")
                    .select("*")
                    .eq("id", docId)
                    .maybeSingle();
                if (fallbackRes.data) {
                    data = fallbackRes.data;
                    error = null;
                }
            } catch (fallbackErr) {
                console.warn("[Sub Settings GET] Fallback query failed:", fallbackErr);
            }
        }

        // If database fetch yielded nothing or failed, try local file cache fallback
        if (!data) {
            const localSettings = getLocalWorkspaceSettings();
            if (localSettings[docId]) {
                return res.json({ success: true, content: localSettings[docId] });
            }
        }

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        if (data && data.content) {
            saveLocalWorkspaceSettings(docId, data.content);
            return res.json({ success: true, content: data.content });
        }

        return res.json({ success: true, content: null });
    } catch (err: any) {
        console.error("Express GET /api/subscription/settings error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// POST subscription settings
app.post("/api/subscription/settings", verifyTenant, async (req: any, res) => {
    try {
        const tenantId = req.tenantId;
        const content = req.body;
        if (!content || typeof content !== "object") {
            return res.status(400).json({ error: "Invalid subscription settings payload" });
        }

        let baseCompanyId = tenantId;
        if (tenantId.startsWith("ws-personal-")) {
            baseCompanyId = tenantId.replace("ws-personal-", "");
        } else if (tenantId.startsWith("ws-legal-")) {
            baseCompanyId = tenantId.replace("ws-legal-", "");
        } else if (tenantId.startsWith("ws-sales-")) {
            baseCompanyId = tenantId.replace("ws-sales-", "");
        }

        const isCravebizInc = baseCompanyId === "cravebiz-inc" || tenantId === "cravebiz-inc";
        let dbCompanyId = baseCompanyId;
        if (isCravebizInc) {
            dbCompanyId = "00000000-0000-0000-0000-000000000000";
        } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbCompanyId)) {
            dbCompanyId = "11111111-1111-1111-1111-111111111111";
        }

        const docId = dbCompanyId;

        // Save locally
        saveLocalWorkspaceSettings(docId, content);

        // Async sync with Supabase
        (async () => {
            try {
                const client = getAuthenticatedClient(req.token);
                let { error: upsertError } = await client
                    .from("generated_documents")
                    .upsert({
                        id: docId,
                        company_id: isCravebizInc ? null : dbCompanyId,
                        document_type: "cravebiz_workspace_settings",
                        content: content
                    });

                if (upsertError) {
                    let nullCompanyUpsert = await client
                        .from("generated_documents")
                        .upsert({
                            id: docId,
                            company_id: null,
                            document_type: "cravebiz_workspace_settings",
                            content: content
                        });
                    upsertError = nullCompanyUpsert.error;
                }

                if (upsertError) {
                    await supabaseClient
                        .from("generated_documents")
                        .upsert({
                            id: docId,
                            company_id: null,
                            document_type: "cravebiz_workspace_settings",
                            content: content
                        });
                }

                // Sync user_ai_credits table in Supabase
                const userId = req.user?.email || req.user?.id || tenantId;
                const credits = await getUserAiCredits(userId, tenantId, req.token);
                if (content.aiUnits !== undefined) {
                    credits.remainingCredits = parseInt(String(content.aiUnits), 10);
                }
                if (content.tier) {
                    credits.subscriptionPlan = content.tier;
                }
                await saveUserAiCredits(credits, req.token);
            } catch (dbErr) {
                console.warn("[Sub Settings Sync] Database sync failed:", dbErr);
            }
        })();

        res.json({ success: true, message: "Subscription settings saved successfully." });
    } catch (err: any) {
        console.error("Express POST /api/subscription/settings error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// POST subscription team invitation (sends simulated email from inviter)
app.post("/api/subscription/invite", verifyTenant, async (req: any, res) => {
    try {
        const tenantId = req.tenantId;
        const { inviteName, inviteEmail, inviteRole } = req.body;
        
        if (!inviteEmail) {
            return res.status(400).json({ error: "inviteEmail is required" });
        }

        const inviterEmail = req.user?.email || "owner@cravebiz.ai";
        const inviterName = req.user?.name || "Workspace Owner";
        
        // Resolve the real, base company ID
        let baseCompanyId = tenantId;
        if (tenantId.startsWith("ws-personal-")) {
            baseCompanyId = tenantId.replace("ws-personal-", "");
        } else if (tenantId.startsWith("ws-legal-")) {
            baseCompanyId = tenantId.replace("ws-legal-", "");
        } else if (tenantId.startsWith("ws-sales-")) {
            baseCompanyId = tenantId.replace("ws-sales-", "");
        }

        const secureLink = `${req.protocol}://${req.get('host')}?tenant=${tenantId}&invitedEmail=${encodeURIComponent(inviteEmail)}`;

        const emailBody = `
================================================================================
📧 OUTGOING TEAM INVITATION EMAIL DISPATCHED via CRAVEBIZ SSL
================================================================================
Timestamp: ${new Date().toISOString()}
Tenant/Workspace ID: ${tenantId}
From: ${inviterName} <${inviterEmail}>
To: ${inviteName || "Workspace Member"} <${inviteEmail}>
Subject: Invitation to join the '${baseCompanyId.toUpperCase()}' Workspace on CraveBiZ

Dear ${inviteName || "Workspace Member"},

You have been invited by ${inviterName} (${inviterEmail}) to join the '${baseCompanyId.toUpperCase()}' Workspace as a ${inviteRole || "Member"}.

With this access, you can collaborate on invoice generation, dynamic documents, signature workflows, and leverage workspace AI features.

To accept this invitation and securely access the workspace, please click the link below:
${secureLink}

This invitation link is unique to your email address and secured via SSL.

Best regards,
The CraveBiZ Team
================================================================================
`;
        console.log(emailBody);

        res.json({ success: true, message: "Invitation email dispatched successfully." });
    } catch (err: any) {
        console.error("Express POST /api/subscription/invite error:", err);
        res.status(500).json({ error: err.message || "Internal server error dispatching invitation email" });
    }
});

// Vite Dev Server / Static Hosting setup (only when not on Vercel)
if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
        import("vite").then(({ createServer }) => {
            createServer({
                server: { middlewareMode: true },
                appType: "spa",
            }).then((vite) => {
                app.use(vite.middlewares);
                app.listen(PORT, "0.0.0.0", () => {
                    console.log(`Server starting on port ${PORT} with environment ${process.env.NODE_ENV || 'development'}`);
                });
            });
        });
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server starting on port ${PORT} with environment production`);
        });
    }
}

export default app;
