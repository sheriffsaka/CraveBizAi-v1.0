import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
    generateTextResponse,
    transformDocument,
    generateRenewalInvoiceSuggestion,
    generateClientPaymentHealthReport,
    generateDocumentFromPurpose,
    reviewDocumentContent,
    generateInvoiceInsight
} from "./services/serverAiService";

const app = express();
const PORT = 3000;

// Body parsing middleware
app.use(express.json());

// API Routes for GenAI Operations
app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
        createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        }).then((vite) => {
            app.use(vite.middlewares);
            app.listen(PORT, "0.0.0.0", () => {
                console.log(`Server starting on port ${PORT} with environment ${process.env.NODE_ENV || 'development'}`);
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
