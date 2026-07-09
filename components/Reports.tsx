
import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, PieChart, Pie, Cell, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import StatCard from './StatCard';
import { Invoice, Client, Service, InvoiceStatus } from '../types';
import { generateTextResponse } from '../services/aiGenerationService';

// Helper to convert data to CSV string
const convertToCsv = (data: any[], headers: string[]): string => {
  const csvRows = [];
  csvRows.push(headers.join(',')); // Add header row

  for (const row of data) {
    const values = headers.map(header => {
      let value = row[header];
      if (typeof value === 'string' && value.includes(',')) {
        value = `"${value}"`; // Quote if contains comma
      }
      return value;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
};

// Helper to download CSV
const downloadCsv = (csvString: string, filename: string) => {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};


const ReportsIcon = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

interface ReportsProps {
    invoices: Invoice[];
    clients: Client[];
    services: Service[];
}

type DateRange = 'all_time' | 'last_30_days' | 'this_quarter' | 'this_year';

const Reports: React.FC<ReportsProps> = ({invoices, clients, services}) => {
    const [reportQuery, setReportQuery] = useState('');
    const [aiReportResponse, setAiReportResponse] = useState<string | null>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange>('all_time');

    const isInvoiceInDateRange = useCallback((invoice: Invoice, startDate: Date | null, endDate: Date | null) => {
        const invoiceDate = new Date(invoice.issueDate);
        if (startDate && invoiceDate < startDate) return false;
        if (endDate && invoiceDate > endDate) return false;
        return true;
    }, []);

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        let start: Date | null = null;
        let end: Date | null = now;

        switch (dateRange) {
            case 'last_30_days':
                start = new Date(now);
                start.setDate(now.getDate() - 30);
                break;
            case 'this_quarter':
                const currentMonth = now.getMonth();
                const quarterStartMonth = currentMonth - (currentMonth % 3);
                start = new Date(now.getFullYear(), quarterStartMonth, 1);
                break;
            case 'this_year':
                start = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                start = null; 
                end = null;
                break;
        }
        return { startDate: start, endDate: end };
    }, [dateRange]);

    const filteredInvoices = useMemo(() => {
      if (dateRange === 'all_time') return invoices;
      return invoices.filter(inv => isInvoiceInDateRange(inv, startDate, endDate));
    }, [invoices, dateRange, startDate, endDate, isInvoiceInDateRange]);

    const totalRevenue = useMemo(() => filteredInvoices
        .filter(inv => inv.status === InvoiceStatus.Paid)
        .reduce((sum, inv) => sum + inv.total, 0), [filteredInvoices]);

    const trendData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const last6 = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            last6.push({ month: d.getMonth(), year: d.getFullYear(), name: months[d.getMonth()], revenue: 0 });
        }
        filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).forEach(inv => {
            const invDate = new Date(inv.issueDate);
            const m = invDate.getMonth();
            const y = invDate.getFullYear();
            const match = last6.find(d => d.month === m && d.year === y);
            if (match) match.revenue += Number(inv.total);
        });
        return last6;
    }, [filteredInvoices]);

    const paidInvoicesCount = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).length;
    const overdueInvoicesCount = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Overdue).length;
    const sentInvoicesCount = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Sent).length;
    const draftInvoicesCount = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Draft).length;
    const totalInvoicesOverall = filteredInvoices.length;

    const invoiceStatusData = [
        { name: 'Paid', value: paidInvoicesCount },
        { name: 'Overdue', value: overdueInvoicesCount },
        { name: 'Sent', value: sentInvoicesCount },
        { name: 'Draft', value: draftInvoicesCount },
    ];
    
    const COLORS = { 'Paid': '#22c55e', 'Overdue': '#ef4444', 'Sent': '#3b82f6', 'Draft': '#6b7280' };

    const revenueByService = useMemo(() => {
      const serviceRevenueMap = new Map<string, number>();
      filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).forEach(invoice => {
        invoice.items.forEach(item => {
          const service = services.find(s => s.id === item.serviceId);
          if (service) {
            const currentRevenue = serviceRevenueMap.get(service.name) || 0;
            serviceRevenueMap.set(service.name, currentRevenue + (item.price * item.quantity));
          }
        });
      });
      return Array.from(serviceRevenueMap.entries())
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue);
    }, [filteredInvoices, services]);

    const averageInvoiceValueOverTime = useMemo(() => {
      const monthlyDataMap = new Map<string, { total: number, count: number }>();
      filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).forEach(invoice => {
        const monthYear = new Date(invoice.issueDate).toLocaleString('en-US', { year: 'numeric', month: 'short' });
        const currentData = monthlyDataMap.get(monthYear) || { total: 0, count: 0 };
        monthlyDataMap.set(monthYear, { total: currentData.total + invoice.total, count: currentData.count + 1 });
      });
      return Array.from(monthlyDataMap.entries())
        .map(([name, data]) => ({ name, avgValue: data.total / data.count }))
        .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
    }, [filteredInvoices]);

    const averagePaymentTermDays = useMemo(() => {
        const paidInvoicesInDateRange = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid);
        if (paidInvoicesInDateRange.length === 0) return 0;
        const totalDays = paidInvoicesInDateRange.reduce((sum, invoice) => {
            const issue = new Date(invoice.issueDate);
            const due = new Date(invoice.dueDate);
            const diffTime = Math.abs(due.getTime() - issue.getTime());
            return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }, 0);
        return Math.round(totalDays / paidInvoicesInDateRange.length);
    }, [filteredInvoices]);

    const clientLifetimeValue = useMemo(() => {
      const clientLTVMap = new Map<string, number>();
      filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).forEach(invoice => {
        const client = clients.find(c => c.id === invoice.clientId);
        if (client) {
          const currentLTV = clientLTVMap.get(client.companyName) || 0;
          clientLTVMap.set(client.companyName, currentLTV + invoice.total);
        }
      });
      return Array.from(clientLTVMap.entries())
        .map(([companyName, totalRevenue]) => ({ companyName, totalRevenue }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
    }, [filteredInvoices, clients]);

    const invoiceConversionRates = useMemo(() => {
        const total = filteredInvoices.length;
        const paid = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).length;
        const sent = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Sent).length;
        const overdue = filteredInvoices.filter(inv => inv.status === InvoiceStatus.Overdue).length;
        const sentOrPaid = sent + paid + overdue;
        const draftToSent = total > 0 ? ((sentOrPaid) / total) * 100 : 0; 
        const sentToPaid = sentOrPaid > 0 ? (paid / sentOrPaid) * 100 : 0;
        const totalPaidRate = total > 0 ? (paid / total) * 100 : 0;
        return { total, draftToSent, sentToPaid, totalPaidRate, drafts: draftInvoicesCount, sent, paid, overdue };
    }, [filteredInvoices, draftInvoicesCount]);

    const overdueAgingData = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const ageGroups = {
            '1-30 Days': { count: 0, amount: 0 },
            '31-60 Days': { count: 0, amount: 0 },
            '61-90 Days': { count: 0, amount: 0 },
            '90+ Days': { count: 0, amount: 0 },
        };
        filteredInvoices.filter(inv => inv.status === InvoiceStatus.Overdue).forEach(invoice => {
            const dueDate = new Date(invoice.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 1 && diffDays <= 30) { ageGroups['1-30 Days'].count++; ageGroups['1-30 Days'].amount += invoice.total; }
            else if (diffDays >= 31 && diffDays <= 60) { ageGroups['31-60 Days'].count++; ageGroups['31-60 Days'].amount += invoice.total; }
            else if (diffDays >= 61 && diffDays <= 90) { ageGroups['61-90 Days'].count++; ageGroups['61-90 Days'].amount += invoice.total; }
            else if (diffDays > 90) { ageGroups['90+ Days'].count++; ageGroups['90+ Days'].amount += invoice.total; }
        });
        return Object.entries(ageGroups).map(([label, data]) => ({ label, ...data }));
    }, [filteredInvoices]);

    const handleGenerateReportAI = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reportQuery.trim() || isLoadingReport) return;
        setIsLoadingReport(true);
        setAiReportResponse(null);
        try {
            const dataDump = `Filtered by ${dateRange}. Total Revenue: ₦${totalRevenue.toLocaleString()}. Invoices: ${totalInvoicesOverall}. Paid: ${paidInvoicesCount}. Aging: ${overdueAgingData.map(d => `${d.label}: ₦${d.amount}`).join(', ')}`;
            const prompt = `Based on the following data, answer: "${reportQuery}". Data: ${dataDump}`;
            const response = await generateTextResponse(prompt, 'gemini-3-pro-preview', "Platform Financial Analyst.");
            setAiReportResponse(response);
        } catch (error) {
            setAiReportResponse("AI service disrupted. Please retry.");
        } finally {
            setIsLoadingReport(false);
        }
    };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">Vault Analytics</h1>
        <p className="text-gray-500 mt-1 font-medium">Deep financial intelligence gathered from SME operations.</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6 print-hidden">
        <div className="flex items-center space-x-4">
          <label htmlFor="dateRange" className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Temporal Context:</label>
          <select
            id="dateRange"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-4 py-2 border-2 border-gray-100 rounded-xl focus:border-primary-500 outline-none text-xs font-black uppercase tracking-widest bg-white"
          >
            <option value="all_time">Archive</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="this_quarter">Current Quarter</option>
            <option value="this_year">Current Fiscal Year</option>
          </select>
        </div>

        <button
          id="export-ledger-btn"
          onClick={() => {
            const csvData = filteredInvoices.map(inv => ({
              id: inv.id,
              clientName: clients.find(c => c.id === inv.clientId)?.companyName || 'Unknown',
              total: inv.total,
              status: inv.status,
              issueDate: inv.issueDate,
              dueDate: inv.dueDate,
            }));
            const csvString = convertToCsv(csvData, ['id', 'clientName', 'total', 'status', 'issueDate', 'dueDate']);
            downloadCsv(csvString, `CraveBiZ_Financials_${dateRange}_${Date.now()}.csv`);
          }}
          className="bg-slate-900 text-white hover:bg-slate-850 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Data Ledger (CSV)
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 transition-shadow">
          <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter flex items-center gap-3">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              AI Performance Analysis
          </h3>
          <form onSubmit={handleGenerateReportAI} className="space-y-6">
              <textarea
                  id="reportQuery"
                  value={reportQuery}
                  onChange={e => setReportQuery(e.target.value)}
                  rows={2}
                  className="w-full px-6 py-4 border-2 border-gray-100 rounded-2xl outline-none focus:border-primary-500 font-medium bg-gray-50/30"
                  placeholder="Ask a specific financial question about this period..."
                  disabled={isLoadingReport}
              ></textarea>
              <div className="flex justify-end">
                  <button type="submit" className="bg-primary-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-primary-700 transition-all disabled:bg-gray-300 cursor-pointer" disabled={isLoadingReport || !reportQuery.trim()}>
                      {isLoadingReport ? "Analyzing..." : "Query Database"}
                  </button>
              </div>
          </form>
          {aiReportResponse && (
              <div className="mt-8 p-6 bg-primary-50 rounded-2xl border border-primary-100 text-sm font-medium leading-relaxed italic text-primary-900 animate-in slide-in-from-top-4">
                  {aiReportResponse}
              </div>
          )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Computed Revenue" value={`₦${totalRevenue.toLocaleString()}`} icon={<ReportsIcon d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />} />
        <StatCard title="Audit Count" value={totalInvoicesOverall.toString()} icon={<ReportsIcon d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />} />
        <StatCard title="Average Payment Term" value={`${averagePaymentTermDays} Days`} icon={<ReportsIcon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />} />
        <StatCard title="Client Nodes" value={clients.length.toString()} icon={<ReportsIcon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Temporal Revenue Trend</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: 'rgba(37, 99, 235, 0.05)'}} />
                <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Status Distribution</h3>
           <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                    <Pie data={invoiceStatusData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name" label>
                        {invoiceStatusData.map((entry) => (
                            <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Client Lifetime Value (LTV)</h3>
          {clientLifetimeValue.length > 0 ? (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={clientLifetimeValue.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                  <YAxis dataKey="companyName" type="category" tick={{fill: '#4b5563', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} width={120} />
                  <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "LTV"]} />
                  <Bar dataKey="totalRevenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400 italic font-bold">No Client Transactions Located</div>
          )}
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Service Revenue Contribution</h3>
          {revenueByService.length > 0 ? (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={revenueByService} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} fill="#8884d8" dataKey="revenue" nameKey="name" label={(entry) => `${entry.name}: ₦${(entry.value/1000).toFixed(0)}k`}>
                    {revenueByService.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `₦${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400 italic font-bold">No Service Revenue History</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
          <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Outstanding / Overdue Aging Bracket</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={overdueAgingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Outstanding Amount"]} />
                <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Pipeline Conversion & Ticket Sizes</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-black uppercase text-gray-500">Draft ➔ Dispatch Rate</span>
                  <span className="text-xs font-black text-primary-600">{invoiceConversionRates.draftToSent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-primary-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, invoiceConversionRates.draftToSent)}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-black uppercase text-gray-500">Dispatch ➔ Settlement Rate</span>
                  <span className="text-xs font-black text-emerald-600">{invoiceConversionRates.sentToPaid.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, invoiceConversionRates.sentToPaid)}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-black uppercase text-gray-500">Global Ledger Pay-through Rate</span>
                  <span className="text-xs font-black text-indigo-600">{invoiceConversionRates.totalPaidRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, invoiceConversionRates.totalPaidRate)}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider mb-3">Average Invoice Ticket size</h4>
            {averageInvoiceValueOverTime.length > 0 ? (
              <div style={{ width: '100%', height: 120 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={averageInvoiceValueOverTime}>
                    <XAxis dataKey="name" tick={{fill: '#9ca3af', fontSize: 8, fontWeight: 900}} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Avg Value"]} />
                    <Line type="monotone" dataKey="avgValue" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <span className="text-xs font-bold text-gray-400 italic">No historical timeline dataset.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
