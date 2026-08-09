
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Service, Invoice, InvoiceStatus, InvoiceItem, Company, InvoiceFrequency, RecurringStatus } from '../types';
import { getSubscriptionInfo } from '../services/subscriptionService';
import Icon from './common/Icon';
import InvoiceDetail from './InvoiceDetail';
import SearchableServiceSelect from './common/SearchableServiceSelect';

interface InvoiceFormProps {
  initialInvoice?: Invoice | null;
  clients: Client[];
  services: Service[];
  company: Company;
  onSave: (invoice: Invoice | Omit<Invoice, 'id' | 'invoiceNumber'>, status: InvoiceStatus) => void;
  onCancel: () => void;
  onNavigate?: (page: any) => void;
}

export function calculateNextRecurrenceDate(currentDateStrOrObj: string | Date, frequency: InvoiceFrequency): string {
  const currentDate = typeof currentDateStrOrObj === 'string' ? new Date(currentDateStrOrObj) : currentDateStrOrObj;
  const nextDate = new Date(currentDate);
  if (isNaN(nextDate.getTime())) return '';
  nextDate.setHours(0, 0, 0, 0);
  switch (frequency) {
    case 'daily': nextDate.setDate(currentDate.getDate() + 1); break;
    case 'weekly': nextDate.setDate(currentDate.getDate() + 7); break;
    case 'monthly': nextDate.setMonth(currentDate.getMonth() + 1); break;
    case 'quarterly': nextDate.setMonth(currentDate.getMonth() + 3); break;
    case 'biannually': nextDate.setMonth(currentDate.getMonth() + 6); break;
    case 'annually':
    case 'yearly': nextDate.setFullYear(currentDate.getFullYear() + 1); break;
    default: return '';
  }
  return nextDate.toISOString().split('T')[0];
}

const InvoiceForm: React.FC<InvoiceFormProps> = ({ initialInvoice, clients, services, onSave, onCancel, company, onNavigate }) => {
  const [clientId, setClientId] = useState<string>('');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [items, setItems] = useState<InvoiceItem[]>([{ 
    serviceId: '', 
    description: '', 
    quantity: 1, 
    price: 0,
    billingCycle: undefined,
    autoRenew: false,
    renewalReminderDaysBefore: 7
  }]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [manualBankName, setManualBankName] = useState('');
  const [manualAccountName, setManualAccountName] = useState('');
  const [manualAccountNumber, setManualAccountNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [frequency, setFrequency] = useState<InvoiceFrequency>('one-time');
  const [nextRecurrenceDate, setNextRecurrenceDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [recurringStatus, setRecurringStatus] = useState<RecurringStatus>('active');
  const [autoGenerate, setAutoGenerate] = useState<boolean>(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // Persistence logic for drafts
  useEffect(() => {
    if (!initialInvoice) {
      const savedDraft = localStorage.getItem('cravebiz_invoice_draft');
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          if (draft.clientId) setClientId(draft.clientId);
          if (draft.projectId) setProjectId(draft.projectId);
          if (draft.issueDate) setIssueDate(draft.issueDate);
          if (draft.dueDate) setDueDate(draft.dueDate);
          if (draft.items) setItems(draft.items);
          if (draft.selectedBankAccountId) setSelectedBankAccountId(draft.selectedBankAccountId);
          if (draft.manualBankName) setManualBankName(draft.manualBankName);
          if (draft.manualAccountName) setManualAccountName(draft.manualAccountName);
          if (draft.manualAccountNumber) setManualAccountNumber(draft.manualAccountNumber);
          if (draft.paymentTerms) setPaymentTerms(draft.paymentTerms);
          if (draft.discount) setDiscount(draft.discount);
          if (draft.frequency) setFrequency(draft.frequency);
          if (draft.nextRecurrenceDate) setNextRecurrenceDate(draft.nextRecurrenceDate);
        } catch (e) {
          console.error("Draft recovery failed", e);
        }
      }
    }
  }, [initialInvoice]);

  useEffect(() => {
    if (!initialInvoice) {
      const draft = {
        clientId, projectId, issueDate, dueDate, items, selectedBankAccountId,
        manualBankName, manualAccountName, manualAccountNumber,
        paymentTerms, discount, frequency, nextRecurrenceDate
      };
      localStorage.setItem('cravebiz_invoice_draft', JSON.stringify(draft));
    }
  }, [clientId, projectId, issueDate, dueDate, items, selectedBankAccountId, manualBankName, manualAccountName, manualAccountNumber, paymentTerms, discount, frequency, nextRecurrenceDate, initialInvoice]);

  const clearDraft = () => localStorage.removeItem('cravebiz_invoice_draft');

  useEffect(() => {
    if (initialInvoice) {
      setClientId(initialInvoice.clientId);
      setProjectId(initialInvoice.projectId);
      setIssueDate(initialInvoice.issueDate);
      setDueDate(initialInvoice.dueDate);
      setItems(initialInvoice.items);
      setSelectedBankAccountId(initialInvoice.selectedBankAccountId || 'manual');
      setManualBankName(initialInvoice.manualBankName || '');
      setManualAccountName(initialInvoice.manualAccountName || '');
      setManualAccountNumber(initialInvoice.manualAccountNumber || '');
      setPaymentTerms(initialInvoice.paymentTerms || '');
      setDiscount(initialInvoice.discount || 0);
      setFrequency(initialInvoice.frequency || 'one-time');
      setNextRecurrenceDate(initialInvoice.nextRecurrenceDate || initialInvoice.nextDueDate || '');
      setStartDate(initialInvoice.startDate || initialInvoice.issueDate || '');
      setEndDate(initialInvoice.endDate || '');
      setRecurringStatus(initialInvoice.recurringStatus || 'active');
      setAutoGenerate(initialInvoice.autoGenerate !== undefined ? initialInvoice.autoGenerate : true);
    } else {
      setProjectId(undefined);
        if (company?.bankAccounts && company.bankAccounts.length > 0) {
            setSelectedBankAccountId(company.bankAccounts[0].id);
        } else {
            setSelectedBankAccountId('manual');
        }
    }
  }, [initialInvoice, company]);

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    if (field === 'serviceId') {
        const s = services.find(srv => srv.id === value);
        if (s) {
            newItems[index].price = s.price;
            newItems[index].description = s.description || s.name;
            newItems[index].directCost = s.directCost || 0;
            newItems[index].indirectCost = s.indirectCost || 0;
        }
    }
    setItems(newItems);
  };

  const handleSelectServiceForItem = (index: number, selectedService: Service | null) => {
    const newItems = [...items];
    if (selectedService) {
      newItems[index].serviceId = selectedService.id;
      newItems[index].price = selectedService.price;
      newItems[index].description = selectedService.description || selectedService.name;
      newItems[index].directCost = selectedService.directCost || 0;
      newItems[index].indirectCost = selectedService.indirectCost || 0;
      if (!newItems[index].quantity || newItems[index].quantity <= 0) {
        newItems[index].quantity = 1;
      }
    } else {
      newItems[index].serviceId = 'custom';
    }
    setItems(newItems);
  };

  const handleCustomServiceForItem = (index: number, customTerm: string) => {
    const newItems = [...items];
    newItems[index].serviceId = 'custom';
    newItems[index].description = customTerm;
    setItems(newItems);
  };

  const addItem = () => { 
      setItems([...items, { 
        serviceId: '', 
        description: '', 
        quantity: 1, 
        price: 0,
        discount: 0,
        directCost: 0,
        indirectCost: 0,
        billingCycle: undefined,
        autoRenew: false,
        renewalReminderDaysBefore: 7
      }]); 
  };
  
  const removeItem = (index: number) => { 
      setItems(items.filter((_, i) => i !== index)); 
  };

  const handleCancel = () => {
      clearDraft();
      onCancel();
  };

  const subtotal = useMemo(() => items.reduce((s, i) => s + (i.quantity * i.price) - (i.discount || 0), 0), [items]);
  const tax = (subtotal - discount) * 0.075;
  const total = (subtotal - discount) + tax;

  const getPreviewData = (status: InvoiceStatus): Invoice => ({
    id: initialInvoice?.id || 'preview',
    companyId: company?.id || '',
    invoiceNumber: initialInvoice?.invoiceNumber || `PREVIEW`,
    clientId, 
    projectId,
    issueDate, dueDate, items, total, 
    discount,
    amountPaid: initialInvoice?.amountPaid || 0, 
    status,
    selectedBankAccountId: selectedBankAccountId === 'manual' ? undefined : selectedBankAccountId,
    manualBankName: selectedBankAccountId === 'manual' ? manualBankName : undefined,
    manualAccountName: selectedBankAccountId === 'manual' ? manualAccountName : undefined,
    manualAccountNumber: selectedBankAccountId === 'manual' ? manualAccountNumber : undefined,
    paymentTerms, frequency, nextRecurrenceDate,
    nextDueDate: nextRecurrenceDate,
    startDate: frequency !== 'one-time' ? (startDate || issueDate) : undefined,
    endDate: frequency !== 'one-time' ? (endDate || undefined) : undefined,
    recurringStatus: frequency !== 'one-time' ? recurringStatus : undefined,
    autoGenerate: frequency !== 'one-time' ? autoGenerate : undefined,
    autoSend: frequency !== 'one-time' ? autoGenerate : undefined,
    invoiceSchedule: frequency !== 'one-time' ? frequency : undefined,
    isRecurringTemplate: frequency !== 'one-time'
  });

  const handleSaveInternal = (status: InvoiceStatus) => {
      if (!clientId) { alert("Client selection required."); return; }
      if (!dueDate) { alert("Due date required."); return; }
      if (items.some(it => !it.serviceId && !it.description.trim())) {
        alert("All line items must have a service selected or a description.");
        return;
      }
      
      const sanitizedItems = items.map(it => ({
        ...it,
        serviceId: it.serviceId || 'custom'
      }));

      const previewData = getPreviewData(status);
      const data = { ...previewData, items: sanitizedItems };

      clearDraft();
      if (!initialInvoice) {
          const { id, invoiceNumber, ...finalData } = data;
          onSave(finalData as Omit<Invoice, 'id' | 'invoiceNumber'>, status);
      } else {
          onSave(data as Invoice, status);
      }
  };

  const selectedClient = clients.find(c => c.id === clientId);

  const activeClientsList = useMemo(() => {
    return (clients || []).filter(c => !c.is_archived && c.status !== 'Archived' && c.status !== 'Deleted');
  }, [clients]);

  const activeServicesList = useMemo(() => {
    return services || [];
  }, [services]);

  const hasClients = activeClientsList.length > 0;
  const hasServices = activeServicesList.length > 0;

  // First Invoice Guidance: Check missing required records when creating new invoice
  if (!initialInvoice && (!hasClients || !hasServices)) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-4xl mx-auto text-gray-900 mb-10 border border-amber-200">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-5 mb-6">
          <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl border border-amber-200">
            <Icon name="alertCircle" className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">First Invoice Setup Guidance</h2>
            <p className="text-sm font-medium text-gray-600">Please set up required records before generating your first invoice.</p>
          </div>
        </div>

        <div className="space-y-6">
          {!hasClients && (
            <div className="p-6 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-amber-900 tracking-tight">Add a Client First</h3>
                <p className="text-sm font-medium text-amber-800 mt-1 leading-relaxed">
                  You need at least one client before creating an invoice. Add your first client to continue.
                </p>
              </div>
              <button
                onClick={() => onNavigate ? onNavigate('clients') : null}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all shrink-0 flex items-center justify-center gap-2"
              >
                <Icon name="userPlus" className="w-4 h-4" />
                Add Client
              </button>
            </div>
          )}

          {!hasServices && (
            <div className="p-6 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-amber-900 tracking-tight">Add a Service First</h3>
                <p className="text-sm font-medium text-amber-800 mt-1 leading-relaxed">
                  You need at least one service before creating an invoice. Add your first service to continue.
                </p>
              </div>
              <button
                onClick={() => onNavigate ? onNavigate('services') : null}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all shrink-0 flex items-center justify-center gap-2"
              >
                <Icon name="plus" className="w-4 h-4" />
                Add Service
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-xl max-w-4xl mx-auto text-gray-900 mb-10 border border-gray-100">
        <h2 className="text-3xl font-black text-gray-800 mb-8 uppercase tracking-tighter border-b pb-4">{initialInvoice ? 'Modify Record' : 'Generate Invoice'}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Client</label>
                <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full p-3.5 border rounded-lg bg-gray-50 text-gray-900 shadow-sm focus:ring-2 focus:ring-primary-500 outline-none font-bold">
                    <option value="" disabled>Select client...</option>
                    {clients
                      .filter(c => (!c.is_archived && c.status !== 'Archived' && c.status !== 'Deleted') || c.id === clientId)
                      .map(c => <option key={c.id} value={c.id}>{c.companyName}{c.is_archived || c.status === 'Archived' ? ' (Archived)' : ''}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Issue Date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full p-3.5 border rounded-lg bg-gray-50 text-gray-900 shadow-sm focus:ring-2 focus:ring-primary-500 outline-none font-bold" />
            </div>
            <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full p-3.5 border rounded-lg bg-gray-50 text-gray-900 shadow-sm focus:ring-2 focus:ring-primary-500 outline-none font-bold" />
            </div>
        </div>

        <div className="p-8 bg-primary-50 rounded-xl border border-primary-100 mb-8 shadow-sm">
            <h3 className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-6">Financial Routing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Settlement Account</label>
                    <select 
                        value={selectedBankAccountId} 
                        onChange={e => setSelectedBankAccountId(e.target.value)} 
                        className="w-full p-3.5 border rounded-lg bg-white text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                    >
                        {company?.bankAccounts?.map(ba => (
                            <option key={ba.id} value={ba.id}>{ba.bankName} - {ba.accountNumber}</option>
                        ))}
                        <option value="manual">-- Add Manual Account --</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-2">Invoice Recurrence / Frequency</label>
                    <select value={frequency} onChange={e => {
                        const f = e.target.value as InvoiceFrequency;
                        setFrequency(f);
                        if (f !== 'one-time') {
                          const baseDate = issueDate ? new Date(issueDate) : new Date();
                          setNextRecurrenceDate(calculateNextRecurrenceDate(isNaN(baseDate.getTime()) ? new Date() : baseDate, f));
                        } else {
                          setNextRecurrenceDate('');
                        }
                    }} className="w-full p-3.5 border rounded-lg bg-white text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-primary-500 font-bold">
                        <option value="one-time">One-Time</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly (Every 3 Months)</option>
                        <option value="biannually">Bi-Annually (Every 6 Months)</option>
                        <option value="annually">Yearly</option>
                    </select>
                </div>
            </div>

            {frequency !== 'one-time' && (
                <div className="mt-6 p-6 bg-white border border-primary-200 rounded-xl shadow-sm animate-in fade-in space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div>
                            <p className="text-xs font-black text-primary-900 uppercase tracking-wider">Recurring Invoice Schedule & Automation</p>
                            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Automated invoice generation will be processed and saved directly to Supabase.</p>
                        </div>
                        <span className="px-2.5 py-1 text-[10px] font-black uppercase rounded-full bg-primary-100 text-primary-800 border border-primary-200">
                          {frequency} Schedule
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Start Date</label>
                            <input
                                type="date"
                                value={startDate || issueDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full p-2.5 border rounded-lg bg-gray-50 text-gray-900 font-bold text-xs outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-primary-700 uppercase mb-1">Next Due Date *</label>
                            <input
                                type="date"
                                value={nextRecurrenceDate}
                                onChange={e => setNextRecurrenceDate(e.target.value)}
                                className="w-full p-2.5 border border-primary-300 rounded-lg bg-primary-50/50 text-primary-900 font-black text-xs outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">End Date (Optional)</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="w-full p-2.5 border rounded-lg bg-gray-50 text-gray-900 font-bold text-xs outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Recurring Status</label>
                            <select
                                value={recurringStatus}
                                onChange={e => setRecurringStatus(e.target.value as RecurringStatus)}
                                className="w-full p-2.5 border rounded-lg bg-gray-50 text-gray-900 font-bold text-xs outline-none focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="active">Active</option>
                                <option value="paused">Paused</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <input
                            type="checkbox"
                            id="autoGenerateCheck"
                            checked={autoGenerate}
                            onChange={e => setAutoGenerate(e.target.checked)}
                            className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                        />
                        <label htmlFor="autoGenerateCheck" className="text-xs font-bold text-gray-700 cursor-pointer">
                            Auto-generate new invoice instances automatically when due date arrives
                        </label>
                    </div>
                </div>
            )}

            {selectedBankAccountId === 'manual' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 p-6 bg-white rounded-lg border border-primary-100 shadow-sm animate-in slide-in-from-top-2">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Bank Name</label>
                        <input type="text" value={manualBankName} onChange={e => setManualBankName(e.target.value)} placeholder="e.g. GTBank" className="w-full p-3 text-sm border rounded-lg bg-gray-50 font-bold outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Account Holder</label>
                        <input type="text" value={manualAccountName} onChange={e => setManualAccountName(e.target.value)} placeholder="e.g. My SME Ltd" className="w-full p-3 text-sm border rounded-lg bg-gray-50 font-bold outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Account No.</label>
                        <input type="text" value={manualAccountNumber} onChange={e => setManualAccountNumber(e.target.value)} placeholder="10 Digits" className="w-full p-3 text-sm border rounded-lg bg-gray-50 font-bold outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                </div>
            )}
        </div>

        <div className="mb-10">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Terms & Notes</label>
            <textarea value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} rows={4} className="w-full p-4 border rounded-lg bg-gray-50 text-gray-900 shadow-sm focus:ring-2 focus:ring-primary-500 outline-none text-sm font-medium" placeholder="Project terms..."></textarea>
        </div>

        <div className="space-y-6">
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter border-b pb-4">Line Items</h3>
            {items.map((item, index) => (
                <div key={index} className="p-6 border rounded-xl space-y-4 bg-white shadow-sm border-gray-100">
                    <div className="flex gap-4 items-start">
                        <div className="flex-1">
                            <SearchableServiceSelect
                              label="Service / Product / Package"
                              services={services}
                              selectedServiceId={item.serviceId}
                              onSelectService={(srv) => handleSelectServiceForItem(index, srv)}
                              onCustomItemSelect={(customTerm) => handleCustomServiceForItem(index, customTerm)}
                              placeholder="Search line item, service, or package..."
                              allowCustomItem={true}
                            />
                        </div>
                        <button type="button" onClick={() => removeItem(index)} title="Remove Line Item" className="mt-6 p-3 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-black text-gray-400 uppercase">Description</label>
                        </div>
                        <textarea value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="w-full p-4 border rounded-lg text-sm bg-gray-50 text-gray-900 outline-none focus:ring-2 focus:ring-primary-500 font-medium" rows={2}></textarea>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Qty</label>
                            <input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))} className="w-full p-3 border rounded-lg bg-gray-50 text-gray-900 font-black text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Rate (₦)</label>
                            <input type="number" value={item.price} onChange={e => handleItemChange(index, 'price', Number(e.target.value))} className="w-full p-3 border rounded-lg bg-gray-50 text-gray-900 font-black text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Direct Cost (₦)</label>
                            <input type="number" value={item.directCost === undefined || item.directCost === 0 ? '' : item.directCost} onChange={e => handleItemChange(index, 'directCost', Number(e.target.value))} placeholder="0" className="w-full p-3 border rounded-lg bg-gray-50 text-gray-900 font-black text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Indirect Cost (₦)</label>
                            <input type="number" value={item.indirectCost === undefined || item.indirectCost === 0 ? '' : item.indirectCost} onChange={e => handleItemChange(index, 'indirectCost', Number(e.target.value))} placeholder="0" className="w-full p-3 border rounded-lg bg-gray-50 text-gray-900 font-black text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Discount (₦)</label>
                            <input type="number" value={item.discount || 0} onChange={e => handleItemChange(index, 'discount', Number(e.target.value))} className="w-full p-3 border rounded-lg bg-gray-50 text-gray-900 font-black text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Amount</label>
                            <div className="w-full p-3 bg-gray-100 rounded-lg font-black text-gray-800 text-sm">₦{((item.price * item.quantity) - (item.discount || 0)).toLocaleString()}</div>
                        </div>
                    </div>

                </div>
            ))}
            <button type="button" onClick={addItem} className="w-full py-5 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-black uppercase tracking-widest text-xs hover:border-primary-400 hover:text-primary-600 transition-all flex items-center justify-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                Add Line Item
            </button>
        </div>

        <div className="mt-12 flex justify-end">
            <div className="w-80 space-y-4 p-8 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex justify-between text-[10px] text-gray-400 font-black uppercase tracking-widest"><span>Subtotal</span><span className="text-gray-900">₦{subtotal.toLocaleString()}</span></div>
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Discount (₦)</label>
                    <input 
                        type="number" 
                        value={discount} 
                        onChange={e => setDiscount(Number(e.target.value))} 
                        className="w-full p-2 border rounded-lg bg-white text-gray-900 font-bold outline-none focus:ring-2 focus:ring-primary-500 text-right"
                        placeholder="0"
                    />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 font-black uppercase tracking-widest"><span>VAT (7.5%)</span><span className="text-gray-900">₦{tax.toLocaleString()}</span></div>
                <div className="flex justify-between border-t-2 border-gray-200 pt-5 font-black text-3xl text-primary-600 tracking-tighter"><span>Total Amount</span><span>₦{total.toLocaleString()}</span></div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-4 text-center">Settlement handled via Registry Updates</p>
            </div>
        </div>

        <div className="mt-12 flex flex-wrap justify-end gap-5">
            <button type="button" onClick={handleCancel} className="px-10 py-4 text-gray-400 hover:text-red-500 font-black uppercase tracking-widest text-xs">Cancel</button>
            <button type="button" onClick={() => setIsPreviewOpen(true)} disabled={!clientId} className="px-10 py-4 border-2 border-primary-600 text-primary-600 rounded-lg font-black uppercase tracking-widest text-xs hover:bg-primary-50">Preview</button>
            <button type="button" onClick={() => handleSaveInternal(initialInvoice?.status || InvoiceStatus.Draft)} className="px-10 py-4 border-2 border-gray-200 text-gray-600 rounded-lg font-black uppercase tracking-widest text-xs hover:bg-gray-50">
                {initialInvoice ? 'Update Record' : 'Save Draft'}
            </button>
            <button type="button" onClick={() => handleSaveInternal(InvoiceStatus.Sent)} className="px-12 py-5 bg-primary-600 text-white rounded-lg shadow-xl font-black uppercase tracking-widest text-xs hover:bg-primary-700">
                {initialInvoice ? 'Update & Relay' : 'Save & Relay'}
            </button>
        </div>

        {isPreviewOpen && selectedClient && company && (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
                <div className="bg-white w-full max-w-5xl h-[95vh] overflow-y-auto rounded-xl shadow-2xl relative animate-in zoom-in-95">
                    <div className="sticky top-0 bg-white/90 backdrop-blur-md p-6 border-b flex justify-between items-center z-10">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Secure Document Preview</span>
                        <button onClick={() => setIsPreviewOpen(false)} className="bg-red-50 text-red-600 px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-red-100">
                          Exit Preview
                        </button>
                    </div>
                    <div className="p-10 md:p-16">
                        <InvoiceDetail 
                            invoice={getPreviewData(initialInvoice?.status || InvoiceStatus.Sent)} 
                            client={selectedClient} 
                            services={services} 
                            company={company} 
                            onUpdateStatus={() => {}} 
                            onGenerateReceipt={() => {}} 
                            allTenantInvoices={[]} 
                            onEditInvoice={() => setIsPreviewOpen(false)} 
                            onViewPlainInvoice={(id, action) => { 
                                if (action === 'print') window.print();
                                else if (action === 'word') alert("Download available after saving.");
                            }} 
                            onViewTemplate={() => {}} 
                            onSendInvoice={async () => { alert("Please update before sending."); }} 
                            onSendReceipt={() => {}} 
                            onRecordPayment={async () => {}}
                        />
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default InvoiceForm;
