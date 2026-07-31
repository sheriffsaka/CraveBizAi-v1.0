
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { InvoiceStatus, Invoice, Client, Service } from '../types';
import StatCard from './StatCard';
import InvoiceList from './InvoiceList';
import { Page } from '../App';
import { api } from '../lib/api';
import { getSubscriptionInfo } from '../services/subscriptionService';
import GlobalFilterBar from './GlobalFilterBar';
import {
  GlobalFilterState,
  loadGlobalFilterFromSession,
  saveGlobalFilterToSession,
  filterInvoices,
  DEFAULT_GLOBAL_FILTER,
  isFilterActive
} from '../lib/globalFilter';
import { Search, RotateCcw, Users, Briefcase, CheckCircle, FileText } from 'lucide-react';

const DashboardIcon = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

interface DashboardProps {
    invoices: Invoice[];
    clients: Client[];
    services?: Service[];
    activeTenantId?: string;
    setActivePage: (page: Page) => void;
    onViewInvoice: (invoiceId: string) => void;
    onEditInvoice: (invoiceId: string) => void;
    onGenerateRenewal: (clientId: string, item: any) => Promise<void>;
    globalFilter?: GlobalFilterState;
    onFilterChange?: (filter: GlobalFilterState) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
    invoices,
    clients,
    services = [],
    activeTenantId,
    setActivePage,
    onViewInvoice,
    onEditInvoice,
    onGenerateRenewal,
    globalFilter,
    onFilterChange
}) => {
    const [invoiceUsage, setInvoiceUsage] = React.useState<{ totalQuota: number; remainingCount: number; createdCount: number; resetDate: string } | null>(null);
    const [receiptUsage, setReceiptUsage] = React.useState<{ totalQuota: number; remainingCount: number; createdCount: number; resetDate: string } | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = React.useState<boolean>(false);

    // Filter state fallback
    const [internalFilter, setInternalFilter] = React.useState<GlobalFilterState>(() => loadGlobalFilterFromSession());
    const currentFilter = globalFilter || internalFilter;

    const handleFilterChange = (newFilter: GlobalFilterState) => {
        if (onFilterChange) {
            onFilterChange(newFilter);
        } else {
            setInternalFilter(newFilter);
            saveGlobalFilterToSession(newFilter);
        }
    };

    // Filtered invoices subset according to active Global Filter
    const filteredInvoices = useMemo(() => {
        return filterInvoices(invoices, services, clients, currentFilter);
    }, [invoices, services, clients, currentFilter]);

    React.useEffect(() => {
        let isMounted = true;
        const loadUsage = async () => {
            setIsLoadingUsage(true);
            try {
                const sub = getSubscriptionInfo(activeTenantId || '');
                const invData = await api.getInvoiceUsage(activeTenantId, sub.tier);
                const recData = await api.getReceiptUsage(activeTenantId, sub.tier);
                if (isMounted) {
                    if (invData) setInvoiceUsage(invData);
                    if (recData) setReceiptUsage(recData);
                }
            } catch (e) {
                console.warn("Error fetching document usage in Dashboard:", e);
            } finally {
                if (isMounted) setIsLoadingUsage(false);
            }
        };

        loadUsage();

        const handleSubChange = () => { loadUsage(); };
        window.addEventListener('cravebiz_subscription_change', handleSubChange);
        return () => {
            isMounted = false;
            window.removeEventListener('cravebiz_subscription_change', handleSubChange);
        };
    }, [activeTenantId]);

    // Calculate real revenue data for the chart (last 6 months) using filteredInvoices
    const calculatedTrendData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const last6 = [];
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            last6.push({
                month: d.getMonth(),
                year: d.getFullYear(),
                name: months[d.getMonth()],
                revenue: 0
            });
        }

        filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid).forEach(inv => {
            const invDate = new Date(inv.issueDate);
            const m = invDate.getMonth();
            const y = invDate.getFullYear();
            const match = last6.find(d => d.month === m && d.year === y);
            if (match) {
                match.revenue += Number(inv.total);
            }
        });

        return last6;
    }, [filteredInvoices]);

    const { totalRevenue, totalDirectCost, grossProfit, profitMarginPct, paidCount } = useMemo(() => {
        let rev = 0;
        let cost = 0;
        let pCount = 0;

        filteredInvoices.forEach(inv => {
            if (inv.status === InvoiceStatus.Paid) {
                pCount++;
                const invRev = Number(inv.total || 0);
                rev += invRev;

                if (inv.items && inv.items.length > 0) {
                    inv.items.forEach(item => {
                        const qty = Number(item.quantity) || 1;
                        const matchingSrv = services.find(s => s.id === item.serviceId || s.name.toLowerCase() === (item.description || '').toLowerCase());
                        const itemDc = item.directCost !== undefined && item.directCost !== null ? Number(item.directCost) : -1;
                        const srvDc = Number(matchingSrv?.directCost || 0);
                        const unitDc = itemDc >= 0 ? itemDc : srvDc;
                        cost += unitDc * qty;
                    });
                }
            }
        });

        const profit = rev - cost;
        const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;
        return {
            totalRevenue: rev,
            totalDirectCost: cost,
            grossProfit: profit,
            profitMarginPct: margin,
            paidCount: pCount
        };
    }, [filteredInvoices, services]);

    const outstanding = useMemo(() => filteredInvoices
        .filter(inv => inv.status === InvoiceStatus.Sent || inv.status === InvoiceStatus.Overdue)
        .reduce((sum, inv) => sum + (inv.total - (inv.amountPaid || 0)), 0), [filteredInvoices]);
    
    const overdue = useMemo(() => filteredInvoices
        .filter(inv => inv.status === InvoiceStatus.Overdue)
        .reduce((sum, inv) => sum + (inv.total - (inv.amountPaid || 0)), 0), [filteredInvoices]);

    // Filtered Client Registry
    const filteredClients = useMemo(() => {
        if (currentFilter.selectedClientIds.length > 0) {
            return clients.filter(c => currentFilter.selectedClientIds.includes(c.id));
        }
        // Unique client IDs present in filteredInvoices
        const activeClientIds = new Set(filteredInvoices.map(i => i.clientId));
        if (activeClientIds.size > 0) {
            return clients.filter(c => activeClientIds.has(c.id));
        }
        return clients;
    }, [clients, filteredInvoices, currentFilter]);

    // Filtered Services Count
    const filteredServicesCount = useMemo(() => {
        if (currentFilter.selectedServiceIds.length > 0) {
            return currentFilter.selectedServiceIds.length;
        }
        const activeServiceIds = new Set<string>();
        filteredInvoices.forEach(i => {
            i.items?.forEach(item => {
                if (item.serviceId) activeServiceIds.add(item.serviceId);
            });
        });
        return activeServiceIds.size > 0 ? activeServiceIds.size : services.length;
    }, [services, filteredInvoices, currentFilter]);

    const expiringServices = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const expiring: any[] = [];
        
        filteredInvoices.forEach(inv => {
            if (!inv.items) return;
            inv.items.forEach(item => {
                if (item.periodEndDate) {
                    const endDate = new Date(item.periodEndDate);
                    endDate.setHours(0, 0, 0, 0);
                    const diffTime = endDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays <= 30) {
                        const client = clients.find(c => c.id === inv.clientId);
                        expiring.push({
                            id: `${inv.id}-${item.serviceId}-${item.periodEndDate}`,
                            clientId: inv.clientId,
                            clientName: client?.companyName || 'Unknown Client',
                            serviceName: item.description.split('\n')[0] || 'Service',
                            expiryDate: item.periodEndDate,
                            daysLeft: diffDays,
                            status: diffDays < 0 ? 'Expired' : diffDays <= 7 ? 'Expiring Soon' : 'Active',
                            item: item
                        });
                    }
                }
            });
        });
        
        // Remove duplicates
        const unique = expiring.reduce((acc: any[], curr) => {
            const exists = acc.find(a => a.clientId === curr.clientId && a.serviceName === curr.serviceName && a.expiryDate === curr.expiryDate);
            if (!exists) acc.push(curr);
            return acc;
        }, []);

        return unique.sort((a, b) => a.daysLeft - b.daysLeft);
    }, [filteredInvoices, clients]);

    const [isGeneratingRenewal, setIsGeneratingRenewal] = React.useState<string | null>(null);

    const handleRenewalClick = async (clientId: string, item: any) => {
        setIsGeneratingRenewal(item.id);
        try {
            await onGenerateRenewal(clientId, item);
        } finally {
            setIsGeneratingRenewal(null);
        }
    };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">Command Center</h1>
        <p className="text-gray-500 mt-1 font-medium">Synchronized workspace overview and performance metrics.</p>
      </div>

      {/* Global Filter Bar */}
      <GlobalFilterBar
        filter={currentFilter}
        onFilterChange={handleFilterChange}
        clients={clients}
        services={services}
        totalInvoicesCount={invoices.length}
        filteredInvoicesCount={filteredInvoices.length}
        title="Dashboard Global Filter"
        description="Filter total revenue, clients, expiring services, and revenue trajectory in real-time"
      />

      {/* Primary KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Revenue" 
          value={`₦${totalRevenue.toLocaleString()}`} 
          change={`${paidCount} Paid Invoices`} 
          changeType="increase"
          icon={<DashboardIcon d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />}
        />
        <StatCard 
          title="Gross Profit" 
          value={`₦${grossProfit.toLocaleString()}`} 
          change={`${profitMarginPct}% Margin (Cost: ₦${totalDirectCost.toLocaleString()})`} 
          changeType="increase"
          icon={<DashboardIcon d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />}
        />
        <StatCard 
          title="Outstanding" 
          value={`₦${outstanding.toLocaleString()}`} 
          icon={<DashboardIcon d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>}
        />
        <StatCard 
          title="Overdue" 
          value={`₦${overdue.toLocaleString()}`}
          changeType="decrease"
          icon={<DashboardIcon d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z M12 8v4 M12 16h.01" />}
        />
      </div>

      {/* No Data Found banner if filter returns 0 records */}
      {filteredInvoices.length === 0 && isFilterActive(currentFilter) && (
        <div className="bg-white p-8 rounded-xl shadow-xl border border-gray-100 text-center py-12 space-y-3">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto border border-amber-100">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">No Matching Records Found</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">None of your invoices or metrics match the current combination of Date, Client, or Service filters.</p>
          <button
            onClick={() => handleFilterChange(DEFAULT_GLOBAL_FILTER)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md cursor-pointer inline-flex items-center space-x-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Active Filters</span>
          </button>
        </div>
      )}

      {/* Document Usage Quotas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-900 to-indigo-950 p-6 rounded-xl shadow-xl text-white relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Invoice Quota</span>
              <h3 className="text-2xl font-black mt-1">
                {invoiceUsage ? `${invoiceUsage.remainingCount} / ${invoiceUsage.totalQuota}` : 'Loading...'}
              </h3>
              <p className="text-xs text-blue-200/80 mt-1">
                Invoices Remaining ({invoiceUsage?.createdCount || 0} created)
              </p>
            </div>
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md">
              <svg className="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          {invoiceUsage && (
            <div className="mt-4">
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-400 h-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, (invoiceUsage.remainingCount / invoiceUsage.totalQuota) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-blue-300/70 mt-2 text-right">
                Resets: {new Date(invoiceUsage.resetDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-teal-950 p-6 rounded-xl shadow-xl text-white relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Receipt Quota</span>
              <h3 className="text-2xl font-black mt-1">
                {receiptUsage ? `${receiptUsage.remainingCount} / ${receiptUsage.totalQuota}` : 'Loading...'}
              </h3>
              <p className="text-xs text-emerald-200/80 mt-1">
                Receipts Remaining ({receiptUsage?.createdCount || 0} issued)
              </p>
            </div>
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md">
              <svg className="w-6 h-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          {receiptUsage && (
            <div className="mt-4">
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-emerald-400 h-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, (receiptUsage.remainingCount / receiptUsage.totalQuota) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-emerald-300/70 mt-2 text-right">
                Resets: {new Date(receiptUsage.resetDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-8">
            <div className="bg-white p-8 rounded-xl shadow-2xl border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Revenue Trajectory</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={calculatedTrendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={(value) => `₦${(value/1000).toFixed(0)}k`} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 900}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                formatter={(value: number) => [`₦${value.toLocaleString()}`, "Revenue"]}
                                cursor={{fill: 'rgba(37, 99, 235, 0.05)'}}
                                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}}
                            />
                            <Bar dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-2xl border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Expiring Services Intelligence</h3>
                    <span className="bg-primary-50 text-primary-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">AI Monitoring Active</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-gray-50">
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Client</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Service</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Expiry</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                <th className="pb-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {expiringServices.map((exp) => (
                                <tr key={exp.id} className="group hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4">
                                        <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{exp.clientName}</p>
                                    </td>
                                    <td className="py-4">
                                        <p className="text-xs font-bold text-gray-500 truncate max-w-[150px]">{exp.serviceName}</p>
                                    </td>
                                    <td className="py-4">
                                        <p className="text-xs font-black text-gray-700">{new Date(exp.expiryDate).toLocaleDateString()}</p>
                                    </td>
                                    <td className="py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            exp.daysLeft < 0 ? 'bg-red-50 text-red-600' : 
                                            exp.daysLeft <= 7 ? 'bg-yellow-50 text-yellow-600' : 
                                            'bg-green-50 text-green-600'
                                        }`}>
                                            {exp.status}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right">
                                        <button 
                                            onClick={() => handleRenewalClick(exp.clientId, exp.item)}
                                            disabled={isGeneratingRenewal === exp.id}
                                            className="bg-primary-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
                                        >
                                            {isGeneratingRenewal === exp.id ? 'Analyzing...' : 'Renew'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {expiringServices.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-10 text-center italic text-gray-400 text-sm font-bold">No services expiring within 30 days.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-2xl border border-gray-100">
             <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Client Registry</h3>
             <ul className="space-y-6">
                {filteredClients.slice(0, 4).map((client) => (
                    <li key={client.id} className="flex items-center space-x-4 p-4 rounded-xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100">
                         <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center text-white font-black text-lg shadow-lg shrink-0">
                            {client.companyName ? client.companyName[0].toUpperCase() : 'C'}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="font-black text-gray-900 text-sm truncate uppercase tracking-tight">{client.companyName}</p>
                            <p className="text-gray-400 text-xs font-bold truncate">{client.email}</p>
                        </div>
                    </li>
                ))}
                {filteredClients.length === 0 && <li className="text-center py-10 italic text-gray-400 text-sm font-bold">No active clients match current filters.</li>}
             </ul>
        </div>
      </div>
      
      <div>
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Recent Documents</h3>
            <button onClick={() => setActivePage('invoices')} className="bg-gray-50 px-6 py-2 rounded-xl font-black text-primary-600 uppercase tracking-widest text-[10px] hover:bg-primary-50 transition-all border border-gray-100 cursor-pointer">
                Audit Trail
            </button>
        </div>
        <InvoiceList invoices={filteredInvoices} clients={clients} services={services} limit={5} onViewInvoice={onViewInvoice} onEditInvoice={onEditInvoice} globalFilter={currentFilter} onFilterChange={handleFilterChange} />
      </div>

    </div>
  );
};

export default Dashboard;