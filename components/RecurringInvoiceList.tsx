
import React, { useState, useMemo } from 'react';
import { Invoice, Client, InvoiceFrequency } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface RecurringInvoiceListProps {
  invoices: Invoice[]; // These should already be filtered to be isRecurringTemplate: true
  clients: Client[];
  onViewInvoice: (invoiceId: string) => void;
  onEditInvoice?: (invoiceId: string) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
}

type SortKey = 'invoiceNumber' | 'clientName' | 'frequency' | 'nextRecurrenceDate' | 'total' | 'balance' | 'status';
type SortDirection = 'asc' | 'desc';

export function formatFrequencyLabel(freq?: string): string {
  if (!freq) return 'One-Time';
  const f = freq.toLowerCase();
  switch (f) {
    case 'one-time': return 'One-Time';
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'biannually':
    case 'bi-annually': return 'Bi-Annually';
    case 'yearly':
    case 'annually': return 'Yearly';
    default: return f.charAt(0).toUpperCase() + f.slice(1);
  }
}

const RecurringInvoicesTable: React.FC<{
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
    if (onDeleteInvoice && window.confirm(`Are you sure you want to delete template ${number}? This action cannot be undone.`)) {
      onDeleteInvoice(id);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('invoiceNumber')}>Template ID{getSortIcon('invoiceNumber')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('clientName')}>Client{getSortIcon('clientName')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('frequency')}>Frequency{getSortIcon('frequency')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('nextRecurrenceDate')}>Next Bill Date{getSortIcon('nextRecurrenceDate')}</th>
            <th scope="col" className="px-6 py-3 font-semibold">Auto-Gen</th>
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
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-50 text-primary-700 border border-primary-100">
                    {formatFrequencyLabel(invoice.frequency)}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-gray-800">{invoice.nextRecurrenceDate || invoice.nextDueDate || 'N/A'}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${invoice.autoGenerate !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {invoice.autoGenerate !== false ? 'Auto' : 'Manual'}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium">₦{invoice.total.toLocaleString()}</td>
                <td className={`px-6 py-4 font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₦{balance.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <InvoiceStatusBadge status={invoice.status} />
                    {invoice.recurringStatus && (
                      <span className={`text-[9px] font-extrabold uppercase ${invoice.recurringStatus === 'active' ? 'text-green-600' : 'text-amber-600'}`}>
                        Schedule: {invoice.recurringStatus}
                      </span>
                    )}
                  </div>
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
                  <td colSpan={8} className="text-center py-10 text-gray-500">No recurring invoice templates found.</td>
              </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};


const RecurringInvoiceList: React.FC<RecurringInvoiceListProps> = ({ invoices, clients, onViewInvoice, onEditInvoice, onDeleteInvoice }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('invoiceNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const getClientNameById = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || 'Unknown Client';
  };

  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = invoices.filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getClientNameById(invoice.clientId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.frequency.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        case 'frequency':
          valA = a.frequency;
          valB = b.frequency;
          break;
        case 'nextRecurrenceDate':
          valA = a.nextRecurrenceDate ? new Date(a.nextRecurrenceDate).getTime() : 0;
          valB = b.nextRecurrenceDate ? new Date(b.nextRecurrenceDate).getTime() : 0;
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
          valA = a.invoiceNumber;
          valB = b.invoiceNumber;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return filtered;
  }, [invoices, clients, searchTerm, sortKey, sortDirection]);

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
    let totalValue = 0;
    let activeCount = 0;
    let draftCount = 0;
    let overdueCount = 0;
    const frequencies: Record<string, { count: number; total: number }> = {
      daily: { count: 0, total: 0 },
      weekly: { count: 0, total: 0 },
      monthly: { count: 0, total: 0 },
      quarterly: { count: 0, total: 0 },
      biannually: { count: 0, total: 0 },
      yearly: { count: 0, total: 0 }
    };

    invoices.forEach(inv => {
      totalValue += inv.total;
      if (inv.status === 'Paid' || inv.status === 'Sent') {
        activeCount++;
      } else if (inv.status === 'Draft') {
        draftCount++;
      } else {
        overdueCount++;
      }

      let rawFreq = inv.frequency?.toLowerCase() || 'monthly';
      if (rawFreq === 'annually') rawFreq = 'yearly';
      if (rawFreq === 'bi-annually') rawFreq = 'biannually';

      if (frequencies[rawFreq]) {
        frequencies[rawFreq].count++;
        frequencies[rawFreq].total += inv.total;
      } else {
        frequencies[rawFreq] = { count: 1, total: inv.total };
      }
    });

    const getFrequencyColor = (freqKey: string) => {
      switch (freqKey) {
        case 'daily': return '#14B8A6'; // Teal
        case 'weekly': return '#10B981'; // Emerald
        case 'monthly': return '#3B82F6'; // Blue
        case 'quarterly': return '#F59E0B'; // Amber
        case 'biannually': return '#EC4899'; // Pink
        case 'yearly': return '#8B5CF6'; // Purple
        default: return '#6B7280';
      }
    };

    const frequencyData = Object.entries(frequencies).map(([key, data]) => ({
      name: formatFrequencyLabel(key),
      count: data.count,
      value: data.total,
      color: getFrequencyColor(key)
    })).filter(d => d.count > 0);

    return {
      totalTemplates: invoices.length,
      totalValue,
      activeCount,
      draftCount,
      frequencyData
    };
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-gray-400 uppercase tracking-widest mb-1">Active Templates</p>
          <h3 className="text-2xl font-black text-gray-800">{stats.totalTemplates}</h3>
          <p className="text-4xs text-gray-400 mt-1">Total active subscriptions</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-primary-500 uppercase tracking-widest mb-1">Contract Value</p>
          <h3 className="text-2xl font-black text-primary-600">₦{stats.totalValue.toLocaleString()}</h3>
          <p className="text-4xs text-primary-400 mt-1">Total value per cycle</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-green-600 uppercase tracking-widest mb-1">Sending Status</p>
          <h3 className="text-2xl font-black text-green-700">{stats.activeCount}</h3>
          <p className="text-4xs text-green-500 mt-1">Templates active / sending</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-amber-500 uppercase tracking-widest mb-1">Draft Templates</p>
          <h3 className="text-2xl font-black text-amber-600">{stats.draftCount}</h3>
          <p className="text-4xs text-amber-400 mt-1">Awaiting setup</p>
        </div>
      </div>

      {/* Frequency Distribution Chart */}
      {invoices.length > 0 && stats.frequencyData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-4">
            <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-2">Template Frequency Breakdown</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Overview of contract value distributions per billing cadence. Helps project periodic revenue pipelines.
            </p>
            <div className="space-y-2">
              {stats.frequencyData.map(freq => (
                <div key={freq.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: freq.color }}></span>
                    <span className="font-bold text-gray-600">{freq.name} ({freq.count})</span>
                  </div>
                  <span className="font-black text-gray-800">₦{freq.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-8 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.frequencyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Total Value']} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="value" name="Projected Cycle Income" radius={[8, 8, 0, 0]} maxBarSize={45}>
                  {stats.frequencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 md:space-x-4">
            <h2 className="text-xl font-semibold">Recurring Invoices</h2>
            <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Icon name="search" className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    />
                </div>
            </div>
        </div>
        <RecurringInvoicesTable 
          invoices={paginatedInvoices}
          clients={clients}
          onViewInvoice={onViewInvoice}
          onEditInvoice={onEditInvoice}
          onDeleteInvoice={onDeleteInvoice}
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
    </div>
  );
};

export default RecurringInvoiceList;
