import { api } from "../lib/api.ts";
import { syncSubscriptionInfoFromDb, updateMemoryAiCredits, ensureAiCreditsOrThrow } from "./subscriptionService.ts";

function handleAiResponseUnits(companyId: string, data: any) {
    if (companyId && data) {
        const units = typeof data.newAiUnits === "number" ? data.newAiUnits : typeof data.remainingCredits === "number" ? data.remainingCredits : null;
        if (units !== null) {
            updateMemoryAiCredits(companyId, units);
        }
        syncSubscriptionInfoFromDb(companyId).catch(err => console.warn("AI response unit sync warning:", err));
    }
}

export async function generateInvoiceInsight(prompt: string, complex: boolean = false): Promise<string> {
    try {
        const companyId = localStorage.getItem('cravebiz_tenant') || '';
        ensureAiCreditsOrThrow(companyId);
        const headers = await api.getAuthHeaders(companyId);
        const response = await fetch("/api/ai/invoice-insight", {
            method: "POST",
            headers,
            body: JSON.stringify({ prompt, complex })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (companyId) {
            handleAiResponseUnits(companyId, data);
        }
        return data.text || "I'm sorry, I couldn't generate an insight for this invoice at the moment.";
    } catch (error: any) {
        console.error("Client Error calling generateInvoiceInsight API:", error);
        return error.message || "The AI consultant is currently unavailable. Please check your network connection.";
    }
}
