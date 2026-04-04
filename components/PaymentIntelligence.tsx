
import React, { useMemo, useState } from 'react';
import { Invoice, Client, InvoiceStatus } from '../types';
import StatCard from './StatCard';
import Icon from './common/Icon';
import { generateClientPaymentHealthReport } from '../services/aiGenerationService';

interface PaymentIntelligenceProps {
  invoices: Invoice[];
  clients: Client[];
}

const PaymentIntelligence: React.FC<PaymentIntelligenceProps> = ({ invoices, clients }) => {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Get last 12 months for the timeline
  const months = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({
        name: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        month: d.getMonth(),
        key: `${d.getFullYear()}-${d.getMonth()}`
      });
    }
    return result;
  }, []);

  const clientMatrix = useMemo(() => {
    return clients.map(client => {
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
      
      const monthlyStatus = months.map(m => {
        const monthStart = new Date(m.year, m.month, 1);
        const monthEnd = new Date(m.year, m.month + 1, 0);
        const now = new Date();

        // Find all invoices that cover this month
        const applicableInvoices = clientInvoices.filter(inv => {
          // 1. Check item periods (most accurate)
          const hasItemCoverage = inv.items?.some(item => {
            if (!item.periodStartDate || !item.periodEndDate) return false;
            const start = new Date(item.periodStartDate);
            const end = new Date(item.periodEndDate);
            return start <= monthEnd && end >= monthStart;
          });

          if (hasItemCoverage) return true;

          // 2. Fallback to issueDate if no item periods are defined at all for the invoice
          const anyItemHasPeriod = inv.items?.some(item => item.periodStartDate && item.periodEndDate);
          if (!anyItemHasPeriod) {
            const issueDate = new Date(inv.issueDate);
            return issueDate.getFullYear() === m.year && issueDate.getMonth() === m.month;
          }

          return false;
        });

        let status: 'paid' | 'unpaid' | 'overdue' | 'none' = 'none';
        if (applicableInvoices.length > 0) {
          const hasOverdue = applicableInvoices.some(inv => 
            inv.status === InvoiceStatus.Overdue || 
            (inv.status !== InvoiceStatus.Paid && inv.status !== InvoiceStatus.Draft && new Date(inv.dueDate) < now)
          );
          const hasUnpaid = applicableInvoices.some(inv => inv.status !== InvoiceStatus.Paid && inv.status !== InvoiceStatus.Draft);
          const hasPaid = applicableInvoices.some(inv => inv.status === InvoiceStatus.Paid);

          if (hasOverdue) status = 'overdue';
          else if (hasUnpaid) status = 'unpaid';
          else if (hasPaid) status = 'paid';
        }

        return { ...m, status };
      });

      const totalPaid = clientInvoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
      
      const totalOutstanding = clientInvoices
        .filter(inv => inv.status !== InvoiceStatus.Paid && inv.status !== InvoiceStatus.Draft)
        .reduce((sum, inv) => sum + Math.max(0, inv.total - (inv.amountPaid || 0)), 0);

      const isPaidAhead = monthlyStatus.some((m, idx) => {
        const now = new Date();
        const monthDate = new Date(m.year, m.month, 1);
        return monthDate > now && m.status === 'paid';
      });

      const isOverdue = monthlyStatus.some(m => m.status === 'overdue');

      return {
        client,
        monthlyStatus,
        totalPaid,
        totalOutstanding,
        isPaidAhead,
        isOverdue
      };
    });
  }, [clients, invoices, months]);

  const stats = useMemo(() => {
    const paidAhead = clientMatrix.filter(c => c.isPaidAhead).length;
    const overdueCount = clientMatrix.filter(c => c.isOverdue).length;
    const dueThisMonth = clientMatrix.filter(c => {
        const now = new Date();
        const thisMonth = c.monthlyStatus.find(m => m.month === now.getMonth() && m.year === now.getFullYear());
        return thisMonth?.status === 'unpaid';
    }).length;
    const totalOutstanding = clientMatrix.reduce((sum, c) => sum + c.totalOutstanding, 0);

    return { paidAhead, overdueCount, dueThisMonth, totalOutstanding };
  }, [clientMatrix]);

  const handleAnalyze = async (clientId: string) => {
    const clientData = clientMatrix.find(c => c.client.id === clientId);
    if (!clientData) return;

    setIsAnalyzing(true);
    setSelectedClientId(clientId);
    setAiReport(null);

    try {
      const report = await generateClientPaymentHealthReport(clientId, clientData.monthlyStatus);
      setAiReport(report);
    } catch (e) {
      setAiReport("Failed to generate report.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Client', ...months.map(m => `${m.name} ${m.year}`), 'Total Paid', 'Outstanding'];
    const rows = clientMatrix.map(c => [
      c.client.companyName,
      ...c.monthlyStatus.map(m => m.status.toUpperCase()),
      c.totalPaid,
      c.totalOutstanding
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `payment_intelligence_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">Payment Intelligence</h1>
          <p className="text-gray-500 mt-1 font-medium">Visual mapping of client coverage and payment health.</p>
        </div>
        <button 
            onClick={exportCSV}
            className="bg-white border-2 border-gray-100 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2"
        >
            <Icon name="reports" className="w-4 h-4" />
            Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Paid Ahead" value={stats.paidAhead.toString()} change="Clients" changeType="increase" icon={<Icon name="dashboard" />} />
        <StatCard title="Due This Month" value={stats.dueThisMonth.toString()} change="Clients" changeType="decrease" icon={<Icon name="invoices" />} />
        <StatCard title="Overdue" value={stats.overdueCount.toString()} change="Clients" changeType="decrease" icon={<Icon name="reports" />} />
        <StatCard title="Total Outstanding" value={`₦${stats.totalOutstanding.toLocaleString()}`} change="Across Vault" changeType="decrease" icon={<Icon name="clients" />} />
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Payment & Coverage Matrix</h3>
            <div className="flex gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400">Paid</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400">Unpaid</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400">Overdue</span>
                </div>
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="p-6 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest sticky left-0 bg-gray-50 z-10">Client</th>
                {months.map(m => (
                  <th key={m.key} className="p-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[80px]">
                    {m.name}<br/>{m.year}
                  </th>
                ))}
                <th className="p-6 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientMatrix.map(c => (
                <tr key={c.client.id} className="hover:bg-gray-50/30 transition-colors group">
                  <td className="p-6 sticky left-0 bg-white group-hover:bg-gray-50/30 z-10 border-r border-gray-50">
                    <p className="font-black text-gray-900 uppercase tracking-tight text-sm">{c.client.companyName}</p>
                    <p className="text-[10px] font-bold text-gray-400">₦{c.totalPaid.toLocaleString()} Total Paid</p>
                  </td>
                  {c.monthlyStatus.map(m => (
                    <td key={m.key} className="p-4 text-center">
                      <div className={`w-8 h-8 mx-auto rounded-xl flex items-center justify-center transition-all transform hover:scale-110 ${
                        m.status === 'paid' ? 'bg-green-100 text-green-600' :
                        m.status === 'unpaid' ? 'bg-yellow-100 text-yellow-600' :
                        m.status === 'overdue' ? 'bg-red-100 text-red-600' :
                        'bg-gray-50 text-gray-200'
                      }`}>
                        {m.status === 'paid' && <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        {m.status === 'unpaid' && <div className="w-2 h-2 rounded-full bg-current"></div>}
                        {m.status === 'overdue' && <span className="font-black text-[10px]">!</span>}
                        {m.status === 'none' && <div className="w-1 h-1 rounded-full bg-current"></div>}
                      </div>
                    </td>
                  ))}
                  <td className="p-6 text-right">
                    <button 
                        onClick={() => handleAnalyze(c.client.id)}
                        disabled={isAnalyzing && selectedClientId === c.client.id}
                        className="p-2 rounded-xl bg-primary-50 text-primary-600 hover:bg-primary-600 hover:text-white transition-all disabled:opacity-50"
                        title="AI Health Report"
                    >
                        <svg className={`w-5 h-5 ${isAnalyzing && selectedClientId === c.client.id ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClientId && aiReport && (
        <div className="bg-primary-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-800 rounded-full -mr-32 -mt-32 opacity-50 blur-3xl"></div>
            <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">AI Payment Health Report</h3>
                    <p className="text-primary-300 font-bold text-sm">Intelligence for {clientMatrix.find(c => c.client.id === selectedClientId)?.client.companyName}</p>
                </div>
                <button onClick={() => setAiReport(null)} className="text-primary-400 hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="prose prose-invert max-w-none relative z-10">
                <p className="text-lg leading-relaxed font-medium text-primary-50 whitespace-pre-wrap">{aiReport}</p>
            </div>
            <div className="mt-10 flex gap-4 relative z-10">
                <button className="bg-white text-primary-900 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-primary-50 transition-all">Execute Suggested Action</button>
                <button className="bg-primary-800 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-primary-700 transition-all border border-primary-700">Dismiss Intelligence</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default PaymentIntelligence;
