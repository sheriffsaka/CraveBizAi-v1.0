import { GeneratedDocument, Invoice, InvoiceItem, DocumentReviewResult } from "../types";

export async function generateTextResponse(
    prompt: string,
    model: string,
    systemInstruction?: string,
): Promise<string> {
    try {
        const response = await fetch("/api/ai/text-response", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, model, systemInstruction })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.text || "Sorry, I encountered an error while processing your request.";
    } catch (error) {
        console.error("Client Error calling generateTextResponse API:", error);
        return "Sorry, I encountered an error while processing your request.";
    }
}

export async function transformDocument(
    rawContent: string,
    companyContext: any
): Promise<GeneratedDocument | null> {
    try {
        const response = await fetch("/api/ai/transform-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawContent, companyContext })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Client Error calling transformDocument API:", error);
        return null;
    }
}

export async function generateRenewalInvoiceSuggestion(
    clientId: string,
    expiringItems: InvoiceItem[]
): Promise<Partial<Invoice> | null> {
    try {
        const response = await fetch("/api/ai/renewal-suggestion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, expiringItems })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Client Error calling renewal suggestion API:", error);
        return null;
    }
}

export async function generateClientPaymentHealthReport(
    clientId: string,
    paymentHistory: any[]
): Promise<string> {
    try {
        const response = await fetch("/api/ai/client-payment-health-report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, paymentHistory })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.text || "Failed to generate health report.";
    } catch (error) {
        console.error("Client Error calling client payment health report API:", error);
        return "Failed to generate health report.";
    }
}

export async function generateDocumentFromPurpose(
    purpose: string,
    companyContext: any
): Promise<GeneratedDocument | null> {
    try {
        const response = await fetch("/api/ai/generate-document-from-purpose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purpose, companyContext })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Client Error calling generateDocumentFromPurpose API:", error);
        return null;
    }
}

export async function reviewDocumentContent(
    documentText: string
): Promise<DocumentReviewResult | null> {
    try {
        const response = await fetch("/api/ai/review-document-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentText })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Client Error calling reviewDocumentContent API:", error);
        return null;
    }
}
