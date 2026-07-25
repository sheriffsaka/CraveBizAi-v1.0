import React, { useState, useMemo } from 'react';
import { Service, Invoice } from '../types';
import ServiceFormModal from './ServiceFormModal';
import Icon from './common/Icon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ServiceListProps {
  companyId: string;
  services: Service[];
  invoices?: Invoice[];
  onAddService: (service: Omit<Service, 'id'>) => void;
  onUpdateService: (service: Service) => void;
}

type SortKey = 'name' | 'category' | 'price' | 'popularity';
type SortDirection = 'asc' | 'desc';

const ServicesTable: React.FC<{
  services: Service[];
  onEditClick: (service: Service) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  serviceUsage: Record<string, number>;
}> = ({ services, onEditClick, sortKey, sortDirection, onSort, serviceUsage }) => {
  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>Service / Product Name{getSortIcon('name')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('category')}>Category{getSortIcon('category')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('price')}>Standard Price{getSortIcon('price')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('popularity')}>Sales Vol{getSortIcon('popularity')}</th>
            <th scope="col" className="px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr key={service.id} className="bg-white border-b hover:bg-gray-50">
              <th scope="row" className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                <div className="text-sm font-bold text-gray-900">{service.name}</div>
                {service.packageName && (
                  <div className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 inline-flex items-center space-x-1 px-2 py-0.5 rounded-md mt-0.5">
                    <span>📦</span>
                    <span>{service.packageName}</span>
                  </div>
                )}
              </th>
              <td className="px-6 py-4">
                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full font-bold uppercase text-[9px] tracking-wider">
                  {service.category || 'Uncategorized'}
                </span>
              </td>
              <td className="px-6 py-4 font-medium text-gray-900">₦{service.price.toLocaleString()}</td>
              <td className="px-6 py-4">
                <span className="font-bold text-gray-600">{serviceUsage[service.id] || 0} units</span>
              </td>
              <td className="px-6 py-4 text-right">
                <a href="#" onClick={(e) => { e.preventDefault(); onEditClick(service); }} className="font-bold text-primary-600 hover:text-primary-800 uppercase text-[10px] tracking-widest transition-colors">Edit</a>
              </td>
            </tr>
          ))}
          {services.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-10 text-gray-500">No services or products registered.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const ServiceList: React.FC<ServiceListProps> = ({ companyId, services, invoices = [], onAddService, onUpdateService }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleEditClick = (service: Service) => {
    setEditingService(service);
  };

  const handleCloseFormModal = () => {
    setIsAddModalOpen(false);
    setEditingService(null);
  };

  const handleSaveService = (service: Service | Omit<Service, 'id'>) => {
    if ('id' in service && service.id) {
      onUpdateService(service as Service);
    } else {
      onAddService(service as Omit<Service, 'id'>);
    }
    handleCloseFormModal();
  };

  const analytics = useMemo(() => {
    const serviceUsageMap: Record<string, number> = {};
    const serviceRevenueMap: Record<string, number> = {};

    invoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        if (item.serviceId) {
          const qty = item.quantity || 1;
          serviceUsageMap[item.serviceId] = (serviceUsageMap[item.serviceId] || 0) + qty;
          serviceRevenueMap[item.serviceId] = (serviceRevenueMap[item.serviceId] || 0) + (qty * (item.price || 0));
        }
      });
    });

    const uniqueCategories = new Set(services.map(s => s.category?.toLowerCase()).filter(Boolean));
    const avgPrice = services.length > 0 ? services.reduce((sum, s) => sum + s.price, 0) / services.length : 0;

    // Find the most popular product name
    let topServiceId = '';
    let maxUsage = 0;
    Object.entries(serviceUsageMap).forEach(([id, qty]) => {
      if (qty > maxUsage) {
        maxUsage = qty;
        topServiceId = id;
      }
    });
    const topServiceName = services.find(s => s.id === topServiceId)?.name || 'None';

    // Chart Data
    const topProductsSales = services
      .map(s => ({
        name: s.name,
        revenue: serviceRevenueMap[s.id] || 0,
        volume: serviceUsageMap[s.id] || 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .filter(p => p.revenue > 0);

    return {
      serviceUsageMap,
      uniqueCategoriesCount: uniqueCategories.size,
      avgPrice,
      topServiceName,
      topProductsSales
    };
  }, [services, invoices]);

  const filteredAndSortedServices = useMemo(() => {
    let filtered = services.filter(service => 
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortKey) {
        case 'name':
          valA = a.name;
          valB = b.name;
          break;
        case 'category':
          valA = a.category;
          valB = b.category;
          break;
        case 'price':
          valA = a.price;
          valB = b.price;
          break;
        case 'popularity':
          valA = analytics.serviceUsageMap[a.id] || 0;
          valB = analytics.serviceUsageMap[b.id] || 0;
          break;
        default:
          valA = a.name;
          valB = b.name;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return filtered;
  }, [services, searchTerm, sortKey, sortDirection, analytics.serviceUsageMap]);

  const paginatedServices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedServices.slice(startIndex, endIndex);
  }, [filteredAndSortedServices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedServices.length / itemsPerPage);

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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Offerings</p>
          <h3 className="text-2xl font-black text-gray-800">{services.length}</h3>
          <p className="text-4xs text-gray-400 mt-1">Services & products registry</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-emerald-600 uppercase tracking-widest mb-1">Average Pricing</p>
          <h3 className="text-2xl font-black text-emerald-700">₦{Math.round(analytics.avgPrice).toLocaleString()}</h3>
          <p className="text-4xs text-emerald-500 mt-1">Standard rate average</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-primary-500 uppercase tracking-widest mb-1">Service Categories</p>
          <h3 className="text-2xl font-black text-primary-600">{analytics.uniqueCategoriesCount}</h3>
          <p className="text-4xs text-primary-400 mt-1">Siloed business groups</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-purple-600 uppercase tracking-widest mb-1">Top Volume Item</p>
          <h3 className="text-2xl font-black text-purple-700 truncate max-w-full">{analytics.topServiceName}</h3>
          <p className="text-4xs text-purple-500 mt-1">Highest sales transaction counts</p>
        </div>
      </div>

      {/* Top Offerings sales volume charts */}
      {services.length > 0 && analytics.topProductsSales.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-4">
            <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-2">Service Catalog Sales (₦)</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Revenue generated from individual catalog service/product sales. Focuses on invoice quantative multiplication values.
            </p>
            <div className="space-y-2">
              {analytics.topProductsSales.map(p => (
                <div key={p.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="font-bold text-gray-600 truncate max-w-[150px]">{p.name} ({p.volume} units)</span>
                  </div>
                  <span className="font-black text-gray-800">₦{p.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-8 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.topProductsSales} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Total Revenue']} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="revenue" name="Total Sales" radius={[8, 8, 0, 0]} fill="#10B981" maxBarSize={45}>
                  {analytics.topProductsSales.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#10B981" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Services Table List */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 md:space-x-4">
            <h2 className="text-xl font-semibold">Catalog Registry</h2>
            <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Icon name="search" className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search name, category..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    />
                </div>
                <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold shadow text-sm w-full md:w-auto">
                    + Add Service
                </button>
            </div>
        </div>

        <ServicesTable
          services={paginatedServices}
          onEditClick={handleEditClick}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          serviceUsage={analytics.serviceUsageMap}
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

      <ServiceFormModal
        isOpen={isAddModalOpen || !!editingService}
        onClose={handleCloseFormModal}
        onSaveService={handleSaveService}
        service={editingService}
        companyId={companyId}
      />
    </div>
  );
};

export default ServiceList;
