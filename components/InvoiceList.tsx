
import React, { useState, useMemo } from 'react';
import { Invoice, Client, InvoiceStatus } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';

interface InvoiceListProps {
  invoices: Invoice[];
  clients: Client[];
  limit?: number; // Optional limit for displaying a subset (e.g., on dashboard)
  onViewInvoice: (invoiceId: string) => void;
  onEditInvoice?: (invoiceId: string) => void;
}

type SortKey = 'invoiceNumber' | 'clientName' | 'issueDate' | 'dueDate' | 'total' | 'status';
type SortDirection = 'asc' | 'desc';

const InvoicesTable: React.FC<{
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
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('dueDate')}>Due Date{getSortIcon('dueDate')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('total')}>Amount{getSortIcon('total')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('status')}>Status{getSortIcon('status')}</th>
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
              <td className="px-6 py-4">{invoice.dueDate}</td>
              <td className="px-6 py-4 font-medium">₦{invoice.total.toLocaleString()}</td>
              <td className="px-6 py-4">
                <InvoiceStatusBadge status={invoice.status} />
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
                  <td colSpan={6} className="text-center py-10 text-gray-500">No invoices found.</td>
              </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};


const InvoiceList: React.FC<InvoiceListProps> = ({ invoices, clients, limit, onViewInvoice, onEditInvoice }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = limit || 10; 

  const getClientNameById = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || 'Unknown Client';
  };

  const nonTemplateInvoices = useMemo(() => {
    return invoices.filter(inv => !inv.isRecurringTemplate);
  }, [invoices]);

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

  return (
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
  );
};

export default InvoiceList;
