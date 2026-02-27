
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
