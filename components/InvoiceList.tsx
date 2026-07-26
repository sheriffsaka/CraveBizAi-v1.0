
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
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}> = ({ invoices, clients, onViewInvoice, onEditInvoice, onDeleteInvoice, sortKey, sortDirection, onSort }) => {
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
            const balance = invoice.total - (invoice.amountPaid || 0);
            return (
              <tr key={invoice.id} className="bg-white border-b hover:bg-gray-50 group">
                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                  {invoice.invoiceNumber}
                </th>
                <td className="px-6 py-4">{getClientName(invoice.clientId)}</td>
                <td className="px-6 py-4">{invoice.dueDate}</td>
                <td className="px-6 py-4 font-medium">₦{invoice.total.toLocaleString()}</td>
                <td className={`px-6 py-4 font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₦{balance.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <InvoiceStatusBadge status={invoice.status} />
                </td>
                <td className="px-6 py-4 text-right space-x-3">
                  <button onClick={() => onViewInvoice(invoice.id)} className="font-bold text-primary-600 hover:text-primary-800 transition-colors uppercase text-[10px] tracking-widest">View</button>
                  {onEditInvoice && (
                      <button onClick={() => onEditInvoice(invoice.id)} className="font-bold text-amber-600 hover:text-amber-800 transition-colors uppercase text-[10px] tracking-widest">Edit</button>
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
                  <td colSpan={7} className="text-center py-10 text-gray-500">No invoices found.</td>
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
  globalFilter,
  onFilterChange
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
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

  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = nonTemplateInvoices.filter(invoice => 
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
  }, [nonTemplateInvoices, clients, searchTerm, sortKey, sortDirection]);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedInvoices.slice(startIndex, endIndex);
  }, [filteredAndSortedInvoices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedInvoices.length / itemsPerPage);

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

    nonTemplateInvoices.forEach(inv => {
      totalInvoiced += inv.total;
      const paid = inv.amountPaid || 0;
      totalPaid += paid;
      totalOutstanding += (inv.total - paid);
      
      if (inv.status === 'Paid') paidCount++;
      else if (inv.status === 'Sent') sentCount++;
      else if (inv.status === 'Draft') draftCount++;
      else if (inv.status === 'Overdue') overdueCount++;
    });

    const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      collectionRate,
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

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 md:space-x-4">
            <h2 className="text-xl font-semibold">
              {limit ? 'Recent Documents' : 'Full Registry'}
            </h2>
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
          invoices={limit ? nonTemplateInvoices.slice(0, limit) : paginatedInvoices} 
          clients={clients}
          onViewInvoice={onViewInvoice}
          onEditInvoice={onEditInvoice}
          onDeleteInvoice={onDeleteInvoice}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
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
