import React, { useState, useMemo } from 'react';
import { Client, Invoice, WorkspaceRole } from '../types';
import ClientFormModal from './ClientFormModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import Icon from './common/Icon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ClientListProps {
  companyId: string;
  clients: Client[];
  invoices?: Invoice[];
  userRole?: WorkspaceRole;
  onAddClient: (client: Omit<Client, 'id'>) => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient?: (clientId: string) => Promise<void> | void;
  onArchiveClient?: (client: Client) => Promise<void> | void;
  onRestoreClient?: (client: Client) => Promise<void> | void;
  onBulkArchiveClients?: (clientIds: string[]) => Promise<void> | void;
  onBulkRestoreClients?: (clientIds: string[]) => Promise<void> | void;
  onBulkDeleteClients?: (clientIds: string[]) => Promise<void> | void;
}

type SortKey = 'companyName' | 'name' | 'email';
type SortDirection = 'asc' | 'desc';
type FilterTab = 'active' | 'archived' | 'all';

const ClientsTable: React.FC<{
  clients: Client[];
  selectedClientIds: string[];
  onToggleSelectClient: (id: string) => void;
  onToggleSelectAll: () => void;
  onEditClick: (client: Client) => void;
  onArchiveClick?: (client: Client) => void;
  onRestoreClick?: (client: Client) => void;
  onDeleteClick?: (client: Client) => void;
  userRole?: WorkspaceRole;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}> = ({
  clients,
  selectedClientIds,
  onToggleSelectClient,
  onToggleSelectAll,
  onEditClick,
  onArchiveClick,
  onRestoreClick,
  onDeleteClick,
  userRole,
  sortKey,
  sortDirection,
  onSort
}) => {
  const isOwner = userRole === 'Owner';
  const allSelected = clients.length > 0 && clients.every(c => selectedClientIds.includes(c.id));

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
          <tr>
            <th scope="col" className="p-4 w-4">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
              />
            </th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('companyName')}>
              Company Name{getSortIcon('companyName')}
            </th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>
              Contact Person{getSortIcon('name')}
            </th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('email')}>
              Email{getSortIcon('email')}
            </th>
            <th scope="col" className="px-6 py-3">Status</th>
            <th scope="col" className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const isArchived = client.is_archived || client.status === 'Archived';
            const isSelected = selectedClientIds.includes(client.id);

            return (
              <tr key={client.id} className={`border-b hover:bg-gray-50 transition-colors ${isSelected ? 'bg-primary-50/30' : 'bg-white'}`}>
                <td className="w-4 p-4">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelectClient(client.id)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                  />
                </td>
                <th scope="row" className="px-6 py-4 font-bold text-gray-900 whitespace-nowrap">
                  {client.companyName}
                </th>
                <td className="px-6 py-4 font-medium text-gray-700">{client.name}</td>
                <td className="px-6 py-4 text-gray-600">{client.email}</td>
                <td className="px-6 py-4">
                  {isArchived ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      Archived
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button
                    onClick={() => onEditClick(client)}
                    className="font-bold text-primary-600 hover:text-primary-800 uppercase text-[10px] tracking-wider transition-colors"
                  >
                    Edit
                  </button>

                  {!isArchived && onArchiveClick && (
                    <button
                      onClick={() => onArchiveClick(client)}
                      className="font-bold text-amber-600 hover:text-amber-800 uppercase text-[10px] tracking-wider transition-colors ml-2"
                      title="Archive client (Preserves historical records)"
                    >
                      Archive
                    </button>
                  )}

                  {isArchived && onRestoreClick && (
                    <button
                      onClick={() => onRestoreClick(client)}
                      className="font-bold text-emerald-600 hover:text-emerald-800 uppercase text-[10px] tracking-wider transition-colors ml-2"
                      title="Restore client to active list"
                    >
                      Restore
                    </button>
                  )}

                  {isOwner && onDeleteClick && (
                    <button
                      onClick={() => onDeleteClick(client)}
                      className="font-bold text-red-600 hover:text-red-800 uppercase text-[10px] tracking-wider transition-colors ml-2"
                      title="Workspace Owner Delete Action"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {clients.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-10 text-gray-500 font-medium">
                No client records found for this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const ClientList: React.FC<ClientListProps> = ({
  companyId,
  clients,
  invoices = [],
  userRole,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
  onArchiveClient,
  onRestoreClient,
  onBulkArchiveClients,
  onBulkRestoreClients,
  onBulkDeleteClients
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [dependencyLockedClient, setDependencyLockedClient] = useState<{ client: Client; invoiceCount: number } | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
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

  const activeClients = useMemo(() => clients.filter(c => !c.is_archived && c.status !== 'Archived' && c.status !== 'Deleted'), [clients]);
  const archivedClients = useMemo(() => clients.filter(c => c.is_archived || c.status === 'Archived'), [clients]);

  const displayedClientsByTab = useMemo(() => {
    if (activeTab === 'active') return activeClients;
    if (activeTab === 'archived') return archivedClients;
    return clients.filter(c => c.status !== 'Deleted');
  }, [activeTab, activeClients, archivedClients, clients]);

  const filteredAndSortedClients = useMemo(() => {
    let filtered = displayedClientsByTab.filter(client =>
      client.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const valA = a[sortKey] || '';
      const valB = b[sortKey] || '';
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    return filtered;
  }, [displayedClientsByTab, searchTerm, sortKey, sortDirection]);

  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedClients.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedClients, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedClients.length / itemsPerPage);

  const handleToggleSelectClient = (id: string) => {
    setSelectedClientIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const currentTabIds = paginatedClients.map(c => c.id);
    const allSelected = currentTabIds.every(id => selectedClientIds.includes(id));
    if (allSelected) {
      setSelectedClientIds(prev => prev.filter(id => !currentTabIds.includes(id)));
    } else {
      setSelectedClientIds(prev => Array.from(new Set([...prev, ...currentTabIds])));
    }
  };

  const handleDeleteAttempt = (client: Client) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
    if (clientInvoices.length > 0) {
      setDependencyLockedClient({ client, invoiceCount: clientInvoices.length });
    } else {
      setDeletingClient(client);
    }
  };

  const stats = useMemo(() => {
    let gmailCount = 0;
    let outlookCount = 0;
    let corporateCount = 0;
    let otherCount = 0;

    activeClients.forEach(c => {
      const email = c.email.toLowerCase();
      if (email.includes('@gmail.com')) gmailCount++;
      else if (email.includes('@outlook.com') || email.includes('@hotmail.com') || email.includes('@live.com')) outlookCount++;
      else if (email.includes('@yahoo.com') || email.includes('@ymail.com')) otherCount++;
      else corporateCount++;
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

    const activeBillingClientsCount = activeClients.filter(c => (clientInvoiceCountMap[c.id] || 0) > 0).length;
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const avgRevenue = activeClients.length > 0 ? totalRevenue / activeClients.length : 0;

    const topClientsData = activeClients
      .map(c => ({
        name: c.companyName || c.name || 'Client',
        revenue: clientRevenueMap[c.id] || 0,
        invoicesCount: clientInvoiceCountMap[c.id] || 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .filter(c => c.revenue > 0);

    return {
      totalClients: activeClients.length,
      archivedClientsCount: archivedClients.length,
      corporateCount,
      publicCount: gmailCount + outlookCount + otherCount,
      emailTypeData,
      activeBillingClientsCount,
      totalRevenue,
      avgRevenue,
      topClientsData
    };
  }, [activeClients, archivedClients, invoices]);

  return (
    <>
      <div className="space-y-6 mb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Active Client Accounts</p>
            <h3 className="text-2xl font-black text-gray-800">{stats.totalClients}</h3>
            <p className="text-[11px] text-gray-400 mt-1">{stats.corporateCount} corporate domains registered</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Archived Accounts</p>
            <h3 className="text-2xl font-black text-amber-700">{stats.archivedClientsCount}</h3>
            <p className="text-[11px] text-amber-500 mt-1">Preserved for audit trail</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest mb-1">Total Invoice Value</p>
            <h3 className="text-2xl font-black text-primary-600">₦{stats.totalRevenue.toLocaleString()}</h3>
            <p className="text-[11px] text-primary-400 mt-1">Sum of all billing events</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1">Average Client Value</p>
            <h3 className="text-2xl font-black text-purple-600">₦{Math.round(stats.avgRevenue).toLocaleString()}</h3>
            <p className="text-[11px] text-purple-400 mt-1">Total revenue / client count</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {activeClients.length > 0 && stats.emailTypeData.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Corporate Domain Demographics</h4>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
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

          {activeClients.length > 0 && stats.topClientsData.length > 0 ? (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-2">Top Clients Performance (₦)</h4>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
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
              <p className="text-xs text-gray-400 mt-1">Issue client invoices to generate financial summaries</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
        {/* Header & Tabs */}
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Client Directory</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage active and archived client profiles with audit preservation</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => { setActiveTab('active'); setCurrentPage(1); setSelectedClientIds([]); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Active ({activeClients.length})
              </button>
              <button
                onClick={() => { setActiveTab('archived'); setCurrentPage(1); setSelectedClientIds([]); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'archived' ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Archived ({archivedClients.length})
              </button>
              <button
                onClick={() => { setActiveTab('all'); setCurrentPage(1); setSelectedClientIds([]); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                All ({clients.length})
              </button>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-sm text-xs transition-colors flex items-center space-x-1"
            >
              <span>+ Add Client</span>
            </button>
          </div>
        </div>

        {/* Search & Bulk Action Bar */}
        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon name="search" className="w-4 h-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by company or name..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          {selectedClientIds.length > 0 && (
            <div className="flex items-center space-x-2 bg-primary-50 px-3 py-1.5 rounded-xl border border-primary-200">
              <span className="text-xs font-bold text-primary-800">
                {selectedClientIds.length} Selected
              </span>

              {activeTab !== 'archived' && onBulkArchiveClients && (
                <button
                  onClick={async () => {
                    await onBulkArchiveClients(selectedClientIds);
                    setSelectedClientIds([]);
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  Bulk Archive
                </button>
              )}

              {activeTab === 'archived' && onBulkRestoreClients && (
                <button
                  onClick={async () => {
                    await onBulkRestoreClients(selectedClientIds);
                    setSelectedClientIds([]);
                  }}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  Bulk Restore
                </button>
              )}

              {userRole === 'Owner' && onBulkDeleteClients && (
                <button
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete ${selectedClientIds.length} selected client(s)?`)) {
                      await onBulkDeleteClients(selectedClientIds);
                      setSelectedClientIds([]);
                    }
                  }}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  Bulk Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <ClientsTable
          clients={paginatedClients}
          selectedClientIds={selectedClientIds}
          onToggleSelectClient={handleToggleSelectClient}
          onToggleSelectAll={handleToggleSelectAll}
          onEditClick={handleEditClick}
          onArchiveClick={onArchiveClient ? (c) => onArchiveClient(c) : undefined}
          onRestoreClick={onRestoreClient ? (c) => onRestoreClient(c) : undefined}
          onDeleteClick={handleDeleteAttempt}
          userRole={userRole}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={(key) => {
            if (sortKey === key) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            else { setSortKey(key); setSortDirection('asc'); }
          }}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
            <span className="text-xs font-medium text-gray-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-white border border-gray-200 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-white border border-gray-200 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ClientFormModal
        isOpen={isAddModalOpen || !!editingClient}
        onClose={handleCloseFormModal}
        onSaveClient={handleSaveClient}
        client={editingClient}
        companyId={companyId}
      />

      {/* Dependency Lock Modal */}
      {dependencyLockedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-200">
            <div className="flex items-center space-x-3 text-amber-600 mb-4">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Icon name="alert-triangle" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  Financial Audit Lock
                </span>
                <h3 className="text-base font-bold text-gray-900 mt-1">
                  Hard Deletion Blocked
                </h3>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed mb-4">
              Client <strong className="text-gray-900">{dependencyLockedClient.client.companyName}</strong> is linked to{' '}
              <strong className="text-amber-700">{dependencyLockedClient.invoiceCount}</strong> existing financial invoice(s).
              To preserve accounting integrity and compliance records, hard deletion is restricted.
            </p>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-xs text-amber-900 mb-6 font-medium">
              💡 <strong>Recommended Action:</strong> Archive this client. Archived clients are hidden from active dropdowns while preserving historical invoices.
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setDependencyLockedClient(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 rounded-xl"
              >
                Cancel
              </button>
              {onArchiveClient && (
                <button
                  onClick={async () => {
                    await onArchiveClient(dependencyLockedClient.client);
                    setDependencyLockedClient(null);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
                >
                  Archive Client Instead
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hard Delete Confirmation Modal */}
      {deletingClient && (
        <DeleteConfirmationModal
          isOpen={!!deletingClient}
          onClose={() => setDeletingClient(null)}
          onConfirm={async () => {
            if (deletingClient && onDeleteClient) {
              await onDeleteClient(deletingClient.id);
            }
            setDeletingClient(null);
          }}
          title="Delete Client Record"
          itemName={`${deletingClient.companyName} (${deletingClient.name})`}
          itemType="Client"
          warningText="This action will permanently delete this client record from the database."
          impactText="Ensure no outstanding operations rely on this client account before proceeding."
        />
      )}
    </>
  );
};

export default ClientList;