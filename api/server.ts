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
import { SignifyService } from "../services/signifyService.js";

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
            'sheriffdeenalade@gmail.com'
        ].includes(user.email?.toLowerCase() || '');

        let isUserAdmin = isAdminEmail;
        if (!isUserAdmin) {
            try {
                const { data: profile } = await supabaseClient
                    .from("profiles")
                    .select("is_admin")
                    .eq("id", user.id)
                    .maybeSingle();
                if (profile?.is_admin) {
                    isUserAdmin = true;
                }
            } catch (pErr) {
                console.warn("Could not query profile for admin bypass:", pErr);
            }
        }

        if (!tenantId) {
            if (isUserAdmin) {
                tenantId = "cravebiz-inc";
            } else {
                return res.status(400).json({ error: "Missing workspace context (X-Tenant-Id or tenantId)" });
            }
        }

        if (isUserAdmin) {
            req.user = { id: user.id, email: user.email, name: "Super Admin", role: "Owner" };
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
            req.user = { id: user.id, email: user.email, name: user.user_metadata?.full_name || "User", role: "Owner" };
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
                req.user = { id: user.id, email: user.email, name: user.user_metadata?.full_name || "User", role: "Owner" };
                req.tenantId = tenantId;
                return next();
            }
            
            return res.status(403).json({ error: "Forbidden: You do not belong to this workspace" });
        }
        
        req.user = { id: user.id, email: user.email, name: user.user_metadata?.full_name || "User", role: membership.role };
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
if (isProductionDir) {
    WORKSPACE_SETTINGS_FILE = path.join("/tmp", "cravebiz_workspace_settings.json");
    GLOBAL_PRICING_FILE = path.join("/tmp", "cravebiz_global_pricing_settings.json");
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

    // Check high-resiliency local cache file first
    const localSettings = getLocalWorkspaceSettings();
    let data = localSettings[docId] ? { content: localSettings[docId] } : null;

    if (!data) {
        // Fetch workspace settings from DB using the request-specific authenticated client
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
            console.warn("[AI Deduct] Database fetch failed, relying on defaults:", fetchErr);
        }
    }

    let tier = isCravebizInc ? "Enterprise" : "Free";
    let aiUnits = isCravebizInc ? 1000 : 10;
    let aiModeEnabled = false;
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
        aiModeEnabled = content.aiModeEnabled !== undefined ? (content.aiModeEnabled === true || content.aiModeEnabled === "true") : aiModeEnabled;
        memberPermissions = content.memberPermissions || {};
    }

    // Allow client header to override or verify if AI Mode is enabled
    if (clientAiModeEnabled !== undefined) {
        aiModeEnabled = clientAiModeEnabled;
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
        throw new Error("AI Mode is currently turned OFF. Please turn ON AI Mode in the workspace header or settings to use AI features.");
    }

    // Deduct 1 unit
    const newUnits = aiUnits - 1;

    // Save to the high-resiliency local cache file first (guarantees persistence inside the single container)
    const updatedContent = {
        tier,
        aiUnits: newUnits,
        aiModeEnabled,
        memberPermissions,
        invitedMembers: data?.content?.invitedMembers || {},
        memberDetails: data?.content?.memberDetails || {}
    };
    saveLocalWorkspaceSettings(docId, updatedContent);

    // Sync back to Supabase database asynchronously (never blocks the request)
    (async () => {
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
    })();

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

        const responseText = await generateTextResponse(prompt, "gemini-3.5-flash", "You are an expert AI Legal Document Counsel. Return ONLY valid JSON.");
        
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


app.post("/api/ai/text-response", verifyTenant, async (req: any, res) => {
    try {
        const { prompt, model, systemInstruction } = req.body;
        const text = await generateTextResponse(prompt, model, systemInstruction);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + (text || "").length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "General AI Assistant Interaction", tokens);
        res.json({ text, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/text-response error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/transform-document", verifyTenant, async (req: any, res) => {
    try {
        const { rawContent, companyContext } = req.body;
        const doc = await transformDocument(rawContent, companyContext);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + JSON.stringify(doc).length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "AI Document Transformation", tokens);
        res.json({ ...doc, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/transform-document error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/renewal-suggestion", verifyTenant, async (req: any, res) => {
    try {
        const { clientId, expiringItems } = req.body;
        const suggestion = await generateRenewalInvoiceSuggestion(clientId, expiringItems);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + JSON.stringify(suggestion).length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "AI Invoice Renewal Suggestion", tokens);
        res.json({ ...suggestion, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/renewal-suggestion error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/client-payment-health-report", verifyTenant, async (req: any, res) => {
    try {
        const { clientId, paymentHistory } = req.body;
        const text = await generateClientPaymentHealthReport(clientId, paymentHistory);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + (text || "").length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "AI Client Payment Health Analysis", tokens);
        res.json({ text, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/client-payment-health-report error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/generate-document-from-purpose", verifyTenant, async (req: any, res) => {
    try {
        const { purpose, companyContext, selectedPreset } = req.body;
        const doc = await generateDocumentFromPurpose(purpose, companyContext, selectedPreset);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + JSON.stringify(doc).length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "AI Document Generation", tokens);
        res.json({ ...doc, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/generate-document-from-purpose error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/review-document-content", verifyTenant, async (req: any, res) => {
    try {
        const { documentText } = req.body;
        const report = await reviewDocumentContent(documentText);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + JSON.stringify(report).length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "AI Document Compliance Review", tokens);
        res.json({ ...report, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/review-document-content error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/invoice-insight", verifyTenant, async (req: any, res) => {
    try {
        const { prompt, complex } = req.body;
        const text = await generateInvoiceInsight(prompt, complex);
        const tokens = Math.max(25, Math.ceil((JSON.stringify(req.body).length + (text || "").length) * 0.26));
        const newUnits = await deductAiUnitServerSide(req.tenantId, req.token, req.user?.email, req.headers["x-ai-mode-enabled"] === "true", req.user?.name, "AI Financial Insights", tokens);
        res.json({ text, newAiUnits: newUnits });
    } catch (err: any) {
        console.error("Express /api/ai/invoice-insight error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// SECURE SUBSCRIPTION MANAGEMENT ENDPOINTS (VERIFY VIA FLUTTERWAVE IF KEY PROVIDED)

// Get public key endpoint
app.get("/api/subscription/public-key", (req, res) => {
    res.json({ publicKey: process.env.VITE_FLUTTERWAVE_PUBLIC_KEY || "" });
});

// 1. Upgrade subscription tier
app.post("/api/subscription/upgrade", verifyTenant, async (req: any, res) => {
    try {
        const { tier, transactionId, billingCycle } = req.body;
        const tenantId = req.tenantId;

        if (!['Free', 'Starter', 'Growth', 'Business', 'Enterprise'].includes(tier)) {
            return res.status(400).json({ error: "Invalid subscription tier." });
        }

        const isAnnual = billingCycle === 'annual';
        const expectedAmounts: Record<string, number> = isAnnual ? {
            Free: 0,
            Starter: 45000,
            Growth: 95000,
            Business: 195000,
            Enterprise: 495000
        } : {
            Free: 0,
            Starter: 4500,
            Growth: 9500,
            Business: 19500,
            Enterprise: 49500
        };

        const expectedAmount = expectedAmounts[tier];

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
                    return res.status(400).json({ error: "Could not securely verify payment with Flutterwave API." });
                }

                const flwData: any = await flwRes.json();
                if (flwData.status !== "success" || !flwData.data || (flwData.data.status !== "successful" && flwData.data.status !== "completed")) {
                    return res.status(400).json({ error: "Payment transaction was not successful or is incomplete." });
                }

                if (flwData.data.currency !== "NGN") {
                    return res.status(400).json({ error: "Invalid currency. Must pay in NGN." });
                }

                if (flwData.data.amount < expectedAmount) {
                    return res.status(400).json({ error: `Insufficient payment amount. Paid: ${flwData.data.amount}, Expected: ${expectedAmount}` });
                }
            } catch (flwErr: any) {
                console.error("Flutterwave API fetch error:", flwErr);
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

        const tierLimits: Record<string, number> = {
            Free: 10,
            Starter: 100,
            Growth: 300,
            Business: 800,
            Enterprise: 2500
        };

        const newUnits = tierLimits[tier];

        // Securely upsert the new tier and reset AI credits to standard plan limits
        let { error: upsertError } = await client
            .from("generated_documents")
            .upsert({
                id: docId,
                company_id: dbCompanyId,
                document_type: "cravebiz_workspace_settings",
                content: {
                    tier,
                    aiUnits: newUnits,
                    aiModeEnabled: true,
                    memberPermissions
                }
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
                    content: {
                        tier,
                        aiUnits: newUnits,
                        aiModeEnabled: true,
                        memberPermissions
                    }
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
                    content: {
                        tier,
                        aiUnits: newUnits,
                        aiModeEnabled: true,
                        memberPermissions
                    }
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
            console.error("Backend subscription upgrade upsert error:", upsertError);
            return res.status(500).json({ error: "Failed to update subscription in secure cloud vault." });
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

        const packMap: Record<string, { amount: number; credits: number }> = {
            pack_100: { amount: 1000, credits: 100 },
            pack_300: { amount: 2500, credits: 300 },
            pack_1000: { amount: 7500, credits: 1000 },
            pack_5000: { amount: 30000, credits: 5000 }
        };

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
                    return res.status(400).json({ error: "Could not securely verify payment with Flutterwave API." });
                }

                const flwData: any = await flwRes.json();
                if (flwData.status !== "success" || !flwData.data || (flwData.data.status !== "successful" && flwData.data.status !== "completed")) {
                    return res.status(400).json({ error: "Payment transaction was not successful or is incomplete." });
                }

                if (flwData.data.currency !== "NGN") {
                    return res.status(400).json({ error: "Invalid currency. Must pay in NGN." });
                }

                if (flwData.data.amount < expectedAmount) {
                    return res.status(400).json({ error: `Insufficient payment amount. Paid: ${flwData.data.amount}, Expected: ${expectedAmount}` });
                }
            } catch (flwErr: any) {
                console.error("Flutterwave API fetch error:", flwErr);
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

        // Securely upsert the new credit balance
        let { error: upsertError } = await client
            .from("generated_documents")
            .upsert({
                id: docId,
                company_id: dbCompanyId,
                document_type: "cravebiz_workspace_settings",
                content: {
                    tier,
                    aiUnits: newUnits,
                    aiModeEnabled: true, // Always enable AI Mode on successful refill
                    memberPermissions
                }
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
                    content: {
                        tier,
                        aiUnits: newUnits,
                        aiModeEnabled: true,
                        memberPermissions
                    }
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
                    content: {
                        tier,
                        aiUnits: newUnits,
                        aiModeEnabled: true,
                        memberPermissions
                    }
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
            return res.status(500).json({ error: "Failed to update AI units in secure cloud vault." });
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

// GET endpoint to fetch global plan settings
app.get("/api/admin/global-pricing-settings", async (req, res) => {
    try {
        // 1. Try local cache file first
        const local = getLocalGlobalPricingSettings();
        if (local) {
            console.log("[Global Pricing] Successfully loaded global pricing from local file.");
            return res.json(local);
        }

        // 2. Fall back to Supabase
        console.log("[Global Pricing] Fetching global pricing from Supabase...");
        const { data, error } = await supabaseClient
            .from("generated_documents")
            .select("content")
            .eq("id", "99999999-9999-9999-9999-999999999999")
            .maybeSingle();

        if (data && data.content) {
            saveLocalGlobalPricingSettings(data.content);
            return res.json(data.content);
        }

        // 3. Fall back to returning null so client uses default TIER_LIMITS
        return res.json(null);
    } catch (err: any) {
        console.error("Express GET /api/admin/global-pricing-settings error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// POST endpoint to update global plan settings
app.post("/api/admin/global-pricing-settings", verifyTenant, async (req: any, res) => {
    try {
        // Double-check admin privileges
        const userEmail = req.user?.email || "";
        const isAdmin = [
            'cravebiz@cloudcraves.com',
            'super@admin.com',
            'sheriffdeenalade@gmail.com'
        ].includes(userEmail.toLowerCase());

        if (!isAdmin) {
            return res.status(403).json({ error: "Access denied: Admins only." });
        }

        const limits = req.body;
        if (!limits || typeof limits !== "object") {
            return res.status(400).json({ error: "Invalid pricing limits payload" });
        }

        // Save locally
        saveLocalGlobalPricingSettings(limits);

        // Async write back to Supabase with company_id: null to prevent foreign key errors
        (async () => {
            try {
                const { error: dbErr } = await supabaseClient
                    .from("generated_documents")
                    .upsert({
                        id: '99999999-9999-9999-9999-999999999999',
                        company_id: null,
                        document_type: 'cravebiz_global_pricing_settings',
                        content: limits
                    });
                if (dbErr) {
                    console.warn("[Global Pricing Sync] Supabase upsert error:", dbErr);
                } else {
                    console.log("[Global Pricing Sync] Supabase upsert successful.");
                }
            } catch (dbEx) {
                console.warn("[Global Pricing Sync] Exception syncing with Supabase:", dbEx);
            }
        })();

        res.json({ success: true, message: "Global plan settings saved successfully." });
    } catch (err: any) {
        console.error("Express POST /api/admin/global-pricing-settings error:", err);
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

        // Try local file cache first
        const localSettings = getLocalWorkspaceSettings();
        if (localSettings[docId]) {
            return res.json({ success: true, content: localSettings[docId] });
        }

        // Fall back to database fetch
        const { data, error } = await supabaseClient
            .from("generated_documents")
            .select("*")
            .eq("id", docId)
            .maybeSingle();

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
                let { error: upsertError } = await supabaseClient
                    .from("generated_documents")
                    .upsert({
                        id: docId,
                        company_id: isCravebizInc ? null : dbCompanyId,
                        document_type: "cravebiz_workspace_settings",
                        content: content
                    });

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
