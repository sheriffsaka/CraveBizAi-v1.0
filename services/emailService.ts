import nodemailer from "nodemailer";
import { createInAppNotificationRecordAsync } from "./inAppNotificationModule.js";

/**
 * Creates a nodemailer transport instance using environment variables for credentials
 */
function createTransporter() {
    const host = process.env.SMTP_HOST || "u68gmz62qy7g.fips.mail-manager-smtp.us-east-2.on.aws";
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || "inp-swyctvudaud66iimc7vl4dt3";
    const pass = process.env.SMTP_PASS || "?97&l6xrbQ5xX)A$%2gx^RjuelxC8HEq";

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
}

export interface SendEmailOptions {
    from?: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
}

/**
 * Centralized Email Dispatcher:
 * Routes every email through the configured SMTP server.
 * Gracefully logs errors without interrupting user workflow.
 */
export async function sendEmailViaSMTP(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; message: string }> {
    const defaultFrom = process.env.SMTP_FROM || "noreply@cloudcraves.com";
    const defaultReplyTo = process.env.SMTP_REPLY_TO || "support@cloudcraves.com";

    const fromAddress = options.from || defaultFrom;
    const replyToAddress = options.replyTo || defaultReplyTo;
    const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

    // Ensure notification record exists in notifications table before dispatching email
    for (const recipient of toAddresses) {
        try {
            await createInAppNotificationRecordAsync({
                recipientEmail: recipient,
                title: options.subject || 'Email Notification',
                message: options.text || options.subject || 'An email notification was sent to your inbox.',
                category: 'email',
                type: 'info'
            });
        } catch (notifErr) {
            console.warn("[emailService] Notification creation notice in sendEmailViaSMTP:", notifErr);
        }
    }

    try {
        const transporter = createTransporter();
        const mailOptions = {
            from: fromAddress,
            to: toAddresses.join(', '),
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: replyToAddress
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[SMTP Dispatch Success] Email dispatched to ${toAddresses.join(', ')} | MessageId: ${info.messageId || 'sent'}`);
        return {
            success: true,
            messageId: info.messageId,
            message: `Email dispatched successfully via SMTP to ${toAddresses.join(', ')}`
        };
    } catch (err: any) {
        console.error(`[SMTP Dispatch Error] Failed to dispatch email to ${toAddresses.join(', ')}:`, {
            name: err.name || 'SMTPError',
            message: err.message || String(err)
        });
        return {
            success: false,
            message: err.message || "Failed to dispatch email via SMTP transport."
        };
    }
}

// Export aliases for centralized email dispatcher
export const sendEmailViaSES = sendEmailViaSMTP;
export const sendEmail = sendEmailViaSMTP;

// ==========================================
// 1. RECEIPT EMAILS
// ==========================================

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

export function buildReceiptHtmlEmail(data: ReceiptEmailData): string {
    const symbol = data.currencySymbol || '₦';
    const companyName = data.company.name || 'CraveBiZ Merchant';
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); border: 1px solid #e5e7eb;">
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
                    <tr>
                        <td style="background-color: #10b981; padding: 12px 32px; color: #ffffff; text-align: center; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                            ✓ Payment Received &amp; Confirmed in Full
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">
                                Dear ${data.recipientName}${data.recipientCompany ? ` (${data.recipientCompany})` : ''},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                                Thank you for your business. We have successfully received and processed your payment. Details of this transaction are outlined below for your accounting and tax records.
                            </p>

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

                            <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: 0.05em;">
                                Itemized Payment Summary
                            </h3>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <thead>
                                    <tr style="background-color: #f3f4f6; text-align: left;">
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Description</th>
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase; text-align: center;">Qty</th>
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase; text-align: right;">Unit Price</th>
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase; text-align: right;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsRowsHtml}
                                </tbody>
                            </table>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td width="50%"></td>
                                    <td width="50%">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="padding: 6px 0; font-size: 13px; color: #6b7280;">Subtotal:</td>
                                                <td style="padding: 6px 0; font-size: 13px; color: #111827; font-weight: 600; text-align: right;">${symbol}${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            ${tax > 0 ? `
                                            <tr>
                                                <td style="padding: 6px 0; font-size: 13px; color: #6b7280;">Tax / Fees:</td>
                                                <td style="padding: 6px 0; font-size: 13px; color: #111827; font-weight: 600; text-align: right;">${symbol}${tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                            ` : ''}
                                            <tr style="border-top: 2px solid #e5e7eb;">
                                                <td style="padding: 10px 0 0 0; font-size: 15px; font-weight: 800; color: #111827;">Total Paid:</td>
                                                <td style="padding: 10px 0 0 0; font-size: 16px; font-weight: 900; color: #16a34a; text-align: right;">${formattedPaid}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            ${data.paymentNotes ? `
                            <div style="margin-top: 24px; padding: 14px; background-color: #f9fafb; border-left: 4px solid #10b981; border-radius: 4px;">
                                <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; margin-bottom: 4px;">Notes:</div>
                                <div style="font-size: 13px; color: #4b5563;">${data.paymentNotes}</div>
                            </div>
                            ` : ''}
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                                Powered by <strong style="color: #111827;">CraveBiZ AI</strong> — Invoicing &amp; Financial Automation Platform
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

export async function sendReceiptEmailDirect(data: ReceiptEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const html = buildReceiptHtmlEmail(data);
    const subject = `Payment Receipt #${data.invoiceNumber} from ${data.company.name || 'CraveBiZ'}`;
    const fromAddress = `${data.company.name || 'CraveBiZ'} <${process.env.SMTP_FROM || 'noreply@cloudcraves.com'}>`;
    const textContent = `Payment Receipt #${data.invoiceNumber}\nTotal Amount Paid: ${data.currencySymbol || '₦'}${data.amountPaid || data.totalAmount}\n\nDear ${data.recipientName},\nThank you for your payment. Details available in HTML version.`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Payment Receipt #${data.invoiceNumber}`,
            message: `Payment of ${data.currencySymbol || '₦'}${data.amountPaid || data.totalAmount} for Invoice #${data.invoiceNumber} has been received and confirmed.`,
            category: 'receipt',
            type: 'success'
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
    }

    return await sendEmailViaSES({
        from: fromAddress,
        to: data.recipientEmail,
        subject,
        html,
        text: textContent,
        replyTo: data.company.email
    });
}

// ==========================================
// 2. INVOICE EMAILS
// ==========================================

export interface InvoiceEmailData {
    recipientEmail: string;
    recipientName: string;
    recipientCompany?: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    totalAmount: number;
    amountPaid?: number;
    currencySymbol?: string;
    status?: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';
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
        bankName?: string;
        bankAccountName?: string;
        bankAccountNumber?: string;
    };
    paymentTerms?: string;
    notes?: string;
    viewLink?: string;
}

export function buildInvoiceHtmlEmail(data: InvoiceEmailData): string {
    const symbol = data.currencySymbol || '₦';
    const companyName = data.company.name || 'CraveBiZ Merchant';
    const formattedTotal = `${symbol}${data.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    <title>Invoice #${data.invoiceNumber} from ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
                    <tr>
                        <td style="background-color: #1e1b4b; padding: 32px; color: #ffffff;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        ${data.company.logoUrl ? `<img src="${data.company.logoUrl}" alt="${companyName}" style="max-height: 48px; margin-bottom: 12px; border-radius: 6px;">` : ''}
                                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff;">${companyName}</h1>
                                        ${data.company.address ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #c7d2fe;">${data.company.address}</p>` : ''}
                                    </td>
                                    <td align="right" valign="top">
                                        <div style="background-color: #312e81; color: #e0e7ff; font-size: 12px; font-weight: 800; text-transform: uppercase; padding: 6px 14px; border-radius: 20px; display: inline-block;">
                                            Official Invoice
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">
                                Dear ${data.recipientName}${data.recipientCompany ? ` (${data.recipientCompany})` : ''},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                                Please find details for invoice <strong>#${data.invoiceNumber}</strong> issued by <strong>${companyName}</strong>.
                            </p>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                                <tr>
                                    <td>
                                        <div style="font-size: 11px; font-weight: 800; color: #3730a3; text-transform: uppercase; margin-bottom: 4px;">Total Amount Due</div>
                                        <div style="font-size: 32px; font-weight: 900; color: #312e81;">${formattedTotal}</div>
                                    </td>
                                    <td align="right" valign="bottom">
                                        <div style="font-size: 12px; color: #4338ca; font-weight: 700;">Due Date: ${data.dueDate}</div>
                                    </td>
                                </tr>
                            </table>

                            <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: #374151; text-transform: uppercase;">Invoice Items</h3>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <thead>
                                    <tr style="background-color: #f3f4f6; text-align: left;">
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase;">Item</th>
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase; text-align: center;">Qty</th>
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase; text-align: right;">Rate</th>
                                        <th style="padding: 12px 16px; font-size: 12px; font-weight: 800; color: #4b5563; text-transform: uppercase; text-align: right;">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsRowsHtml}
                                </tbody>
                            </table>

                            ${data.company.bankAccountNumber ? `
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                                <div style="font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 8px;">Bank Payment Details</div>
                                <div style="font-size: 13px; color: #334155;">Bank: <strong>${data.company.bankName || 'N/A'}</strong></div>
                                <div style="font-size: 13px; color: #334155;">Account Name: <strong>${data.company.bankAccountName || companyName}</strong></div>
                                <div style="font-size: 13px; color: #334155;">Account Number: <strong>${data.company.bankAccountNumber}</strong></div>
                            </div>
                            ` : ''}
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #6b7280;">
                                Powered by <strong style="color: #111827;">CraveBiZ AI Platform</strong>
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

export async function sendInvoiceEmailDirect(data: InvoiceEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const html = buildInvoiceHtmlEmail(data);
    const subject = `Invoice #${data.invoiceNumber} from ${data.company.name || 'CraveBiZ'}`;
    const fromAddress = `${data.company.name || 'CraveBiZ'} <${process.env.SMTP_FROM || 'noreply@cloudcraves.com'}>`;
    const textContent = `Invoice #${data.invoiceNumber}\nTotal Amount Due: ${data.currencySymbol || '₦'}${data.totalAmount}\nDue Date: ${data.dueDate}\n\nDear ${data.recipientName},\nPlease view full invoice details in your HTML email view.`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Invoice #${data.invoiceNumber} Issued`,
            message: `New invoice #${data.invoiceNumber} for ${data.currencySymbol || '₦'}${data.totalAmount} from ${data.company.name || 'CraveBiZ'} is ready for review.`,
            category: 'invoice',
            type: 'info'
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
    }

    return await sendEmailViaSES({
        from: fromAddress,
        to: data.recipientEmail,
        subject,
        html,
        text: textContent,
        replyTo: data.company.email
    });
}

// ==========================================
// 3. DOCSIGNIFY INVITATION & SIGNATURE EMAILS
// ==========================================

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

export async function sendSignifyEmailDirect(data: SignifyEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
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
    } else if (data.type === 'notification') {
        subject = `Notification: Update on document '${docTitle}'`;
        actionHeading = "There is an update regarding your document on DocSignify.";
        actionButtonText = "View Document";
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
                    <tr>
                        <td style="background-color: #4f46e5; padding: 32px 32px; text-align: left;">
                            <div style="color: #ffffff; font-size: 22px; font-weight: 800;">
                                CraveBiZ <span style="font-weight: 400; opacity: 0.9;">DocSignify</span>
                            </div>
                            <div style="color: #c7d2fe; font-size: 13px; font-weight: 600; margin-top: 4px;">
                                Secure Electronic Signature Portal
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 32px;">
                            <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
                                ${actionHeading}
                            </h2>
                            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                                Dear <strong>${data.recipientName}</strong>,
                            </p>
                            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                                <strong>${senderName}</strong> has prepared <strong>'${docTitle}'</strong> for e-signature. Please click the button below to view the document and place your signature securely.
                            </p>
                            ${data.message ? `
                            <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                                <div style="font-size: 11px; font-weight: 800; color: #4f46e5; text-transform: uppercase; margin-bottom: 4px;">Message from ${senderName}:</div>
                                <div style="font-size: 13px; color: #334155; font-style: italic;">"${data.message}"</div>
                            </div>
                            ` : ''}
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
                    <tr>
                        <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #475569;">
                                Powered by CraveBiZ DocSignify SSL Encryption
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                                Secured by SHA-256 cryptographic hashes &amp; audit trail logs.
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

    const textContent = `${subject}\n\nDear ${data.recipientName},\n\nYou have been invited by ${senderName} to review/sign '${docTitle}'.\n\nPlease click the secure link below:\n${data.secureLink}\n\nBest regards,\nCraveBiZ Team`;
    const fromAddress = `CraveBiZ DocSignify <${process.env.SMTP_FROM || 'noreply@cloudcraves.com'}>`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Document Request: ${docTitle}`,
            message: `You have been requested by ${senderName} to sign/review '${docTitle}'.`,
            category: 'document',
            type: 'info',
            actionUrl: data.secureLink
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
    }

    return await sendEmailViaSES({
        from: fromAddress,
        to: data.recipientEmail,
        subject,
        html,
        text: textContent
    });
}

// ==========================================
// 4. DOCUMENT NOTIFICATION EMAILS
// ==========================================

export interface DocumentNotificationEmailData {
    recipientEmail: string;
    recipientName: string;
    documentTitle: string;
    notificationMessage: string;
    actionUrl?: string;
    senderName?: string;
}

export async function sendDocumentNotificationEmailDirect(data: DocumentNotificationEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const senderName = data.senderName || 'CraveBiZ Platform';
    const subject = `Document Notification: '${data.documentTitle}'`;

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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <tr>
                        <td style="background-color: #0284c7; padding: 28px 32px; color: #ffffff;">
                            <div style="font-size: 20px; font-weight: 800;">CraveBiZ Document Notification</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">Dear <strong>${data.recipientName}</strong>,</p>
                            <p style="margin: 0 0 20px 0; font-size: 14px; color: #334155; line-height: 1.6;">
                                ${data.notificationMessage}
                            </p>
                            ${data.actionUrl ? `
                            <div style="text-align: center; margin: 28px 0;">
                                <a href="${data.actionUrl}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
                                    View Document Details &rarr;
                                </a>
                            </div>
                            ` : ''}
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                            CraveBiZ AI Document Notifications
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Document Notice: ${data.documentTitle}`,
            message: data.notificationMessage,
            category: 'document',
            type: 'info',
            actionUrl: data.actionUrl
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
    }

    return await sendEmailViaSES({
        to: data.recipientEmail,
        subject,
        html,
        text: `${data.notificationMessage}\n\nView details: ${data.actionUrl || ''}`
    });
}

// ==========================================
// 5. ACCOUNT VERIFICATION EMAILS
// ==========================================

export interface AccountVerificationEmailData {
    recipientEmail: string;
    recipientName?: string;
    verificationCode: string;
    verificationUrl?: string;
}

export async function sendAccountVerificationEmailDirect(data: AccountVerificationEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const subject = `Verify Your CraveBiZ Account - Code: ${data.verificationCode}`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Account Verification Code`,
            message: `Your account verification code is ${data.verificationCode}.`,
            category: 'email_verification',
            type: 'warning'
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                    <tr>
                        <td style="background-color: #2563eb; padding: 32px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Welcome to CraveBiZ AI</h1>
                            <p style="margin: 6px 0 0 0; font-size: 13px; color: #bfdbfe;">Verify your email address to get started</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 36px 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">Hello <strong>${data.recipientName || data.recipientEmail}</strong>,</p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                                Thank you for creating an account with CraveBiZ AI. Please use the verification code below to complete your account registration:
                            </p>

                            <div style="background-color: #eff6ff; border: 2px dashed #93c5fd; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 28px;">
                                <div style="font-size: 11px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Your 6-Digit Code</div>
                                <div style="font-size: 36px; font-weight: 900; color: #1e40af; letter-spacing: 0.25em;">${data.verificationCode}</div>
                            </div>

                            ${data.verificationUrl ? `
                            <div style="text-align: center; margin-bottom: 24px;">
                                <a href="${data.verificationUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px;">
                                    Verify Account Instantly &rarr;
                                </a>
                            </div>
                            ` : ''}

                            <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                                If you did not request this email, please ignore it or contact CraveBiZ support.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                            Secured by CraveBiZ Email Service
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    return await sendEmailViaSES({
        to: data.recipientEmail,
        subject,
        html,
        text: `Your CraveBiZ Verification Code is: ${data.verificationCode}`
    });
}

// ==========================================
// 6. PASSWORD RESET EMAILS
// ==========================================

export interface PasswordResetEmailData {
    recipientEmail: string;
    resetToken: string;
    resetUrl: string;
}

export async function sendPasswordResetEmailDirect(data: PasswordResetEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const subject = `Reset Your CraveBiZ Password`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Password Reset Request`,
            message: `A password reset token was requested for your account. Use the reset link to choose a new password.`,
            category: 'password_reset',
            type: 'warning',
            actionUrl: data.resetUrl
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                    <tr>
                        <td style="background-color: #4338ca; padding: 32px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Password Reset Request</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 36px 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">Hello,</p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                                We received a request to reset the password for your CraveBiZ AI account (<strong>${data.recipientEmail}</strong>).
                            </p>

                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${data.resetUrl}" target="_blank" style="display: inline-block; background-color: #4338ca; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(67, 56, 202, 0.3);">
                                    Reset Password Now &rarr;
                                </a>
                            </div>

                            <p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b;">
                                If you cannot click the button above, copy and paste this secure URL into your browser:
                            </p>
                            <div style="background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 11px; color: #4338ca; word-break: break-all; margin-bottom: 24px;">
                                ${data.resetUrl}
                            </div>

                            <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                                If you did not request a password reset, you can safely ignore this message. Your password will remain unchanged.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                            CraveBiZ Security &amp; Email Authentication
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    return await sendEmailViaSES({
        to: data.recipientEmail,
        subject,
        html,
        text: `Reset your CraveBiZ password by visiting:\n${data.resetUrl}`
    });
}

// ==========================================
// 7. TEAM & WORKSPACE INVITATION EMAILS
// ==========================================

export interface TeamInvitationEmailData {
    inviteName?: string;
    inviteEmail: string;
    inviteRole?: string;
    inviterName: string;
    inviterEmail: string;
    companyName: string;
    inviteUrl: string;
}

export async function sendTeamInvitationEmailDirect(data: TeamInvitationEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const subject = `Invitation to join ${data.companyName.toUpperCase()} Workspace on CraveBiZ`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.inviteEmail,
            title: `Team Invitation: ${data.companyName}`,
            message: `You have been invited by ${data.inviterName} to join workspace '${data.companyName}' as ${data.inviteRole || 'Member'}.`,
            category: 'invitation',
            type: 'info',
            actionUrl: data.inviteUrl
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                    <tr>
                        <td style="background-color: #059669; padding: 32px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Workspace Invitation</h1>
                            <p style="margin: 6px 0 0 0; font-size: 13px; color: #a7f3d0;">Join ${data.companyName.toUpperCase()} on CraveBiZ</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 36px 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 15px; color: #0f172a;">Dear <strong>${data.inviteName || 'Workspace Member'}</strong>,</p>
                            <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                                <strong>${data.inviterName}</strong> (${data.inviterEmail}) has invited you to join the <strong>'${data.companyName.toUpperCase()}'</strong> Workspace as a <strong>${data.inviteRole || 'Member'}</strong>.
                            </p>

                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${data.inviteUrl}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);">
                                    Accept Invitation &amp; Join Workspace &rarr;
                                </a>
                            </div>

                            <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                                This secure link is unique to your email address (${data.inviteEmail}).
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                            CraveBiZ AI Workspace Collaboration
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    return await sendEmailViaSES({
        to: data.inviteEmail,
        subject,
        html,
        text: `You have been invited by ${data.inviterName} to join ${data.companyName} on CraveBiZ.\nAccept link: ${data.inviteUrl}`
    });
}

// ==========================================
// 8. USER REGISTRATION WELCOME EMAILS
// ==========================================

export interface UserRegistrationEmailData {
    recipientEmail: string;
    recipientName?: string;
    companyName?: string;
    loginUrl?: string;
}

export async function sendUserRegistrationEmailDirect(data: UserRegistrationEmailData): Promise<{ success: boolean; message: string; messageId?: string }> {
    const name = data.recipientName || 'Valued Partner';
    const company = data.companyName ? `'${data.companyName}'` : 'your';
    const subject = `Welcome to CraveBiZ AI - Account Registration Confirmed`;

    try {
        await createInAppNotificationRecordAsync({
            recipientEmail: data.recipientEmail,
            title: `Welcome to CraveBiZ AI!`,
            message: `Welcome, ${name}! Your CraveBiZ account has been successfully set up and configured.`,
            category: 'user_registration',
            type: 'success',
            actionUrl: data.loginUrl
        });
    } catch (e) {
        console.warn("[emailService] Failed to record in-app notification:", e);
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                    <tr>
                        <td style="background-color: #1e1b4b; padding: 36px 32px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 26px; font-weight: 800;">Welcome to CraveBiZ AI</h1>
                            <p style="margin: 6px 0 0 0; font-size: 14px; color: #c7d2fe;">Your Intelligent Invoicing &amp; Business Workspace Platform</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 36px 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a;">Hello ${name},</p>
                            <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                                We are thrilled to welcome you to CraveBiZ AI! Your account and ${company} workspace have been successfully created and configured.
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                                With CraveBiZ AI, you can generate smart invoices, process receipts, sign electronic documents via DocSignify, track direct &amp; indirect costs, and collaborate seamlessly with team members.
                            </p>

                            ${data.loginUrl ? `
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${data.loginUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                                    Access Your Workspace Now &rarr;
                                </a>
                            </div>
                            ` : ''}

                            <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 0 8px 8px 0; margin-top: 24px;">
                                <div style="font-size: 12px; font-weight: 800; color: #1e1b4b; text-transform: uppercase; margin-bottom: 4px;">Account Overview:</div>
                                <div style="font-size: 13px; color: #334155;">Registered Email: <strong>${data.recipientEmail}</strong></div>
                                ${data.companyName ? `<div style="font-size: 13px; color: #334155;">Workspace Name: <strong>${data.companyName}</strong></div>` : ''}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
                            Powered by CraveBiZ Email Service
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    return await sendEmailViaSES({
        to: data.recipientEmail,
        subject,
        html,
        text: `Welcome to CraveBiZ AI, ${name}!\nYour account (${data.recipientEmail}) and workspace have been registered successfully.`
    });
}

