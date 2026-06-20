
import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedDocument, Invoice, InvoiceItem } from "../types";

export async function generateTextResponse(
    prompt: string,
    model: string,
    systemInstruction?: string,
): Promise<string> {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        return "Gemini AI is not configured. Please set your API key.";
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const config = systemInstruction ? { systemInstruction } : {};

        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: config,
        });
        return response.text;
    } catch (error) {
        console.error(`Error calling Gemini API with model ${model}:`, error);
        return "Sorry, I encountered an error while processing your request.";
    }
}

export async function transformDocument(rawContent: string, companyContext: any): Promise<GeneratedDocument | null> {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-pro-preview';

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
                                // For title, paragraph, footer
                                text: { type: Type.STRING },
                                // From HeaderBlock
                                companyName: { type: Type.STRING },
                                address: { type: Type.STRING },
                                phone: { type: Type.STRING },
                                email: { type: Type.STRING },
                                website: { type: Type.STRING },
                                logoUrl: { type: Type.STRING },
                                // From MetadataBlock
                                documentTitle: { type: Type.STRING },
                                clientName: { type: Type.STRING },
                                preparedBy: { type: Type.STRING },
                                date: { type: Type.STRING },
                                reference: { type: Type.STRING },
                                // From TableBlock
                                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                                rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                                // From SummaryBlock
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
        // Sometimes the model returns the JSON wrapped in markdown backticks, so we clean it.
        const cleanedJsonString = jsonString.replace(/^```json\s*|```\s*$/g, '');
        const parsedJson = JSON.parse(cleanedJsonString);
        return parsedJson as GeneratedDocument;

    } catch (error) {
        console.error("Gemini AI Error during document transformation:", error);
        return null;
    }
}

export async function generateRenewalInvoiceSuggestion(clientId: string, expiringItems: InvoiceItem[]): Promise<Partial<Invoice> | null> {
    if (!process.env.API_KEY) return null;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';

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
        return null;
    }
}

export async function generateClientPaymentHealthReport(clientId: string, paymentHistory: any[]): Promise<string> {
    if (!process.env.API_KEY) return "AI Configuration Missing.";
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';

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

        return response.text;
    } catch (error) {
        console.error("Gemini AI Error during health report:", error);
        return "Failed to generate health report.";
    }
}

export async function generateDocumentFromPurpose(purpose: string, companyContext: any): Promise<GeneratedDocument | null> {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

export interface DocumentReviewResult {
    score: number;
    summary: string;
    risks: string[];
    suggestions: string[];
    keyClauses: { name: string; content: string }[];
}

export async function reviewDocumentContent(documentText: string): Promise<DocumentReviewResult | null> {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

