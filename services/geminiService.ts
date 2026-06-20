export async function generateInvoiceInsight(prompt: string, complex: boolean = false): Promise<string> {
    try {
        const response = await fetch("/api/ai/invoice-insight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, complex })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.text || "I'm sorry, I couldn't generate an insight for this invoice at the moment.";
    } catch (error) {
        console.error("Client Error calling generateInvoiceInsight API:", error);
        return "The AI consultant is currently unavailable. Please check your network connection.";
    }
}
