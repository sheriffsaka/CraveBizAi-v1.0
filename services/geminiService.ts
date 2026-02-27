
import { GoogleGenAI } from "@google/genai";

/**
 * CraveBiZ AI Generation Service
 * Optimized for Gemini 3 series models.
 */
export async function generateInvoiceInsight(prompt: string, complex: boolean = false): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use gemini-3-pro-preview for complex reasoning/financial analysis
  // Use gemini-3-flash-preview for quick summaries/descriptions
  const modelName = complex ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "You are the CraveBiZ AI Financial Consultant. Your goal is to provide accurate, professional, and actionable insights into invoice data, cash flow, and client payment behaviors.",
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: complex ? 2000 : 0 }
      }
    });

    return response.text || "I'm sorry, I couldn't generate an insight for this invoice at the moment.";
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "The AI consultant is currently unavailable. Please check your network connection.";
  }
}
