
import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, Client, Service, InvoiceStatus, Company, BankAccount } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';
import PaymentModal from './PaymentModal';
import { api } from '../lib/api';
import { formatFrequencyLabel } from './RecurringInvoiceList';

interface InvoiceDetailProps {
  invoice: Invoice;
  client: Client;
  services: Service[];
  company: Company | null;
  onUpdateStatus: (invoiceId: string, status: InvoiceStatus) => void;
  onRecordPayment: (invoiceId: string, amount: number, details?: any) => Promise<void>;
  onGenerateReceipt: (invoiceId: string) => void;
  allTenantInvoices: Invoice[];
  onEditInvoice: (invoiceId: string) => void;
  onViewPlainInvoice: (invoiceId: string, action?: 'print' | 'word') => void;
  onViewTemplate: (templateId: string) => void;
  onSendInvoice: (invoiceId: string) => Promise<void>;
  onSendReceipt: (invoiceId: string) => void;
}

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoice, client, services, company, onUpdateStatus, onViewPlainInvoice, onSendInvoice, onEditInvoice, onRecordPayment, onGenerateReceipt, onSendReceipt }) => {
    const [isSending, setIsSending] = useState(false);
    const [sendFeedback, setSendFeedback] = useState<string | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    const getServiceName = (serviceId: string) => services.find(s => s.id === serviceId)?.name || 'Service Item';
    const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = invoice.discount || 0;
    const tax = (subtotal - discount) * 0.075;
    
    // Payment breakdown logic
    const isPaid = invoice.status === InvoiceStatus.Paid || (invoice.amountPaid || 0) >= invoice.total - 0.001;
    const amountPaid = isPaid ? invoice.total : (invoice.amountPaid || 0);
    const hasPayment = amountPaid > 0 || isPaid;
    const balanceDue = isPaid ? 0 : Math.max(0, invoice.total - amountPaid);

    const handleSend = async () => {
        if (isSending || invoice.id === 'preview') return;
        
        if (!client.email) {
            alert("This client does not have an email address configured.");
            return;
        }

        setIsSending(true);
        setSendFeedback(null);
        try {
            await onSendInvoice(invoice.id);

            const itemsPayload = invoice.items.map(item => ({
                name: getServiceName(item.serviceId),
                description: item.description,
                quantity: item.quantity,
                price: item.price
            }));

            const response = await api.sendInvoiceEmailDirect({
                invoiceId: invoice.id,
                companyId: company?.id || (invoice as any).companyId,
                recipientEmail: client.email,
                recipientName: client.name || "Valued Client",
                recipientCompany: client.companyName,
                invoiceNumber: invoice.invoiceNumber,
                issueDate: invoice.issueDate,
                dueDate: invoice.dueDate,
                totalAmount: invoice.total,
                amountPaid: invoice.amountPaid || 0,
                currencySymbol: "₦",
                items: itemsPayload,
                company: {
                    name: company?.name || "CraveBiZ Workspace",
                    email: company?.email,
                    phone: company?.phone,
                    address: company?.address,
                    logoUrl: company?.logoUrl,
                    bankAccounts: company?.bankAccounts
                },
                notes: (invoice as any).notes || invoice.paymentTerms
            });

            setSendFeedback(response.message || `Invoice #${invoice.invoiceNumber} delivered directly to ${client.email}'s inbox!`);
        } catch (e: any) {
            console.error("Failed to send invoice email directly:", e);
            const subject = `Invoice ${invoice.invoiceNumber} from ${company?.name || 'Us'}`;
            const body = `Dear ${client.name},\n\nPlease find details for invoice #${invoice.invoiceNumber}.\n\nAmount Due: ₦${balanceDue.toLocaleString()}\nDue Date: ${invoice.dueDate}\n\nThank you for your business.\n\nBest regards,\n${company?.name || 'The Team'}`;
            const mailtoLink = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            setSendFeedback(`Notice: Opening mail client as fallback (${e.message || 'Server error'}).`);
            setTimeout(() => { window.location.href = mailtoLink; }, 800);
        } finally {
            setIsSending(false);
        }
    };

    const handleConfirmPayment = async (amount: number, details?: any) => {
        try {
            await onRecordPayment(invoice.id, amount, details);
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
      {sendFeedback && (
        <div className="max-w-4xl mx-auto mb-6 p-4 bg-primary-900 text-primary-50 rounded-xl shadow-lg border border-primary-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📧</span>
            <p className="text-sm font-semibold">{sendFeedback}</p>
          </div>
          <button 
            onClick={() => setSendFeedback(null)}
            className="text-xs font-bold px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition"
          >
            Dismiss
          </button>
        </div>
      )}

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
              {invoice.status === InvoiceStatus.PartiallyPaid ? 'Record Payment' : 'Mark as Paid'}
          </button>
        )}

        {((invoice.amountPaid || 0) > 0 || invoice.status === InvoiceStatus.Paid) && (
          <button 
              onClick={() => onGenerateReceipt(invoice.id)} 
              disabled={invoice.id === 'preview'} 
              className="px-6 py-2.5 bg-emerald-700 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-emerald-800 transition-all transform hover:-translate-y-0.5 disabled:bg-gray-400 flex items-center gap-2"
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
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.frequency && invoice.frequency !== 'one-time' && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-primary-100 text-primary-800 border border-primary-200">
                  {formatFrequencyLabel(invoice.frequency)} Recurring
                </span>
              )}
            </div>
          </div>
        </header>

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
             <div className="mb-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Due Date</h3>
                 <p className="text-gray-800 font-black">{invoice.dueDate}</p>
             </div>
             {invoice.nextRecurrenceDate && invoice.frequency !== 'one-time' && (
               <div>
                   <h3 className="text-[10px] font-black text-primary-500 uppercase tracking-widest mb-1">Next Recurrence</h3>
                   <p className="text-primary-700 font-black">{invoice.nextRecurrenceDate}</p>
               </div>
             )}
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
                        <span>- ₦{amountPaid.toLocaleString()}</span>
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
            client={client}
          />
      )}
    </div>
  );
};

export default InvoiceDetail;
