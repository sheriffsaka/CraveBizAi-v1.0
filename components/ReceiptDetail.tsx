
import React from 'react';
import { Invoice, Client, Service, Company, BankAccount } from '../types';
import Icon from './common/Icon';

interface ReceiptDetailProps {
  invoice: Invoice;
  client: Client;
  services: Service[];
  company: Company;
}

const ReceiptDetail: React.FC<ReceiptDetailProps> = ({ invoice, client, services, company }) => {
    
    const getServiceName = (serviceId: string) => {
        return services.find(s => s.id === serviceId)?.name || 'Custom Item';
    };

    const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = invoice.total - subtotal; 
    
    const selectedBankAccount: BankAccount | undefined = company.bankAccounts?.find(
        (account) => account.id === invoice.selectedBankAccountId
    );

    const handlePdfExport = () => {
        const element = document.getElementById('receipt-container');
        if (!element) return;
        
        const originalBg = document.body.style.backgroundColor;
        document.body.style.backgroundColor = '#ffffff';

        // Use standard mm units for A4
        const opt = {
            margin: 0,
            filename: `Receipt_${invoice.invoiceNumber}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                scrollY: 0, 
                scrollX: 0,
                logging: false,
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait' 
            }
        };

        // @ts-ignore
        if (window.html2pdf) {
             // @ts-ignore
             window.html2pdf().set(opt).from(element).save().then(() => {
                 document.body.style.backgroundColor = originalBg;
             }).catch((err: any) => {
                 console.error(err);
                 document.body.style.backgroundColor = originalBg;
             });
        } else {
            window.print();
        }
    };

    const downloadAsWord = () => {
        const logoHtml = company?.logoUrl 
            ? `<img src="${company.logoUrl}" width="100" height="auto" alt="Logo" style="display:block;" />` 
            : `<div style="width:80px;height:80px;background:#f3f4f6;text-align:center;line-height:80px;font-size:10px;color:#999;border:1px dashed #ccc;">NO LOGO</div>`;

        const itemsRows = invoice.items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; vertical-align:top;">
                    <div style="font-weight: bold; color: #111827;">${getServiceName(item.serviceId)}</div>
                    <div style="font-size: 9pt; color: #6b7280;">${item.description || ''}</div>
                </td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #e5e7eb; vertical-align:top;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e5e7eb; vertical-align:top;">₦${item.price.toLocaleString()}</td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827; vertical-align:top;">₦${(item.price * item.quantity).toLocaleString()}</td>
            </tr>
        `).join('');

        const wordTemplate = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="UTF-8">
                <title>Receipt ${invoice.invoiceNumber}</title>
                <style>
                    @page { size: A4; margin: 1.5cm; }
                    body { font-family: 'Arial', sans-serif; font-size: 10pt; color: #000; line-height:1.4; }
                    table { width: 100%; border-collapse: collapse; }
                    td, th { vertical-align: top; padding: 5px; }
                </style>
            </head>
            <body>
                <div class="WordSection1">
                    <table style="border-bottom: 2px solid #166534; padding-bottom: 20px; margin-bottom: 20px;">
                      <tr>
                        <td width="60%" valign="middle">
                           ${logoHtml}
                           <div style="font-size: 14pt; font-weight: bold; color: #111827; margin-top:10px;">${company.name}</div>
                           <div style="font-size: 9pt; color: #6b7280;">${company.address}</div>
                           <div style="font-size: 9pt; color: #2563eb;">${company.email}</div>
                        </td>
                        <td width="40%" valign="middle" align="right">
                            <div style="font-size: 24pt; font-weight: 900; color: #166534; text-transform: uppercase;">RECEIPT</div>
                            <div style="font-size: 10pt; color: #6b7280;">Ref: ${invoice.invoiceNumber}</div>
                            <div style="margin-top: 10px; border: 1px solid #166534; color: #166534; display: inline-block; padding: 5px 15px; font-weight: bold; text-transform: uppercase;">PAID</div>
                        </td>
                      </tr>
                    </table>

                    <br/>

                    <table>
                        <tr>
                            <td width="50%">
                                <div style="font-size: 8pt; text-transform: uppercase; color: #9ca3af; font-weight: bold; margin-bottom: 5px;">Received From</div>
                                <div style="font-size: 12pt; font-weight: bold; color: #111827;">${client.companyName}</div>
                                <div>${client.name}</div>
                                <div>${client.email}</div>
                            </td>
                            <td width="50%" align="right">
                                <table>
                                    <tr><td align="right" style="color:#6b7280; font-weight:bold;">Payment Date:</td><td align="right" style="font-weight:bold;">${invoice.issueDate}</td></tr>
                                    <tr><td align="right" style="color:#6b7280; font-weight:bold;">Due Date:</td><td align="right" style="font-weight:bold;">${invoice.dueDate}</td></tr>
                                </table>
                            </td>
                        </tr>
                    </table>

                    <br/><br/>

                    <table style="border: 1px solid #e5e7eb;">
                        <thead>
                            <tr style="background-color: #f0fdf4; color: #166534;">
                                <th align="left" style="padding: 10px; font-size: 9pt; text-transform: uppercase;">Description</th>
                                <th align="center" style="padding: 10px; font-size: 9pt; text-transform: uppercase;">Qty</th>
                                <th align="right" style="padding: 10px; font-size: 9pt; text-transform: uppercase;">Unit Price</th>
                                <th align="right" style="padding: 10px; font-size: 9pt; text-transform: uppercase;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${itemsRows}</tbody>
                    </table>

                    <br/>

                    <table>
                        <tr>
                            <td width="50%"></td>
                            <td width="50%">
                                 <table style="border: 1px solid #e5e7eb;">
                                     <tr>
                                         <td align="right" style="padding: 8px; color: #6b7280; font-weight:bold;">Subtotal</td>
                                         <td align="right" style="padding: 8px; font-weight: bold;">₦${subtotal.toLocaleString()}</td>
                                     </tr>
                                     <tr>
                                         <td align="right" style="padding: 8px; color: #6b7280; font-weight:bold;">VAT (7.5%)</td>
                                         <td align="right" style="padding: 8px; font-weight: bold;">₦${tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                     </tr>
                                     <tr style="background-color: #f0fdf4;">
                                         <td align="right" style="padding: 10px; color: #111827; font-weight: bold; font-size: 12pt;">Total Paid</td>
                                         <td align="right" style="padding: 10px; font-weight: bold; font-size: 14pt; color: #166534;">₦${invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                     </tr>
                                 </table>
                            </td>
                        </tr>
                    </table>

                    <br/><br/>

                    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #6b7280; font-size: 9pt;">
                        <p style="font-weight: bold; margin-bottom: 5px; color: #111827;">Payment Successfully Received. Thank you!</p>
                        ${selectedBankAccount 
                            ? `<p>Payment processed to <strong>${selectedBankAccount.accountName}</strong> (${selectedBankAccount.bankName})</p>`
                            : `<p>Payment information verified.</p>`
                        }
                    </div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', wordTemplate], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Receipt-${invoice.invoiceNumber}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

  return (
    <div className="min-h-screen bg-gray-700 flex flex-col items-center py-10 overflow-auto">
      {/* Action Buttons */}
      <div className="w-[210mm] flex justify-end space-x-4 mb-6 print-hidden">
        <button 
          onClick={handlePdfExport} 
          className="flex items-center px-4 py-2 bg-green-700 text-white rounded shadow hover:bg-green-800 font-bold text-sm"
        >
          Download PDF
        </button>
        <button 
          onClick={downloadAsWord} 
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 font-bold text-sm"
        >
          <Icon name="download-word" className="w-5 h-5 mr-2" /> Download Word
        </button>
      </div>

      {/* Screen Layout - A4 Paper Simulation */}
      {/* Wrapper handles centering */}
      <div className="flex justify-center w-full">
          <div 
            id="receipt-container" 
            className="bg-white shadow-2xl text-black relative"
            style={{
                width: '210mm',
                minHeight: '297mm',
                padding: '20mm',
                boxSizing: 'border-box',
                fontFamily: 'Arial, sans-serif'
            }}
          >
            
            {/* HEADER */}
            <div className="flex justify-between items-center mb-10 pb-6 border-b-2 border-green-700">
                <div className="w-[60%] flex items-center gap-4">
                   {company.logoUrl ? (
                       <img src={company.logoUrl} alt="Logo" className="h-20 w-auto object-contain" />
                   ) : (
                       <div className="h-20 w-20 bg-gray-50 border border-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-400">NO LOGO</div>
                   )}
                   <div>
                       <h2 className="text-xl font-bold text-gray-800">{company.name}</h2>
                       <p className="text-xs text-gray-500">{company.address}</p>
                       <p className="text-xs text-blue-600 font-bold">{company.email}</p>
                   </div>
                </div>
                <div className="w-[40%] text-right">
                    <h1 className="text-5xl font-black text-green-700 uppercase tracking-tight">Receipt</h1>
                    <p className="text-base font-bold text-gray-500 mt-1">Ref: {invoice.invoiceNumber}</p>
                    <div className="mt-2">
                        <span className="px-4 py-1 text-sm font-bold rounded border border-green-600 text-green-700 uppercase tracking-widest inline-block">
                            Paid
                        </span>
                    </div>
                </div>
            </div>

            {/* INFO GRID */}
            <div className="flex justify-between items-start mb-10">
                <div className="w-[50%]">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Received From</p>
                    <h3 className="text-lg font-bold text-gray-900">{client.companyName}</h3>
                    <p className="text-sm text-gray-700 font-medium">{client.name}</p>
                    <p className="text-sm text-gray-500">{client.email}</p>
                </div>
                <div className="w-[50%] text-right">
                    <table className="w-full text-sm">
                        <tbody>
                            <tr>
                                <td className="text-right font-bold text-gray-500 py-1">Payment Date:</td>
                                <td className="text-right font-bold text-gray-900 py-1 pl-4">{invoice.issueDate}</td>
                            </tr>
                            <tr>
                                <td className="text-right font-bold text-gray-500 py-1">Due Date:</td>
                                <td className="text-right font-bold text-gray-900 py-1 pl-4">{invoice.dueDate}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ITEMS */}
            <table className="w-full mb-10 border-collapse">
                <thead>
                    <tr className="bg-green-50 text-green-800 border-t border-b border-green-100">
                        <th className="py-3 px-3 text-left text-xs font-bold uppercase tracking-wider">Description</th>
                        <th className="py-3 px-3 text-center text-xs font-bold uppercase tracking-wider w-20">Qty</th>
                        <th className="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider w-32">Unit Price</th>
                        <th className="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider w-32">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.items.map((item, index) => (
                        <tr key={index} className="border-b border-gray-100">
                            <td className="py-3 px-3 align-top">
                                <p className="font-bold text-gray-800 text-sm">{getServiceName(item.serviceId)}</p>
                                <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                            </td>
                            <td className="py-3 px-3 align-top text-center text-sm font-medium text-gray-600">{item.quantity}</td>
                            <td className="py-3 px-3 align-top text-right text-sm font-medium text-gray-600">₦{item.price.toLocaleString()}</td>
                            <td className="py-3 px-3 align-top text-right text-sm font-bold text-gray-900">₦{(item.price * item.quantity).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* TOTALS */}
            <div className="flex justify-end mb-12">
                <div className="w-1/2">
                     <table className="w-full text-sm border-collapse">
                         <tbody>
                             <tr>
                                 <td className="py-2 text-right font-bold text-gray-500">Subtotal</td>
                                 <td className="py-2 text-right font-bold text-gray-900 w-32">₦{subtotal.toLocaleString()}</td>
                             </tr>
                             <tr>
                                 <td className="py-2 text-right font-bold text-gray-500 border-b border-gray-200">VAT (7.5%)</td>
                                 <td className="py-2 text-right font-bold text-gray-900 border-b border-gray-200">₦{tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                             </tr>
                             <tr className="bg-green-50">
                                 <td className="py-3 text-right font-black text-gray-900 text-lg">Total Paid</td>
                                 <td className="py-3 text-right font-black text-green-700 text-lg">₦{invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                             </tr>
                         </tbody>
                     </table>
                </div>
            </div>

            {/* FOOTER */}
            <div className="border-t border-gray-100 pt-8 text-center break-inside-avoid">
                <p className="font-bold text-gray-800 text-sm mb-1 uppercase tracking-widest">Payment Successfully Received</p>
                {selectedBankAccount ? (
                    <p className="text-xs text-gray-500">Processed to <span className="font-bold">{selectedBankAccount.accountName}</span> ({selectedBankAccount.bankName})</p>
                ) : (
                    <p className="text-xs text-gray-500">Payment information verified.</p>
                )}
            </div>

          </div>
      </div>
    </div>
  );
};

export default ReceiptDetail;
