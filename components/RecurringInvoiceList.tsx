import React, { useState, useMemo } from 'react';
import { Invoice, Client, Service } from '../types';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import Icon from './common/Icon';

interface RecurringInvoiceListProps {
  invoices: Invoice[];
  clients: Client[];
  services?: Service[];
  onViewInvoice: (invoiceId: string) => void;
  onEditInvoice?: (invoiceId: string) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
  onRenewInvoice?: (template: Invoice) => Promise<void>;
  onTogglePause?: (template: Invoice) => Promise<void>;
  onToggleArchive?: (template: Invoice) => Promise<void>;
}

export type RenewalFilter = 'all' | 'due-soon' | 'overdue' | 'due-30-days' | 'paused';
export type SortKey = 'nextDueDate' | 'clientName' | 'invoiceNumber' | 'service' | 'frequency' | 'total' | 'status';
export type SortDirection = 'asc' | 'desc';

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

export function getInvoiceServicesSummary(invoice: Invoice, services: Service[] = []): string {
  if (!invoice.items || invoice.items.length === 0) return 'General Service';
  const names = invoice.items.map(item => {
    if (item.serviceId && item.serviceId !== 'custom') {
      const found = services.find(s => s.id === item.serviceId);
      if (found?.name) return found.name;
    }
    return item.description || 'Service Item';
  });
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  if (uniqueNames.length === 0) return 'General Service';
  if (uniqueNames.length === 1) return uniqueNames[0];
  return `${uniqueNames[0]} (+${uniqueNames.length - 1} more)`;
}

export function getRenewalUrgency(dueDateStr?: string, frequency?: string) {
  if (!dueDateStr) {
    return {
      label: 'No Due Date',
      badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
      daysDiff: 9999,
      isOverdue: false,
      isDueToday: false,
      isDueSoon: false
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  if (isNaN(due.getTime())) {
    return {
      label: dueDateStr,
      badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
      daysDiff: 9999,
      isOverdue: false,
      isDueToday: false,
      isDueSoon: false
    };
  }

  const diffTime = due.getTime() - today.getTime();
  const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Overdue:Scheduled generation date has passed
  if (daysDiff < 0) {
    const daysAgo = Math.abs(daysDiff);
    return {
      label: `Overdue (${daysAgo}d ago)`,
      badgeClass: 'bg-red-100 text-red-800 border-red-300 font-bold',
      daysDiff,
      isOverdue: true,
      isDueToday: false,
      isDueSoon: false // STRICTLY false when overdue
    };
  }

  // Frequency specific Due Soon threshold
  // Monthly: last 7 days
  // Quarterly: last month (30 days)
  // Annual: last quarter (90 days)
  // Weekly / Daily: last 2 days
  let dueSoonWindowDays = 7;
  const freq = (frequency || '').toLowerCase();
  if (freq === 'monthly') {
    dueSoonWindowDays = 7;
  } else if (freq === 'quarterly' || freq === 'biannually' || freq === 'bi-annually') {
    dueSoonWindowDays = 30;
  } else if (freq === 'annually' || freq === 'yearly') {
    dueSoonWindowDays = 90;
  } else if (freq === 'weekly' || freq === 'daily') {
    dueSoonWindowDays = 2;
  }

  const isDueToday = daysDiff === 0;
  const isDueSoon = daysDiff >= 0 && daysDiff <= dueSoonWindowDays;

  if (isDueToday) {
    return {
      label: 'Due Today',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-black',
      daysDiff,
      isOverdue: false,
      isDueToday: true,
      isDueSoon: true
    };
  } else if (isDueSoon) {
    return {
      label: `Due in ${daysDiff} day${daysDiff > 1 ? 's' : ''}`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-bold',
      daysDiff,
      isOverdue: false,
      isDueToday: false,
      isDueSoon: true
    };
  } else {
    return {
      label: `Due ${dueDateStr}`,
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200 font-medium',
      daysDiff,
      isOverdue: false,
      isDueToday: false,
      isDueSoon: false
    };
  }
}

const RecurringInvoiceList: React.FC<RecurringInvoiceListProps> = ({
  invoices,
  clients,
  services = [],
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRenewInvoice,
  onTogglePause,
  onToggleArchive
}) => {
  const [activeTab, setActiveTab] = useState<'renewals' | 'templates' | 'archived'>('renewals');
  const [searchTerm, setSearchTerm] = useState('');
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('nextDueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const itemsPerPage = 10;

  const getClientNameById = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.companyName || clients.find(c => c.id === clientId)?.name || 'Unknown Client';
  };

  const stats = useMemo(() => {
    let totalContractValue = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let due30Count = 0;
    let pausedCount = 0;
    let activeCount = 0;

    const activeInvoices = invoices.filter(inv => inv.recurringStatus !== 'archived');
    const archivedInvoices = invoices.filter(inv => inv.recurringStatus === 'archived');

    activeInvoices.forEach(inv => {
      totalContractValue += inv.total;
      if (inv.recurringStatus === 'paused') {
        pausedCount++;
      } else {
        activeCount++;
      }

      const dueDateStr = inv.nextRecurrenceDate || inv.nextDueDate || inv.dueDate;
      const urgency = getRenewalUrgency(dueDateStr, inv.frequency);
      if (urgency.isOverdue) overdueCount++;
      if (urgency.isDueSoon) dueSoonCount++;
      if (urgency.daysDiff >= 0 && urgency.daysDiff <= 30) due30Count++;
    });

    return {
      totalTemplates: activeInvoices.length,
      archivedCount: archivedInvoices.length,
      totalContractValue,
      overdueCount,
      dueSoonCount,
      due30Count,
      pausedCount,
      activeCount
    };
  }, [invoices]);

  const filteredAndSortedInvoices = useMemo(() => {
    let list = [...invoices];

    if (activeTab === 'archived') {
      // Archived View: ONLY include archived recurring invoices
      list = list.filter(inv => inv.recurringStatus === 'archived');
    } else {
      // Active Views (renewals & templates): NEVER include archived recurring invoices
      list = list.filter(inv => inv.recurringStatus !== 'archived');

      if (activeTab === 'renewals') {
        if (renewalFilter === 'overdue') {
          list = list.filter(inv => {
            const date = inv.nextRecurrenceDate || inv.nextDueDate || inv.dueDate;
            return getRenewalUrgency(date, inv.frequency).isOverdue;
          });
        } else if (renewalFilter === 'due-soon') {
          list = list.filter(inv => {
            const date = inv.nextRecurrenceDate || inv.nextDueDate || inv.dueDate;
            return getRenewalUrgency(date, inv.frequency).isDueSoon;
          });
        } else if (renewalFilter === 'due-30-days') {
          list = list.filter(inv => {
            const date = inv.nextRecurrenceDate || inv.nextDueDate || inv.dueDate;
            const urgency = getRenewalUrgency(date, inv.frequency);
            return urgency.daysDiff >= 0 && urgency.daysDiff <= 30;
          });
        } else if (renewalFilter === 'paused') {
          list = list.filter(inv => inv.recurringStatus === 'paused');
        }
      }
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      list = list.filter(inv => {
        const clientName = getClientNameById(inv.clientId).toLowerCase();
        const invoiceNum = inv.invoiceNumber.toLowerCase();
        const serviceName = getInvoiceServicesSummary(inv, services).toLowerCase();
        const freqLabel = formatFrequencyLabel(inv.frequency).toLowerCase();
        const statusLabel = (inv.recurringStatus || inv.status || '').toLowerCase();
        return (
          clientName.includes(query) ||
          invoiceNum.includes(query) ||
          serviceName.includes(query) ||
          freqLabel.includes(query) ||
          statusLabel.includes(query)
        );
      });
    }

    // Sort invoices
    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortKey) {
        case 'nextDueDate': {
          const dateA = a.nextRecurrenceDate || a.nextDueDate || a.dueDate || '9999-12-31';
          const dateB = b.nextRecurrenceDate || b.nextDueDate || b.dueDate || '9999-12-31';
          valA = new Date(dateA).getTime();
          valB = new Date(dateB).getTime();
          if (isNaN(valA)) valA = 9999999999999;
          if (isNaN(valB)) valB = 9999999999999;
          break;
        }
        case 'clientName':
          valA = getClientNameById(a.clientId);
          valB = getClientNameById(b.clientId);
          break;
        case 'invoiceNumber':
          valA = a.invoiceNumber;
          valB = b.invoiceNumber;
          break;
        case 'service':
          valA = getInvoiceServicesSummary(a, services);
          valB = getInvoiceServicesSummary(b, services);
          break;
        case 'frequency':
          valA = formatFrequencyLabel(a.frequency);
          valB = formatFrequencyLabel(b.frequency);
          break;
        case 'total':
          valA = a.total;
          valB = b.total;
          break;
        case 'status':
          valA = a.recurringStatus || a.status;
          valB = b.recurringStatus || b.status;
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

    return list;
  }, [invoices, clients, services, activeTab, renewalFilter, searchTerm, sortKey, sortDirection]);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedInvoices, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedInvoices.length / itemsPerPage);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">↕</span>;
    return sortDirection === 'asc' ? <span className="text-primary-600 ml-1 font-black">↑</span> : <span className="text-primary-600 ml-1 font-black">↓</span>;
  };

  const handleRenewClick = async (invoice: Invoice) => {
    if (!onRenewInvoice) return;
    setRenewingId(invoice.id);
    try {
      await onRenewInvoice(invoice);
    } finally {
      setRenewingId(null);
    }
  };

  const handleTogglePauseClick = async (invoice: Invoice) => {
    if (!onTogglePause) return;
    setPausingId(invoice.id);
    try {
      await onTogglePause(invoice);
    } finally {
      setPausingId(null);
    }
  };

  const handleToggleArchiveClick = async (invoice: Invoice) => {
    if (!onToggleArchive) return;
    setArchivingId(invoice.id);
    try {
      await onToggleArchive(invoice);
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string, number: string) => {
    e.stopPropagation();
    if (onDeleteInvoice && window.confirm(`Are you sure you want to delete recurring template ${number}? This action cannot be undone.`)) {
      onDeleteInvoice(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Due Soon */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-100/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Due Soon</p>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Icon name="repeat" className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-amber-900">{stats.dueSoonCount}</h3>
            <p className="text-xs text-amber-700 mt-1">Approaching next generation date</p>
          </div>
        </div>

        {/* Card 2: Overdue Generation */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Overdue Generation</p>
            <span className="p-2 rounded-xl bg-red-50 text-red-600">
              <Icon name="invoices" className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-red-600">{stats.overdueCount}</h3>
            <p className="text-xs text-red-500 mt-1">Scheduled generation date passed</p>
          </div>
        </div>

        {/* Card 3: Active Schedules */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Active Schedules</p>
            <span className="p-2 rounded-xl bg-green-50 text-green-600">
              <Icon name="services" className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-green-700">{stats.activeCount}</h3>
            <p className="text-xs text-green-600 mt-1">{stats.pausedCount} paused • {stats.archivedCount} archived</p>
          </div>
        </div>

        {/* Card 4: Contract Value */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Contract Value</p>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Icon name="reports" className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-blue-900">₦{stats.totalContractValue.toLocaleString()}</h3>
            <p className="text-xs text-blue-600 mt-1">Total active value per cycle</p>
          </div>
        </div>
      </div>

      {/* Main Module Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Module Header */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-primary-100 text-primary-700">
                  <Icon name="repeat" className="w-6 h-6" />
                </span>
                <h2 className="text-xl font-bold text-gray-900">Recurring Invoices & Renewals</h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Automated recurring invoice management. View upcoming renewal dates, separate due soon from overdue, and archive inactive schedules.
              </p>
            </div>

            {/* Main Tabs (Renewals, Active Templates, Archived Templates) */}
            <div className="flex items-center bg-gray-200/60 p-1 rounded-xl self-start md:self-auto">
              <button
                onClick={() => { setActiveTab('renewals'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'renewals'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>Invoices Due for Renewal</span>
                {stats.dueSoonCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white">
                    {stats.dueSoonCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('templates'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'templates'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>All Active Templates</span>
                <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-gray-300 text-gray-700">
                  {stats.totalTemplates}
                </span>
              </button>

              <button
                onClick={() => { setActiveTab('archived'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'archived'
                    ? 'bg-white text-amber-800 shadow-sm font-black'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>📦 Archived</span>
                {stats.archivedCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    {stats.archivedCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search Bar & Sub-Filters */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Icon name="search" className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search by client, invoice #, service, frequency..."
                className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sub-Filters for Renewals */}
            {activeTab === 'renewals' && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                <button
                  onClick={() => { setRenewalFilter('all'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    renewalFilter === 'all'
                      ? 'bg-gray-900 text-white font-bold'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  All Active
                </button>
                <button
                  onClick={() => { setRenewalFilter('due-soon'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
                    renewalFilter === 'due-soon'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
                  }`}
                >
                  <span>Due Soon</span>
                  {stats.dueSoonCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-900 font-bold">
                      {stats.dueSoonCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setRenewalFilter('overdue'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
                    renewalFilter === 'overdue'
                      ? 'bg-red-600 text-white font-bold'
                      : 'bg-white text-red-700 hover:bg-red-50 border border-red-200'
                  }`}
                >
                  <span>Overdue</span>
                  {stats.overdueCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-100 text-red-900 font-bold">
                      {stats.overdueCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setRenewalFilter('due-30-days'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    renewalFilter === 'due-30-days'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
                  }`}
                >
                  Next 30 Days
                </button>
                <button
                  onClick={() => { setRenewalFilter('paused'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    renewalFilter === 'paused'
                      ? 'bg-gray-700 text-white font-bold'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  Paused ({stats.pausedCount})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Banner */}
        <div className="bg-primary-50/40 px-6 py-2.5 border-b border-primary-100/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-primary-900 font-semibold">
            <span className="w-2 h-2 rounded-full bg-primary-600 animate-pulse"></span>
            <span>
              {activeTab === 'renewals'
                ? `Showing ${filteredAndSortedInvoices.length} recurring invoices in renewal schedule`
                : activeTab === 'templates'
                ? `Showing ${filteredAndSortedInvoices.length} active recurring template contracts`
                : `Showing ${filteredAndSortedInvoices.length} archived recurring templates (hidden from active generation)`}
            </span>
          </div>
          <span className="text-gray-400 text-[11px]">
            Sorted by: <strong className="text-gray-700">{sortKey === 'nextDueDate' ? 'Nearest Next Due Date' : sortKey}</strong>
          </span>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-gray-600">
            <thead className="text-[11px] font-bold text-gray-600 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('clientName')}
                >
                  Client Name {getSortIcon('clientName')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('invoiceNumber')}
                >
                  Invoice Number {getSortIcon('invoiceNumber')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('service')}
                >
                  Service {getSortIcon('service')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('nextDueDate')}
                >
                  Next Due Date {getSortIcon('nextDueDate')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('frequency')}
                >
                  Frequency {getSortIcon('frequency')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('total')}
                >
                  Amount {getSortIcon('total')}
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  Status {getSortIcon('status')}
                </th>
                <th scope="col" className="px-6 py-3.5 text-right font-bold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paginatedInvoices.map((invoice) => {
                const clientName = getClientNameById(invoice.clientId);
                const serviceSummary = getInvoiceServicesSummary(invoice, services);
                const dueDateStr = invoice.nextRecurrenceDate || invoice.nextDueDate || invoice.dueDate;
                const urgency = getRenewalUrgency(dueDateStr, invoice.frequency);
                const isArchived = invoice.recurringStatus === 'archived';
                const isPaused = invoice.recurringStatus === 'paused';

                return (
                  <tr
                    key={invoice.id}
                    className={`hover:bg-gray-50/80 transition-colors group border-b border-gray-100 ${
                      isArchived ? 'bg-gray-50/50 opacity-80' : ''
                    }`}
                  >
                    {/* Client Name */}
                    <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs uppercase flex-shrink-0 ${
                          isArchived ? 'bg-gray-200 text-gray-600' : 'bg-primary-100 text-primary-700'
                        }`}>
                          {clientName.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{clientName}</div>
                          {invoice.lastGeneratedDate && (
                            <div className="text-[10px] text-gray-400 font-normal">
                              Last renewed: {invoice.lastGeneratedDate}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Invoice Number */}
                    <td className="px-6 py-4 font-mono font-bold text-primary-700 whitespace-nowrap">
                      <button
                        onClick={() => onViewInvoice(invoice.id)}
                        className="hover:underline hover:text-primary-900 text-left"
                      >
                        {invoice.invoiceNumber}
                      </button>
                    </td>

                    {/* Service */}
                    <td className="px-6 py-4 font-medium text-gray-700 max-w-xs truncate">
                      <span className="inline-block truncate max-w-[200px]" title={serviceSummary}>
                        {serviceSummary}
                      </span>
                    </td>

                    {/* Next Due Date */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-gray-900">{dueDateStr || 'N/A'}</span>
                        {isArchived ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 border border-gray-200 w-fit">
                            Archived
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border w-fit ${urgency.badgeClass}`}
                          >
                            {urgency.label}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Frequency */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-primary-50 text-primary-700 border border-primary-100">
                        {formatFrequencyLabel(invoice.frequency)}
                      </span>
                    </td>

                    {/* Total Amount */}
                    <td className="px-6 py-4 font-bold text-gray-900 whitespace-nowrap">
                      ₦{invoice.total.toLocaleString()}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {isArchived ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700 border border-gray-300 w-fit">
                            📦 Archived
                          </span>
                        ) : (
                          <>
                            <InvoiceStatusBadge status={invoice.status} />
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider ${
                                isPaused ? 'text-amber-600' : 'text-green-600'
                              }`}
                            >
                              {isPaused ? '⏸️ Paused' : '⚡ Schedule Active'}
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right whitespace-nowrap space-x-2">
                      {isArchived ? (
                        /* Restore Action Button */
                        onToggleArchive && (
                          <button
                            onClick={() => handleToggleArchiveClick(invoice)}
                            disabled={archivingId === invoice.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all active:scale-95"
                            title="Restore recurring schedule to active lists"
                          >
                            {archivingId === invoice.id ? (
                              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                              <span>🔄 Restore Schedule</span>
                            )}
                          </button>
                        )
                      ) : (
                        <>
                          {/* Renew Now Action Button */}
                          {onRenewInvoice && (
                            <button
                              onClick={() => handleRenewClick(invoice)}
                              disabled={renewingId === invoice.id || isPaused}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                isPaused
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                  : 'bg-primary-600 hover:bg-primary-700 text-white active:scale-95'
                              }`}
                              title={isPaused ? 'Resume schedule to generate renewal' : 'Generate current cycle renewal invoice'}
                            >
                              {renewingId === invoice.id ? (
                                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <span>⚡ Renew Now</span>
                              )}
                            </button>
                          )}

                          {/* Pause / Resume Button */}
                          {onTogglePause && (
                            <button
                              onClick={() => handleTogglePauseClick(invoice)}
                              disabled={pausingId === invoice.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                              title={isPaused ? 'Resume renewal schedule' : 'Pause automatic renewal schedule'}
                            >
                              {pausingId === invoice.id ? '...' : isPaused ? '▶️ Resume' : '⏸️ Pause'}
                            </button>
                          )}

                          {/* Archive Action Button */}
                          {onToggleArchive && (
                            <button
                              onClick={() => handleToggleArchiveClick(invoice)}
                              disabled={archivingId === invoice.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                              title="Archive schedule (hide without deleting)"
                            >
                              {archivingId === invoice.id ? '...' : '📦 Archive'}
                            </button>
                          )}
                        </>
                      )}

                      {/* View Action */}
                      <button
                        onClick={() => onViewInvoice(invoice.id)}
                        className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="View details"
                      >
                        👁️
                      </button>

                      {/* Edit Action */}
                      {!isArchived && onEditInvoice && (
                        <button
                          onClick={() => onEditInvoice(invoice.id)}
                          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Edit template"
                        >
                          ✏️
                        </button>
                      )}

                      {/* Delete Action */}
                      {onDeleteInvoice && (
                        <button
                          onClick={(e) => handleDelete(e, invoice.id, invoice.invoiceNumber)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete template"
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {paginatedInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="p-3 bg-gray-100 rounded-full text-gray-400">
                        <Icon name="repeat" className="w-8 h-8" />
                      </span>
                      <p className="font-bold text-gray-700 text-sm">
                        {activeTab === 'archived'
                          ? 'No archived recurring invoices'
                          : 'No recurring invoices found'}
                      </p>
                      <p className="text-xs text-gray-400 max-w-sm">
                        {searchTerm || renewalFilter !== 'all'
                          ? 'Try clearing your search query or changing filter settings.'
                          : activeTab === 'archived'
                          ? 'Archived recurring templates will appear here and can be restored at any time.'
                          : 'Create a recurring invoice template from the "Invoices" or "Create Invoice" tab to enable automated renewal tracking.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex justify-between items-center text-xs">
            <span className="text-gray-500">
              Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredAndSortedInvoices.length} total)
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Previous
              </button>
              {[...Array(totalPages)].map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index + 1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    currentPage === index + 1
                      ? 'bg-primary-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecurringInvoiceList;
