import { GeneratedDocument, Invoice, InvoiceItem, DocumentReviewResult } from "../types.ts";
import { api } from "../lib/api.ts";
import { syncSubscriptionInfoFromDb } from "./subscriptionService.ts";

export async function generateTextResponse(
    prompt: string,
    model: string,
    systemInstruction?: string,
): Promise<string> {
    try {
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/text-response", {
            method: "POST",
            headers,
            body: JSON.stringify({ prompt, model, systemInstruction })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (companyId) {
            syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("Sync err:", err));
        }
        return data.text || "Sorry, I encountered an error while processing your request.";
    } catch (error: any) {
        console.error("Client Error calling generateTextResponse API:", error);
        return error.message || "Sorry, I encountered an error while processing your request.";
    }
}

export async function transformDocument(
    rawContent: string,
    companyContext: any
): Promise<GeneratedDocument | null> {
    try {
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/transform-document", {
            method: "POST",
            headers,
            body: JSON.stringify({ rawContent, companyContext })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        if (companyId) {
            syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("Sync err:", err));
        }
        return await response.json();
    } catch (error: any) {
        console.error("Client Error calling transformDocument API:", error);
        throw error;
    }
}

export async function generateRenewalInvoiceSuggestion(
    clientId: string,
    expiringItems: InvoiceItem[]
): Promise<Partial<Invoice> | null> {
    try {
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/renewal-suggestion", {
            method: "POST",
            headers,
            body: JSON.stringify({ clientId, expiringItems })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        if (companyId) {
            syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("Sync err:", err));
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
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/client-payment-health-report", {
            method: "POST",
            headers,
            body: JSON.stringify({ clientId, paymentHistory })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (companyId) {
            syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("Sync err:", err));
        }
        return data.text || "Failed to generate health report.";
    } catch (error: any) {
        console.error("Client Error calling client payment health report API:", error);
        return error.message || "Failed to generate health report.";
    }
}

export async function generateDocumentFromPurpose(
    purpose: string,
    companyContext: any,
    selectedPreset?: string
): Promise<GeneratedDocument | null> {
    try {
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/generate-document-from-purpose", {
            method: "POST",
            headers,
            body: JSON.stringify({ purpose, companyContext, selectedPreset })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        if (companyId) {
            syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("Sync err:", err));
        }
        return await response.json();
    } catch (error: any) {
        console.error("Client Error calling generateDocumentFromPurpose API:", error);
        throw error;
    }
}

export async function reviewDocumentContent(
    documentText: string
): Promise<DocumentReviewResult | null> {
    try {
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/review-document-content", {
            method: "POST",
            headers,
            body: JSON.stringify({ documentText })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        if (companyId) {
            syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("Sync err:", err));
        }
        return await response.json();
    } catch (error: any) {
        console.error("Client Error calling reviewDocumentContent API:", error);
        throw error;
    }
}
