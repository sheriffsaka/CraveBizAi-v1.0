import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedDocument, Invoice, InvoiceItem, DocumentReviewResult, DocumentBlock, DocumentBlockType } from "../types.ts";
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

// function getApiKey(): string {
//     let key = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
//     if (!key) {
//         console.warn("WARNING: Neither GEMINI_API_KEY nor API_KEY is set in environment.");
//         return "";
//     }
//     key = key.trim();
//     // Strip wrapping quotes if present (common issue in custom environments)
//     if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
//         key = key.substring(1, key.length - 1).trim();
//     }
//     // Ignore invalid placeholder key from example
//     // if (key.startsWith("AQ.Ab8RN6")) {
//     //     console.warn("WARNING: GEMINI_API_KEY is using a placeholder string from .env.example.");
//     //     return "";
//     // }
//     return key;
// }

function getApiKey(): string {
    console.log("GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);

    const key = process.env.GEMINI_API_KEY || "";

    if (!key) {
        console.error("No GEMINI_API_KEY found.");
        return "";
    }

    console.log("Key length:", key.length);
    console.log("Key preview:", key.substring(0, 6));

    return key.trim();
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
    return new GoogleGenAI({
        apiKey,
        httpOptions: {
            headers: {
                'User-Agent': 'aistudio-build',
            }
        }
    });
}

async function callGeminiWithFallback(
    prompt: string,
    preferredModel: string,
    systemInstruction?: string,
    responseSchema?: any,
    responseMimeType?: string,
    temperature?: number
) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Gemini API key is missing or invalid. Please configure GEMINI_API_KEY in Environment Settings.");
    }

    const ai = getGeminiClient();
    const config: any = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseMimeType) config.responseMimeType = responseMimeType;
    if (responseSchema) config.responseSchema = responseSchema;
    if (temperature !== undefined) config.temperature = temperature;

    // Helper to map obsolete or non-standard models to valid high-performance models
    const normalizeModel = (m: string) => {
        if (!m || m.includes('2.5') || m.includes('1.5') || m.includes('2.0') || m === 'gemini-pro') {
            return 'gemini-3.6-flash';
        }
        if (m === 'gemini-3-flash-preview' || m === 'gemini-3.5-flash') {
            return 'gemini-3.6-flash';
        }
        if (m === 'gemini-3-pro-preview') {
            return 'gemini-3.1-pro-preview';
        }
        return m;
    };

    const primaryModel = normalizeModel(preferredModel);

    // Sequence of models to try in order of efficiency & availability
    const modelsToTry = [
        primaryModel,
        'gemini-3.6-flash',
        'gemini-flash-latest'
    ];

    const uniqueModels = Array.from(new Set(modelsToTry.filter(Boolean)));

    let lastError: any = null;
    for (const modelName of uniqueModels) {
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: config
            });
            return response;
        } catch (err: any) {
            lastError = err;
            const errMsg = err.message || String(err);
            console.warn(`Gemini call with model '${modelName}' failed (${errMsg}). Trying next model...`);
        }
    }

    const errMessage = lastError?.message || String(lastError);
    if (errMessage.includes("429") || errMessage.includes("RESOURCE_EXHAUSTED") || errMessage.includes("prepayment credits")) {
        throw new Error("Gemini API quota exceeded or model prepayment credits required. Switching to standard response fallback.");
    }

    throw lastError;
}

function compileMockDocument(text: string, companyContext: any, selectedPreset?: string, selectedIndustry?: string): GeneratedDocument {
    const today = new Date().toLocaleDateString();
    const ctx = companyContext || {};
    const industry = selectedIndustry || "Technology";
    
    // Determine Document Type and Title
    let docType = selectedPreset || "Service Agreement";
    let docTitle = (selectedPreset || "PROFESSIONAL SERVICES AGREEMENT").toUpperCase();
    if (!docTitle.includes("AGREEMENT") && !docTitle.includes("CONTRACT") && !docTitle.includes("PROPOSAL") && !docTitle.includes("INVOICE") && !docTitle.includes("LETTER") && !docTitle.includes("MOU") && !docTitle.includes("NDA") && !docTitle.includes("QUOTATION") && !docTitle.includes("RECEIPT")) {
        docTitle = docTitle + " DOCUMENT";
    }
    
    const lowerText = text.toLowerCase();
    if (!selectedPreset) {
        if (lowerText.includes("nda") || lowerText.includes("disclosure") || lowerText.includes("confidentiality")) {
            docType = "Non-Disclosure Agreement (NDA)";
            docTitle = "MUTUAL NON-DISCLOSURE AGREEMENT";
        } else if (lowerText.includes("invoice") || lowerText.includes("bill")) {
            docType = "Invoice";
            docTitle = "COMMERCIAL TAX INVOICE";
        } else if (lowerText.includes("receipt")) {
            docType = "Receipt";
            docTitle = "OFFICIAL PAYMENT RECEIPT";
        } else if (lowerText.includes("quotation") || lowerText.includes("quote")) {
            docType = "Quotation";
            docTitle = "COMMERCIAL PRICE QUOTATION";
        } else if (lowerText.includes("proposal") || lowerText.includes("estimate")) {
            docType = "Proposal";
            docTitle = "BUSINESS & TECHNICAL PROPOSAL";
        } else if (lowerText.includes("employment") || lowerText.includes("letter") || lowerText.includes("offer")) {
            docType = "Employment Letter";
            docTitle = "FORMAL LETTER OF EMPLOYMENT & OFFER";
        } else if (lowerText.includes("partnership")) {
            docType = "Partnership Agreement";
            docTitle = "STRATEGIC PARTNERSHIP COVENANT";
        } else if (lowerText.includes("memorandum") || lowerText.includes("memo") || lowerText.includes("mou")) {
            docType = "Memorandum";
            docTitle = "MEMORANDUM OF UNDERSTANDING & COOPERATION";
        } else if (lowerText.includes("letter")) {
            docType = "Business Letter";
            docTitle = "OFFICIAL EXECUTIVE BUSINESS LETTER";
        } else if (lowerText.includes("contract") || lowerText.includes("agreement")) {
            docType = "Contract";
            docTitle = "MASTER SERVICES CONTRACT";
        }
    }

    // Extract client name if available
    let clientName = "Authorized Counterparty Client";
    const clientMatches = text.match(/(?:between|and|client|partner|for|with|to)\s+([A-Z][a-zA-Z0-9\s.]{2,30})/i);
    if (clientMatches && clientMatches[1]) {
        const candidate = clientMatches[1].trim();
        const upperCand = candidate.toUpperCase();
        if (upperCand !== "NDA" && upperCand !== "AGREEMENT" && upperCand !== "CONTRACT" && upperCand !== "THE" && upperCand !== "US" && upperCand !== "ME" && upperCand !== "YOU" && upperCand !== "A" && upperCand !== "CLIENT" && upperCand !== "PARTNER") {
            clientName = candidate;
        }
    }

    // Parse specific items & prices from text to construct a dynamic table
    const tableRows: string[][] = [];
    let parsedSubtotal = 0;
    
    const textSegments = text.split(/[.;\n•]/);
    for (const segment of textSegments) {
        const trimmed = segment.trim();
        if (!trimmed || trimmed.length < 5) continue;
        const priceMatch = trimmed.match(/\$[0-9,]+(?:\.[0-9]{2})?/);
        if (priceMatch) {
            const priceStr = priceMatch[0];
            const priceVal = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
            let desc = trimmed.replace(priceStr, '').replace(/(?:costing|for|price:?|cost:?|total:?|at|fee:?|of)\s*$/i, '').trim();
            desc = desc.replace(/^[\s-:,]+/g, '').replace(/[\s-:,]+$/g, '').trim();
            if (desc.length > 3) {
                tableRows.push([
                    desc,
                    "1",
                    "$" + priceVal.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    "$" + priceVal.toLocaleString('en-US', { minimumFractionDigits: 2 })
                ]);
                parsedSubtotal += priceVal;
            }
        }
    }

    if (tableRows.length === 0) {
        const singleFeeMatch = text.match(/\$[0-9,]+(?:\.[0-9]{2})?/);
        if (singleFeeMatch) {
            const feeVal = parseFloat(singleFeeMatch[0].replace(/[^0-9.]/g, '')) || 0;
            tableRows.push([
                `${docType} Professional Deliverables (${industry})`,
                "1",
                "$" + feeVal.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                "$" + feeVal.toLocaleString('en-US', { minimumFractionDigits: 2 })
            ]);
            parsedSubtotal = feeVal;
        } else {
            tableRows.push(
                [`1. ${industry} Core Deliverable Phase 1`, "1", "$2,500.00", "$2,500.00"],
                [`2. ${industry} Implementation & Compliance Audit`, "1", "$1,500.00", "$1,500.00"]
            );
            parsedSubtotal = 4000;
        }
    }

    // Industry specific standard clause snippets
    const industryComplianceMap: Record<string, string> = {
        "Technology": "Both parties agree to uphold technical standards, source code encryption, 99.9% operational uptime SLAs, and strict cybersecurity practices conforming to ISO/IEC 27001 regulations.",
        "Healthcare": "All services and patient/client data handling shall adhere strictly to HIPAA, HITECH, and applicable health data privacy standards, safeguarding protected health information (PHI) at all times.",
        "Legal": "This instrument is drafted under formal statutory provisions, maintaining strict attorney-client privilege, legal confidentiality, and adherence to state bar professional standards.",
        "Finance": "Financial records, fee calculations, and transaction settlement terms herein comply with GAAP accounting rules, FINRA/SEC oversight guidelines, and anti-money laundering (AML) protocols.",
        "Construction": "All physical works, site developments, and structural modifications shall comply with OSHA workplace safety mandates, local building codes, lien releases, and architectural guidelines.",
        "Education": "Academic, training, and student record handling shall strictly observe FERPA regulations and institution accreditation criteria for educational compliance.",
        "Real Estate": "Property transfers, leases, and real estate disclosures shall conform to state real estate licensing laws, fair housing provisions, and title insurance standards.",
        "Retail": "Commercial merchandising, consumer privacy, credit card processing (PCI-DSS), and return policies shall follow standard commercial codes and retail protection acts.",
        "Hospitality": "Guest management, catering operations, and event services shall maintain health code compliance, public liability coverage, and hospitality service agreements.",
        "Consulting": "Advisory services, strategy frameworks, and executive reports represent proprietary intellectual property tailored specifically for counterparty operations.",
        "Non-Profit": "All funds, grants, and partnership contributions shall be deployed exclusively for charitable and public benefit objectives in compliance with 501(c)(3) tax codes.",
        "Government": "Procurement, public disclosures, and contractual execution shall abide by FAR (Federal Acquisition Regulations) and state public bidding transparency statutes."
    };

    const industryNote = industryComplianceMap[industry] || "Services shall be executed in accordance with industry best practices and applicable commercial standards.";

    const blocks: DocumentBlock[] = [
        {
            id: 'cover_' + Math.floor(Math.random() * 100000),
            type: 'cover_page',
            content: {
                title: docTitle,
                subtitle: `${industry} Sector - Official ${docType}`,
                companyName: ctx.name || "CRAVEBIZ AI ENTERPRISE",
                preparedBy: ctx.name || "CraveBiZ AI Document Architect",
                preparedFor: clientName,
                date: today,
                logoUrl: ctx.logoUrl || ctx.logo_url || ''
            }
        },
        {
            id: 'hdr_' + Math.floor(Math.random() * 100000),
            type: 'header',
            content: {
                companyName: ctx.name || "CRAVEBIZ ENTERPRISE SOLUTIONS",
                address: ctx.address || "100 Corporate Parkway, Suite 500",
                email: ctx.email || "agreements@cravebiz.ai",
                phone: ctx.phone || "+1 (800) 555-0199",
                website: ctx.website || "www.cravebiz.ai",
                logoUrl: ctx.logoUrl || ctx.logo_url || ''
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
                reference: `REF-${industry.substring(0,3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`
            }
        },
        {
            id: 'title_' + Math.floor(Math.random() * 100000),
            type: 'title',
            content: {
                text: docTitle
            }
        },
        {
            id: 'p1_' + Math.floor(Math.random() * 100000),
            type: 'paragraph',
            content: {
                text: `1. PREAMBLE & OBJECTIVES\nThis ${docType} ("Agreement") is executed on this ${today} by and between ${ctx.name || 'CraveBiZ Solutions'} ("Provider / Issuer") and ${clientName} ("Counterparty / Client"), operating within the ${industry} industry sector.\n\nWHEREAS, Provider possesses specialized capabilities in ${industry} operations, and Client desires to engage Provider for the execution of official business objectives set forth herein.`
            }
        },
        {
            id: 'p2_' + Math.floor(Math.random() * 100000),
            type: 'paragraph',
            content: {
                text: `2. SCOPE OF WORK & DETAILED REQUIREMENTS\nThe specific terms, requirements, and deliverables encompassed under this ${docType} include:\n${text}`
            }
        },
        {
            id: 'p3_' + Math.floor(Math.random() * 100000),
            type: 'paragraph',
            content: {
                text: `3. INDUSTRY REGULATORY COMPLIANCE & STANDARDS (${industry.toUpperCase()})\n${industryNote}\n\nBoth parties covenant to strictly abide by all statutory laws, state guidelines, and environmental/data safety rules governing the ${industry} domain.`
            }
        },
        {
            id: 'p4_' + Math.floor(Math.random() * 100000),
            type: 'paragraph',
            content: {
                text: `4. FINANCIAL CONSIDERATIONS & SCHEDULE OF FEES\nIn consideration of the satisfactory fulfillment of obligations under this document, the financial schedule and fee allocations are detailed below. All payments are due within thirty (30) days from invoice date.`
            }
        },
        {
            id: 'tbl_' + Math.floor(Math.random() * 100000),
            type: 'table',
            content: {
                headers: ["Itemized Deliverable / Service", "Qty", "Unit Rate", "Total Amount"],
                rows: tableRows
            }
        },
        {
            id: 'sum_' + Math.floor(Math.random() * 100000),
            type: 'summary',
            content: {
                subtotal: parsedSubtotal,
                tax: Math.round(parsedSubtotal * 0.05 * 100) / 100,
                total: Math.round(parsedSubtotal * 1.05 * 100) / 100,
                currency: "$"
            }
        },
        {
            id: 'p5_' + Math.floor(Math.random() * 100000),
            type: 'paragraph',
            content: {
                text: `5. CONFIDENTIALITY, INTELLECTUAL PROPERTY & TERMINATION\nAll proprietary documents, algorithms, client data, trade secrets, and financial terms shared between the parties shall remain strictly confidential. This ${docType} may be terminated by either party upon thirty (30) days written notice in event of material breach.`
            }
        },
        {
            id: 'ftr_' + Math.floor(Math.random() * 100000),
            type: 'footer',
            content: {
                text: `IN WITNESS WHEREOF, the authorized representatives of both parties have executed this ${docType} as of the date first written above. Conforms to ${industry} Industry Standard Covenants.`
            }
        }
    ];

    return {
        documentType: `${industry} - ${docType}`,
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
        const response = await callGeminiWithFallback(
            prompt,
            model || 'gemini-3.6-flash',
            systemInstruction
        );
        return response.text || "";
    } catch (error) {
        console.error(`Error calling Gemini API with model ${model}:`, error);
        throw error;
    }
}

export async function transformDocument(rawContent: string, companyContext: any): Promise<GeneratedDocument | null> {
    const apiKey = getApiKey();
    const ctx = companyContext || {};
    if (!apiKey) {
        throw new Error("Gemini API key is not configured. Please set GEMINI_API_KEY in environment variables to transform documents via AI.");
    }

    const ai = getGeminiClient();
    const model = 'gemini-3.6-flash'; // Optimized to ensure fast responsive delivery

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
        const response = await callGeminiWithFallback(
            prompt,
            model,
            systemInstruction,
            schema,
            "application/json"
        );

        const jsonString = response.text ? response.text.trim() : "";
        if (!jsonString) {
            throw new Error("Received empty text response from Gemini API");
        }
        const cleanedJsonString = jsonString.replace(/^```json\s*|```\s*$/g, '');
        const parsedJson = JSON.parse(cleanedJsonString);
        return parsedJson as GeneratedDocument;
    } catch (error: any) {
        console.error("Gemini AI Error during document transformation:", error);
        throw new Error(`AI Document Transformation failed: ${error?.message || 'Gemini model failed to transform document'}`);
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
        const response = await callGeminiWithFallback(
            prompt,
            'gemini-3.6-flash',
            systemInstruction,
            schema,
            "application/json"
        );

        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Gemini AI Error during renewal suggestion:", error);
        throw error;
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

    const model = 'gemini-3.6-flash';

    const systemInstruction = `You are a financial analyst. Analyze the client's payment history and service coverage.
    - Detect trends (e.g., always pays late, pays ahead).
    - Identify gaps in service coverage.
    - Suggest specific actions (Send reminder, Generate renewal, Thank client).
    - Keep it concise and professional.`;

    const prompt = `Client ID: ${clientId}\nPayment & Coverage History:\n${JSON.stringify(paymentHistory, null, 2)}\n\nPlease provide a health report and suggested actions.`;

    try {
        const response = await callGeminiWithFallback(
            prompt,
            model,
            systemInstruction
        );

        return response.text || "";
    } catch (error) {
        console.error("Gemini AI Error during health report:", error);
        throw error;
    }
}

export async function generateDocumentFromPurpose(
    purpose: string, 
    companyContext: any, 
    selectedPreset?: string,
    selectedIndustry?: string
): Promise<GeneratedDocument | null> {
    const apiKey = getApiKey();
    const ctx = companyContext || {};
    if (!apiKey) {
        throw new Error("Gemini API key is not configured. Please set GEMINI_API_KEY in environment variables to enable AI Document Generation.");
    }

    const model = 'gemini-3.6-flash';

    const systemInstruction = `You are an expert corporate lawyer, industry advisor, and professional document preparer.
    Your task is to generate a comprehensive, print-ready, high-quality business document that adheres to standard practices of the selected document type and industry sector.
    Your output MUST be a structured business document in JSON format matching the schema.
    ${selectedPreset ? `Document Type: "${selectedPreset}".` : ''}
    ${selectedIndustry ? `Industry Sector: "${selectedIndustry}".` : ''}
    
    Generation Guidelines:
    - Generate rich, detailed, non-generic content.
    - Structure the document into clean, numbered sections (e.g. '1. Purpose & Scope', '2. Deliverables & Specifications', '3. Financial Terms & Fee Schedule', '4. Industry Regulatory Compliance', '5. Confidentiality & Intellectual Property', '6. Term & Termination', '7. Governing Law').
    - Incorporate standard terminology, compliance rules, and best practices relevant to the ${selectedIndustry || 'General Business'} industry (e.g., HIPAA for Healthcare, SLAs for Tech, OSHA for Construction, GAAP for Finance, FERPA for Education).
    - Generate appropriate blocks: [header, metadata, title, multiple paragraph blocks with numbered section headings, table with itemized breakdown, summary block, footer].
    - Automatically fill company details from companyContext into the header block.
    - Ensure all custom pricing, milestones, parties, and rules mentioned in the prompt are accurately represented.`;

    const prompt = `Generate a comprehensive business document based on this purpose: "${purpose}".
    Document Type: ${selectedPreset || 'Business Document'}
    Target Industry: ${selectedIndustry || 'General'}
    
    Company Context for Header:
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
        const response = await callGeminiWithFallback(
            prompt,
            model,
            systemInstruction,
            schema,
            "application/json"
        );
        const jsonString = response.text ? response.text.trim() : "";
        if (!jsonString) {
            throw new Error("Received empty text response from Gemini API");
        }
        const cleaned = jsonString.replace(/^```json\s*|```\s*$/g, '');
        const parsed = JSON.parse(cleaned) as GeneratedDocument;
        
        // Programmatically prepend cover page
        if (parsed && parsed.blocks) {
            const hasCover = parsed.blocks.some(b => b.type === 'cover_page');
            if (!hasCover) {
                const metaBlock = parsed.blocks.find(b => b.type === 'metadata');
                const documentTitle = metaBlock?.content?.documentTitle || parsed.documentType || "Strategic Agreement";
                const clientName = metaBlock?.content?.clientName || "Valued Counterparty";
                const preparedBy = metaBlock?.content?.preparedBy || ctx.name || "CraveBiZ AI Transformer";
                const today = metaBlock?.content?.date || new Date().toLocaleDateString();
                
                const coverBlock: DocumentBlock = {
                    id: 'cover_' + Math.floor(Math.random() * 100000),
                    type: 'cover_page',
                    content: {
                        title: documentTitle,
                        subtitle: "Strategic Project Covenant",
                        companyName: ctx.name || "CRAVEBIZ AI CLIENT",
                        preparedBy: preparedBy,
                        preparedFor: clientName,
                        date: today,
                        logoUrl: ctx.logoUrl || ctx.logo_url || ''
                    }
                };
                parsed.blocks.unshift(coverBlock);
            }
        }
        return parsed;
    } catch (error: any) {
        console.error("Gemini AI Error generating document from purpose:", error);
        throw new Error(`AI Document Generation failed: ${error?.message || 'Gemini model was unable to generate document contents'}`);
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

    const model = 'gemini-3.6-flash';

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
        const response = await callGeminiWithFallback(
            prompt,
            model,
            systemInstruction,
            schema,
            "application/json"
        );
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

    const modelName = 'gemini-3.6-flash';

    try {
        const response = await callGeminiWithFallback(
            prompt,
            modelName,
            "You are the CraveBiZ AI Financial Consultant. Your goal is to provide accurate, professional, and actionable insights into invoice data, cash flow, and client payment behaviors.",
            undefined,
            undefined,
            0.7
        );

        return response.text || "I'm sorry, I couldn't generate an insight for this invoice at the moment.";
    } catch (error) {
        console.error("Gemini AI Error:", error);
        throw error;
    }
}
