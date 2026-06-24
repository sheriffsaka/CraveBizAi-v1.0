import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedDocument, Invoice, InvoiceItem, DocumentReviewResult, DocumentBlock, DocumentBlockType } from "../types";
import fs from "fs";
import path from "path";

// Dynamically load environment variables from local .env or .env.example files as a fallback
function loadEnvFiles() {
    for (const filename of [".env", ".env.example"]) {
        const filePath = path.join(process.cwd(), filename);
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, "utf-8");
                const lines = content.split(/\r?\n/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith("#")) continue;
                    const index = trimmed.indexOf("=");
                    if (index > -1) {
                        const key = trimmed.substring(0, index).trim();
                        const value = trimmed.substring(index + 1).trim().replace(/^["']|["']$/g, "");
                        if (key && value && !process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                }
            } catch (err) {
                console.error(`Error loading env file ${filename}:`, err);
            }
        }
    }
}

// Execute environment loading
loadEnvFiles();

function getApiKey(): string {
    let key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!key) {
        console.warn("WARNING: Neither GEMINI_API_KEY nor API_KEY is set in environment.");
        return "";
    }
    key = key.trim();
    // Strip wrapping quotes if present (common issue in custom environments)
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.substring(1, key.length - 1).trim();
    }
    return key;
}

export function checkApiKeyStatus() {
    const rawKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    const key = getApiKey();
    return {
        configured: !!key,
        keyLength: key.length,
        preview: key ? `${key.substring(0, 6)}...${key.substring(Math.max(0, key.length - 4))}` : "",
        source: process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : (process.env.API_KEY ? "API_KEY" : "None"),
        hasWhitespace: rawKey.length !== rawKey.trim().length,
        hasQuotes: (rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))
    };
}

function getGeminiClient(): GoogleGenAI {
    const apiKey = getApiKey();
    return new GoogleGenAI({ apiKey });
}

function compileMockDocument(text: string, companyContext: any): GeneratedDocument {
    const today = new Date().toLocaleDateString();
    const ctx = companyContext || {};
    
    // Heuristic analysis of the user's prompt or raw text
    let docType = "Service Agreement";
    let docTitle = "PROFESSIONAL SERVICES AGREEMENT";
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes("nda") || lowerText.includes("disclosure") || lowerText.includes("confidentiality")) {
        docType = "Non-Disclosure Agreement";
        docTitle = "MUTUAL NON-DISCLOSURE AGREEMENT";
    } else if (lowerText.includes("invoice") || lowerText.includes("bill") || lowerText.includes("receipt") || lowerText.includes("payment")) {
        docType = "Invoice";
        docTitle = "COMMERCIAL TAX INVOICE";
    } else if (lowerText.includes("proposal") || lowerText.includes("quote") || lowerText.includes("estimate") || lowerText.includes("valuation")) {
        docType = "Proposal";
        docTitle = "BUSINESS DEVELOPMENT PROPOSAL";
    } else if (lowerText.includes("employment") || lowerText.includes("offer") || lowerText.includes("job") || lowerText.includes("hire")) {
        docType = "Employment Agreement";
        docTitle = "OFFER OF EMPLOYMENT & CONTRACT";
    } else if (lowerText.includes("contract") || lowerText.includes("agreement")) {
        docType = "Contract Agreement";
        docTitle = "FORMAL BUSINESS COVENANT";
    } else if (lowerText.includes("report") || lowerText.includes("analysis") || lowerText.includes("audit")) {
        docType = "Report";
        docTitle = "STRATEGIC AUDIT & SUMMARY REPORT";
    }

    // Attempt to extract client name from text
    let clientName = "Authorized Counterparty Client";
    const clientMatches = text.match(/(?:between|and|client|partner|for|with)\s+([A-Z][a-zA-Z0-9\s.]{2,30})/i);
    if (clientMatches && clientMatches[1]) {
        const candidate = clientMatches[1].trim();
        const upperCand = candidate.toUpperCase();
        // Skip common helper words
        if (upperCand !== "NDA" && upperCand !== "AGREEMENT" && upperCand !== "CONTRACT" && upperCand !== "THE" && upperCand !== "US" && upperCand !== "ME" && upperCand !== "YOU" && upperCand !== "A") {
            clientName = candidate;
        }
    }

    // Attempt to extract monetary/fee values
    const feeMatches = text.match(/\$[0-9,]+(?:\.[0-9]{2})?/g);
    const feeString = feeMatches ? feeMatches[0] : "$2,500.00";
    const numericFee = parseFloat(feeString.replace(/[^0-9.]/g, '')) || 2500;

    // Detect subjects and generate targeted paragraphs
    let subjects = ["professional advisory services"];
    if (lowerText.includes("software") || lowerText.includes("app") || lowerText.includes("web") || lowerText.includes("code")) {
        subjects = ["software architectural engineering and application development"];
    } else if (lowerText.includes("design") || lowerText.includes("ui") || lowerText.includes("ux") || lowerText.includes("brand")) {
        subjects = ["creative design audits, corporate user experience styling, and custom brand assets"];
    } else if (lowerText.includes("marketing") || lowerText.includes("content") || lowerText.includes("campaign") || lowerText.includes("sales")) {
        subjects = ["target audience campaigns, digital advertising management, and search engine optimization"];
    } else if (lowerText.includes("consulting") || lowerText.includes("audit") || lowerText.includes("strategy") || lowerText.includes("advisory")) {
        subjects = ["specialized consulting advisory services and strategic operational workshops"];
    }

    const blocks: DocumentBlock[] = [
        {
            id: 'hdr_' + Math.floor(Math.random() * 100000),
            type: 'header',
            content: {
                companyName: ctx.name || "CRAVEBIZ AI CLIENT",
                address: ctx.address || "123 Technology Way",
                email: ctx.email || "billing@cravebiz.com",
                phone: ctx.phone || "+1 (555) 012-3456",
                website: ctx.website || "https://cravebiz.com",
                logoUrl: ctx.logoUrl || ""
            }
        },
        {
            id: 'meta_' + Math.floor(Math.random() * 100000),
            type: 'metadata',
            content: {
                documentTitle: docTitle,
                clientName: clientName,
                preparedBy: ctx.name || "CraveBiZ AI Transformer",
                date: today,
                reference: "REF-" + Math.floor(Math.random() * 899999 + 100000)
            }
        },
        {
            id: 'title_1',
            type: 'title',
            content: { text: "1. RECITALS AND PURPOSE" }
        },
        {
            id: 'p_1',
            type: 'paragraph',
            content: { text: `This document formalizes the custom parameters and guidelines requested for processing under user purpose: "${text}". The operational standard herein represents a legally binding accord between ${ctx.name || "Provider"} ("Provider") and ${clientName} ("Client").` }
        }
    ];

    if (docType === "Invoice") {
        blocks.push(
            {
                id: 'title_2',
                type: 'title',
                content: { text: "2. ITEMIZED INVOICE LINES" }
            },
            {
                id: 'tbl_1',
                type: 'table',
                content: {
                    headers: ["Line Description", "Quantity", "Rate", "Total"],
                    rows: [
                        [`Professional deliverable: ${subjects[0]}`, "1", feeString.replace('$', ''), feeString.replace('$', '')],
                        ["Standardized Integration & Testing Audit", "1", "0.00", "0.00"]
                    ]
                }
            },
            {
                id: 'sum_1',
                type: 'summary',
                content: {
                    subtotal: numericFee,
                    tax: 0,
                    total: numericFee,
                    currency: "USD",
                    notes: `This invoice is compiled under standard Net-30 remittance limits from the dispatch date.`
                }
            }
        );
    } else if (docType === "Non-Disclosure Agreement") {
        blocks.push(
            {
                id: 'title_2',
                type: 'title',
                content: { text: "2. DEFINITION OF COVENANTS & MATERIAL PROTECTION" }
            },
            {
                id: 'p_2',
                type: 'paragraph',
                content: { text: `Under the parameters of "${text}", both parties covenant that confidential assets, designs, strategic outlines, structures, algorithms, and pricing formulas shared after ${today} shall remain strictly proprietary.` }
            },
            {
                id: 'title_3',
                type: 'title',
                content: { text: "3. VALIDITY TERM AND LEGAL REMEDIES" }
            },
            {
                id: 'p_3',
                type: 'paragraph',
                content: { text: "This non-disclosure compliance term is valid for five (5) consecutive years from execution. Unilateral breaches are subject to immediate injunctive blockades and judicial proceedings under applicable territorial laws." }
            },
            {
                id: 'footer_1',
                type: 'footer',
                content: { text: `CraveBiZ SmartDraft — Secure digital safeguard protecting mutual proprietary innovations.` }
            }
        );
    } else {
        blocks.push(
            {
                id: 'title_2',
                type: 'title',
                content: { text: "2. STATEMENT OF WORK AND OBJECTIVES" }
            },
            {
                id: 'p_2',
                type: 'paragraph',
                content: { text: `The scope of work encompasses delivering target artifacts for: ${subjects[0]}. All milestones will be evaluated according to standard professional verification processes.` }
            },
            {
                id: 'title_3',
                type: 'title',
                content: { text: "3. FINANCIAL CONSIDERATIONS AND SETTLEMENT" }
            },
            {
                id: 'p_3',
                type: 'paragraph',
                content: { text: `In strict consideration of successful milestone completion under rules of "${text}", the Client shall pay a total financial amount of ${feeString}. Balance due is to be settled within fourteen (14) days from the formal invoice submittal date.` }
            },
            {
                id: 'footer_1',
                type: 'footer',
                content: { text: `CraveBiZ SmartDraft — Formalized under applicable merchant specifications. All terms preserved.` }
            }
        );
    }

    return {
        documentType: docType,
        blocks: blocks
    };
}

export async function generateTextResponse(
    prompt: string,
    model: string,
    systemInstruction?: string,
): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return `[Demo Mode] Gemini AI is not configured yet. Here is a simulated response corresponding to your prompt: "${prompt}"\n\nTo unlock live and bespoke AI generations powered by Gemini, please supply your GEMINI_API_KEY in the Environment Settings.`;
    }

    try {
        const ai = getGeminiClient();
        const config = systemInstruction ? { systemInstruction } : {};

        const response = await ai.models.generateContent({
            model: model || 'gemini-3.5-flash',
            contents: prompt,
            config: config,
        });
        return response.text || "";
    } catch (error) {
        console.error(`Error calling Gemini API with model ${model}:`, error);
        return "Sorry, I encountered an error while processing your request.";
    }
}

export async function transformDocument(rawContent: string, companyContext: any): Promise<GeneratedDocument | null> {
    const apiKey = getApiKey();
    const ctx = companyContext || {};
    if (!apiKey) {
        return compileMockDocument(rawContent, ctx);
    }

    const ai = getGeminiClient();
    const model = 'gemini-3.5-flash'; // Optimized to ensure fast responsive delivery

    const systemInstruction = `You are an intelligent document transformation engine. Your task is to analyze raw, unstructured text and reformat it into a professional, structured business document in JSON format based on the provided schema.
    - Automatically detect the document type (e.g., Invoice, Receipt, Proposal, Report).
    - Extract key entities like client names, dates, and financial figures.
    - Rewrite content for clarity and professionalism, correcting grammar and structure.
    - Populate the header block with the provided company context.
    - For simple text blocks like 'title', 'paragraph', or 'footer', use the 'text' property within the 'content' object.
    - If critical information (like client name or total) is missing, leave the corresponding JSON field as an empty string.
    - DO NOT invent financial values. Preserve all numerical accuracy.
    - Auto-generate a reference/invoice number if one is not present.
    - Ensure all monetary values are numbers, not strings.`;

    const prompt = `Here is the raw content to transform:\n\n---\n${rawContent}\n---\n\nHere is the context for the company generating this document:\nCompany Name: ${ctx.name || "CRAVEBIZ AI CLIENT"}\nAddress: ${ctx.address || ""}\nEmail: ${ctx.email || ""}\nPhone: ${ctx.phone || ""}\nWebsite: ${ctx.website || ""}\n\nPlease analyze the raw content and generate a structured JSON document based on the schema.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            documentType: { type: Type.STRING, description: "Detected document type (e.g., 'Invoice', 'Receipt', 'Proposal')." },
            blocks: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        type: { type: Type.STRING, description: "The type of content block.", enum: ['header', 'metadata', 'title', 'paragraph', 'table', 'summary', 'footer'] },
                        content: {
                            type: Type.OBJECT,
                            description: "An object containing the content for the block. The properties used depend on the block 'type'.",
                            properties: {
                                text: { type: Type.STRING },
                                companyName: { type: Type.STRING },
                                address: { type: Type.STRING },
                                phone: { type: Type.STRING },
                                email: { type: Type.STRING },
                                website: { type: Type.STRING },
                                logoUrl: { type: Type.STRING },
                                documentTitle: { type: Type.STRING },
                                clientName: { type: Type.STRING },
                                preparedBy: { type: Type.STRING },
                                date: { type: Type.STRING },
                                reference: { type: Type.STRING },
                                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                                rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                                subtotal: { type: Type.NUMBER },
                                tax: { type: Type.NUMBER },
                                total: { type: Type.NUMBER },
                                currency: { type: Type.STRING },
                                notes: { type: Type.STRING },
                            }
                        }
                    },
                    required: ['id', 'type', 'content']
                }
            }
        },
        required: ['documentType', 'blocks']
    };
    
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema
            },
        });

        const jsonString = response.text ? response.text.trim() : "";
        if (!jsonString) {
            throw new Error("Received empty text response from Gemini API");
        }
        const cleanedJsonString = jsonString.replace(/^```json\s*|```\s*$/g, '');
        const parsedJson = JSON.parse(cleanedJsonString);
        return parsedJson as GeneratedDocument;
    } catch (error) {
        console.error("Gemini AI Error during document transformation. Falling back to structured heuristic draft:", error);
        return compileMockDocument(rawContent, ctx);
    }
}

export async function generateRenewalInvoiceSuggestion(clientId: string, expiringItems: InvoiceItem[]): Promise<Partial<Invoice> | null> {
    const apiKey = getApiKey();
    
    // Fallback/Programmatic Suggester: Precomputes accurate rollover dates to maintain flawless operation
    const renewItems = expiringItems.map(item => {
        let cycle = item.billingCycle || "monthly";
        let monthsToAdd = 1;
        if (cycle.toLowerCase() === "quarterly") monthsToAdd = 3;
        if (cycle.toLowerCase() === "annually" || cycle.toLowerCase() === "yearly") monthsToAdd = 12;

        let prevEndDate = item.periodEndDate ? new Date(item.periodEndDate) : new Date();
        let newStartDate = new Date(prevEndDate);
        newStartDate.setDate(newStartDate.getDate() + 1);

        let newEndDate = new Date(newStartDate);
        newEndDate.setMonth(newEndDate.getMonth() + monthsToAdd);

        return {
            ...item,
            periodStartDate: newStartDate.toISOString().split('T')[0],
            periodEndDate: newEndDate.toISOString().split('T')[0]
        };
    });

    const totalCalculated = renewItems.reduce((acc, item) => acc + (item.price * (item.quantity || 1)), 0);

    const programmaticSuggestion: Partial<Invoice> = {
        clientId: clientId,
        items: renewItems,
        total: totalCalculated,
        paymentTerms: "Net 30"
    };

    if (!apiKey) {
        return programmaticSuggestion;
    }

    const ai = getGeminiClient();
    const model = 'gemini-3.5-flash';

    const systemInstruction = `You are an intelligent billing assistant. Your task is to analyze expiring service items for a client and suggest a renewal invoice.
    - Pre-fill the same service items.
    - Adjust the periodStartDate to the day after the current periodEndDate.
    - Calculate the new periodEndDate based on the billingCycle (monthly, quarterly, annually).
    - Maintain pricing.
    - Return a JSON object representing the suggested invoice.`;

    const prompt = `Client ID: ${clientId}\nExpiring Items:\n${JSON.stringify(expiringItems, null, 2)}\n\nPlease suggest a renewal invoice.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            clientId: { type: Type.STRING },
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        serviceId: { type: Type.STRING },
                        description: { type: Type.STRING },
                        quantity: { type: Type.NUMBER },
                        price: { type: Type.NUMBER },
                        billingCycle: { type: Type.STRING },
                        periodStartDate: { type: Type.STRING },
                        periodEndDate: { type: Type.STRING },
                        durationInMonths: { type: Type.NUMBER },
                        autoRenew: { type: Type.BOOLEAN },
                        renewalReminderDaysBefore: { type: Type.NUMBER }
                    }
                }
            },
            total: { type: Type.NUMBER },
            paymentTerms: { type: Type.STRING }
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema
            },
        });

        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Gemini AI Error during renewal suggestion:", error);
        return programmaticSuggestion; // Safe fallback
    }
}

export async function generateClientPaymentHealthReport(clientId: string, paymentHistory: any[]): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
        let totalPayments = paymentHistory ? paymentHistory.length : 0;
        let latePayments = paymentHistory ? paymentHistory.filter(p => p.status === 'delayed' || p.status === 'unpaid' || p.isLate).length : 0;
        let healthScore = totalPayments > 0 ? Math.round(((totalPayments - latePayments) / totalPayments) * 100) : 100;
        
        let paymentPunctuality = "Excellent";
        if (healthScore < 90) paymentPunctuality = "Good";
        if (healthScore < 75) paymentPunctuality = "Moderate";
        if (healthScore < 50) paymentPunctuality = "High Risk";

        return `### 📊 Client Payment Health Report (Demo Mode)
Client Reference Code: **${clientId}**
Estimated Profile Status: **${paymentPunctuality}** (Estimated Score: **${healthScore}/100**)

*Notice: Live dynamic AI analysis is currently in Demo Mode because the GEMINI_API_KEY is not configured. To activate deep cognitive evaluation and custom cash flow forecasting, please configure your key in settings.*

#### 🔍 Critical Evaluation & Coverage Gaps
${latePayments > 0 ? `- **Action Required**: Historical invoices show delayed payment settlement. Maintain short payment terms (e.g. Net 15) and setup automatic reminders.` : `- **Liquidity Stability**: Client demonstrates a very stable history of completing invoice fulfillment. Suitable for standard monthly workflows.`}
- **Service Continuity**: Always inspect upcoming renewal cycles to avoid service interruption.

#### 💡 Actionable Recommendations
1. **Punctuality Reminders**: Trigger reminders 3 days prior to expiration.
2. **Transition Option**: Move client onto automatic credit pre-authorizations or monthly retainers.`;
    }

    const ai = getGeminiClient();
    const model = 'gemini-3.5-flash';

    const systemInstruction = `You are a financial analyst. Analyze the client's payment history and service coverage.
    - Detect trends (e.g., always pays late, pays ahead).
    - Identify gaps in service coverage.
    - Suggest specific actions (Send reminder, Generate renewal, Thank client).
    - Keep it concise and professional.`;

    const prompt = `Client ID: ${clientId}\nPayment & Coverage History:\n${JSON.stringify(paymentHistory, null, 2)}\n\nPlease provide a health report and suggested actions.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
            },
        });

        return response.text || "";
    } catch (error) {
        console.error("Gemini AI Error during health report:", error);
        return "Failed to generate health report.";
    }
}

export async function generateDocumentFromPurpose(purpose: string, companyContext: any): Promise<GeneratedDocument | null> {
    const apiKey = getApiKey();
    const ctx = companyContext || {};
    if (!apiKey) {
        return compileMockDocument(purpose, ctx);
    }

    const ai = getGeminiClient();
    const model = 'gemini-3.5-flash';

    const systemInstruction = `You are an expert corporate lawyer and document preparer. Your task is to generate a professional business document (like a Contract, Service Agreement, NDA, Proposal, Quote, or Invoice) based entirely on the user's stated purpose/requirements.
    Your output MUST be a structured business document in JSON format matching the schema.
    - Generate correct blocks: [header, metadata, title, paragraph, table, summary, footer].
    - Automatically create realistic details to make the document whole, e.g. sections/paragraphs with standard legal boilerplate if it is an agreement, realistic table items with prices if it is a proposal/fee breakdown, and clean summary values.
    - Standard document types like: "Service Agreement", "Non-Disclosure Agreement", "Consulting Proposal", "MOU".
    - Automatically fill company detail fields from the companyContext.
    - Use metadata block with current date and preparedBy.
    - Return a professional, clean, legally sound document design.`;

    const prompt = `Generate a business document based on this purpose: "${purpose}".
    
    Here is the company context that MUST be placed in the header block:
    Company Name: ${ctx.name || "CRAVEBIZ AI CLIENT"}
    Address: ${ctx.address || ""}
    Email: ${ctx.email || ""}
    Phone: ${ctx.phone || ""}
    Website: ${ctx.website || ""}
    Logo URL: ${ctx.logoUrl || ''}
    
    Use the schema to structure the generated document content.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            documentType: { type: Type.STRING, description: "Type of business document generated." },
            blocks: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        type: { type: Type.STRING, description: "The type of content block.", enum: ['header', 'metadata', 'title', 'paragraph', 'table', 'summary', 'footer'] },
                        content: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING },
                                companyName: { type: Type.STRING },
                                address: { type: Type.STRING },
                                phone: { type: Type.STRING },
                                email: { type: Type.STRING },
                                website: { type: Type.STRING },
                                logoUrl: { type: Type.STRING },
                                documentTitle: { type: Type.STRING },
                                clientName: { type: Type.STRING },
                                preparedBy: { type: Type.STRING },
                                date: { type: Type.STRING },
                                reference: { type: Type.STRING },
                                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                                rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                                subtotal: { type: Type.NUMBER },
                                tax: { type: Type.NUMBER },
                                total: { type: Type.NUMBER },
                                currency: { type: Type.STRING },
                                notes: { type: Type.STRING },
                            }
                        }
                    },
                    required: ['id', 'type', 'content']
                }
            }
        },
        required: ['documentType', 'blocks']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema
            },
        });
        const jsonString = response.text ? response.text.trim() : "";
        if (!jsonString) {
            throw new Error("Received empty text response from Gemini API");
        }
        const cleaned = jsonString.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(cleaned) as GeneratedDocument;
    } catch (error) {
        console.error("Gemini AI Error generating document from purpose. Falling back to structured heuristic draft:", error);
        return compileMockDocument(purpose, ctx);
    }
}

export async function reviewDocumentContent(documentText: string): Promise<DocumentReviewResult | null> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            score: 85,
            summary: "The document exhibits structurally complete billing/service clauses. However, there is a risk profile relating to liability exclusion and local jurisdiction arbitration choices.",
            risks: [
                "Uncapped liability terms during operational periods.",
                "Missing unilateral convenience termination timelines.",
                "Intellectual property assignment remains undefined prior to final balance clearance."
            ],
            suggestions: [
                "Add a limitation of liability clause capped at 100% of the total paid project contract amount.",
                "Specify Delaware or local jurisdiction venues to avoid geographic legal friction.",
                "Add a 14-day notice requirement for termination due to convenience."
            ],
            keyClauses: [
                { name: "Payment Milestones", content: "Mandates 50% upfront deposit with balances on completion milestones." },
                { name: "Intellectual Property Ownership", content: "Ownership transitions completely upon complete fulfillment of accounts." }
            ]
        };
    }

    const ai = getGeminiClient();
    const model = 'gemini-3.5-flash';

    const systemInstruction = `You are an elite legal and compliance officer. Review the provided business document or text and deliver a structured compliance analysis.
    - Provide an overall health/safety score strictly between 0 and 100 representing how complete and low-risk the document is.
    - Write a elegant 2-3 sentence executive summary of the document and its structural validity.
    - Identify key risks, potential loopholes, or unfavorable clauses in 'risks'.
    - Provide constructive, actionable suggestions for improving the document's terms in 'suggestions'.
    - Extract and list critical legal/financial clauses (e.g. Indemnification, Termination, Payment Terms, Confidentiality) in 'keyClauses' with their names and short content summaries.`;

    const prompt = `Review and analyze this document content:\n\n---\n${documentText}\n---\n\nDeliver the compliance and structural report matching the schema format.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            score: { type: Type.INTEGER, description: "Compliance/health score from 0 to 100." },
            summary: { type: Type.STRING, description: "A high-level executive summary of the document." },
            risks: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of identified risks, pitfalls, or loopholes." },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Actionable suggestions for improving the document." },
            keyClauses: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "Clause name (e.g. Confidentiality, Limitation of Liability)." },
                        content: { type: Type.STRING, description: "Summary or content of the clause." }
                    },
                    required: ['name', 'content']
                },
                description: "Key clauses extracted from the document."
            }
        },
        required: ['score', 'summary', 'risks', 'suggestions', 'keyClauses']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema
            },
        });
        const jsonString = response.text ? response.text.trim() : "";
        if (!jsonString) {
            throw new Error("Received empty text response from Gemini API");
        }
        const cleaned = jsonString.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(cleaned) as DocumentReviewResult;
    } catch (error) {
        console.error("Gemini AI Error reviewing document:", error);
        return null;
    }
}

export async function generateInvoiceInsight(prompt: string, complex: boolean = false): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return `### 💡 CraveBiZ AI Invoice Insight (Demo Mode)

**Overview Assessment**:
This document exhibits well-structured invoicing elements with standard payment periods. Let me provide standard financial insights to accelerate your liquid cash flows:

**Action Guidelines**:
1. **Accelerate Turnaround**: Shorten payment cycles from Net 30 to **Net 14** or provide a **1.5% prompt settlement discount** to improve incoming liquidity.
2. **Periodic Notifications**: Set up reminders to trigger 3 days prior to client expiration.
3. **Connect Gemini API Key**: Go to Settings in the AI Studio sidebar and supply a valid \`GEMINI_API_KEY\` to enable high-fidelity automated analysis powered by **Gemini 3.5 Pro / Flash** LLMs.`;
    }

    const ai = getGeminiClient();
    const modelName = complex ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash';

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                systemInstruction: "You are the CraveBiZ AI Financial Consultant. Your goal is to provide accurate, professional, and actionable insights into invoice data, cash flow, and client payment behaviors.",
                temperature: 0.7,
            }
        });

        return response.text || "I'm sorry, I couldn't generate an insight for this invoice at the moment.";
    } catch (error) {
        console.error("Gemini AI Error:", error);
        return "The AI consultant is currently unavailable. Please check your network connection.";
    }
}
