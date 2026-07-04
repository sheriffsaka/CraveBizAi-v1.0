
import React, { useState, useMemo } from 'react';
import { Invoice, Client, InvoiceStatus } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface SentReceiptsListProps {
  invoices: Invoice[]; // These should already be filtered to be isReceiptSent: true
  clients: Client[];
  onViewInvoice: (invoiceId: string) => void; // For viewing the original invoice detail
  onEditInvoice?: (invoiceId: string) => void;
}

type SortKey = 'invoiceNumber' | 'clientName' | 'issueDate' | 'total';
type SortDirection = 'asc' | 'desc';

const SentReceiptsTable: React.FC<{
  invoices: Invoice[];
  clients: Client[];
  onViewInvoice: (invoiceId: string) => void;
  onEditInvoice?: (invoiceId: string) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}> = ({ invoices, clients, onViewInvoice, onEditInvoice, sortKey, sortDirection, onSort }) => {
  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || 'Unknown Client';
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('invoiceNumber')}>Invoice ID{getSortIcon('invoiceNumber')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('clientName')}>Client{getSortIcon('clientName')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('issueDate')}>Payment Date{getSortIcon('issueDate')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('total')}>Amount{getSortIcon('total')}</th>
            <th scope="col" className="px-6 py-3">Status</th>
            <th scope="col" className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="bg-white border-b hover:bg-gray-50 group">
              <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                {invoice.invoiceNumber}
              </th>
              <td className="px-6 py-4">{getClientName(invoice.clientId)}</td>
              <td className="px-6 py-4">{invoice.issueDate}</td>
              <td className="px-6 py-4 font-medium">₦{invoice.total.toLocaleString()}</td>
              <td className="px-6 py-4">
                <InvoiceStatusBadge status={InvoiceStatus.Paid} /> {/* Receipts are always for Paid invoices */}
              </td>
              <td className="px-6 py-4 text-right space-x-3">
                <button onClick={() => onViewInvoice(invoice.id)} className="font-bold text-primary-600 hover:text-primary-800 transition-colors uppercase text-[10px] tracking-widest">View</button>
                {onEditInvoice && (
                    <button onClick={() => onEditInvoice(invoice.id)} className="font-bold text-amber-600 hover:text-amber-800 transition-colors uppercase text-[10px] tracking-widest">Edit</button>
                )}
              </td>
            </tr>
          ))}
           {invoices.length === 0 && (
              <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500">No receipts have been sent yet.</td>
              </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};


const SentReceiptsList: React.FC<SentReceiptsListProps> = ({ invoices, clients, onViewInvoice, onEditInvoice }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const getClientNameById = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || 'Unknown Client';
  };

  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = invoices.filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getClientNameById(invoice.clientId).toLowerCase().includes(searchTerm.toLowerCase())
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
          valA = new Date(a.issueDate).getTime();
          valB = new Date(b.issueDate).getTime();
          break;
        case 'total':
          valA = a.total;
          valB = b.total;
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

  const stats = useMemo(() => {
    let totalAmount = 0;
    const clientReceipts: Record<string, { companyName: string; total: number }> = {};

    invoices.forEach(inv => {
      totalAmount += inv.total;
      const clientName = clients.find(c => c.id === inv.clientId)?.companyName || 'Unknown Client';
      if (!clientReceipts[inv.clientId]) {
        clientReceipts[inv.clientId] = { companyName: clientName, total: 0 };
      }
      clientReceipts[inv.clientId].total += inv.total;
    });

    const clientChartData = Object.entries(clientReceipts).map(([id, data], idx) => ({
      name: data.companyName,
      value: data.total,
      color: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'][idx % 6]
    })).sort((a, b) => b.value - a.value).slice(0, 5);

    const avgAmount = invoices.length > 0 ? totalAmount / invoices.length : 0;

    return {
      totalReceipts: invoices.length,
      totalAmount,
      avgAmount,
      clientChartData
    };
  }, [invoices, clients]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Receipts Issued</p>
          <h3 className="text-2xl font-black text-gray-800">{stats.totalReceipts}</h3>
          <p className="text-4xs text-gray-400 mt-1">Paid invoices with verified receipts</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-green-600 uppercase tracking-widest mb-1">Total Verified Revenue</p>
          <h3 className="text-2xl font-black text-green-700">₦{stats.totalAmount.toLocaleString()}</h3>
          <p className="text-4xs text-green-500 mt-1">Settled payments confirmed</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-primary-500 uppercase tracking-widest mb-1">Average Receipt Value</p>
          <h3 className="text-2xl font-black text-primary-600">₦{Math.round(stats.avgAmount).toLocaleString()}</h3>
          <p className="text-4xs text-primary-400 mt-1">Per transaction average</p>
        </div>
      </div>

      {/* Receipts Analytics Chart */}
      {invoices.length > 0 && stats.clientChartData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center animate-fade-in">
          <div className="md:col-span-4">
            <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-2">Top Customers by Verified Receipts</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Breakdown of total settled payments by account. Focuses on top revenue drivers.
            </p>
            <div className="space-y-2">
              {stats.clientChartData.map(client => (
                <div key={client.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: client.color }}></span>
                    <span className="font-bold text-gray-600 truncate max-w-[150px]">{client.name}</span>
                  </div>
                  <span className="font-black text-gray-800">₦{client.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-8 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.clientChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} formatter={(value: number) => `₦${(value / 1000).toLocaleString()}k`} />
                <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Total Receipts']} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="value" name="Settled Payments" radius={[8, 8, 0, 0]} maxBarSize={45}>
                  {stats.clientChartData.map((entry, index) => (
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
            <h2 className="text-xl font-semibold">Sent Receipts</h2>
            <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Icon name="search" className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search receipts..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    />
                </div>
            </div>
        </div>
      <SentReceiptsTable 
        invoices={paginatedInvoices}
        clients={clients}
        onViewInvoice={onViewInvoice}
        onEditInvoice={onEditInvoice}
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

export default SentReceiptsList;
