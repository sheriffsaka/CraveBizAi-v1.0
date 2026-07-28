import nodemailer from "nodemailer";
import { Resend } from "resend";

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    if (!resendClient) {
        resendClient = new Resend(apiKey);
    }
    return resendClient;
}

export interface ReceiptEmailData {
    recipientEmail: string;
    recipientName: string;
    recipientCompany?: string;
    invoiceNumber: string;
    issueDate: string;
    paymentDate?: string;
    totalAmount: number;
    amountPaid: number;
    currencySymbol?: string;
    items: Array<{
        name: string;
        description?: string;
        quantity: number;
        price: number;
    }>;
    company: {
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        logoUrl?: string;
        taxId?: string;
    };
    paymentMethod?: string;
    paymentNotes?: string;
}

/**
 * Creates a nodemailer transport instance using env variables or fallback
 */
function createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
        return nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });
    }

    // Default fallback nodemailer transport (direct send / JSON transport for dev testing)
    return nodemailer.createTransport({
        jsonTransport: true
    });
}

/**
 * Renders a well-formatted responsive HTML email for payment receipts
 */
export function buildReceiptHtmlEmail(data: ReceiptEmailData): string {
    const symbol = data.currencySymbol || '₦';
    const companyName = data.company.name || 'CraveBiZ Merchant';
    const formattedTotal = `${symbol}${data.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedPaid = `${symbol}${(data.amountPaid || data.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const payDate = data.paymentDate || data.issueDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const subtotal = data.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.max(0, data.totalAmount - subtotal);

    const itemsRowsHtml = data.items.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        const bg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 16px; font-size: 14px; color: #1f2937; font-weight: 600;">
                    ${item.name}
                    ${item.description ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px; font-weight: normal;">${item.description}</div>` : ''}
                </td>
                <td style="padding: 12px 16px; font-size: 14px; color: #4b5563; text-align: center;">${item.quantity}</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #4b5563; text-align: right;">${symbol}${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #111827; font-weight: 700; text-align: right;">${symbol}${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Receipt #${data.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 24px 12px;">
        <tr>
            <td align="center">
                <!-- Email Container -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); border: 1px solid #e5e7eb;">
                    
                    <!-- Header Banner -->
                    <tr>
                        <td style="background-color: #065f46; padding: 32px 32px 28px 32px; color: #ffffff;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        ${data.company.logoUrl ? `<img src="${data.company.logoUrl}" alt="${companyName}" style="max-height: 48px; margin-bottom: 12px; border-radius: 6px;">` : ''}
                                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; tracking-tight: -0.025em; color: #ffffff;">${companyName}</h1>
                                        ${data.company.address ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #a7f3d0; line-height: 1.4;">${data.company.address}</p>` : ''}
                                        ${data.company.phone || data.company.email ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #a7f3d0;">${[data.company.email, data.company.phone].filter(Boolean).join(' • ')}</p>` : ''}
                                    </td>
                                    <td align="right" valign="top">
                                        <div style="background-color: #047857; color: #d1fae5; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 6px 14px; border-radius: 20px; display: inline-block; border: 1px solid #059669;">
                                            Official Receipt
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Paid Badge Ribbon -->
                    <tr>
                        <td style="background-color: #10b981; padding: 12px 32px; color: #ffffff; text-align: center; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                            ✓ Payment Received &amp; Confirmed in Full
                        </td>
                    </tr>

                    <!-- Content Area -->
                    <tr>
                        <td style="padding: 32px;">
                            
                            <!-- Greeting & Message -->
                            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">
                                Dear ${data.recipientName}${data.recipientCompany ? ` (${data.recipientCompany})` : ''},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                                Thank you for your business. We have successfully received and processed your payment. Details of this transaction are outlined below for your accounting and tax records.
                            </p>

                            <!-- Highlight Amount Card -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                                <tr>
                                    <td>
                                        <div style="font-size: 11px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">
                                            Total Amount Paid
                                        </div>
                                        <div style="font-size: 32px; font-weight: 900; color: #15803d; letter-spacing: -0.03em;">
                                            ${formattedPaid}
                                        </div>
                                    </td>
                                    <td align="right" valign="bottom">
                                        <span style="background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px; border: 1px solid #86efac;">
                                            PAID IN FULL
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Meta Details Grid -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px; border-collapse: collapse;">
                                <tr>
                                    <td width="50%" valign="top" style="padding: 12px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                                        <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Receipt Number</div>
                                        <div style="font-size: 14px; font-weight: 700; color: #111827;">#${data.invoiceNumber}</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="46%" valign="top" style="padding: 12px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                                        <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Payment Date</div>
                                        <div style="font-size: 14px; font-weight: 700; color: #111827;">${payDate}</div>
                                    </td>
                                </tr>
                                <tr><td height="10" colspan="3"></td></tr>
                                <tr>
                                    <td width="50%" valign="top" style="padding: 12px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                                        <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Payment Method</div>
                                        <div style="font-size: 14px; font-weight: 700; color: #111827;">${data.paymentMethod || 'Bank Transfer / Online'}</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="46%" valign="top" style="padding: 12px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                                        <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Received From</div>
                                        <div style="font-size: 14px; font-weight: 700; color: #111827;">${data.recipientName}</div>
                                        <div style="font-size: 12px; color: #6b7280;">${data.recipientEmail}</div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Itemized Breakdown Header -->
                            <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: 0.05em;">
                                Itemized Payment Summary
                            </h3>

                            <!-- Items Table -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                                <thead>
                                    <tr style="background-color: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
                                        <th align="left" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Description</th>
                                        <th align="center" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Qty</th>
                                        <th align="right" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Price</th>
                                        <th align="right" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsRowsHtml}
                                </tbody>
                            </table>

                            <!-- Totals Calculation -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                <tr>
                                    <td width="50%"></td>
                                    <td width="50%">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Subtotal:</td>
                                                <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #1f2937;">${symbol}${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            ${tax > 0 ? `
                                            <tr>
                                                <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Tax / Fees:</td>
                                                <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #1f2937;">${symbol}${tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            ` : ''}
                                            <tr style="border-top: 2px solid #e5e7eb;">
                                                <td style="padding: 8px 0 0 0; font-size: 15px; font-weight: 800; color: #111827;">Total Paid:</td>
                                                <td align="right" style="padding: 8px 0 0 0; font-size: 16px; font-weight: 900; color: #059669;">${formattedPaid}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 4px 0 0 0; font-size: 12px; color: #6b7280;">Balance Due:</td>
                                                <td align="right" style="padding: 4px 0 0 0; font-size: 12px; font-weight: 700; color: #10b981;">${symbol}0.00</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            ${data.paymentNotes ? `
                            <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                                <div style="font-size: 11px; font-weight: 800; color: #1e40af; text-transform: uppercase; margin-bottom: 2px;">Payment Notes</div>
                                <div style="font-size: 13px; color: #334155;">${data.paymentNotes}</div>
                            </div>
                            ` : ''}

                        </td>
                    </tr>

                    <!-- Footer Section -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #374151;">
                                Thank you for your business!
                            </p>
                            <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                                This email serves as an official electronic payment receipt from <strong>${companyName}</strong>. Please retain this copy for your financial records.
                            </p>
                            ${data.company.taxId ? `<p style="margin: 0 0 8px 0; font-size: 11px; color: #9ca3af;">Tax ID / Registration: ${data.company.taxId}</p>` : ''}
                            <p style="margin: 12px 0 0 0; font-size: 11px; color: #9ca3af;">
                                Powered by CraveBiZ AI Billing System • ${new Date().getFullYear()}
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Sends the formatted receipt email directly to the recipient's inbox
 */
export async function sendReceiptEmailDirect(data: ReceiptEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    try {
        const html = buildReceiptHtmlEmail(data);
        const subject = `Payment Receipt #${data.invoiceNumber} from ${data.company.name}`;
        const textContent = `Payment Receipt #${data.invoiceNumber}\n\nDear ${data.recipientName},\n\nThank you for your payment of ${data.currencySymbol || '₦'}${data.totalAmount.toLocaleString()} to ${data.company.name}.\nDate: ${data.paymentDate || data.issueDate}\nStatus: PAID IN FULL\n\nBest regards,\n${data.company.name}`;
        
        const resend = getResendClient();
        if (resend) {
            const fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM || `${data.company.name || 'CraveBiZ'} <onboarding@resend.dev>`;
            try {
                const resendRes = await resend.emails.send({
                    from: fromAddress,
                    to: [data.recipientEmail],
                    subject: subject,
                    html: html,
                    text: textContent
                });

                if (resendRes.error) {
                    console.error(`[Resend Dispatch Error] Receipt #${data.invoiceNumber}:`, resendRes.error);
                } else {
                    console.log(`[Resend Email Dispatch] Receipt #${data.invoiceNumber} sent to ${data.recipientEmail}. Id:`, resendRes.data?.id);
                    return {
                        success: true,
                        message: `Receipt #${data.invoiceNumber} successfully dispatched via Resend to ${data.recipientEmail}!`,
                        messageId: resendRes.data?.id
                    };
                }
            } catch (resendErr: any) {
                console.error(`[Resend Email Dispatch Exception] Receipt #${data.invoiceNumber}:`, resendErr);
            }
        }

        // Fallback to Nodemailer/SMTP
        const transporter = createTransporter();
        const fromAddress = process.env.SMTP_FROM || `${data.company.name || 'CraveBiZ'} <no-reply@cravebiz.ai>`;
        
        const mailOptions = {
            from: fromAddress,
            to: `${data.recipientName} <${data.recipientEmail}>`,
            subject: subject,
            html: html,
            text: textContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Direct Dispatch] Receipt #${data.invoiceNumber} sent to ${data.recipientEmail}. MessageId:`, info.messageId || 'sent');

        return {
            success: true,
            message: `Receipt #${data.invoiceNumber} successfully dispatched directly to ${data.recipientEmail}!`,
            messageId: info.messageId
        };
    } catch (err: any) {
        console.error(`[Email Direct Dispatch Error] Failed to dispatch receipt #${data.invoiceNumber}:`, err);
        return {
            success: false,
            message: err.message || "Failed to dispatch email directly."
        };
    }
}

export interface InvoiceEmailData {
    recipientEmail: string;
    recipientName: string;
    recipientCompany?: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    totalAmount: number;
    amountPaid: number;
    currencySymbol?: string;
    items: Array<{
        name: string;
        description?: string;
        quantity: number;
        price: number;
    }>;
    company: {
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        logoUrl?: string;
        bankAccounts?: Array<{ bankName: string; accountNumber: string; accountName: string }>;
    };
    notes?: string;
}

/**
 * Renders a well-formatted responsive HTML email for invoices
 */
export function buildInvoiceHtmlEmail(data: InvoiceEmailData): string {
    const symbol = data.currencySymbol || '₦';
    const companyName = data.company.name || 'CraveBiZ Merchant';
    const balanceDue = Math.max(0, data.totalAmount - (data.amountPaid || 0));
    const formattedTotal = `${symbol}${data.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedBalance = `${symbol}${balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const subtotal = data.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const itemsRowsHtml = data.items.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        const bg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 16px; font-size: 14px; color: #1f2937; font-weight: 600;">
                    ${item.name}
                    ${item.description ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px; font-weight: normal;">${item.description}</div>` : ''}
                </td>
                <td style="padding: 12px 16px; font-size: 14px; color: #4b5563; text-align: center;">${item.quantity}</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #4b5563; text-align: right;">${symbol}${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 12px 16px; font-size: 14px; color: #111827; font-weight: 700; text-align: right;">${symbol}${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
        `;
    }).join('');

    const bankHtml = data.company.bankAccounts && data.company.bankAccounts.length > 0 ? `
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <div style="font-size: 11px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                💳 Payment Instructions &amp; Bank Details
            </div>
            ${data.company.bankAccounts.map(bank => `
                <div style="font-size: 13px; color: #1e293b; margin-bottom: 6px;">
                    <strong>Bank:</strong> ${bank.bankName} &nbsp;|&nbsp; 
                    <strong>Account No:</strong> <span style="font-family: monospace; font-weight: 700; font-size: 14px; color: #0284c7;">${bank.accountNumber}</span> &nbsp;|&nbsp; 
                    <strong>Name:</strong> ${bank.accountName}
                </div>
            `).join('')}
        </div>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice #${data.invoiceNumber} from ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #1e3a8a; padding: 32px; color: #ffffff;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        ${data.company.logoUrl ? `<img src="${data.company.logoUrl}" alt="${companyName}" style="max-height: 48px; margin-bottom: 12px; border-radius: 6px;">` : ''}
                                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff;">${companyName}</h1>
                                        ${data.company.address ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #93c5fd;">${data.company.address}</p>` : ''}
                                        ${data.company.email ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #93c5fd;">${data.company.email}</p>` : ''}
                                    </td>
                                    <td align="right" valign="top">
                                        <div style="background-color: #1e40af; color: #dbeafe; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 6px 14px; border-radius: 20px; display: inline-block; border: 1px solid #3b82f6;">
                                            Official Invoice
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">
                                Dear ${data.recipientName}${data.recipientCompany ? ` (${data.recipientCompany})` : ''},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                                Please find details of your new invoice <strong>#${data.invoiceNumber}</strong> below. Kindly review the itemized breakdown and remit payment by the due date.
                            </p>

                            <!-- Highlight Amount Card -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                                <tr>
                                    <td>
                                        <div style="font-size: 11px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">
                                            Balance Due
                                        </div>
                                        <div style="font-size: 32px; font-weight: 900; color: #1d4ed8; letter-spacing: -0.03em;">
                                            ${formattedBalance}
                                        </div>
                                    </td>
                                    <td align="right" valign="bottom">
                                        <span style="background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px; border: 1px solid #93c5fd;">
                                            DUE ${data.dueDate}
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Meta Grid -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                <tr>
                                    <td width="48%" valign="top" style="padding: 12px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                                        <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Invoice Number</div>
                                        <div style="font-size: 14px; font-weight: 700; color: #111827;">#${data.invoiceNumber}</div>
                                    </td>
                                    <td width="4%"></td>
                                    <td width="48%" valign="top" style="padding: 12px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                                        <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px;">Issue Date</div>
                                        <div style="font-size: 14px; font-weight: 700; color: #111827;">${data.issueDate}</div>
                                    </td>
                                </tr>
                            </table>

                            ${bankHtml}

                            <!-- Itemized Table -->
                            <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: #374151; text-transform: uppercase;">
                                Itemized Breakdown
                            </h3>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                                <thead>
                                    <tr style="background-color: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
                                        <th align="left" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Description</th>
                                        <th align="center" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Qty</th>
                                        <th align="right" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Price</th>
                                        <th align="right" style="padding: 10px 16px; font-size: 11px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsRowsHtml}
                                </tbody>
                            </table>

                            <!-- Totals -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                <tr>
                                    <td width="50%"></td>
                                    <td width="50%">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Total Amount:</td>
                                                <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #1f2937;">${formattedTotal}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Amount Paid:</td>
                                                <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #1f2937;">${symbol}${(data.amountPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            <tr style="border-top: 2px solid #e5e7eb;">
                                                <td style="padding: 8px 0 0 0; font-size: 15px; font-weight: 800; color: #111827;">Balance Due:</td>
                                                <td align="right" style="padding: 8px 0 0 0; font-size: 16px; font-weight: 900; color: #1d4ed8;">${formattedBalance}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            ${data.notes ? `
                            <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                                <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 2px;">Terms &amp; Notes</div>
                                <div style="font-size: 13px; color: #334155;">${data.notes}</div>
                            </div>
                            ` : ''}

                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #374151;">
                                Thank you for your business!
                            </p>
                            <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280;">
                                Sent by <strong>${companyName}</strong> via CraveBiZ AI Workspace.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Sends the formatted invoice email directly to the recipient's inbox
 */
export async function sendInvoiceEmailDirect(data: InvoiceEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    try {
        const html = buildInvoiceHtmlEmail(data);
        const subject = `Invoice #${data.invoiceNumber} from ${data.company.name}`;
        const textContent = `Invoice #${data.invoiceNumber}\n\nDear ${data.recipientName},\n\nPlease find attached invoice #${data.invoiceNumber} for ${data.currencySymbol || '₦'}${data.totalAmount.toLocaleString()}.\nDue Date: ${data.dueDate}\n\nBest regards,\n${data.company.name}`;
        
        const resend = getResendClient();
        if (resend) {
            const fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM || `${data.company.name || 'CraveBiZ'} <onboarding@resend.dev>`;
            try {
                const resendRes = await resend.emails.send({
                    from: fromAddress,
                    to: [data.recipientEmail],
                    subject: subject,
                    html: html,
                    text: textContent
                });

                if (resendRes.error) {
                    console.error(`[Resend Dispatch Error] Invoice #${data.invoiceNumber}:`, resendRes.error);
                } else {
                    console.log(`[Resend Email Dispatch] Invoice #${data.invoiceNumber} sent to ${data.recipientEmail}. Id:`, resendRes.data?.id);
                    return {
                        success: true,
                        message: `Invoice #${data.invoiceNumber} successfully dispatched via Resend to ${data.recipientEmail}!`,
                        messageId: resendRes.data?.id
                    };
                }
            } catch (resendErr: any) {
                console.error(`[Resend Email Dispatch Exception] Invoice #${data.invoiceNumber}:`, resendErr);
            }
        }

        // Fallback to Nodemailer/SMTP
        const transporter = createTransporter();
        const fromAddress = process.env.SMTP_FROM || `${data.company.name || 'CraveBiZ'} <no-reply@cravebiz.ai>`;
        
        const mailOptions = {
            from: fromAddress,
            to: `${data.recipientName} <${data.recipientEmail}>`,
            subject: subject,
            html: html,
            text: textContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Direct Dispatch] Invoice #${data.invoiceNumber} sent to ${data.recipientEmail}. MessageId:`, info.messageId || 'sent');

        return {
            success: true,
            message: `Invoice #${data.invoiceNumber} successfully dispatched directly to ${data.recipientEmail}!`,
            messageId: info.messageId
        };
    } catch (err: any) {
        console.error(`[Email Direct Dispatch Error] Failed to dispatch invoice #${data.invoiceNumber}:`, err);
        return {
            success: false,
            message: err.message || "Failed to dispatch invoice email directly."
        };
    }
}

export interface SignifyEmailData {
    recipientEmail: string;
    recipientName: string;
    documentTitle: string;
    secureLink: string;
    message?: string;
    senderName?: string;
    expirationDate?: string;
    type?: 'invitation' | 'completion' | 'owner_sign_request' | 'notification';
}

/**
 * Sends DocSignify e-signature invitation & notification emails via Resend API with Nodemailer fallback
 */
export async function sendSignifyEmailDirect(data: SignifyEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    try {
        const senderName = data.senderName || 'CraveBiZ Workspace';
        const docTitle = data.documentTitle || 'Document';
        
        let subject = `Action Required: E-Signature Invitation for '${docTitle}'`;
        let actionHeading = "You've been invited to review and sign a document";
        let actionButtonText = "Review & Sign Document";
        
        if (data.type === 'completion') {
            subject = `Completed: '${docTitle}' has been fully signed`;
            actionHeading = "Great news! All parties have signed the document.";
            actionButtonText = "View & Download Signed PDF";
        } else if (data.type === 'owner_sign_request') {
            subject = `Action Required: All signers completed '${docTitle}' - Please sign to finish`;
            actionHeading = "All invited signers have completed signing. Your signature is now required as Workspace Owner.";
            actionButtonText = "Sign & Complete Document";
        }

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #4f46e5; padding: 32px 32px; text-align: left;">
                            <div style="color: #ffffff; font-size: 22px; font-weight: 800; tracking-tight: -0.02em;">
                                CraveBiZ <span style="font-weight: 400; opacity: 0.9;">DocSignify</span>
                            </div>
                            <div style="color: #c7d2fe; font-size: 13px; font-weight: 600; margin-top: 4px;">
                                Secure Electronic Signature Portal
                            </div>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px 32px;">
                            <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
                                ${actionHeading}
                            </h2>

                            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                                Dear <strong>${data.recipientName}</strong>,
                            </p>

                            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                                <strong>${senderName}</strong> has prepared <strong>'${docTitle}'</strong> for e-signature. Please click the button below to view the original PDF and place your signature securely.
                            </p>

                            ${data.message ? `
                            <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                                <div style="font-size: 11px; font-weight: 800; color: #4f46e5; text-transform: uppercase; margin-bottom: 4px;">Message from ${senderName}:</div>
                                <div style="font-size: 13px; color: #334155; font-style: italic;">"${data.message}"</div>
                            </div>
                            ` : ''}

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${data.secureLink}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                                    ${actionButtonText} &rarr;
                                </a>
                            </div>

                            ${data.expirationDate ? `
                            <p style="margin: 0 0 20px 0; font-size: 12px; color: #64748b; text-align: center;">
                                ⏱️ This secure link will expire on <strong>${data.expirationDate}</strong>.
                            </p>
                            ` : ''}

                            <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 12px 16px; border-radius: 8px; margin-top: 24px;">
                                <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px;">Direct Link Backup:</div>
                                <div style="font-size: 11px; word-break: break-all; color: #4f46e5;">
                                    ${data.secureLink}
                                </div>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #475569;">
                                Powered by CraveBiZ DocSignify SSL Encryption
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                                Secured by SHA-256 cryptographic hashes & audit trail logs.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        const textContent = `${subject}\n\nDear ${data.recipientName},\n\nYou have been invited by ${senderName} to sign '${docTitle}'.\n\nPlease click the secure link below to review and sign:\n${data.secureLink}\n\nBest regards,\nCraveBiZ Team`;

        const resend = getResendClient();
        if (resend) {
            const fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM || `CraveBiZ DocSignify <onboarding@resend.dev>`;
            try {
                const resendRes = await resend.emails.send({
                    from: fromAddress,
                    to: [data.recipientEmail],
                    subject: subject,
                    html: html,
                    text: textContent
                });

                if (resendRes.error) {
                    console.error(`[Resend Signify Error] ${data.recipientEmail}:`, resendRes.error);
                } else {
                    console.log(`[Resend Signify Success] Sent to ${data.recipientEmail}, Id:`, resendRes.data?.id);
                    return {
                        success: true,
                        message: `DocSignify invitation dispatched via Resend to ${data.recipientEmail}`,
                        messageId: resendRes.data?.id
                    };
                }
            } catch (resendErr: any) {
                console.error(`[Resend Signify Exception] ${data.recipientEmail}:`, resendErr);
            }
        }

        // Fallback to Nodemailer/SMTP
        const transporter = createTransporter();
        const fromAddress = process.env.SMTP_FROM || `CraveBiZ DocSignify <no-reply@cravebiz.ai>`;
        
        const mailOptions = {
            from: fromAddress,
            to: `${data.recipientName} <${data.recipientEmail}>`,
            subject: subject,
            html: html,
            text: textContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Signify Email Direct Dispatch] Sent to ${data.recipientEmail}. MessageId:`, info.messageId || 'sent');

        return {
            success: true,
            message: `DocSignify invitation dispatched directly to ${data.recipientEmail}!`,
            messageId: info.messageId
        };
    } catch (err: any) {
        console.error(`[Signify Email Dispatch Error] Failed to send to ${data.recipientEmail}:`, err);
        return {
            success: false,
            message: err.message || "Failed to send e-sign email invitation."
        };
    }
}

