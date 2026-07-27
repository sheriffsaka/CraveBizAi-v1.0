
import React, { useState, useMemo } from 'react';
import { Client, Invoice, WorkspaceRole } from '../types';
import ClientFormModal from './ClientFormModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import Icon from './common/Icon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ClientListProps {
  companyId: string; // Added companyId
  clients: Client[];
  invoices?: Invoice[];
  userRole?: WorkspaceRole;
  onAddClient: (client: Omit<Client, 'id'>) => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient?: (clientId: string) => void;
}

type SortKey = 'companyName' | 'name' | 'email';
type SortDirection = 'asc' | 'desc';

const ClientsTable: React.FC<{
  clients: Client[];
  onEditClick: (client: Client) => void;
  onDeleteClick?: (client: Client) => void;
  userRole?: WorkspaceRole;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}> = ({ clients, onEditClick, onDeleteClick, userRole, sortKey, sortDirection, onSort }) => {
  const isOwner = userRole === 'Owner';

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('companyName')}>Company Name{getSortIcon('companyName')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>Contact Person{getSortIcon('name')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('email')}>Email{getSortIcon('email')}</th>
            <th scope="col" className="px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id} className="bg-white border-b hover:bg-gray-50">
              <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                {client.companyName}
              </th>
              <td className="px-6 py-4">{client.name}</td>
              <td className="px-6 py-4">{client.email}</td>
              <td className="px-6 py-4 text-right space-x-3">
                <a href="#" onClick={(e) => { e.preventDefault(); onEditClick(client); }} className="font-bold text-primary-600 hover:text-primary-800 uppercase text-[10px] tracking-widest transition-colors">Edit</a>
                {isOwner && onDeleteClick && (
                  <button 
                    onClick={() => onDeleteClick(client)} 
                    className="font-bold text-red-600 hover:text-red-800 uppercase text-[10px] tracking-widest transition-colors"
                    title="Workspace Owner Delete Action"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
          {clients.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center py-10 text-gray-500">No clients found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const ClientList: React.FC<ClientListProps> = ({ companyId, clients, invoices = [], userRole, onAddClient, onUpdateClient, onDeleteClient }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('companyName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleEditClick = (client: Client) => {
    setEditingClient(client);
  };

  const handleCloseFormModal = () => {
    setIsAddModalOpen(false);
    setEditingClient(null);
  };

  const handleSaveClient = (client: Client | Omit<Client, 'id'>) => {
    if ('id' in client && client.id) {
      onUpdateClient(client as Client);
    } else {
      onAddClient(client as Omit<Client, 'id'>);
    }
    handleCloseFormModal();
  };

  const filteredAndSortedClients = useMemo(() => {
    let filtered = clients.filter(client => 
      client.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0; // Should not happen with current sort keys
    });

    return filtered;
  }, [clients, searchTerm, sortKey, sortDirection]);

  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedClients.slice(startIndex, endIndex);
  }, [filteredAndSortedClients, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedClients.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const stats = useMemo(() => {
    let gmailCount = 0;
    let outlookCount = 0;
    let corporateCount = 0;
    let otherCount = 0;

    clients.forEach(c => {
      const email = c.email.toLowerCase();
      if (email.includes('@gmail.com')) {
        gmailCount++;
      } else if (email.includes('@outlook.com') || email.includes('@hotmail.com') || email.includes('@live.com')) {
        outlookCount++;
      } else if (email.includes('@yahoo.com') || email.includes('@ymail.com')) {
        otherCount++;
      } else {
        corporateCount++;
      }
    });

    const emailTypeData = [
      { name: 'Corporate Domain', value: corporateCount, color: '#10B981' },
      { name: 'Gmail Address', value: gmailCount, color: '#EF4444' },
      { name: 'Outlook / Hotmail', value: outlookCount, color: '#3B82F6' },
      { name: 'Yahoo / Others', value: otherCount, color: '#F59E0B' }
    ].filter(d => d.value > 0);

    const clientRevenueMap: Record<string, number> = {};
    const clientInvoiceCountMap: Record<string, number> = {};
    
    invoices.forEach(inv => {
      clientRevenueMap[inv.clientId] = (clientRevenueMap[inv.clientId] || 0) + inv.total;
      clientInvoiceCountMap[inv.clientId] = (clientInvoiceCountMap[inv.clientId] || 0) + 1;
    });

    const activeClientsCount = clients.filter(c => (clientInvoiceCountMap[c.id] || 0) > 0).length;
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const avgRevenue = clients.length > 0 ? totalRevenue / clients.length : 0;

    const topClientsData = clients
      .map(c => ({
        name: c.companyName || c.name || 'Client',
        revenue: clientRevenueMap[c.id] || 0,
        invoicesCount: clientInvoiceCountMap[c.id] || 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .filter(c => c.revenue > 0);

    return {
      totalClients: clients.length,
      corporateCount,
      publicCount: gmailCount + outlookCount + otherCount,
      emailTypeData,
      activeClientsCount,
      totalRevenue,
      avgRevenue,
      topClientsData
    };
  }, [clients, invoices]);

  return (
    <>
      <div className="space-y-6 mb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-3xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Client Accounts</p>
            <h3 className="text-2xl font-black text-gray-800">{stats.totalClients}</h3>
            <p className="text-4xs text-gray-400 mt-1">{stats.corporateCount} corporate domains registered</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-3xs font-black text-green-600 uppercase tracking-widest mb-1">Active Accounts</p>
            <h3 className="text-2xl font-black text-green-700">{stats.activeClientsCount}</h3>
            <p className="text-4xs text-green-500 mt-1">With active billing records</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-3xs font-black text-primary-500 uppercase tracking-widest mb-1">Total Invoice Value</p>
            <h3 className="text-2xl font-black text-primary-600">₦{stats.totalRevenue.toLocaleString()}</h3>
            <p className="text-4xs text-primary-400 mt-1">Sum of all billing events</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-3xs font-black text-purple-500 uppercase tracking-widest mb-1">Average Client value</p>
            <h3 className="text-2xl font-black text-purple-600">₦{Math.round(stats.avgRevenue).toLocaleString()}</h3>
            <p className="text-4xs text-purple-400 mt-1">Total revenue / client count</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Corporate domain demographics chart */}
          {clients.length > 0 && stats.emailTypeData.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Corporate Domain Demographics</h4>
                <p className="text-3xs text-gray-400 leading-relaxed mb-4">
                  Domain distribution used across contact profiles in this workspace.
                </p>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.emailTypeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="value" name="Contacts" radius={[6, 6, 0, 0]} maxBarSize={30}>
                      {stats.emailTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Clients by Revenue chart */}
          {clients.length > 0 && stats.topClientsData.length > 0 ? (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Top Clients Performance (₦)</h4>
                <p className="text-3xs text-gray-400 leading-relaxed mb-4">
                  Total revenue weight analysis of your highest billing customer accounts.
                </p>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topClientsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Billed Amount']} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="revenue" name="Total Billed" radius={[6, 6, 0, 0]} fill="#3B82F6" maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center min-h-[220px]">
              <Icon name="activity" className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No Billing History Recorded</p>
              <p className="text-4xs text-gray-400 mt-1">Issue client invoices to generate financial summaries</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 md:space-x-4">
              <h2 className="text-xl font-semibold">Clients</h2>
              <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Icon name="search" className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search clients..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    />
                </div>
                <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold shadow text-sm w-full md:w-auto">
                    + Add Client
                </button>
              </div>
          </div>
        <ClientsTable
          clients={paginatedClients}
          onEditClick={handleEditClick}
          onDeleteClick={(client) => setDeletingClient(client)}
          userRole={userRole}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        {totalPages > 1 && (
          <div className="p-4 border-t flex justify-center items-center space-x-2">
              <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  Previous
              </button>
              {[...Array(totalPages)].map((_, index) => (
                  <button
                      key={index}
                      onClick={() => handlePageChange(index + 1)}
                      className={`px-3 py-1 rounded-md ${currentPage === index + 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                      {index + 1}
                  </button>
              ))}
              <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  Next
              </button>
          </div>
        )}
      </div>
      <ClientFormModal 
        isOpen={isAddModalOpen || !!editingClient}
        onClose={handleCloseFormModal}
        onSaveClient={handleSaveClient}
        client={editingClient}
        companyId={companyId} // Passed companyId
      />

      {deletingClient && (
        <DeleteConfirmationModal
          isOpen={!!deletingClient}
          onClose={() => setDeletingClient(null)}
          onConfirm={async () => {
            if (deletingClient && onDeleteClient) {
              await onDeleteClient(deletingClient.id);
            }
          }}
          title="Delete Client Record"
          itemName={`${deletingClient.companyName} (${deletingClient.name})`}
          itemType="Client"
          warningText="This action is permanent and cannot be undone. All linked invoice histories and records will be preserved."
          impactText="Removing this client profile will un-link them from future invoice creation."
        />
      )}
    </>
  );
};

export default ClientList;