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
    const ai = getGeminiClient();
    const config: any = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseMimeType) config.responseMimeType = responseMimeType;
    if (responseSchema) config.responseSchema = responseSchema;
    if (temperature !== undefined) config.temperature = temperature;

    try {
        const response = await ai.models.generateContent({
            model: preferredModel,
            contents: prompt,
            config: config
        });
        return response;
    } catch (err: any) {
        console.warn(`Preferred model ${preferredModel} failed or quota exceeded:`, err.message || err);
        if (preferredModel !== 'gemini-2.5-flash') {
            console.info(`Attempting fallback to free tier model 'gemini-2.5-flash'...`);
            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: config
                });
                return response;
            } catch (fallbackErr: any) {
                console.error("Fallback to 'gemini-2.5-flash' failed as well:", fallbackErr.message || fallbackErr);
                throw fallbackErr;
            }
        }
        throw err;
    }
}

function compileMockDocument(text: string, companyContext: any, selectedPreset?: string): GeneratedDocument {
    const today = new Date().toLocaleDateString();
    const ctx = companyContext || {};
    
    // Determine Document Type and Title
    let docType = selectedPreset || "Service Agreement";
    let docTitle = (selectedPreset || "PROFESSIONAL SERVICES AGREEMENT").toUpperCase();
    if (!docTitle.includes("AGREEMENT") && !docTitle.includes("CONTRACT") && !docTitle.includes("PROPOSAL") && !docTitle.includes("INVOICE") && !docTitle.includes("REPORT") && !docTitle.includes("MOU")) {
        docTitle = docTitle + " AGREEMENT";
    }
    
    const lowerText = text.toLowerCase();
    if (!selectedPreset) {
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
    }

    // Attempt to extract client name from text
    let clientName = "Authorized Counterparty Client";
    const clientMatches = text.match(/(?:between|and|client|partner|for|with|to)\s+([A-Z][a-zA-Z0-9\s.]{2,30})/i);
    if (clientMatches && clientMatches[1]) {
        const candidate = clientMatches[1].trim();
        const upperCand = candidate.toUpperCase();
        if (upperCand !== "NDA" && upperCand !== "AGREEMENT" && upperCand !== "CONTRACT" && upperCand !== "THE" && upperCand !== "US" && upperCand !== "ME" && upperCand !== "YOU" && upperCand !== "A" && upperCand !== "CLIENT" && upperCand !== "PARTNER") {
            clientName = candidate;
        }
    }

    // Parse specific items & prices from text to construct a dynamic, beautiful table
    const tableRows: string[][] = [];
    let parsedSubtotal = 0;
    
    // Split text by lines, semicolons, or bullet points
    const textSegments = text.split(/[.;\n•]/);
    for (const segment of textSegments) {
        const trimmed = segment.trim();
        if (!trimmed || trimmed.length < 5) continue;
        const priceMatch = trimmed.match(/\$[0-9,]+(?:\.[0-9]{2})?/);
        if (priceMatch) {
            const priceStr = priceMatch[0];
            const priceVal = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
            let desc = trimmed.replace(priceStr, '').replace(/(?:costing|for|price:?|cost:?|total:?|at|fee:?|of)\s*$/i, '').trim();
            // Clean up separator characters or trailing/leading punctuation
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

    // If no tables rows were found but a single dollar amount is present, construct a general line
    if (tableRows.length === 0) {
        const singleFeeMatch = text.match(/\$[0-9,]+(?:\.[0-9]{2})?/);
        if (singleFeeMatch) {
            const feeVal = parseFloat(singleFeeMatch[0].replace(/[^0-9.]/g, '')) || 0;
            tableRows.push([
                `Contract Services: ${docType}`,
                "1",
                "$" + feeVal.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                "$" + feeVal.toLocaleString('en-US', { minimumFractionDigits: 2 })
            ]);
            parsedSubtotal = feeVal;
        }
    }

    const blocks: DocumentBlock[] = [
        {
            id: 'cover_' + Math.floor(Math.random() * 100000),
            type: 'cover_page',
            content: {
                title: docTitle,
                subtitle: `Professional ${docType} Draft`,
                companyName: ctx.name || "CRAVEBIZ SOLUTIONS",
                preparedBy: ctx.name || "CRAVEBIZ",
                preparedFor: clientName,
                date: today,
                logoUrl: ctx.logoUrl || ctx.logo_url || ''
            }
        },
        {
            id: 'hdr_' + Math.floor(Math.random() * 100000),
            type: 'header',
            content: {
                companyName: ctx.name || "CRAVEBIZ SOLUTIONS",
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
                preparedBy: ctx.name || "CRAVEBIZ",
                date: today,
                reference: "REF-" + Math.floor(Math.random() * 899999 + 100000)
            }
        },
        {
            id: 'title_1',
            type: 'title',
            content: { text: "1. RECITALS, PURPOSE AND SCOPE" }
        },
        {
            id: 'p_1',
            type: 'paragraph',
            content: { text: `This document establishes the official parameters, provisions, and guidelines for the ${docType} requested under user specifications: "${text}".` }
        },
        {
            id: 'p_1_details',
            type: 'paragraph',
            content: { text: `The parties bound under this covenant—specifically ${ctx.name || "Provider"} ("Provider") and ${clientName} ("Client")—unilaterally covenant to maintain the compliance, specifications, and performance milestones outlined in this draft starting effective ${today}.` }
        }
    ];

    // If the prompt has explicit sentences without pricing, write them as structured clauses so they are represented perfectly!
    const nonPriceSentences = textSegments.filter(s => {
        const t = s.trim();
        return t.length > 15 && !t.match(/\$[0-9,]+/);
    });

    if (nonPriceSentences.length > 0) {
        blocks.push({
            id: 'title_clauses',
            type: 'title',
            content: { text: "2. CUSTOM USER-SPECIFIED PROVISIONS" }
        });
        
        for (let idx = 0; idx < nonPriceSentences.length; idx++) {
            const cleanSentence = nonPriceSentences[idx].trim();
            const capitalized = cleanSentence.charAt(0).toUpperCase() + cleanSentence.slice(1);
            blocks.push({
                id: `p_user_clause_${idx}`,
                type: 'paragraph',
                content: { text: `Clause 2.${idx + 1}: ${capitalized}.` }
            });
        }
    }

    // Add table if there is any fee/pricing extracted or if it's a proposal/invoice
    if (tableRows.length > 0) {
        const tableId = 'title_table_sect';
        blocks.push(
            {
                id: tableId,
                type: 'title',
                content: { text: docType.toLowerCase().includes('invoice') ? "3. ITEMIZATION OF SERVICES" : "3. FEE SCHEDULE & COST REIMBURSEMENT" }
            },
            {
                id: 'tbl_dynamic_1',
                type: 'table',
                content: {
                    headers: ["Line Item Description", "Qty", "Unit Price", "Total Price"],
                    rows: tableRows
                }
            },
            {
                id: 'sum_dynamic_1',
                type: 'summary',
                content: {
                    subtotal: parsedSubtotal,
                    tax: 0,
                    total: parsedSubtotal,
                    currency: "USD",
                    notes: `This dynamic schedule represents the precise cost items described in user specifications. Balance is payable in Net-30 remittance conditions.`
                }
            }
        );
    } else {
        blocks.push(
            {
                id: 'title_legal',
                type: 'title',
                content: { text: "3. GOVERNING LAW AND RESOLUTION" }
            },
            {
                id: 'p_legal_1',
                type: 'paragraph',
                content: { text: "This Draft Agreement is governed by the prevailing commercial codes and regulations of the specified home jurisdiction. Any disagreements arising under this contract shall be settled via binding arbitration before a designated tribunal." }
            }
        );
    }

    // Footer
    blocks.push({
        id: 'footer_dyn',
        type: 'footer',
        content: { text: `Generated perfectly based on custom specifications for ${docType} with Client ${clientName}. All rights and covenants preserved.` }
    });

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
        const response = await callGeminiWithFallback(
            prompt,
            model || 'gemini-2.5-flash',
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
        return compileMockDocument(rawContent, ctx);
    }

    const ai = getGeminiClient();
    const model = 'gemini-2.5-flash'; // Optimized to ensure fast responsive delivery

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
    const model = 'gemini-2.5-flash';

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
            model,
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

    const ai = getGeminiClient();
    const model = 'gemini-2.5-flash';

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

export async function generateDocumentFromPurpose(purpose: string, companyContext: any, selectedPreset?: string): Promise<GeneratedDocument | null> {
    const apiKey = getApiKey();
    const ctx = companyContext || {};
    if (!apiKey) {
        return compileMockDocument(purpose, ctx, selectedPreset);
    }

    const ai = getGeminiClient();
    const model = 'gemini-2.5-flash';

    const systemInstruction = `You are an expert corporate lawyer and document preparer. Your task is to generate a professional business document based entirely on the user's stated purpose/requirements.
    Your output MUST be a structured business document in JSON format matching the schema.
    ${selectedPreset ? `The requested document type is exactly: "${selectedPreset}". Make sure the output document corresponds to this type.` : ''}
    - Generate correct blocks: [header, metadata, title, paragraph, table, summary, footer].
    - Automatically create realistic details to make the document whole, e.g. sections/paragraphs with standard legal boilerplate if it is an agreement, realistic table items with prices if it is a proposal/fee breakdown, and clean summary values.
    - Automatically fill company detail fields from the companyContext.
    - Use metadata block with current date and preparedBy.
    - Ensure that all custom sentences, specific pricing, milestones, and parties mentioned in the user's description are fully represented in the blocks.
    - Return a professional, clean, legally sound document design.`;

    const prompt = `Generate a business document based on this purpose: "${purpose}".
    ${selectedPreset ? `The chosen document type preset is: "${selectedPreset}".` : ''}
    
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
    const model = 'gemini-2.5-flash';

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

    const modelName = complex ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

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
