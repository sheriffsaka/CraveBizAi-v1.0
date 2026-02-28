
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { InvoiceStatus, Invoice, Client } from '../types';
import StatCard from './StatCard';
import InvoiceList from './InvoiceList';
import { Page } from '../App';

const DashboardIcon = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

interface DashboardProps {
    invoices: Invoice[];
    clients: Client[];
    setActivePage: (page: Page) => void;
    onViewInvoice: (invoiceId: string) => void;
    onEditInvoice: (invoiceId: string) => void;
    onGenerateRenewal: (clientId: string, item: any) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({invoices, clients, setActivePage, onViewInvoice, onEditInvoice, onGenerateRenewal}) => {
    // Calculate real revenue data for the chart (last 6 months)
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

        invoices.filter(inv => inv.status === InvoiceStatus.Paid).forEach(inv => {
            const invDate = new Date(inv.issueDate);
            const m = invDate.getMonth();
            const y = invDate.getFullYear();
            const match = last6.find(d => d.month === m && d.year === y);
            if (match) {
                match.revenue += Number(inv.total);
            }
        });

        return last6;
    }, [invoices]);

    const totalRevenue = useMemo(() => invoices
        .filter(inv => inv.status === InvoiceStatus.Paid)
        .reduce((sum, inv) => sum + inv.total, 0), [invoices]);

    const outstanding = useMemo(() => invoices
        .filter(inv => inv.status === InvoiceStatus.Sent || inv.status === InvoiceStatus.Overdue)
        .reduce((sum, inv) => sum + (inv.total - (inv.amountPaid || 0)), 0), [invoices]);
    
    const overdue = useMemo(() => invoices
        .filter(inv => inv.status === InvoiceStatus.Overdue)
        .reduce((sum, inv) => sum + (inv.total - (inv.amountPaid || 0)), 0), [invoices]);

    const expiringServices = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const expiring: any[] = [];
        
        invoices.forEach(inv => {
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
        
        // Remove duplicates (if multiple invoices have same service period)
        const unique = expiring.reduce((acc: any[], curr) => {
            const exists = acc.find(a => a.clientId === curr.clientId && a.serviceName === curr.serviceName && a.expiryDate === curr.expiryDate);
            if (!exists) acc.push(curr);
            return acc;
        }, []);

        return unique.sort((a, b) => a.daysLeft - b.daysLeft);
    }, [invoices, clients]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          title="Total Revenue" 
          value={`₦${totalRevenue.toLocaleString()}`} 
          change="Real-time" 
          changeType="increase"
          icon={<DashboardIcon d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />}
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Revenue Trajectory</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
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

            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
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
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
             <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Client Registry</h3>
             <ul className="space-y-6">
                {clients.slice(0, 4).map((client, index) => (
                    <li key={client.id} className="flex items-center space-x-4 p-4 rounded-2xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100">
                         <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
                            {client.companyName[0].toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="font-black text-gray-900 text-sm truncate uppercase tracking-tight">{client.companyName}</p>
                            <p className="text-gray-400 text-xs font-bold truncate">{client.email}</p>
                        </div>
                    </li>
                ))}
                {clients.length === 0 && <li className="text-center py-10 italic text-gray-400 text-sm font-bold">No active clients in vault.</li>}
             </ul>
        </div>
      </div>
      
      <div>
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Recent Documents</h3>
            <button onClick={() => setActivePage('invoices')} className="bg-gray-50 px-6 py-2 rounded-xl font-black text-primary-600 uppercase tracking-widest text-[10px] hover:bg-primary-50 transition-all border border-gray-100">
                Audit Trail
            </button>
        </div>
        <InvoiceList invoices={invoices} clients={clients} limit={5} onViewInvoice={onViewInvoice} onEditInvoice={onEditInvoice} />
      </div>

    </div>
  );
};

export default Dashboard;