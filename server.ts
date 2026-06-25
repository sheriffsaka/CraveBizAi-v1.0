import express from "express";
import path from "path";
import fs from "fs";
import {
    generateTextResponse,
    transformDocument,
    generateRenewalInvoiceSuggestion,
    generateClientPaymentHealthReport,
    generateDocumentFromPurpose,
    reviewDocumentContent,
    generateInvoiceInsight,
    checkApiKeyStatus
} from "./services/serverAiService";

const app = express();
const PORT = 3000;

// Body parsing middleware
app.use(express.json());

const SIGNATURES_FILE = path.join(process.cwd(), "public_signatures.json");
const DOCUMENTS_FILE = path.join(process.cwd(), "public_documents.json");

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

app.get("/api/public/signatures", (req, res) => {
    res.json(getPublicSignatures());
});

app.post("/api/public/signatures", (req, res) => {
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

app.get("/api/public/documents", (req, res) => {
    res.json(getPublicDocuments());
});

app.get("/api/public/documents/:id", (req, res) => {
    const docs = getPublicDocuments();
    const doc = docs[req.params.id];
    if (doc) {
        res.json(doc);
    } else {
        res.status(404).json({ error: "Document not found" });
    }
});

app.post("/api/public/documents", (req, res) => {
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

app.post("/api/ai/text-response", async (req, res) => {
    try {
        const { prompt, model, systemInstruction } = req.body;
        const text = await generateTextResponse(prompt, model, systemInstruction);
        res.json({ text });
    } catch (err: any) {
        console.error("Express /api/ai/text-response error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/transform-document", async (req, res) => {
    try {
        const { rawContent, companyContext } = req.body;
        const doc = await transformDocument(rawContent, companyContext);
        res.json(doc);
    } catch (err: any) {
        console.error("Express /api/ai/transform-document error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/renewal-suggestion", async (req, res) => {
    try {
        const { clientId, expiringItems } = req.body;
        const suggestion = await generateRenewalInvoiceSuggestion(clientId, expiringItems);
        res.json(suggestion);
    } catch (err: any) {
        console.error("Express /api/ai/renewal-suggestion error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/client-payment-health-report", async (req, res) => {
    try {
        const { clientId, paymentHistory } = req.body;
        const text = await generateClientPaymentHealthReport(clientId, paymentHistory);
        res.json({ text });
    } catch (err: any) {
        console.error("Express /api/ai/client-payment-health-report error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/generate-document-from-purpose", async (req, res) => {
    try {
        const { purpose, companyContext } = req.body;
        const doc = await generateDocumentFromPurpose(purpose, companyContext);
        res.json(doc);
    } catch (err: any) {
        console.error("Express /api/ai/generate-document-from-purpose error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/review-document-content", async (req, res) => {
    try {
        const { documentText } = req.body;
        const report = await reviewDocumentContent(documentText);
        res.json(report);
    } catch (err: any) {
        console.error("Express /api/ai/review-document-content error:", err);
        res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/ai/invoice-insight", async (req, res) => {
    try {
        const { prompt, complex } = req.body;
        const text = await generateInvoiceInsight(prompt, complex);
        res.json({ text });
    } catch (err: any) {
        console.error("Express /api/ai/invoice-insight error:", err);
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
