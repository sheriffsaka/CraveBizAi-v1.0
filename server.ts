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
import { SignifyService } from "./services/signifyService";

const app = express();
const PORT = 3000;

// Serve uploaded original and signed documents statically
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Body parsing middleware (handling larger base64 uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


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

// ============================================================================
// DOCSIGNIFY CONTROLLER ENDPOINTS
// ============================================================================

// 1. Save base64-encoded files exactly as uploaded to disk (PDF, DOCX, Images)
app.post("/api/signify/upload-file", (req, res) => {
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

// 2. Create/register a document for signing
app.post("/api/signify/documents", (req, res) => {
    try {
        const { id, title, originalFileUrl, ownerId, fileType, fileName, signatories } = req.body;
        if (!id || !title || !originalFileUrl || !ownerId || !signatories) {
            return res.status(400).json({ error: "Missing required fields for document creation" });
        }
        
        const result = SignifyService.createDocument(id, title, originalFileUrl, ownerId, fileType || "pdf", fileName || "document.pdf", signatories);
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
app.get("/api/signify/documents/:id", (req, res) => {
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
app.get("/api/signify/token-validation", (req, res) => {
    try {
        const { token } = req.query;
        if (!token || typeof token !== "string") {
            return res.status(400).json({ error: "Secure token is required for validation" });
        }
        
        const result = SignifyService.getDocumentByToken(token);
        if (!result) {
            return res.status(403).json({ error: "Invalid or expired secure signing token" });
        }
        
        // Ensure signatory hasn't completed or declined yet (security requirement)
        if (result.signatory.status === "signed") {
            return res.json({
                success: true,
                alreadySigned: true,
                document: result.document,
                signatories: result.signatories
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
