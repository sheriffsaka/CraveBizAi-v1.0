
import React, { useEffect, useState, useRef } from 'react';
import { Invoice, Client, Service, Company, BankAccount } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';

interface PlainInvoiceDetailProps {
  invoice: Invoice;
  client: Client;
  services: Service[];
  company: Company | null;
  onBackToInvoiceDetail: () => void; 
  action?: 'print' | 'word';
  onActionComplete?: () => void;
}

const PlainInvoiceDetail: React.FC<PlainInvoiceDetailProps> = ({ invoice, client, services, company, onBackToInvoiceDetail, action, onActionComplete }) => {
    const [isReady, setIsReady] = useState(false);
    const actionProcessedRef = useRef(false);

    const getServiceName = (serviceId: string) => {
        return services.find(s => s.id === serviceId)?.name || 'Service Item';
    };

    const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = invoice.discount || 0;
    const tax = (subtotal - discount) * 0.075; 
    const balanceDue = invoice.total - (invoice.amountPaid || 0);
    const isReceipt = invoice.status === 'Paid';
    
    const selectedBankAccount: BankAccount | undefined = company?.bankAccounts?.find(
        (account) => account.id === invoice.selectedBankAccountId
    );

    const handlePdfExport = () => {
        const element = document.getElementById('plain-invoice-container');
        if (!element) return;

        // Force white background for capture
        const originalBg = document.body.style.backgroundColor;
        document.body.style.backgroundColor = '#ffffff';

        const opt = {
            margin: 0, 
            filename: `${isReceipt ? 'Receipt' : 'Invoice'}_${invoice.invoiceNumber}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                scrollY: 0,
                scrollX: 0,
                logging: false,
                letterRendering: true,
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait' 
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // @ts-ignore
        if (window.html2pdf) {
             // @ts-ignore
             window.html2pdf().set(opt).from(element).save().then(() => {
                 document.body.style.backgroundColor = originalBg;
                 if (onActionComplete) onActionComplete();
             }).catch((err: any) => {
                 console.error(err);
                 document.body.style.backgroundColor = originalBg;
                 if (onActionComplete) onActionComplete();
             });
        } else {
            window.print();
            if (onActionComplete) onActionComplete();
        }
    };

    const downloadAsWord = () => {
        const logoHtml = company?.logoUrl 
            ? `<img src="${company.logoUrl}" width="100" height="auto" alt="Logo" style="display:block;" />` 
            : `<div style="width:80px;height:80px;background:#f3f4f6;color:#9ca3af;border:1px dashed #d1d5db;display:flex;align-items:center;justify-content:center;font-size:10px;">NO LOGO</div>`;

        const bankInfo = selectedBankAccount
            ? `<b>${selectedBankAccount.bankName}</b><br/>Acct: ${selectedBankAccount.accountNumber}<br/>Name: ${selectedBankAccount.accountName}`
            : invoice.manualBankName
            ? `<b>${invoice.manualBankName}</b><br/>Acct: ${invoice.manualAccountNumber}<br/>Name: ${invoice.manualAccountName}`
            : `Contact finance for details.`;

        const itemsRows = invoice.items.map(item => `
            <tr>
                <td style="padding:8px; border-bottom:1px solid #e5e7eb; vertical-align:top;">
                    <strong style="font-size:11pt; color:#111827;">${getServiceName(item.serviceId)}</strong>
                    <div style="font-size:9pt; color:#6b7280;">${item.description || ''}</div>
                </td>
                <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:center; vertical-align:top;">${item.quantity}</td>
                <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right; vertical-align:top;">₦${item.price.toLocaleString()}</td>
                <td style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right; font-weight:bold; vertical-align:top;">₦${(item.price * item.quantity).toLocaleString()}</td>
            </tr>
        `).join('');

        const wordTemplate = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <title>Invoice ${invoice.invoiceNumber}</title>
                <style>
                    @page { size: A4; margin: 1.5cm; }
                    body { font-family: 'Arial', sans-serif; font-size: 10pt; line-height: 1.4; color: #374151; }
                    table { width: 100%; border-collapse: collapse; }
                    td, th { padding: 5px; }
                    .header { background-color: #f9fafb; padding: 20px; border-bottom: 2px solid #2563eb; }
                </style>
            </head>
            <body>
                <div class="WordSection1">
                    <!-- HEADER SECTION -->
                    <table class="header">
                        <tr>
                            <td width="60%" valign="top">
                                ${logoHtml}
                                <div style="margin-top:10px; font-size:14pt; font-weight:bold; color:#111827; text-transform:uppercase;">${company?.name}</div>
                                <div style="font-size:9pt;">${company?.address}</div>
                                <div style="font-size:9pt; color:#2563eb;">${company?.email}</div>
                            </td>
                            <td width="40%" valign="top" align="right">
                                <div style="font-size:28pt; font-weight:900; color:#1e3a8a; text-transform:uppercase;">${isReceipt ? 'RECEIPT' : 'INVOICE'}</div>
                                <div style="font-size:12pt; font-weight:bold; color:#4b5563;"># ${invoice.invoiceNumber}</div>
                                <div style="margin-top:10px; display:inline-block; border:1px solid #ccc; padding: 4px 12px; font-weight:bold; text-transform:uppercase;">${invoice.status}</div>
                            </td>
                        </tr>
                    </table>

                    <br/>

                    <!-- BILL TO & DATES -->
                    <table>
                        <tr>
                            <td width="55%" valign="top">
                                <div style="font-size:8pt; font-weight:bold; color:#9ca3af; text-transform:uppercase; margin-bottom:4px;">Invoiced To</div>
                                <div style="font-size:12pt; font-weight:bold; color:#111827;">${client.companyName}</div>
                                <div>${client.name}</div>
                                <div>${client.email}</div>
                            </td>
                            <td width="45%" valign="top" align="right">
                                <table>
                                    <tr>
                                        <td align="right" style="color:#6b7280; font-weight:bold;">Issue Date:</td>
                                        <td align="right" style="font-weight:bold;">${invoice.issueDate}</td>
                                    </tr>
                                    <tr>
                                        <td align="right" style="color:#6b7280; font-weight:bold;">Due Date:</td>
                                        <td align="right" style="font-weight:bold; color:#dc2626;">${invoice.dueDate}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>

                    <br/><br/>

                    <!-- ITEMS TABLE -->
                    <table style="border: 1px solid #e5e7eb;">
                        <thead>
                            <tr style="background-color:#1e3a8a; color:#ffffff;">
                                <th align="left" style="padding:10px; font-size:9pt; text-transform:uppercase;">Description</th>
                                <th align="center" style="padding:10px; font-size:9pt; text-transform:uppercase; width:10%;">Qty</th>
                                <th align="right" style="padding:10px; font-size:9pt; text-transform:uppercase; width:20%;">Rate</th>
                                <th align="right" style="padding:10px; font-size:9pt; text-transform:uppercase; width:20%;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${itemsRows}</tbody>
                    </table>

                    <br/>

                    <!-- TOTALS -->
                    <table>
                        <tr>
                            <td width="50%"></td>
                            <td width="50%">
                                <table style="border:1px solid #e5e7eb;">
                                    <tr>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#6b7280;">Subtotal</td>
                                        <td align="right" style="padding:8px; font-weight:bold;">₦${subtotal.toLocaleString()}</td>
                                    </tr>
                                    ${discount > 0 ? `
                                    <tr>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#6b7280;">Discount</td>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#dc2626;">- ₦${discount.toLocaleString()}</td>
                                    </tr>
                                    ` : ''}
                                    <tr>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#6b7280;">VAT (7.5%)</td>
                                        <td align="right" style="padding:8px; font-weight:bold;">₦${tax.toLocaleString()}</td>
                                    </tr>
                                     <tr>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#374151; border-top: 1px solid #e5e7eb;">Total Amount</td>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#374151; border-top: 1px solid #e5e7eb;">₦${invoice.total.toLocaleString()}</td>
                                    </tr>
                                    <tr>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#166534;">Amount Paid</td>
                                        <td align="right" style="padding:8px; font-weight:bold; color:#166534;">- ₦${(invoice.amountPaid || 0).toLocaleString()}</td>
                                    </tr>
                                    <tr style="background-color:#f3f4f6;">
                                        <td align="right" style="padding:12px; font-size:12pt; font-weight:bold; color:#111827;">Balance Due</td>
                                        <td align="right" style="padding:12px; font-size:12pt; font-weight:bold; color:#2563eb;">₦${balanceDue.toLocaleString()}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>

                    <br/><br/>

                    <!-- FOOTER -->
                    <table style="border-top:2px solid #e5e7eb; padding-top:20px;">
                        <tr>
                            <td width="50%" valign="top">
                                <div style="font-size:8pt; font-weight:bold; color:#9ca3af; text-transform:uppercase; margin-bottom:5px;">Terms & Conditions</div>
                                <div style="font-size:9pt; color:#4b5563;">${invoice.paymentTerms || 'Standard terms apply.'}</div>
                            </td>
                            <td width="50%" valign="top">
                                <div style="font-size:8pt; font-weight:bold; color:#9ca3af; text-transform:uppercase; margin-bottom:5px;">Payment Details</div>
                                <div style="font-size:9pt; color:#111827; background-color:#eff6ff; padding:10px; border:1px solid #dbeafe;">
                                    ${bankInfo}
                                </div>
                            </td>
                        </tr>
                    </table>
                    
                    <div style="text-align:center; font-size:8pt; color:#9ca3af; margin-top:40px;">Generated via CraveBiZ AI Vault</div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', wordTemplate], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice-${invoice.invoiceNumber}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (onActionComplete) onActionComplete();
    };

    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isReady && action && !actionProcessedRef.current) {
            actionProcessedRef.current = true;
            if (action === 'print') handlePdfExport();
            else if (action === 'word') downloadAsWord();
        }
    }, [isReady, action]);

  return (
    <div className="min-h-screen bg-gray-700 py-10 flex flex-col items-center overflow-auto">
      {/* Controls */}
      <div className="w-[210mm] flex justify-between mb-6 print-hidden">
        <button onClick={onBackToInvoiceDetail} className="bg-white px-4 py-2 rounded shadow text-sm font-bold text-gray-700 flex items-center">
            <Icon name="logout" className="w-4 h-4 mr-2 rotate-180"/> Exit
        </button>
        <div className="space-x-3">
            <button onClick={handlePdfExport} className="bg-blue-600 text-white px-4 py-2 rounded shadow text-sm font-bold hover:bg-blue-700">Download {isReceipt ? 'Receipt' : 'Invoice'} PDF</button>
            <button onClick={downloadAsWord} className="bg-white text-blue-700 px-4 py-2 rounded shadow text-sm font-bold hover:bg-gray-50">Download Word</button>
        </div>
      </div>

      {/* A4 DOCUMENT PREVIEW */}
      {/* Wrapper handles centering; Element handles content */}
      <div className="flex justify-center w-full">
          <div 
            id="plain-invoice-container" 
            className="bg-white shadow-2xl text-black relative"
            style={{
                width: '210mm',
                minHeight: '297mm', // A4 Height
                padding: '20mm', // Safe margins
                boxSizing: 'border-box',
                fontFamily: 'Arial, sans-serif'
            }}
          >
            
            {/* HEADER */}
            <div className="flex justify-between items-start border-b-2 border-blue-900 pb-6 mb-8">
                <div className="w-2/3">
                    <div className="flex items-center gap-4">
                        {company?.logoUrl ? (
                            <img src={company.logoUrl} alt="Logo" className="h-20 w-auto object-contain" />
                        ) : (
                            <div className="h-20 w-20 bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-gray-300">NO LOGO</div>
                        )}
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-tight">{company?.name || 'Company Name'}</h2>
                            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                <p>{company?.address}</p>
                                <p className="text-blue-700 font-medium">{company?.email}</p>
                                <p>{company?.phone}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="w-1/3 text-right">
                    <h1 className="text-5xl font-black text-blue-900 uppercase tracking-tighter mb-2">{isReceipt ? 'Receipt' : 'Invoice'}</h1>
                    <p className="text-base font-bold text-gray-500"># {invoice.invoiceNumber}</p>
                    <div className="mt-2">
                        <span className={`inline-block px-3 py-1 border text-xs font-bold uppercase tracking-wider ${
                            invoice.status === 'Paid' ? 'border-green-500 text-green-700' : 
                            invoice.status === 'Overdue' ? 'border-red-500 text-red-700' : 'border-blue-500 text-blue-700'
                        }`}>
                            {invoice.status}
                        </span>
                    </div>
                </div>
            </div>

            {/* DETAILS GRID */}
            <div className="grid grid-cols-2 gap-10 mb-10">
                <div>
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Bill To</h3>
                    <div className="text-sm">
                        <p className="font-bold text-gray-900 text-lg leading-none mb-1">{client.companyName}</p>
                        <p className="text-gray-700 font-medium">{client.name}</p>
                        <p className="text-gray-500">{client.email}</p>
                    </div>
                </div>
                <div className="text-right">
                    <table className="w-full text-sm">
                        <tbody>
                            <tr>
                                <td className="font-bold text-gray-500 py-1 text-right w-1/2">Issue Date:</td>
                                <td className="font-bold text-gray-900 py-1 pl-4 text-right">{invoice.issueDate}</td>
                            </tr>
                            <tr>
                                <td className="font-bold text-gray-500 py-1 text-right">Due Date:</td>
                                <td className="font-bold text-red-600 py-1 pl-4 text-right">{invoice.dueDate}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ITEMS TABLE */}
            <table className="w-full border-collapse mb-10">
                <thead>
                    <tr className="bg-blue-900 text-white text-xs uppercase tracking-wider">
                        <th className="py-3 px-3 text-left font-bold w-[50%]">Description</th>
                        <th className="py-3 px-3 text-center font-bold">Qty</th>
                        <th className="py-3 px-3 text-right font-bold">Rate</th>
                        <th className="py-3 px-3 text-right font-bold">Amount</th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {invoice.items.map((item, index) => (
                        <tr key={index} className="border-b border-gray-200">
                            <td className="py-3 px-3 align-top">
                                <p className="font-bold text-gray-800">{getServiceName(item.serviceId)}</p>
                                <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                            </td>
                            <td className="py-3 px-3 align-top text-center text-gray-600">{item.quantity}</td>
                            <td className="py-3 px-3 align-top text-right text-gray-600">₦{item.price.toLocaleString()}</td>
                            <td className="py-3 px-3 align-top text-right font-bold text-gray-900">₦{(item.price * item.quantity).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* SUMMARY */}
            <div className="flex justify-end mb-12">
                <div className="w-1/2">
                    <table className="w-full text-sm border-collapse">
                        <tbody>
                            <tr>
                                <td className="py-2 text-right font-bold text-gray-500">Subtotal</td>
                                <td className="py-2 text-right font-bold text-gray-900 w-32">₦{subtotal.toLocaleString()}</td>
                            </tr>
                            {discount > 0 && (
                                <tr>
                                    <td className="py-2 text-right font-bold text-gray-500">Discount</td>
                                    <td className="py-2 text-right font-bold text-red-600"> - ₦{discount.toLocaleString()}</td>
                                </tr>
                            )}
                            <tr>
                                <td className="py-2 text-right font-bold text-gray-500">VAT (7.5%)</td>
                                <td className="py-2 text-right font-bold text-gray-900">₦{tax.toLocaleString()}</td>
                            </tr>
                             <tr>
                                <td className="py-2 text-right font-bold text-gray-800 border-t border-gray-200">Total Amount</td>
                                <td className="py-2 text-right font-bold text-gray-800 border-t border-gray-200">₦{invoice.total.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td className="py-2 text-right font-bold text-green-600">Amount Paid</td>
                                <td className="py-2 text-right font-bold text-green-600">- ₦{(invoice.amountPaid || 0).toLocaleString()}</td>
                            </tr>
                            <tr className="bg-gray-50">
                                <td className="py-3 text-right font-black text-gray-900 text-lg">Balance Due</td>
                                <td className="py-3 text-right font-black text-blue-700 text-lg">₦{balanceDue.toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* FOOTER AREA */}
            <div className="grid grid-cols-2 gap-8 border-t-2 border-gray-100 pt-6 text-sm break-inside-avoid">
                <div>
                    <h4 className="font-bold text-xs text-gray-400 uppercase tracking-widest mb-2">Terms & Notes</h4>
                    <p className="text-gray-600 text-xs leading-relaxed">{invoice.paymentTerms || 'Payment is due within the specified period. Thank you for your business.'}</p>
                </div>
                <div>
                    <h4 className="font-bold text-xs text-gray-400 uppercase tracking-widest mb-2">Payment Instructions</h4>
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded text-xs text-gray-700">
                        {selectedBankAccount ? (
                            <>
                                <div className="flex justify-between mb-1"><span>Bank:</span> <span className="font-bold">{selectedBankAccount.bankName}</span></div>
                                <div className="flex justify-between mb-1"><span>Account Name:</span> <span className="font-bold">{selectedBankAccount.accountName}</span></div>
                                <div className="flex justify-between"><span>Account No:</span> <span className="font-bold font-mono text-blue-800">{selectedBankAccount.accountNumber}</span></div>
                            </>
                        ) : invoice.manualBankName ? (
                            <>
                                <div className="flex justify-between mb-1"><span>Bank:</span> <span className="font-bold">{invoice.manualBankName}</span></div>
                                <div className="flex justify-between mb-1"><span>Account Name:</span> <span className="font-bold">{invoice.manualAccountName || company?.name}</span></div>
                                <div className="flex justify-between"><span>Account No:</span> <span className="font-bold font-mono text-blue-800">{invoice.manualAccountNumber}</span></div>
                            </>
                        ) : (
                            <p className="italic">Please contact us for payment details.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="absolute bottom-4 left-0 w-full text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest">
                Document Secured by CraveBiZ AI
            </div>

          </div>
      </div>
    </div>
  );
};

export default PlainInvoiceDetail;