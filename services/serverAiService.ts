import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedDocument, Invoice, InvoiceItem, DocumentReviewResult, DocumentBlock, DocumentBlockType } from "../types";

function getApiKey(): string {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!key) {
        console.warn("WARNING: Neither GEMINI_API_KEY nor API_KEY is set in environment.");
    }
    return key || "";
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
        const ai = new GoogleGenAI({ apiKey });
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
    if (!apiKey) {
        // High fidelity mockup document based on raw content
        const isNDA = /nda|non-disclosure|confidentiality/i.test(rawContent);
        const isAgreement = /agreement|contract|service/i.test(rawContent);
        const isInvoice = /invoice|bill|receipt|payment/i.test(rawContent);
        
        let docType = "Business Document";
        if (isNDA) docType = "Non-Disclosure Agreement";
        else if (isAgreement) docType = "Service Agreement";
        else if (isInvoice) docType = "Structured Invoice";

        return {
            documentType: docType,
            blocks: [
                {
                    id: "block-header-demo",
                    type: "header",
                    content: {
                        companyName: companyContext.name || "CRAVEBIZ DEMO CLIENT",
                        address: companyContext.address || "123 Business Rd, Suite 100",
                        email: companyContext.email || "billing@cravebiz.com",
                        phone: companyContext.phone || "+1 (555) 019-2834",
                        website: companyContext.website || "https://cravebiz.com",
                        logoUrl: companyContext.logoUrl || ""
                    }
                },
                {
                    id: "block-meta-demo",
                    type: "metadata",
                    content: {
                        date: new Date().toLocaleDateString(),
                        reference: "CB-" + Math.floor(100000 + Math.random() * 900000),
                        preparedBy: "CraveBiZ AI Transformer"
                    }
                },
                {
                    id: "block-title-demo",
                    type: "title",
                    content: {
                        text: docType.toUpperCase()
                    }
                },
                {
                    id: "block-body-demo-1",
                    type: "paragraph",
                    content: {
                        text: `This document has been transformed automatically from raw text input. [Demo Mode: Please configure your GEMINI_API_KEY in the environment Settings to use live AI document transformations.]`
                    }
                },
                ...(isInvoice ? [
                    {
                        id: "block-table-demo",
                        type: "table",
                        content: {
                            headers: ["Description", "Quantity", "Unit Price", "Total"],
                            rows: [
                                ["Consulting Services (Simulated)", "10", "150", "1500"],
                                ["Implementation Support (Simulated)", "1", "500", "500"],
                            ]
                        }
                    },
                    {
                        id: "block-summary-demo",
                        type: "summary",
                        content: {
                            subtotal: 2000,
                            tax: 160,
                            total: 2160,
                            currency: "USD",
                            notes: "Payment is due within 14 days of receipt."
                        }
                    }
                ] : [
                    {
                        id: "block-body-demo-2",
                        type: "paragraph",
                        content: {
                            text: `1. PURPOSE AND SCOPE: The parties agree to enter into discussions regarding mutual business interests. All exchange of proprietary information will be strictly governed by the confidentiality requirements set forth within this document.`
                        }
                    },
                    {
                        id: "block-body-demo-3",
                        type: "paragraph",
                        content: {
                            text: `2. GOVERNING LAW: This agreement shall be governed by, and construed in accordance with, state laws.`
                        }
                    },
                    {
                        id: "block-footer-demo",
                        type: "footer",
                        content: {
                            text: "Confidential Business Document - Demo Copy"
                        }
                    }
                ])
            ] as DocumentBlock[]
        };
    }

    const ai = new GoogleGenAI({ apiKey });
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

    const prompt = `Here is the raw content to transform:\n\n---\n${rawContent}\n---\n\nHere is the context for the company generating this document:\nCompany Name: ${companyContext.name}\nAddress: ${companyContext.address}\nEmail: ${companyContext.email}\nPhone: ${companyContext.phone}\nWebsite: ${companyContext.website}\n\nPlease analyze the raw content and generate a structured JSON document based on the schema.`;

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

        const jsonString = response.text.trim();
        const cleanedJsonString = jsonString.replace(/^```json\s*|```\s*$/g, '');
        const parsedJson = JSON.parse(cleanedJsonString);
        return parsedJson as GeneratedDocument;
    } catch (error) {
        console.error("Gemini AI Error during document transformation:", error);
        return null;
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

    const ai = new GoogleGenAI({ apiKey });
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

    const ai = new GoogleGenAI({ apiKey });
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
    if (!apiKey) {
        const isNDA = /nda|non-disclosure|confidentiality/i.test(purpose);
        const isAgreement = /agreement|contract|service/i.test(purpose);
        
        let docType = "General Proposal";
        if (isNDA) docType = "Non-Disclosure Agreement";
        else if (isAgreement) docType = "Service Agreement";

        return {
            documentType: docType,
            blocks: [
                {
                    id: "block-header-demo-p",
                    type: "header",
                    content: {
                        companyName: companyContext.name || "CRAVEBIZ CLIENT",
                        address: companyContext.address || "123 Professional Dr",
                        email: companyContext.email || "support@cravebiz.com",
                        phone: companyContext.phone || "+1 (555) 012-3456",
                        website: companyContext.website || "https://cravebiz.com",
                        logoUrl: companyContext.logoUrl || ""
                    }
                },
                {
                    id: "block-meta-demo-p",
                    type: "metadata",
                    content: {
                        date: new Date().toLocaleDateString(),
                        reference: "AGR-" + Math.floor(100000 + Math.random() * 900000),
                        preparedBy: "CraveBiZ AI Template Generator"
                    }
                },
                {
                    id: "block-title-demo-p",
                    type: "title",
                    content: {
                        text: docType.toUpperCase()
                    }
                },
                {
                    id: "block-body-demo-p-1",
                    type: "paragraph",
                    content: {
                        text: `This document template was generated based on requirements: "${purpose}". [Demo Mode: Connect a GEMINI_API_KEY to synthesize custom drafts with live AI legal templates and boilerplate blocks.]`
                    }
                },
                {
                    id: "block-body-demo-p-2",
                    type: "paragraph",
                    content: {
                        text: "1. COOPERATION AND STANDARDS: Both parties agree to conduct all mutual exchanges with integrity and follow state-governed standard operating guidelines."
                    }
                },
                {
                    id: "block-body-demo-p-3",
                    type: "paragraph",
                    content: {
                        text: "2. INTELLECTUAL PROPERTY: All deliverables, customized code, or physical materials created during the course of services shall transition to client ownership upon final invoice clearance."
                    }
                },
                {
                    id: "block-footer-demo-p",
                    type: "footer",
                    content: {
                        text: "Generated by CraveBiZ smart drafts - Demo Mode"
                    }
                }
            ] as DocumentBlock[]
        };
    }

    const ai = new GoogleGenAI({ apiKey });
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
    Company Name: ${companyContext.name}
    Address: ${companyContext.address}
    Email: ${companyContext.email}
    Phone: ${companyContext.phone}
    Website: ${companyContext.website}
    Logo URL: ${companyContext.logoUrl || ''}
    
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
        const jsonString = response.text.trim();
        const cleaned = jsonString.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(cleaned) as GeneratedDocument;
    } catch (error) {
        console.error("Gemini AI Error generating document from purpose:", error);
        return null;
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

    const ai = new GoogleGenAI({ apiKey });
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
        const jsonString = response.text.trim();
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

    const ai = new GoogleGenAI({ apiKey });
    const modelName = complex ? 'gemini-3.5-pro' : 'gemini-3.5-flash';

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
