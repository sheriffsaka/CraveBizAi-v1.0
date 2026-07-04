
import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, Client, Service, InvoiceStatus, Company, BankAccount } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import { generateTextResponse } from '../services/aiGenerationService';
import Icon from './common/Icon';
import PaymentModal from './PaymentModal';

interface InvoiceDetailProps {
  invoice: Invoice;
  client: Client;
  services: Service[];
  company: Company | null;
  onUpdateStatus: (invoiceId: string, status: InvoiceStatus) => void;
  onRecordPayment: (invoiceId: string, amount: number) => Promise<void>;
  onGenerateReceipt: (invoiceId: string) => void;
  allTenantInvoices: Invoice[];
  onEditInvoice: (invoiceId: string) => void;
  onViewPlainInvoice: (invoiceId: string, action?: 'print' | 'word') => void;
  onViewTemplate: (templateId: string) => void;
  onSendInvoice: (invoiceId: string) => Promise<void>;
  onSendReceipt: (invoiceId: string) => void;
}

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoice, client, services, company, onUpdateStatus, onViewPlainInvoice, onSendInvoice, onEditInvoice, onRecordPayment, onGenerateReceipt, onSendReceipt }) => {
    const [invoiceSummary, setInvoiceSummary] = useState<string | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    const getServiceName = (serviceId: string) => services.find(s => s.id === serviceId)?.name || 'Service Item';
    const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = invoice.discount || 0;
    const tax = (subtotal - discount) * 0.075;
    
    // Payment breakdown logic
    const hasPayment = (invoice.amountPaid || 0) > 0;
    const balanceDue = invoice.total - (invoice.amountPaid || 0);

    useEffect(() => {
        const generateSummary = async () => {
            setIsLoadingSummary(true);
            try {
                const prompt = `Invoice Summary for ${client.companyName}. Amount: ₦${invoice.total.toLocaleString()}. Provide a concise professional analysis in 2 sentences.`;
                const summary = await generateTextResponse(prompt, 'gemini-3-flash-preview', "Financial Assistant.");
                setInvoiceSummary(summary);
            } catch { setInvoiceSummary("AI summary unavailable."); }
            finally { setIsLoadingSummary(false); }
        };
        if (!invoice.isRecurringTemplate && invoice.id !== 'preview') generateSummary();
    }, [invoice.id, invoice.total]);

    const handleSend = async () => {
        if (isSending || invoice.id === 'preview') return;
        
        if (!client.email) {
            alert("This client does not have an email address configured.");
            return;
        }

        setIsSending(true);
        try {
            await onSendInvoice(invoice.id);
            const subject = `Invoice ${invoice.invoiceNumber} from ${company?.name || 'Us'}`;
            const body = `Dear ${client.name},

Please find attached invoice #${invoice.invoiceNumber} for ${client.companyName}.

Amount Due: ₦${balanceDue.toLocaleString()}
Due Date: ${invoice.dueDate}

Thank you for your business.

Best regards,
${company?.name || 'The Team'}`;

            const mailtoLink = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            setTimeout(() => { window.location.href = mailtoLink; }, 500);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSending(false);
        }
    };

    const handleConfirmPayment = async (amount: number) => {
        try {
            await onRecordPayment(invoice.id, amount);
        } catch (e) {
            console.error("Payment error:", e);
            alert("Failed to sync payment data.");
        }
    };

    const selectedBankAccount = useMemo(() => {
        if (!invoice.selectedBankAccountId || !company) return null;
        return company.bankAccounts?.find(ba => ba.id === invoice.selectedBankAccountId) || null;
    }, [invoice.selectedBankAccountId, company]);

  return (
    <div className="pb-12">
      <div className="flex flex-wrap justify-center gap-3 mb-8 print-hidden">
        <button 
            onClick={() => onEditInvoice(invoice.id)}
            disabled={invoice.id === 'preview'}
            className="px-6 py-2.5 bg-white border border-amber-200 text-amber-700 rounded-xl font-black uppercase tracking-widest text-xs shadow-sm hover:bg-amber-50 transition-all transform hover:-translate-y-0.5 disabled:bg-gray-50 disabled:text-gray-300"
        >
            Modify Document
        </button>

        {invoice.status !== InvoiceStatus.Paid && (
          <button 
              onClick={() => setIsPaymentModalOpen(true)} 
              disabled={invoice.id === 'preview'} 
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-green-700 transition-all transform hover:-translate-y-0.5 disabled:bg-gray-400"
          >
              Mark as Paid
          </button>
        )}

        {invoice.status === InvoiceStatus.Paid && (
          <button 
              onClick={() => onGenerateReceipt(invoice.id)} 
              disabled={invoice.id === 'preview'} 
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-green-700 transition-all transform hover:-translate-y-0.5 disabled:bg-gray-400 flex items-center gap-2"
          >
              <Icon name="file-pdf" className="w-4 h-4" />
              Generate Receipt
          </button>
        )}
        
        <button onClick={() => onViewPlainInvoice(invoice.id, 'print')} className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-black transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
            <Icon name="file-pdf" className="w-4 h-4" />
            Export {invoice.status === InvoiceStatus.Paid ? 'Receipt' : 'Invoice'} PDF
        </button>
        <button onClick={() => onViewPlainInvoice(invoice.id, 'word')} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
            <Icon name="download-word" className="w-4 h-4" /> Export Word
        </button>
        <button 
            onClick={handleSend} 
            disabled={isSending || invoice.id === 'preview'} 
            className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-primary-700 transition-all transform hover:-translate-y-0.5 flex items-center gap-2 disabled:bg-gray-400"
        >
            {isSending ? (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : <Icon name="send" className="w-4 h-4" />}
            {isSending ? 'Opening Mail...' : 'Send Mail'}
        </button>
      </div>

      <div id="invoice-container" className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-4xl mx-auto border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-primary-600"></div>
        
        <header className="flex justify-between items-start pb-8 border-b">
          <div className="flex items-center">
            {company?.logoUrl ? (
                <img src={company.logoUrl} alt="Logo" className="h-16 w-auto mr-5 rounded-lg shadow-sm" />
            ) : (
                <div className="h-16 w-16 bg-gray-50 rounded-lg mr-5 flex items-center justify-center border border-dashed border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-300">No Asset</div>
            )}
            <div>
              <h2 className="text-2xl font-black text-gray-800 tracking-tighter">{company?.name || 'Authorized Workspace'}</h2>
              <p className="text-xs text-gray-500 max-w-xs mt-1 leading-relaxed">{company?.address}</p>
              <p className="text-xs font-bold text-primary-600 mt-1 uppercase tracking-widest">{company?.email}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Document</h1>
            <p className="text-sm text-gray-400 mt-1 font-black"># {invoice.invoiceNumber}</p>
            <div className="mt-3"><InvoiceStatusBadge status={invoice.status} /></div>
          </div>
        </header>
        
        <section className="my-8 p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-start">
            <div className="bg-primary-100 p-2 rounded-lg mr-4">
                <svg className="w-5 h-5 text-primary-600" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13 16V5a1 1 0 112 0v11a1 1 0 11-2 0zM6 16V8a1 1 0 112 0v8a1 1 0 11-2 0z" /></svg>
            </div>
            <div>
                <h3 className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-1">CraveBiZ AI Insights</h3>
                <p className="text-sm text-gray-700 italic leading-relaxed">{isLoadingSummary ? 'Analyzing financial metadata...' : (invoiceSummary || 'Awaiting analysis of commitment data...')}</p>
            </div>
        </section>

        <div className="grid grid-cols-2 gap-12 my-10">
          <div>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Client</h3>
            <p className="font-black text-xl text-gray-800 uppercase tracking-tighter">{client.companyName}</p>
            <p className="text-gray-500 text-sm font-medium">{client.name}</p>
            <p className="text-gray-500 text-sm">{client.email}</p>
          </div>
          <div className="text-right flex flex-col justify-end">
             <div className="mb-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Issue Date</h3>
                 <p className="text-gray-800 font-black">{invoice.issueDate}</p>
             </div>
             <div>
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Due Date</h3>
                 <p className="text-gray-800 font-black">{invoice.dueDate}</p>
             </div>
          </div>
        </div>

        <table className="w-full text-left mb-10 border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase font-black border-b-2 border-gray-50">
                <th className="py-4">Service Description</th>
                <th className="py-4 text-center">Unit</th>
                <th className="py-4 text-right">Rate</th>
                <th className="py-4 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-5">
                    <p className="font-black text-gray-800">{getServiceName(item.serviceId)}</p>
                    <p className="text-xs text-gray-500 whitespace-pre-wrap mt-1 leading-relaxed">{item.description}</p>
                  </td>
                  <td className="py-5 text-center font-bold text-gray-700">{item.quantity}</td>
                  <td className="py-5 text-right font-medium text-gray-600">₦{item.price.toLocaleString()}</td>
                  <td className="py-5 text-right font-black text-gray-900">₦{(item.price * item.quantity).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
        </table>

        <div className="flex justify-end mb-10">
          <div className="w-80 space-y-3 p-6 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex justify-between text-gray-500 font-bold text-xs uppercase tracking-widest"><span>Gross Value</span><span className="text-gray-900">₦{subtotal.toLocaleString()}</span></div>
            {discount > 0 && (
                <div className="flex justify-between text-red-500 font-bold text-xs uppercase tracking-widest"><span>Discount</span><span>- ₦{discount.toLocaleString()}</span></div>
            )}
            <div className="flex justify-between text-gray-500 font-bold text-xs uppercase tracking-widest"><span>VAT (7.5%)</span><span className="text-gray-900">₦{tax.toLocaleString()}</span></div>
            
            <div className="flex justify-between font-bold text-lg text-gray-800 border-t border-gray-200 pt-3 mt-2">
                <span>Total Amount</span>
                <span>₦{invoice.total.toLocaleString()}</span>
            </div>

            {hasPayment && (
                <>
                    <div className="flex justify-between font-bold text-lg text-green-600">
                        <span>Amount Paid</span>
                        <span>- ₦{(invoice.amountPaid || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t-2 border-gray-200 pt-4 font-black text-3xl text-primary-600 tracking-tighter">
                        <span>Balance Due</span>
                        <span>₦{balanceDue.toLocaleString()}</span>
                    </div>
                </>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-8">
            <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Commercial Terms</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">{invoice.paymentTerms || 'Standard commercial settlement terms apply.'}</p>
            </div>
            <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Settlement Information</h3>
                {selectedBankAccount ? (
                    <div className="p-4 bg-primary-50 rounded-xl border border-primary-100 space-y-1">
                        <p className="text-xs text-gray-600">Bank Name: <span className="font-black text-gray-900">{selectedBankAccount.bankName}</span></p>
                        <p className="text-xs text-gray-600">Beneficiary: <span className="font-black text-gray-900">{selectedBankAccount.accountName}</span></p>
                        <p className="text-xs text-gray-600">Account No: <span className="font-black text-gray-900 text-sm tracking-widest">{selectedBankAccount.accountNumber}</span></p>
                    </div>
                ) : invoice.manualBankName ? (
                    <div className="p-4 bg-primary-50 rounded-xl border border-primary-100 space-y-1">
                        <p className="text-xs text-gray-600">Bank Name: <span className="font-black text-gray-900">{invoice.manualBankName}</span></p>
                        <p className="text-xs text-gray-600">Beneficiary: <span className="font-black text-gray-900">{invoice.manualAccountName || company?.name}</span></p>
                        <p className="text-xs text-gray-600">Account No: <span className="font-black text-gray-900 text-sm tracking-widest">{invoice.manualAccountNumber}</span></p>
                    </div>
                ) : (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-700 italic font-bold">Ad-hoc settlement; contact finance for instructions.</div>
                )}
            </div>
        </div>

        <footer className="mt-16 text-center">
            <p className="font-black text-gray-900 text-sm uppercase tracking-widest mb-2 tracking-[0.2em]">CraveBiZ Secure Document Protocol</p>
            <div className="flex items-center justify-center gap-2 opacity-30">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500">Authorized Workspace Protection</span>
            </div>
        </footer>
      </div>

      {isPaymentModalOpen && (
          <PaymentModal 
            isOpen={isPaymentModalOpen} 
            onClose={() => setIsPaymentModalOpen(false)} 
            invoice={invoice} 
            onConfirmPayment={handleConfirmPayment} 
          />
      )}
    </div>
  );
};

export default InvoiceDetail;
