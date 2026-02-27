
import { GoogleGenAI, Chat } from "@google/genai";
import { Message } from '../types';

let chatSession: Chat | null = null;
// Store the API key used to create the current chatSession.
// If process.env.API_KEY changes, the session needs to be re-initialized.
let apiKeyUsedToCreateChatSession: string | null = null;

export async function initializeChat(): Promise<Chat> {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        throw new Error("Gemini AI is not configured. Please set your API key.");
    }

    // Always create a new GoogleGenAI instance for the chat session, as per guidelines.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Updated model to gemini-3-flash-preview as per guidelines for basic text tasks
    chatSession = ai.chats.create({
        model: 'gemini-3-flash-preview', 
        config: {
            systemInstruction: "You are CraveBiZ AI, an intelligent assistant for an invoice management platform. Be professional, simple, and reliable. Keep responses concise and action-oriented. Provide helpful information related to invoicing, client management, services, and reports. If a user asks for something outside of invoice management, politely decline and redirect them to related topics."
        },
    });
    apiKeyUsedToCreateChatSession = process.env.API_KEY; // Store the key used for this session
    return chatSession;
}

export async function sendChatMessage(newMessageText: string): Promise<string> {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        return "Gemini AI is not configured. Please set your API key.";
    }

    // If the chat session hasn't been initialized or the API key has changed, re-initialize.
    if (!chatSession || apiKeyUsedToCreateChatSession !== process.env.API_KEY) {
        console.log("API Key changed or chat session not initialized. Re-initializing chat session.");
        await initializeChat();
    }

    try {
        // Ensure chatSession is not null after (re)initialization
        if (!chatSession) {
            throw new Error("Chat session could not be initialized.");
        }
        const responseStream = await chatSession.sendMessageStream({
            message: newMessageText,
        });

        let fullResponse = '';
        for await (const chunk of responseStream) {
            // Correctly access .text property from chunk as it returns GenerateContentResponse
            fullResponse += chunk.text;
        }
        return fullResponse;

    } catch (error) {
        console.error("Error sending message to Gemini API:", error);
        return "Sorry, I encountered an error while processing your request. Please try again.";
    }
}
