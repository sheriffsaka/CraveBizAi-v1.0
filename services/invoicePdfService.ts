import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import crypto from 'crypto';
import { InvoiceEmailData } from './emailService.js';

const TOKEN_SECRET = process.env.INVOICE_TOKEN_SECRET || process.env.SUPABASE_JWT_SECRET || 'cravebiz_invoice_sec_token_2026_key';

/**
 * Generates a secure, tamper-proof access token for an invoice download link.
 * Format: <base64url(invoiceId:companyId)>.<hmac_sha256>
 */
export function generateInvoiceAccessToken(invoiceId: string, companyId?: string): string {
    const rawPayload = `${invoiceId}:${companyId || 'default'}`;
    const encodedPayload = Buffer.from(rawPayload).toString('base64url');
    const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(rawPayload).digest('hex').substring(0, 32);
    return `${encodedPayload}.${hmac}`;
}

/**
 * Validates the access token before permitting PDF download.
 * Ensures the invoice ID cannot be tampered with or modified in the URL.
 */
export function verifyInvoiceAccessToken(token: string): { invoiceId: string; companyId: string } | null {
    try {
        if (!token || !token.includes('.')) return null;
        const [encodedPayload, providedHmac] = token.split('.');
        if (!encodedPayload || !providedHmac) return null;

        const rawPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
        const [invoiceId, companyId] = rawPayload.split(':');
        if (!invoiceId) return null;

        const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(rawPayload).digest('hex').substring(0, 32);

        const providedBuf = Buffer.from(providedHmac);
        const expectedBuf = Buffer.from(expectedHmac);

        if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
            return { invoiceId, companyId };
        }
    } catch (err) {
        return null;
    }
    return null;
}

/**
 * Generates a clean, professional PDF document for the invoice matching the email branding.
 */
export async function generateInvoicePdfBuffer(data: InvoiceEmailData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Color Palette
    const primaryDark = rgb(0.12, 0.11, 0.29); // #1e1b4b
    const accentIndigo = rgb(0.31, 0.27, 0.90); // #4f46e5
    const textDark = rgb(0.11, 0.13, 0.17); // #111827
    const textMuted = rgb(0.42, 0.46, 0.53); // #6b7280
    const bgLight = rgb(0.97, 0.98, 0.99); // #f8fafc
    const borderGray = rgb(0.90, 0.91, 0.93); // #e5e7eb

    let currentY = height - 40;

    // Header Background Block
    page.drawRectangle({
        x: 35,
        y: currentY - 70,
        width: width - 70,
        height: 80,
        color: primaryDark
    });

    // Company Name in Header
    const companyName = (data.company.name || "CRAVEBIZ MERCHANT").toUpperCase();
    page.drawText(companyName, {
        x: 50,
        y: currentY - 28,
        size: 16,
        font: fontBold,
        color: rgb(1, 1, 1)
    });

    if (data.company.address) {
        page.drawText(data.company.address.substring(0, 65), {
            x: 50,
            y: currentY - 45,
            size: 9,
            font: fontRegular,
            color: rgb(0.78, 0.82, 0.99)
        });
    }

    // Header Right Badge: INVOICE #
    page.drawText("INVOICE", {
        x: width - 150,
        y: currentY - 24,
        size: 15,
        font: fontBold,
        color: rgb(1, 1, 1)
    });

    page.drawText(`#${data.invoiceNumber}`, {
        x: width - 150,
        y: currentY - 42,
        size: 11,
        font: fontBold,
        color: rgb(0.78, 0.82, 0.99)
    });

    currentY -= 95;

    // Billing & Metadata Section
    page.drawText("BILLED TO:", {
        x: 40,
        y: currentY,
        size: 9,
        font: fontBold,
        color: textMuted
    });

    page.drawText(data.recipientName || "Valued Client", {
        x: 40,
        y: currentY - 15,
        size: 12,
        font: fontBold,
        color: textDark
    });

    let recipientYOffset = 28;
    if (data.recipientCompany) {
        page.drawText(data.recipientCompany, {
            x: 40,
            y: currentY - recipientYOffset,
            size: 9.5,
            font: fontRegular,
            color: textMuted
        });
        recipientYOffset += 12;
    }

    if (data.recipientEmail) {
        page.drawText(data.recipientEmail, {
            x: 40,
            y: currentY - recipientYOffset,
            size: 9,
            font: fontRegular,
            color: textMuted
        });
    }

    // Right Column: Issue & Due Dates
    page.drawText("Issue Date:", {
        x: width - 180,
        y: currentY,
        size: 9,
        font: fontBold,
        color: textMuted
    });
    page.drawText(data.issueDate || "N/A", {
        x: width - 100,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: textDark
    });

    page.drawText("Due Date:", {
        x: width - 180,
        y: currentY - 15,
        size: 9,
        font: fontBold,
        color: textMuted
    });
    page.drawText(data.dueDate || "N/A", {
        x: width - 100,
        y: currentY - 15,
        size: 9,
        font: fontBold,
        color: rgb(0.85, 0.2, 0.2)
    });

    currentY -= 65;

    // Items Table Header
    page.drawRectangle({
        x: 35,
        y: currentY - 18,
        width: width - 70,
        height: 24,
        color: bgLight,
        borderColor: borderGray,
        borderWidth: 1
    });

    page.drawText("ITEM / DESCRIPTION", { x: 45, y: currentY - 12, size: 8.5, font: fontBold, color: textMuted });
    page.drawText("QTY", { x: 330, y: currentY - 12, size: 8.5, font: fontBold, color: textMuted });
    page.drawText("RATE", { x: 400, y: currentY - 12, size: 8.5, font: fontBold, color: textMuted });
    page.drawText("AMOUNT", { x: 490, y: currentY - 12, size: 8.5, font: fontBold, color: textMuted });

    currentY -= 28;

    const symbol = data.currencySymbol || "₦";

    // Table Rows
    const items = data.items && data.items.length > 0 ? data.items : [{ name: "Invoice Services", quantity: 1, price: data.totalAmount || 0 }];

    items.forEach((item, index) => {
        const itemTotal = (item.quantity || 1) * (item.price || 0);

        if (index % 2 === 1) {
            page.drawRectangle({
                x: 35,
                y: currentY - 16,
                width: width - 70,
                height: 22,
                color: rgb(0.98, 0.98, 0.99)
            });
        }

        page.drawText((item.name || "Item").substring(0, 42), {
            x: 45,
            y: currentY - 10,
            size: 9,
            font: fontBold,
            color: textDark
        });

        page.drawText(String(item.quantity || 1), {
            x: 335,
            y: currentY - 10,
            size: 9,
            font: fontRegular,
            color: textDark
        });

        page.drawText(`${symbol}${(item.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, {
            x: 400,
            y: currentY - 10,
            size: 9,
            font: fontRegular,
            color: textDark
        });

        page.drawText(`${symbol}${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, {
            x: 490,
            y: currentY - 10,
            size: 9,
            font: fontBold,
            color: textDark
        });

        page.drawLine({
            start: { x: 35, y: currentY - 16 },
            end: { x: width - 35, y: currentY - 16 },
            thickness: 0.5,
            color: borderGray
        });

        currentY -= 22;
    });

    currentY -= 15;

    // Summary Box
    const formattedTotal = `${symbol}${(data.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    page.drawRectangle({
        x: width - 260,
        y: currentY - 50,
        width: 225,
        height: 55,
        color: rgb(0.93, 0.95, 1),
        borderColor: accentIndigo,
        borderWidth: 1
    });

    page.drawText("TOTAL AMOUNT DUE:", {
        x: width - 245,
        y: currentY - 20,
        size: 9,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.6)
    });

    page.drawText(formattedTotal, {
        x: width - 245,
        y: currentY - 42,
        size: 16,
        font: fontBold,
        color: primaryDark
    });

    currentY -= 75;

    // Bank Payment Details
    if (data.company.bankAccountNumber || data.company.bankName) {
        page.drawRectangle({
            x: 35,
            y: currentY - 60,
            width: 300,
            height: 65,
            color: bgLight,
            borderColor: borderGray,
            borderWidth: 1
        });

        page.drawText("BANK PAYMENT DETAILS", {
            x: 45,
            y: currentY - 15,
            size: 8.5,
            font: fontBold,
            color: primaryDark
        });

        page.drawText(`Bank: ${data.company.bankName || 'N/A'}`, {
            x: 45,
            y: currentY - 28,
            size: 8.5,
            font: fontRegular,
            color: textDark
        });

        page.drawText(`Account Name: ${data.company.bankAccountName || data.company.name}`, {
            x: 45,
            y: currentY - 40,
            size: 8.5,
            font: fontRegular,
            color: textDark
        });

        page.drawText(`Account Number: ${data.company.bankAccountNumber || 'N/A'}`, {
            x: 45,
            y: currentY - 52,
            size: 8.5,
            font: fontBold,
            color: accentIndigo
        });
    }

    if (data.notes || data.paymentTerms) {
        currentY -= 80;
        page.drawText("NOTES / PAYMENT TERMS:", {
            x: 35,
            y: currentY,
            size: 8.5,
            font: fontBold,
            color: textMuted
        });

        const noteText = (data.notes || data.paymentTerms || "").substring(0, 140);
        page.drawText(noteText, {
            x: 35,
            y: currentY - 12,
            size: 8.5,
            font: fontRegular,
            color: textDark
        });
    }

    // Footer Line & Text
    page.drawLine({
        start: { x: 35, y: 40 },
        end: { x: width - 35, y: 40 },
        thickness: 1,
        color: borderGray
    });

    page.drawText(`Official Invoice Document • Issued by ${data.company.name || 'CraveBiZ Merchant'} • Powered by CraveBiZ AI Platform`, {
        x: 35,
        y: 25,
        size: 7.5,
        font: fontRegular,
        color: textMuted
    });

    return await pdfDoc.save();
}
