
import React, { useState, useMemo } from 'react';
import { Invoice, Client, Service, InvoiceStatus } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import GlobalFilterBar from './GlobalFilterBar';
import {
  GlobalFilterState,
  loadGlobalFilterFromSession,
  saveGlobalFilterToSession,
  filterInvoices,
  DEFAULT_GLOBAL_FILTER,
  isFilterActive
} from '../lib/globalFilter';

interface InvoiceListProps {
  invoices: Invoice[];
  clients: Client[];
  services?: Service[];
  limit?: number; // Optional limit for displaying a subset (e.g., on dashboard)
  onViewInvoice: (invoiceId: string) => void;
  onEditInvoice?: (invoiceId: string) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
  onBulkDeleteInvoices?: (invoiceIds: string[]) => Promise<void> | void;
  onToggleArchive?: (invoice: Invoice) => Promise<void> | void;
  onBulkArchiveInvoices?: (invoices: Invoice[], targetStatus?: 'archived' | 'active') => Promise<void> | void;
  globalFilter?: GlobalFilterState;
  onFilterChange?: (filter: GlobalFilterState) => void;
}

type SortKey = 'invoiceNumber' | 'clientName' | 'issueDate' | 'dueDate' | 'total' | 'balance' | 'status';
type SortDirection = 'asc' | 'desc';

const InvoicesTable: React.FC<{
  invoices: Invoice[];
  clients: Client[];
  onViewInvoice: (invoiceId: string) => void;
  onEditInvoice?: (invoiceId: string) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
  onToggleArchive?: (invoice: Invoice) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
}> = ({
  invoices,
  clients,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onToggleArchive,
  sortKey,
  sortDirection,
  onSort,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected = false
}) => {
  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || 'Unknown Client';
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const handleDelete = (e: React.MouseEvent, id: string, number: string) => {
    e.stopPropagation();
    if (onDeleteInvoice && window.confirm(`Are you sure you want to delete invoice ${number}? This action cannot be undone.`)) {
      onDeleteInvoice(id);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            {onToggleSelectAll && (
              <th scope="col" className="p-4 w-10">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected && invoices.length > 0}
                    onChange={onToggleSelectAll}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                  />
                </div>
              </th>
            )}
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('invoiceNumber')}>Invoice ID{getSortIcon('invoiceNumber')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('clientName')}>Client{getSortIcon('clientName')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('dueDate')}>Due Date{getSortIcon('dueDate')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('total')}>Amount{getSortIcon('total')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('balance')}>Outstanding{getSortIcon('balance')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('status')}>Status{getSortIcon('status')}</th>
            <th scope="col" className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => {
            const rawBalance = invoice.total - (invoice.amountPaid || 0);
            const isPaid = invoice.status === InvoiceStatus.Paid || rawBalance <= 0.001;
            const balance = isPaid ? 0 : Math.max(0, rawBalance);
            const statusToDisplay = isPaid ? InvoiceStatus.Paid : invoice.status;
            const isSelected = selectedIds.includes(invoice.id);
            const isArchived = invoice.recurringStatus === 'archived';

            return (
              <tr key={invoice.id} className={`border-b hover:bg-gray-50 group transition-colors ${isSelected ? 'bg-primary-50/50' : 'bg-white'}`}>
                {onToggleSelect && (
                  <td className="p-4 w-10">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(invoice.id)}
                        className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                      />
                    </div>
                  </td>
                )}
                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap flex items-center gap-2">
                  <span>{invoice.invoiceNumber}</span>
                  {isArchived && (
                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-gray-200 text-gray-600 border border-gray-300">
                      Archived
                    </span>
                  )}
                </th>
                <td className="px-6 py-4">{getClientName(invoice.clientId)}</td>
                <td className="px-6 py-4">{invoice.dueDate}</td>
                <td className="px-6 py-4 font-medium">₦{invoice.total.toLocaleString()}</td>
                <td className={`px-6 py-4 font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₦{balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4">
                  <InvoiceStatusBadge status={statusToDisplay} />
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button onClick={() => onViewInvoice(invoice.id)} className="font-bold text-primary-600 hover:text-primary-800 transition-colors uppercase text-[10px] tracking-widest">View</button>
                  {onEditInvoice && !isArchived && (
                      <button onClick={() => onEditInvoice(invoice.id)} className="font-bold text-amber-600 hover:text-amber-800 transition-colors uppercase text-[10px] tracking-widest">Edit</button>
                  )}
                  {onToggleArchive && (
                    <button
                      onClick={() => onToggleArchive(invoice)}
                      className={`font-bold transition-colors uppercase text-[10px] tracking-widest ${isArchived ? 'text-green-600 hover:text-green-800' : 'text-amber-700 hover:text-amber-900'}`}
                    >
                      {isArchived ? 'Restore' : 'Archive'}
                    </button>
                  )}
                  {onDeleteInvoice && (
                      <button onClick={(e) => handleDelete(e, invoice.id, invoice.invoiceNumber)} className="font-bold text-red-600 hover:text-red-800 transition-colors uppercase text-[10px] tracking-widest">Delete</button>
                  )}
                </td>
              </tr>
            );
          })}
           {invoices.length === 0 && (
              <tr>
                  <td colSpan={onToggleSelectAll ? 8 : 7} className="text-center py-10 text-gray-500">No invoices found.</td>
              </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};


const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  clients,
  services = [],
  limit,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onBulkDeleteInvoices,
  onToggleArchive,
  onBulkArchiveInvoices,
  globalFilter,
  onFilterChange
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const itemsPerPage = limit || 10; 

  const [internalFilter, setInternalFilter] = useState<GlobalFilterState>(() => loadGlobalFilterFromSession());
  const currentFilter = globalFilter || internalFilter;

  const handleFilterChange = (newFilter: GlobalFilterState) => {
    if (onFilterChange) {
      onFilterChange(newFilter);
    } else {
      setInternalFilter(newFilter);
      saveGlobalFilterToSession(newFilter);
    }
  };

  const getClientNameById = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || 'Unknown Client';
  };

  const globallyFilteredInvoices = useMemo(() => {
    return filterInvoices(invoices, services, clients, currentFilter);
  }, [invoices, services, clients, currentFilter]);

  const nonTemplateInvoices = useMemo(() => {
    return globallyFilteredInvoices.filter(inv => !inv.isRecurringTemplate);
  }, [globallyFilteredInvoices]);

  const tabFilteredInvoices = useMemo(() => {
    if (activeTab === 'archived') {
      return nonTemplateInvoices.filter(inv => inv.recurringStatus === 'archived');
    }
    return nonTemplateInvoices.filter(inv => inv.recurringStatus !== 'archived');
  }, [nonTemplateInvoices, activeTab]);

  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = tabFilteredInvoices.filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getClientNameById(invoice.clientId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.status.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortKey) {
        case 'invoiceNumber':
          valA = a.invoiceNumber;
          valB = b.invoiceNumber;
          break;
        case 'clientName':
          valA = getClientNameById(a.clientId);
          valB = getClientNameById(b.clientId);
          break;
        case 'issueDate':
        case 'dueDate':
          valA = new Date(a[sortKey]).getTime();
          valB = new Date(b[sortKey]).getTime();
          break;
        case 'total':
          valA = a.total;
          valB = b.total;
          break;
        case 'balance':
          valA = a.total - (a.amountPaid || 0);
          valB = b.total - (b.amountPaid || 0);
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        default:
          valA = a.issueDate;
          valB = b.issueDate;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return filtered;
  }, [tabFilteredInvoices, clients, searchTerm, sortKey, sortDirection]);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedInvoices.slice(startIndex, endIndex);
  }, [filteredAndSortedInvoices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedInvoices.length / itemsPerPage);

  const visibleInvoices = limit ? tabFilteredInvoices.slice(0, limit) : paginatedInvoices;

  const isAllSelected = useMemo(() => {
    if (visibleInvoices.length === 0) return false;
    return visibleInvoices.every(inv => selectedIds.includes(inv.id));
  }, [visibleInvoices, selectedIds]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const visibleSet = new Set(visibleInvoices.map(i => i.id));
      setSelectedIds(prev => prev.filter(id => !visibleSet.has(id)));
    } else {
      const visibleIds = visibleInvoices.map(i => i.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected invoice(s)? This action cannot be undone.`)) return;

    setIsProcessingBulk(true);
    try {
      if (onBulkDeleteInvoices) {
        await onBulkDeleteInvoices(selectedIds);
      } else if (onDeleteInvoice) {
        for (const id of selectedIds) {
          await onDeleteInvoice(id);
        }
      }
      setSelectedIds([]);
    } catch (e) {
      console.error("Bulk delete error:", e);
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.length === 0) return;
    const actionLabel = activeTab === 'archived' ? 'restore' : 'archive';
    const targetStatus = activeTab === 'archived' ? 'active' : 'archived';
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${selectedIds.length} selected invoice(s)?`)) return;

    setIsProcessingBulk(true);
    try {
      const selectedInvoices = invoices.filter(i => selectedIds.includes(i.id));
      if (onBulkArchiveInvoices) {
        await onBulkArchiveInvoices(selectedInvoices, targetStatus);
      } else if (onToggleArchive) {
        for (const inv of selectedInvoices) {
          await onToggleArchive(inv);
        }
      }
      setSelectedIds([]);
    } catch (e) {
      console.error("Bulk archive error:", e);
    } finally {
      setIsProcessingBulk(false);
    }
  };

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
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let paidCount = 0;
    let sentCount = 0;
    let draftCount = 0;
    let overdueCount = 0;

    const activeList = nonTemplateInvoices.filter(i => i.recurringStatus !== 'archived');

    activeList.forEach(inv => {
      totalInvoiced += inv.total;
      const isPaid = inv.status === InvoiceStatus.Paid || (inv.amountPaid || 0) >= inv.total - 0.001;
      const paid = isPaid ? inv.total : (inv.amountPaid || 0);
      totalPaid += paid;
      const rawOutstanding = inv.total - paid;
      const outstanding = isPaid ? 0 : Math.max(0, rawOutstanding);
      totalOutstanding += (outstanding <= 0.001 ? 0 : outstanding);
      
      if (isPaid) paidCount++;
      else if (inv.status === InvoiceStatus.Sent) sentCount++;
      else if (inv.status === InvoiceStatus.Draft) draftCount++;
      else if (inv.status === InvoiceStatus.Overdue) overdueCount++;
      else if (inv.status === InvoiceStatus.PartiallyPaid) sentCount++;
    });

    const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      collectionRate,
      archivedCount: nonTemplateInvoices.filter(i => i.recurringStatus === 'archived').length,
      statusData: [
        { name: 'Paid', value: paidCount, color: '#10B981' },
        { name: 'Sent', value: sentCount, color: '#3B82F6' },
        { name: 'Draft', value: draftCount, color: '#6B7280' },
        { name: 'Overdue', value: overdueCount, color: '#EF4444' },
      ].filter(d => d.value > 0)
    };
  }, [nonTemplateInvoices]);

  return (
    <div className="space-y-6">
      {!limit && (
        <>
          {/* Global Filter Bar */}
          <GlobalFilterBar
            filter={currentFilter}
            onFilterChange={handleFilterChange}
            clients={clients}
            services={services}
            totalInvoicesCount={invoices.length}
            filteredInvoicesCount={globallyFilteredInvoices.length}
            title="Invoice Vault Global Filter"
            description="Filter table records, collection totals and status breakdowns across all invoices"
          />

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-3xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Invoiced</p>
              <h3 className="text-2xl font-black text-gray-800">₦{stats.totalInvoiced.toLocaleString()}</h3>
              <p className="text-4xs text-gray-400 mt-1">{nonTemplateInvoices.length} Invoices issued</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-3xs font-black text-green-600 uppercase tracking-widest mb-1">Total Collected</p>
              <h3 className="text-2xl font-black text-green-700">₦{stats.totalPaid.toLocaleString()}</h3>
              <p className="text-4xs text-green-500 mt-1">Settled invoices</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-3xs font-black text-red-500 uppercase tracking-widest mb-1">Total Outstanding</p>
              <h3 className="text-2xl font-black text-red-600">₦{stats.totalOutstanding.toLocaleString()}</h3>
              <p className="text-4xs text-red-400 mt-1">Pending collection</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-3xs font-black text-primary-500 uppercase tracking-widest mb-1">Collection Efficiency</p>
              <h3 className="text-2xl font-black text-primary-600">{stats.collectionRate.toFixed(1)}%</h3>
              <p className="text-4xs text-primary-400 mt-1">Paid relative to invoiced</p>
            </div>
          </div>

          {/* Charts Row */}
          {nonTemplateInvoices.length > 0 && stats.statusData.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-4">
                <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-2">Invoice Status Overview</h4>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                  Visual distribution of financial invoice items currently registered within this SME workspace. Use this to audit unpaid draft vs overdue bills.
                </p>
                <div className="space-y-2">
                  {stats.statusData.map(status => (
                    <div key={status.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }}></span>
                        <span className="font-bold text-gray-600">{status.name}</span>
                      </div>
                      <span className="font-black text-gray-800">{status.value} ({Math.round(status.value / nonTemplateInvoices.length * 100)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="md:col-span-8 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.statusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="value" name="Invoices Count" radius={[8, 8, 0, 0]} maxBarSize={45}>
                      {stats.statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Operations Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-3.5 px-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-black">
              {selectedIds.length}
            </span>
            <span className="text-sm font-bold text-gray-800">
              {selectedIds.length} invoice{selectedIds.length > 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkArchive}
              disabled={isProcessingBulk}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 text-white ${
                activeTab === 'archived' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {activeTab === 'archived' ? '🔄 Bulk Restore' : '📦 Bulk Archive'} ({selectedIds.length})
            </button>

            <button
              onClick={handleBulkDelete}
              disabled={isProcessingBulk}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm flex items-center gap-1.5"
            >
              🗑️ Bulk Delete ({selectedIds.length})
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 md:space-x-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">
                {limit ? 'Recent Documents' : 'Full Registry'}
              </h2>
              {!limit && (
                <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold">
                  <button
                    onClick={() => { setActiveTab('active'); setSelectedIds([]); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      activeTab === 'active'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => { setActiveTab('archived'); setSelectedIds([]); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                      activeTab === 'archived'
                        ? 'bg-white text-amber-900 shadow-sm font-black'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <span>📦 Archived</span>
                    {stats.archivedCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 border border-amber-200">
                        {stats.archivedCount}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {!limit && ( 
              <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 w-full md:w-auto">
                  <div className="relative w-full md:w-64">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <Icon name="search" className="w-5 h-5 text-gray-400" />
                      </div>
                      <input
                          type="text"
                          placeholder="Search IDs, Clients..."
                          value={searchTerm}
                          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      />
                  </div>
              </div>
            )}
        </div>
        <InvoicesTable 
          invoices={visibleInvoices} 
          clients={clients}
          onViewInvoice={onViewInvoice}
          onEditInvoice={onEditInvoice}
          onDeleteInvoice={onDeleteInvoice}
          onToggleArchive={onToggleArchive}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          isAllSelected={isAllSelected}
        />
        {!limit && totalPages > 1 && (
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
    </div>
  );
};

export default InvoiceList;
