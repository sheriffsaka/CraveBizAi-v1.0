
import React, { useState, useMemo } from 'react';
import { Client } from '../types';
import ClientFormModal from './ClientFormModal';
import Icon from './common/Icon';

interface ClientListProps {
  companyId: string; // Added companyId
  clients: Client[];
  onAddClient: (client: Omit<Client, 'id'>) => void;
  onUpdateClient: (client: Client) => void;
}

type SortKey = 'companyName' | 'name' | 'email';
type SortDirection = 'asc' | 'desc';

const ClientsTable: React.FC<{
  clients: Client[];
  onEditClick: (client: Client) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}> = ({ clients, onEditClick, sortKey, sortDirection, onSort }) => {
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
            <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
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
              <td className="px-6 py-4 text-right">
                <a href="#" onClick={(e) => { e.preventDefault(); onEditClick(client); }} className="font-medium text-primary-600 hover:underline">Edit</a>
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

const ClientList: React.FC<ClientListProps> = ({ companyId, clients, onAddClient, onUpdateClient }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
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

  return (
    <>
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
    </>
  );
};

export default ClientList;