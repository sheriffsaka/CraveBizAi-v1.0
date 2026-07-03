
import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Company, User, AllTenantsData, InvoiceStatus, TenantData } from '../types';
import StatCard from './StatCard';
import Icon from './common/Icon';
import { generateTextResponse } from '../services/aiGenerationService';
import CompanyDetailModal from './CompanyDetailModal';
import EditUserModal from './EditUserModal';

interface AdminDashboardProps {
  allTenantData: AllTenantsData;
  companies: Company[];
  users: User[];
  onUpdateCompany: (companyId: string, details: Partial<Company>) => Promise<void>;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateUser: (userId: string, details: Partial<User>) => Promise<void>;
}

const AdminDashboardIcon = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const CompaniesTable: React.FC<{
  companies: Company[];
  onViewDetails: (company: Company) => void;
  sortKey: 'name' | 'email' | 'users' | 'invoices' | 'revenue';
  sortDirection: 'asc' | 'desc';
  onSort: (key: 'name' | 'email' | 'users' | 'invoices' | 'revenue') => void;
  allTenantData: AllTenantsData;
  users: User[];
}> = ({ companies, onViewDetails, sortKey, sortDirection, onSort, allTenantData, users }) => {
  const getSortIcon = (key: string) => (sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null);

  const getCompanyStats = (companyId: string) => {
    const tenantUsers = users.filter(u => u.tenantIds.includes(companyId));
    const tenantInvoices = allTenantData[companyId]?.invoices || [];
    const tenantRevenue = tenantInvoices.filter(inv => inv.status === InvoiceStatus.Paid).reduce((sum, inv) => sum + inv.total, 0);
    return {
      userCount: tenantUsers.length,
      invoiceCount: tenantInvoices.length,
      revenue: tenantRevenue,
    };
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>Company Name{getSortIcon('name')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('email')}>Email{getSortIcon('email')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('users')}>Users{getSortIcon('users')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('invoices')}>Invoices{getSortIcon('invoices')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('revenue')}>Revenue{getSortIcon('revenue')}</th>
            <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const stats = getCompanyStats(company.id);
            return (
              <tr key={company.id} className="bg-white border-b hover:bg-gray-50">
                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{company.name}</th>
                <td className="px-6 py-4">{company.email}</td>
                <td className="px-6 py-4">{stats.userCount}</td>
                <td className="px-6 py-4">{stats.invoiceCount}</td>
                <td className="px-6 py-4">₦{stats.revenue.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => onViewDetails(company)} className="font-medium text-primary-600 hover:underline">View Details</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const UsersTable: React.FC<{
  users: User[];
  onEditUser: (user: User) => void;
  sortKey: 'name' | 'email' | 'tenantCount' | 'isAdmin' | 'status';
  sortDirection: 'asc' | 'desc';
  onSort: (key: 'name' | 'email' | 'tenantCount' | 'isAdmin' | 'status') => void;
}> = ({ users, onEditUser, sortKey, sortDirection, onSort }) => {
  const getSortIcon = (key: string) => (sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>Name{getSortIcon('name')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('email')}>Email{getSortIcon('email')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('tenantCount')}>Tenants{getSortIcon('tenantCount')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('isAdmin')}>Type{getSortIcon('isAdmin')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('status')}>Status{getSortIcon('status')}</th>
            <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
              <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{user.name}</th>
              <td className="px-6 py-4">{user.email}</td>
              <td className="px-6 py-4">{user.tenantIds?.length || 0}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
                  {user.isAdmin ? 'Admin' : 'User'}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {user.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => onEditUser(user)} className="font-medium text-primary-600 hover:underline">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ allTenantData, companies, users, onUpdateCompany, onDeleteCompany, onUpdateUser }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'users' | 'reports'>('overview');

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  const stats = useMemo(() => {
    const tenantValues = Object.values(allTenantData) as TenantData[];
    const totalInvoices = tenantValues.reduce((sum, t) => sum + (t.invoices?.length || 0), 0);
    const totalRevenue = tenantValues.reduce((sum, t) => 
      sum + (t.invoices?.filter(i => i.status === InvoiceStatus.Paid).reduce((s, i) => s + i.total, 0) || 0), 0);
    const pendingRevenue = tenantValues.reduce((sum, t) => 
      sum + (t.invoices?.filter(i => i.status !== InvoiceStatus.Paid).reduce((s, i) => s + i.total, 0) || 0), 0);
    
    // Monthly revenue data for charts
    const monthlyData: { [key: string]: number } = {};
    tenantValues.forEach(t => {
      t.invoices?.forEach(inv => {
        if (inv.status === InvoiceStatus.Paid) {
          const month = inv.issueDate.substring(0, 7); // YYYY-MM
          monthlyData[month] = (monthlyData[month] || 0) + inv.total;
        }
      });
    });

    const chartData = Object.keys(monthlyData).sort().map(month => ({
      name: month,
      revenue: monthlyData[month]
    }));

    return { totalInvoices, totalRevenue, pendingRevenue, chartData };
  }, [allTenantData]);

  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const insight = await generateTextResponse(`Admin Query: ${query}. Context: ${companies.length} companies, ${users.length} users, ${stats.totalInvoices} invoices, Total Revenue: ₦${stats.totalRevenue}.`, 'gemini-3-flash-preview', "You are a Platform Admin Analyst.");
      setResponse(insight);
    } catch (err) {
      setResponse("Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Companies" value={companies.length.toString()} icon={<AdminDashboardIcon d="M3 21h18M3 7v14M21 7v14M6 21V3h12v18M9 7h1m-1 4h1m-1 4h1m4-12h1m-1 4h1m-1 4h1" />} />
          <StatCard title="Total Users" value={users.length.toString()} icon={<AdminDashboardIcon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />} />
          <StatCard title="Total Invoices" value={stats.totalInvoices.toString()} icon={<AdminDashboardIcon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />} />
          <StatCard title="Transaction Volume" value={`₦${stats.totalRevenue.toLocaleString()}`} icon={<AdminDashboardIcon d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
            <h3 className="text-lg font-black mb-6 uppercase tracking-tighter">Revenue Growth</h3>
            <div className="h-64">
              {stats.chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} tickFormatter={(v: number) => `₦${(v/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={4} dot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                  No revenue data yet
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
            <h3 className="text-lg font-black mb-6 uppercase tracking-tighter">Company Distribution</h3>
            <div className="h-64">
              {stats.chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                  No data yet
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
          <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-3">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              AI Platform Intelligence
          </h3>
          <form onSubmit={handleAskAI} className="flex gap-4">
            <input value={query} onChange={e => setQuery(e.target.value)} className="flex-1 border-2 border-gray-100 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 transition-all font-medium" placeholder="Analyze platform growth or revenue trends..." />
            <button className="bg-primary-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-primary-700 transition-all active:scale-95 disabled:bg-gray-300" disabled={loading}>{loading ? 'Consulting...' : 'Run Analysis'}</button>
          </form>
          {response && <div className="mt-6 p-6 bg-primary-50 rounded-2xl border border-primary-100 text-sm font-medium leading-relaxed italic text-primary-900 animate-in slide-in-from-top-4">{response}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
           <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">System Console</h1>
           <p className="text-gray-500 text-sm">Managing {companies.length} SME nodes across the vault.</p>
        </div>
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          <button onClick={() => setActiveTab('overview')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'overview' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Overview</button>
          <button onClick={() => setActiveTab('companies')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'companies' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Companies</button>
          <button onClick={() => setActiveTab('users')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Users</button>
          <button onClick={() => setActiveTab('reports')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Reports</button>
        </div>
      </div>

      {activeTab === 'overview' && renderOverview()}

      {activeTab === 'companies' && (
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b font-black uppercase text-xs tracking-widest text-gray-400 bg-gray-50/50">Company Registry</div>
          <CompaniesTable 
            companies={companies} 
            onViewDetails={(c) => { setSelectedCompany(c); setIsCompanyModalOpen(true); }} 
            sortKey="name" 
            sortDirection="asc" 
            onSort={() => {}} 
            allTenantData={allTenantData} 
            users={users} 
          />
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b font-black uppercase text-xs tracking-widest text-gray-400 bg-gray-50/50">User Access Management</div>
          <UsersTable 
            users={users} 
            onEditUser={(u) => { setSelectedUser(u); setIsUserModalOpen(true); }} 
            sortKey="name" 
            sortDirection="asc" 
            onSort={() => {}} 
          />
        </div>
      )}

      {isCompanyModalOpen && selectedCompany && (
        <CompanyDetailModal 
          isOpen={isCompanyModalOpen}
          onClose={() => setIsCompanyModalOpen(false)}
          company={selectedCompany}
          users={users.filter(u => u.tenantIds.includes(selectedCompany.id))}
          onUpdateCompanyDetails={onUpdateCompany}
          onDeleteCompany={onDeleteCompany}
        />
      )}

      {isUserModalOpen && selectedUser && (
        <EditUserModal 
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          user={selectedUser}
          onUpdateUser={onUpdateUser}
        />
      )}

      {activeTab === 'reports' && (
        <div className="space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Revenue</p>
                  <h4 className="text-3xl font-black text-emerald-900 tracking-tighter">₦{stats.totalRevenue.toLocaleString()}</h4>
              </div>
              <div className="bg-orange-50 p-8 rounded-[2rem] border border-orange-100">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Pending Invoices</p>
                  <h4 className="text-3xl font-black text-orange-900 tracking-tighter">₦{stats.pendingRevenue.toLocaleString()}</h4>
              </div>
              <div className="bg-blue-50 p-8 rounded-[2rem] border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Total SME Nodes</p>
                  <h4 className="text-3xl font-black text-blue-900 tracking-tighter">{companies.length}</h4>
              </div>
           </div>
           
           <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-gray-100">
              <h3 className="text-xl font-black mb-8 uppercase tracking-tighter">Platform Financial Performance</h3>
              <div className="h-96">
                {stats.chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} tickFormatter={(v: number) => `₦${(v/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Revenue']}
                      />
                      <Bar dataKey="revenue" fill="#2563eb" radius={[15, 15, 0, 0]} barSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 italic">
                    Insufficient data for financial reporting
                  </div>
                )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};


export default AdminDashboard;
