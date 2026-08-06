import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  GlobalFilterState,
  DateRangeOption,
  DEFAULT_GLOBAL_FILTER,
  isFilterActive
} from '../lib/globalFilter';
import { Client, Service, InvoiceStatus, Invoice } from '../types';
import {
  Search,
  Calendar,
  Users,
  Briefcase,
  X,
  Filter,
  RotateCcw,
  ChevronDown,
  Check,
  Tag,
  SlidersHorizontal
} from 'lucide-react';

interface GlobalFilterBarProps {
  filter: GlobalFilterState;
  onFilterChange: (newFilter: GlobalFilterState) => void;
  clients: Client[];
  services: Service[];
  totalInvoicesCount: number;
  filteredInvoicesCount: number;
  title?: string;
  description?: string;
  extraHeaderActions?: React.ReactNode;
}

export const GlobalFilterBar: React.FC<GlobalFilterBarProps> = ({
  filter,
  onFilterChange,
  clients,
  services,
  totalInvoicesCount,
  filteredInvoicesCount,
  title = "Global Filter Bar",
  description,
  extraHeaderActions
}) => {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  
  // Dropdown open states
  const [isClientOpen, setIsClientOpen] = useState(false);
  const [isServiceOpen, setIsServiceOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const clientRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(event.target as Node)) {
        setIsClientOpen(false);
      }
      if (serviceRef.current && !serviceRef.current.contains(event.target as Node)) {
        setIsServiceOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered Client Options
  const activeClients = useMemo(() => clients.filter((c) => !c.is_archived && c.status !== 'Archived' && c.status !== 'Deleted'), [clients]);

  const filteredClientOptions = activeClients.filter((c) =>
    c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Filtered Service Options
  const filteredServiceOptions = useMemo(() => {
    return services
      .filter((s) =>
        s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        (s.packageName && s.packageName.toLowerCase().includes(serviceSearch.toLowerCase())) ||
        (s.category && s.category.toLowerCase().includes(serviceSearch.toLowerCase()))
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [services, serviceSearch]);

  const handleResetFilters = () => {
    onFilterChange(DEFAULT_GLOBAL_FILTER);
    setClientSearch('');
    setServiceSearch('');
  };

  const handleDateRangeChange = (range: DateRangeOption) => {
    onFilterChange({
      ...filter,
      dateRange: range
    });
  };

  const handleClientToggle = (clientId: string) => {
    const exists = filter.selectedClientIds.includes(clientId);
    const newClientIds = exists
      ? filter.selectedClientIds.filter((id) => id !== clientId)
      : [...filter.selectedClientIds, clientId];

    onFilterChange({
      ...filter,
      selectedClientIds: newClientIds
    });
  };

  const handleServiceToggle = (serviceId: string) => {
    const exists = filter.selectedServiceIds.includes(serviceId);
    const newServiceIds = exists
      ? filter.selectedServiceIds.filter((id) => id !== serviceId)
      : [...filter.selectedServiceIds, serviceId];

    onFilterChange({
      ...filter,
      selectedServiceIds: newServiceIds
    });
  };

  const handleStatusToggle = (status: InvoiceStatus) => {
    const exists = filter.selectedStatuses.includes(status);
    const newStatuses = exists
      ? filter.selectedStatuses.filter((s) => s !== status)
      : [...filter.selectedStatuses, status];

    onFilterChange({
      ...filter,
      selectedStatuses: newStatuses
    });
  };

  // Active Filter Count Calculation
  const activeFiltersCount =
    (filter.dateRange !== 'all_time' ? 1 : 0) +
    filter.selectedClientIds.length +
    filter.selectedServiceIds.length +
    filter.selectedStatuses.length +
    (filter.searchQuery.trim().length > 0 ? 1 : 0);

  const dateLabels: Record<DateRangeOption, string> = {
    all_time: 'All Time',
    today: 'Today',
    yesterday: 'Yesterday',
    this_week: 'This Week',
    this_month: 'This Month',
    this_quarter: 'This Quarter',
    this_year: 'This Year',
    custom: 'Custom Range'
  };

  return (
    <div id="global-filter-system" className="bg-white p-5 md:p-6 rounded-xl shadow-xl border border-gray-100/90 space-y-4 print-hidden transition-all">
      {/* Top Header Row with Mobile Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-primary-50 text-primary-600 rounded-lg border border-primary-100 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                {title}
              </h2>
              {isFilterActive(filter) && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">
                  Active Filter
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-gray-400 font-medium">{description}</p>
            )}
          </div>
        </div>

        {/* Status Count Badge, Extra Actions & Mobile Expand Button */}
        <div className="flex items-center space-x-3 flex-wrap">
          <div className="text-xs font-bold bg-gray-50 border border-gray-200/80 px-3 py-1.5 rounded-lg text-gray-700 flex items-center space-x-1">
            <span className="text-gray-400 font-extrabold uppercase text-[10px]">Showing:</span>
            <span className="font-black text-primary-600">{filteredInvoicesCount}</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">{totalInvoicesCount}</span>
            <span className="text-gray-400 font-medium">records</span>
          </div>

          {extraHeaderActions}

          <button
            onClick={() => setIsMobileExpanded(!isMobileExpanded)}
            className="sm:hidden flex items-center space-x-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-black px-3 py-1.5 rounded-lg transition-all cursor-pointer"
          >
            <Filter className="w-4 h-4 text-primary-600" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="bg-primary-600 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${isMobileExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Filter Controls Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 ${isMobileExpanded ? 'block' : 'hidden sm:grid'}`}>
        
        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={filter.searchQuery}
            onChange={(e) => onFilterChange({ ...filter, searchQuery: e.target.value })}
            placeholder="Search invoice #, client, item..."
            className="w-full pl-10 pr-8 py-2.5 bg-gray-50/80 border border-gray-200/80 rounded-lg text-xs font-bold text-gray-800 placeholder-gray-400 focus:bg-white focus:border-primary-500 focus:outline-none transition-all shadow-inner"
          />
          {filter.searchQuery && (
            <button
              onClick={() => onFilterChange({ ...filter, searchQuery: '' })}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Date Range Select */}
        <div className="relative">
          <div className="flex items-center bg-gray-50/80 border border-gray-200/80 rounded-lg px-3 py-1.5 focus-within:bg-white focus-within:border-primary-500 transition-all shadow-inner">
            <Calendar className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
            <select
              value={filter.dateRange}
              onChange={(e) => handleDateRangeChange(e.target.value as DateRangeOption)}
              className="w-full bg-transparent text-xs font-extrabold text-gray-800 outline-none cursor-pointer py-1"
            >
              <option value="all_time">Date: All Time</option>
              <option value="today">Date: Today</option>
              <option value="yesterday">Date: Yesterday</option>
              <option value="this_week">Date: This Week</option>
              <option value="this_month">Date: This Month</option>
              <option value="this_quarter">Date: This Quarter</option>
              <option value="this_year">Date: This Year</option>
              <option value="custom">Date: Custom Range</option>
            </select>
          </div>
        </div>

        {/* Client Multi-Select Dropdown */}
        <div className="relative" ref={clientRef}>
          <button
            onClick={() => {
              setIsClientOpen(!isClientOpen);
              setIsServiceOpen(false);
              setIsStatusOpen(false);
            }}
            className={`w-full flex items-center justify-between bg-gray-50/80 border px-3.5 py-2.5 rounded-lg text-xs font-bold text-left transition-all cursor-pointer ${
              filter.selectedClientIds.length > 0
                ? 'border-primary-400 bg-primary-50/30 text-primary-900'
                : 'border-gray-200/80 text-gray-700 hover:bg-gray-100/60'
            }`}
          >
            <div className="flex items-center space-x-2 truncate pr-2">
              <Users className={`w-4 h-4 ${filter.selectedClientIds.length > 0 ? 'text-primary-600' : 'text-gray-400'}`} />
              <span className="truncate">
                {filter.selectedClientIds.length === 0
                  ? 'All Clients'
                  : `${filter.selectedClientIds.length} Client${filter.selectedClientIds.length > 1 ? 's' : ''} Selected`}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isClientOpen ? 'rotate-180' : ''}`} />
          </button>

          {isClientOpen && (
            <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 space-y-2 animate-in fade-in slide-in-from-top-2">
              <div className="relative">
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search clients..."
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-primary-500"
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              </div>

              <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 px-1 pt-1">
                <button
                  onClick={() => onFilterChange({ ...filter, selectedClientIds: activeClients.map((c) => c.id) })}
                  className="hover:text-primary-600 cursor-pointer"
                >
                  Select All
                </button>
                <button
                  onClick={() => onFilterChange({ ...filter, selectedClientIds: [] })}
                  className="hover:text-rose-600 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 space-y-1 pr-1">
                {filteredClientOptions.map((c) => {
                  const isSelected = filter.selectedClientIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      onClick={() => handleClientToggle(c.id)}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary-50 text-primary-900' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="truncate pr-2">{c.companyName} ({c.name})</span>
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                        isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </label>
                  );
                })}
                {filteredClientOptions.length === 0 && (
                  <p className="text-center py-4 text-xs font-medium text-gray-400 italic">No clients found</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Service Multi-Select Dropdown */}
        <div className="relative" ref={serviceRef}>
          <button
            onClick={() => {
              setIsServiceOpen(!isServiceOpen);
              setIsClientOpen(false);
              setIsStatusOpen(false);
            }}
            className={`w-full flex items-center justify-between bg-gray-50/80 border px-3.5 py-2.5 rounded-2xl text-xs font-bold text-left transition-all cursor-pointer ${
              filter.selectedServiceIds.length > 0
                ? 'border-purple-400 bg-purple-50/30 text-purple-900'
                : 'border-gray-200/80 text-gray-700 hover:bg-gray-100/60'
            }`}
          >
            <div className="flex items-center space-x-2 truncate pr-2">
              <Briefcase className={`w-4 h-4 ${filter.selectedServiceIds.length > 0 ? 'text-purple-600' : 'text-gray-400'}`} />
              <span className="truncate">
                {filter.selectedServiceIds.length === 0
                  ? 'All Services'
                  : `${filter.selectedServiceIds.length} Service${filter.selectedServiceIds.length > 1 ? 's' : ''} Selected`}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isServiceOpen ? 'rotate-180' : ''}`} />
          </button>

          {isServiceOpen && (
            <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 space-y-2 animate-in fade-in slide-in-from-top-2">
              <div className="relative">
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              </div>

              <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 px-1 pt-1">
                <button
                  onClick={() => onFilterChange({ ...filter, selectedServiceIds: services.map((s) => s.id) })}
                  className="hover:text-purple-600 cursor-pointer"
                >
                  Select All
                </button>
                <button
                  onClick={() => onFilterChange({ ...filter, selectedServiceIds: [] })}
                  className="hover:text-rose-600 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 space-y-1 pr-1">
                {filteredServiceOptions.map((s) => {
                  const isSelected = filter.selectedServiceIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      onClick={() => handleServiceToggle(s.id)}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        isSelected ? 'bg-purple-50 text-purple-900' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div>{s.name}</div>
                        {s.category && <span className="text-[9px] text-gray-400 font-semibold">{s.category}</span>}
                      </div>
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </label>
                  );
                })}
                {filteredServiceOptions.length === 0 && (
                  <p className="text-center py-4 text-xs font-medium text-gray-400 italic">No services found</p>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Custom Date Range Picker Options (if 'custom' selected) */}
      {filter.dateRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 bg-amber-50/80 border border-amber-200/80 p-3.5 rounded-2xl text-xs">
          <span className="font-black text-amber-900 uppercase tracking-wider text-[10px]">Custom Date Range:</span>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500 font-bold">Start:</span>
            <input
              type="date"
              value={filter.customStartDate}
              onChange={(e) => onFilterChange({ ...filter, customStartDate: e.target.value })}
              className="bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-800 outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500 font-bold">End:</span>
            <input
              type="date"
              value={filter.customEndDate}
              onChange={(e) => onFilterChange({ ...filter, customEndDate: e.target.value })}
              className="bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-800 outline-none"
            />
          </div>
        </div>
      )}

      {/* Active Filter Badges / Tags Row */}
      {isFilterActive(filter) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-1">Active Criteria:</span>

          {filter.dateRange !== 'all_time' && (
            <span className="inline-flex items-center space-x-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-xs font-bold">
              <span>Date: {dateLabels[filter.dateRange]}</span>
              <button
                onClick={() => onFilterChange({ ...filter, dateRange: 'all_time', customStartDate: '', customEndDate: '' })}
                className="hover:text-blue-900 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filter.selectedClientIds.map((cid) => {
            const client = clients.find((c) => c.id === cid);
            return (
              <span
                key={cid}
                className="inline-flex items-center space-x-1.5 bg-primary-50 text-primary-800 border border-primary-200 px-3 py-1 rounded-full text-xs font-bold"
              >
                <span>Client: {client?.companyName || cid}</span>
                <button
                  onClick={() => handleClientToggle(cid)}
                  className="hover:text-primary-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {filter.selectedServiceIds.map((sid) => {
            const service = services.find((s) => s.id === sid);
            return (
              <span
                key={sid}
                className="inline-flex items-center space-x-1.5 bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1 rounded-full text-xs font-bold"
              >
                <span>Service: {service?.name || sid}</span>
                <button
                  onClick={() => handleServiceToggle(sid)}
                  className="hover:text-purple-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {filter.selectedStatuses.map((st) => (
            <span
              key={st}
              className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold"
            >
              <span>Status: {st}</span>
              <button
                onClick={() => handleStatusToggle(st)}
                className="hover:text-emerald-900 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filter.searchQuery && (
            <span className="inline-flex items-center space-x-1.5 bg-gray-100 text-gray-800 border border-gray-300 px-3 py-1 rounded-full text-xs font-bold">
              <span>Query: "{filter.searchQuery}"</span>
              <button
                onClick={() => onFilterChange({ ...filter, searchQuery: '' })}
                className="hover:text-gray-900 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={handleResetFilters}
            className="inline-flex items-center space-x-1 text-rose-600 hover:text-rose-800 text-xs font-black uppercase tracking-wider ml-auto px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default GlobalFilterBar;
