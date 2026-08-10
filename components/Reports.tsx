import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import {
  LayoutDashboard, TrendingUp, Receipt, Percent, FileText,
  Users, Briefcase, Sparkles, Download, Calendar, ArrowUpRight,
  ArrowDownRight, AlertTriangle, CheckCircle2, Search, Filter,
  Clock, DollarSign, Layers, PieChart as PieIcon, Copy, Check, ShieldAlert,
  Repeat, RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { Invoice, Client, Service, InvoiceStatus } from '../types';
import { generateTextResponse } from '../services/aiGenerationService';
import { getSubscriptionInfo } from '../services/subscriptionService';
import ReactMarkdown from 'react-markdown';
import GlobalFilterBar from './GlobalFilterBar';
import { calculateServiceTotalCost, calculateServiceMarginPct } from '../lib/margin';
import {
  GlobalFilterState,
  loadGlobalFilterFromSession,
  saveGlobalFilterToSession,
  filterInvoices
} from '../lib/globalFilter';

// Helper to convert data to CSV string
const convertToCsv = (data: any[], headers: string[]): string => {
  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of data) {
    const values = headers.map(header => {
      let value = row[header];
      if (value === undefined || value === null) value = '';
      if (typeof value === 'string' && value.includes(',')) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
};

// Helper to download CSV
const downloadCsv = (csvString: string, filename: string) => {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export type ReportTab =
  | 'overview'
  | 'revenue'
  | 'expenses'
  | 'profitability'
  | 'invoices'
  | 'clients'
  | 'services'
  | 'ai-usage';

type DateRange = 'all_time' | 'last_30_days' | 'this_quarter' | 'this_year';

interface ReportsProps {
  invoices: Invoice[];
  clients: Client[];
  services: Service[];
  activeTenantId?: string;
  globalFilter?: GlobalFilterState;
  onFilterChange?: (filter: GlobalFilterState) => void;
}

export const getMarginBadge = (marginPct: number) => {
  if (marginPct >= 40) {
    return {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      badge: 'bg-emerald-500 text-white',
      dot: 'bg-emerald-500',
      label: 'High Margin (≥40%)',
      status: 'High'
    };
  } else if (marginPct >= 20) {
    return {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      badge: 'bg-amber-500 text-white',
      dot: 'bg-amber-500',
      label: 'Moderate (20-39%)',
      status: 'Moderate'
    };
  } else {
    return {
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      badge: 'bg-rose-500 text-white',
      dot: 'bg-rose-500',
      label: 'Low Margin (<20%)',
      status: 'Low'
    };
  }
};

const Reports: React.FC<ReportsProps> = ({
  invoices,
  clients,
  services,
  activeTenantId,
  globalFilter,
  onFilterChange
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [dateRange, setDateRange] = useState<DateRange>('all_time');
  const [reportQuery, setReportQuery] = useState('');
  const [aiReportResponse, setAiReportResponse] = useState<string | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [copiedDossier, setCopiedDossier] = useState(false);

  // Search filter states for sub-tables
  const [expenseTableSearch, setExpenseTableSearch] = useState('');
  const [profitabilityTableSearch, setProfitabilityTableSearch] = useState('');
  const [clientTableSearch, setClientTableSearch] = useState('');
  const [serviceTableSearch, setServiceTableSearch] = useState('');

  // Sorting and Pagination states for Client Activity Ledger
  const [clientTableSortField, setClientTableSortField] = useState<'companyName' | 'invoiceCount' | 'totalRevenue' | 'outstanding'>('totalRevenue');
  const [clientTableSortOrder, setClientTableSortOrder] = useState<'asc' | 'desc'>('desc');
  const [clientPageSize, setClientPageSize] = useState<number>(10);
  const [clientCurrentPage, setClientCurrentPage] = useState<number>(1);

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

  const globallyFilteredInvoices = useMemo(() => {
    return filterInvoices(invoices, services, clients, currentFilter);
  }, [invoices, services, clients, currentFilter]);

  const [subTrigger, setSubTrigger] = useState(0);

  useEffect(() => {
    const handleSubChange = () => setSubTrigger(prev => prev + 1);
    window.addEventListener('cravebiz_subscription_change', handleSubChange);
    return () => window.removeEventListener('cravebiz_subscription_change', handleSubChange);
  }, []);

  const subInfo = useMemo(() => getSubscriptionInfo(activeTenantId || ''), [activeTenantId, subTrigger]);

  const isPlanFree = subInfo.tier === 'Free' && subInfo.aiUnits <= 0;
  const isUnitsDepleted = subInfo.aiUnits <= 0;
  const isAiEnabled = subInfo.aiModeEnabled;
  const hasAiAccess = !isPlanFree && !isUnitsDepleted;

  const isTextareaDisabled = isLoadingReport || !isAiEnabled || !hasAiAccess;
  const placeholderText = isPlanFree
    ? "AI Performance Analysis is not available on the Free Subscription Plan. Please upgrade in workspace settings."
    : isUnitsDepleted
    ? "Your subscription AI units are depleted. Please recharge or upgrade to ask financial questions."
    : !isAiEnabled
    ? "AI Mode is turned OFF. Enable AI Mode in the workspace header or settings to ask financial questions."
    : "Ask a specific financial, profitability, or cost question about your operations...";

  const isInvoiceInDateRange = useCallback((invoice: Invoice, startDate: Date | null, endDate: Date | null) => {
    const invoiceDate = new Date(invoice.issueDate);
    if (startDate && invoiceDate < startDate) return false;
    if (endDate && invoiceDate > endDate) return false;
    return true;
  }, []);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = now;

    switch (dateRange) {
      case 'last_30_days':
        start = new Date(now);
        start.setDate(now.getDate() - 30);
        break;
      case 'this_quarter': {
        const currentMonth = now.getMonth();
        const quarterStartMonth = currentMonth - (currentMonth % 3);
        start = new Date(now.getFullYear(), quarterStartMonth, 1);
        break;
      }
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = null;
        end = null;
        break;
    }
    return { startDate: start, endDate: end };
  }, [dateRange]);

  const [invoiceSubTab, setInvoiceSubTab] = useState<'both' | 'onetime' | 'recurring'>('both');

  const filteredInvoices = useMemo(() => {
    if (dateRange === 'all_time') return globallyFilteredInvoices;
    return globallyFilteredInvoices.filter(inv => isInvoiceInDateRange(inv, startDate, endDate));
  }, [globallyFilteredInvoices, dateRange, startDate, endDate, isInvoiceInDateRange]);

  // Comprehensive invoice dataset for Invoice tab including recurring templates
  const allGloballyFilteredInvoices = useMemo(() => {
    return filterInvoices(invoices, services, clients, currentFilter, true);
  }, [invoices, services, clients, currentFilter]);

  const allFilteredInvoices = useMemo(() => {
    if (dateRange === 'all_time') return allGloballyFilteredInvoices;
    return allGloballyFilteredInvoices.filter(inv => isInvoiceInDateRange(inv, startDate, endDate));
  }, [allGloballyFilteredInvoices, dateRange, startDate, endDate, isInvoiceInDateRange]);

  // Partition invoices into One-Time and Recurring
  const oneTimeInvoices = useMemo(() => {
    return allFilteredInvoices.filter(
      inv => !inv.isRecurringTemplate && (!inv.frequency || inv.frequency === 'one-time') && !inv.parentInvoiceId
    );
  }, [allFilteredInvoices]);

  const recurringInvoices = useMemo(() => {
    return allFilteredInvoices.filter(
      inv => inv.isRecurringTemplate || (inv.frequency && inv.frequency !== 'one-time') || !!inv.parentInvoiceId
    );
  }, [allFilteredInvoices]);

  // Helper for independent section statistics
  const calculateInvoiceSectionStats = useCallback((invList: Invoice[]) => {
    const paid = invList.filter(i => i.status === InvoiceStatus.Paid);
    const overdue = invList.filter(i => i.status === InvoiceStatus.Overdue);
    const sent = invList.filter(i => i.status === InvoiceStatus.Sent);
    const draft = invList.filter(i => i.status === InvoiceStatus.Draft);

    const totalCount = invList.length;
    const paidCount = paid.length;
    const overdueCount = overdue.length;
    const sentCount = sent.length;
    const draftCount = draft.length;

    const totalRevenue = paid.reduce((sum, i) => sum + i.total, 0);
    const totalOverdueRevenue = overdue.reduce((sum, i) => sum + i.total, 0);
    const totalSentRevenue = sent.reduce((sum, i) => sum + i.total, 0);
    const totalVolume = invList.reduce((sum, i) => sum + i.total, 0);

    const averageTicket = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0;

    let averagePaymentTermDays = 0;
    if (paid.length > 0) {
      const totalDays = paid.reduce((sum, invoice) => {
        const issue = new Date(invoice.issueDate);
        const due = new Date(invoice.dueDate);
        const diffTime = Math.abs(due.getTime() - issue.getTime());
        return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }, 0);
      averagePaymentTermDays = Math.round(totalDays / paid.length);
    }

    const statusData = [
      { name: 'Paid', value: paidCount, color: '#22c55e' },
      { name: 'Overdue', value: overdueCount, color: '#ef4444' },
      { name: 'Sent', value: sentCount, color: '#3b82f6' },
      { name: 'Draft', value: draftCount, color: '#6b7280' }
    ].filter(d => d.value > 0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const ageGroups = {
      '1-30 Days': { count: 0, amount: 0 },
      '31-60 Days': { count: 0, amount: 0 },
      '61-90 Days': { count: 0, amount: 0 },
      '90+ Days': { count: 0, amount: 0 },
    };
    overdue.forEach(invoice => {
      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 1 && diffDays <= 30) { ageGroups['1-30 Days'].count++; ageGroups['1-30 Days'].amount += invoice.total; }
      else if (diffDays >= 31 && diffDays <= 60) { ageGroups['31-60 Days'].count++; ageGroups['31-60 Days'].amount += invoice.total; }
      else if (diffDays >= 61 && diffDays <= 90) { ageGroups['61-90 Days'].count++; ageGroups['61-90 Days'].amount += invoice.total; }
      else if (diffDays > 90) { ageGroups['90+ Days'].count++; ageGroups['90+ Days'].amount += invoice.total; }
    });
    const overdueAgingData = Object.entries(ageGroups).map(([label, data]) => ({ label, ...data }));

    const sentOrPaid = sentCount + paidCount + overdueCount;
    const draftToSent = totalCount > 0 ? (sentOrPaid / totalCount) * 100 : 0;
    const sentToPaid = sentOrPaid > 0 ? (paidCount / sentOrPaid) * 100 : 0;
    const totalPaidRate = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

    const monthlyDataMap = new Map<string, { total: number; count: number }>();
    paid.forEach(invoice => {
      const monthYear = new Date(invoice.issueDate).toLocaleString('en-US', { year: 'numeric', month: 'short' });
      const currentData = monthlyDataMap.get(monthYear) || { total: 0, count: 0 };
      monthlyDataMap.set(monthYear, { total: currentData.total + invoice.total, count: currentData.count + 1 });
    });
    const averageValueOverTime = Array.from(monthlyDataMap.entries())
      .map(([name, data]) => ({ name, avgValue: Math.round(data.total / data.count) }))
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());

    return {
      totalCount,
      paidCount,
      overdueCount,
      sentCount,
      draftCount,
      totalRevenue,
      totalOverdueRevenue,
      totalSentRevenue,
      totalVolume,
      averageTicket,
      averagePaymentTermDays,
      statusData,
      overdueAgingData,
      conversionRates: { draftToSent, sentToPaid, totalPaidRate },
      averageValueOverTime
    };
  }, []);

  const oneTimeStats = useMemo(() => calculateInvoiceSectionStats(oneTimeInvoices), [oneTimeInvoices, calculateInvoiceSectionStats]);
  const recurringStats = useMemo(() => calculateInvoiceSectionStats(recurringInvoices), [recurringInvoices, calculateInvoiceSectionStats]);

  const recurringExtraStats = useMemo(() => {
    const activeSchedulesCount = recurringInvoices.filter(i => i.recurringStatus !== 'paused').length;
    const pausedSchedulesCount = recurringInvoices.filter(i => i.recurringStatus === 'paused').length;
    const totalContractValue = recurringInvoices.reduce((sum, i) => sum + i.total, 0);

    const freqMap: Record<string, { count: number; value: number }> = {};
    recurringInvoices.forEach(inv => {
      const freqKey = inv.frequency || 'monthly';
      const label = freqKey.charAt(0).toUpperCase() + freqKey.slice(1);
      if (!freqMap[label]) freqMap[label] = { count: 0, value: 0 };
      freqMap[label].count += 1;
      freqMap[label].value += inv.total;
    });

    const frequencyDistribution = Object.entries(freqMap).map(([name, data]) => ({
      name,
      count: data.count,
      value: data.value
    }));

    return {
      activeSchedulesCount,
      pausedSchedulesCount,
      totalContractValue,
      frequencyDistribution
    };
  }, [recurringInvoices]);

  // Invoice status subsets
  const paidInvoices = useMemo(() => filteredInvoices.filter(inv => inv.status === InvoiceStatus.Paid), [filteredInvoices]);
  const overdueInvoices = useMemo(() => filteredInvoices.filter(inv => inv.status === InvoiceStatus.Overdue), [filteredInvoices]);
  const sentInvoices = useMemo(() => filteredInvoices.filter(inv => inv.status === InvoiceStatus.Sent), [filteredInvoices]);
  const draftInvoices = useMemo(() => filteredInvoices.filter(inv => inv.status === InvoiceStatus.Draft), [filteredInvoices]);

  const paidInvoicesCount = paidInvoices.length;
  const overdueInvoicesCount = overdueInvoices.length;
  const sentInvoicesCount = sentInvoices.length;
  const draftInvoicesCount = draftInvoices.length;
  const totalInvoicesOverall = filteredInvoices.length;

  // Revenue sums
  const totalRevenue = useMemo(() => paidInvoices.reduce((sum, inv) => sum + inv.total, 0), [paidInvoices]);
  const totalOverdueRevenue = useMemo(() => overdueInvoices.reduce((sum, inv) => sum + inv.total, 0), [overdueInvoices]);
  const totalSentRevenue = useMemo(() => sentInvoices.reduce((sum, inv) => sum + inv.total, 0), [sentInvoices]);
  const averageInvoiceTicket = useMemo(() => paidInvoicesCount > 0 ? totalRevenue / paidInvoicesCount : 0, [totalRevenue, paidInvoicesCount]);

  // Calculate Direct Costs, Service Performance & Profitability
  const {
    totalDirectCost,
    grossProfit,
    profitMarginPct,
    costToRevenueRatio,
    serviceBreakdown,
    categoryBreakdown,
    totalUnitsDelivered
  } = useMemo(() => {
    let revSum = 0;
    let costSum = 0;
    let totalUnits = 0;

    const serviceMap = new Map<string, {
      serviceId: string;
      serviceName: string;
      category: string;
      revenue: number;
      directCost: number;
      unitsSold: number;
      invoiceIds: Set<string>;
    }>();

    // Seed serviceMap with all catalog services to ensure new services are automatically included in A-Z position
    services.forEach(s => {
      serviceMap.set(s.id, {
        serviceId: s.id,
        serviceName: s.name,
        category: s.category || 'General',
        revenue: 0,
        directCost: 0,
        unitsSold: 0,
        invoiceIds: new Set<string>()
      });
    });

    const categoryMap = new Map<string, { category: string; directCost: number; revenue: number }>();

    paidInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const qty = Number(item.quantity) || 1;
        const itemRevenue = Number(item.price) * qty;

        const matchingService = services.find(s => (item.serviceId && s.id === item.serviceId) || (s.name && item.description && s.name.trim().toLowerCase() === item.description.trim().toLowerCase()));
        const itemDc = item.directCost !== undefined && item.directCost !== null ? Number(item.directCost) : -1;
        const itemIc = item.indirectCost !== undefined && item.indirectCost !== null ? Number(item.indirectCost) : -1;
        const serviceDc = Number(matchingService?.directCost || 0);
        const serviceIc = Number(matchingService?.indirectCost || 0);

        const unitDirectCost = itemDc >= 0 ? itemDc : serviceDc;
        const unitIndirectCost = itemIc >= 0 ? itemIc : serviceIc;
        const unitTotalCost = calculateServiceTotalCost(unitDirectCost, unitIndirectCost);
        const itemCost = unitTotalCost * qty;

        revSum += itemRevenue;
        costSum += itemCost;
        totalUnits += qty;

        const sKey = matchingService?.id || item.serviceId || item.description || 'General Service';
        const sName = matchingService?.name || item.description || 'Custom Service';
        const sCategory = matchingService?.category || 'General';

        if (!serviceMap.has(sKey)) {
          serviceMap.set(sKey, {
            serviceId: sKey,
            serviceName: sName,
            category: sCategory,
            revenue: 0,
            directCost: 0,
            unitsSold: 0,
            invoiceIds: new Set<string>()
          });
        }
        const sData = serviceMap.get(sKey)!;
        sData.revenue += itemRevenue;
        sData.directCost += itemCost;
        sData.unitsSold += qty;
        sData.invoiceIds.add(inv.id);

        if (!categoryMap.has(sCategory)) {
          categoryMap.set(sCategory, { category: sCategory, directCost: 0, revenue: 0 });
        }
        const cData = categoryMap.get(sCategory)!;
        cData.directCost += itemCost;
        cData.revenue += itemRevenue;
      });
    });

    const netProfit = revSum - costSum;
    const marginPct = revSum > 0 ? (netProfit / revSum) * 100 : 0;
    const costRatio = revSum > 0 ? (costSum / revSum) * 100 : 0;

    const sBreakdown = Array.from(serviceMap.values()).map(s => {
      const profit = s.revenue - s.directCost;
      const matchingSrv = services.find(srv => srv.id === s.serviceId || srv.name.trim().toLowerCase() === s.serviceName.trim().toLowerCase());
      const margin = s.revenue > 0
        ? (profit / s.revenue) * 100
        : calculateServiceMarginPct(matchingSrv?.price || 0, matchingSrv?.directCost, matchingSrv?.indirectCost);
      return {
        ...s,
        invoiceCount: s.invoiceIds.size,
        profit,
        profitMarginPct: margin,
        badge: getMarginBadge(margin)
      };
    }).sort((a, b) => a.serviceName.localeCompare(b.serviceName, undefined, { sensitivity: 'base' }));

    const cBreakdown = Array.from(categoryMap.values()).sort((a, b) => b.directCost - a.directCost);

    return {
      totalDirectCost: costSum,
      grossProfit: netProfit,
      profitMarginPct: marginPct,
      costToRevenueRatio: costRatio,
      serviceBreakdown: sBreakdown,
      categoryBreakdown: cBreakdown,
      totalUnitsDelivered: totalUnits
    };
  }, [paidInvoices, services]);

  const topMarginService = useMemo(() => {
    if (serviceBreakdown.length === 0) return null;
    return [...serviceBreakdown].sort((a, b) => b.profitMarginPct - a.profitMarginPct)[0];
  }, [serviceBreakdown]);

  const lowMarginServices = useMemo(() => {
    return serviceBreakdown.filter(s => s.profitMarginPct < 20);
  }, [serviceBreakdown]);

  const highestCostCategory = useMemo(() => {
    return categoryBreakdown.length > 0 ? categoryBreakdown[0].category : 'N/A';
  }, [categoryBreakdown]);

  // Chart datasets
  const trendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const last6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6.push({
        month: d.getMonth(),
        year: d.getFullYear(),
        name: months[d.getMonth()],
        revenue: 0,
        directCost: 0,
        grossProfit: 0
      });
    }

    paidInvoices.forEach(inv => {
      const invDate = new Date(inv.issueDate);
      const m = invDate.getMonth();
      const y = invDate.getFullYear();
      const match = last6.find(d => d.month === m && d.year === y);
      if (match) {
        let invRev = 0;
        let invCost = 0;
        inv.items.forEach(item => {
          const qty = Number(item.quantity) || 1;
          const r = Number(item.price) * qty;
          const matchingService = services.find(s => (item.serviceId && s.id === item.serviceId) || (s.name && item.description && s.name.trim().toLowerCase() === item.description.trim().toLowerCase()));
          const itemDc = item.directCost !== undefined && item.directCost !== null ? Number(item.directCost) : 0;
          const serviceDc = Number(matchingService?.directCost || 0);
          const unitDc = itemDc > 0 ? itemDc : (serviceDc > 0 ? serviceDc : itemDc);
          const c = unitDc * qty;
          invRev += r;
          invCost += c;
        });
        match.revenue += invRev;
        match.directCost += invCost;
        match.grossProfit += (invRev - invCost);
      }
    });

    return last6;
  }, [paidInvoices, services]);

  const invoiceStatusData = useMemo(() => [
    { name: 'Paid', value: paidInvoicesCount, color: '#22c55e' },
    { name: 'Overdue', value: overdueInvoicesCount, color: '#ef4444' },
    { name: 'Sent', value: sentInvoicesCount, color: '#3b82f6' },
    { name: 'Draft', value: draftInvoicesCount, color: '#6b7280' },
  ], [paidInvoicesCount, overdueInvoicesCount, sentInvoicesCount, draftInvoicesCount]);

  const marginStatusDistributionData = useMemo(() => {
    const high = serviceBreakdown.filter(s => s.profitMarginPct >= 40).length;
    const moderate = serviceBreakdown.filter(s => s.profitMarginPct >= 20 && s.profitMarginPct < 40).length;
    const low = serviceBreakdown.filter(s => s.profitMarginPct < 20).length;
    return [
      { name: 'High Margin (≥40%)', value: high, color: '#10b981' },
      { name: 'Moderate (20-39%)', value: moderate, color: '#f59e0b' },
      { name: 'Low Margin (<20%)', value: low, color: '#f43f5e' },
    ].filter(d => d.value > 0);
  }, [serviceBreakdown]);

  const revenueByServiceChart = useMemo(() => {
    return serviceBreakdown.map(s => ({
      name: s.serviceName,
      revenue: s.revenue,
      directCost: s.directCost,
      unitsSold: s.unitsSold
    }));
  }, [serviceBreakdown]);

  const averageInvoiceValueOverTime = useMemo(() => {
    const monthlyDataMap = new Map<string, { total: number, count: number }>();
    paidInvoices.forEach(invoice => {
      const monthYear = new Date(invoice.issueDate).toLocaleString('en-US', { year: 'numeric', month: 'short' });
      const currentData = monthlyDataMap.get(monthYear) || { total: 0, count: 0 };
      monthlyDataMap.set(monthYear, { total: currentData.total + invoice.total, count: currentData.count + 1 });
    });
    return Array.from(monthlyDataMap.entries())
      .map(([name, data]) => ({ name, avgValue: Math.round(data.total / data.count) }))
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
  }, [paidInvoices]);

  const averagePaymentTermDays = useMemo(() => {
    if (paidInvoices.length === 0) return 0;
    const totalDays = paidInvoices.reduce((sum, invoice) => {
      const issue = new Date(invoice.issueDate);
      const due = new Date(invoice.dueDate);
      const diffTime = Math.abs(due.getTime() - issue.getTime());
      return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }, 0);
    return Math.round(totalDays / paidInvoices.length);
  }, [paidInvoices]);

  const clientLifetimeValue = useMemo(() => {
    const clientLTVMap = new Map<string, { companyName: string; totalRevenue: number; outstanding: number; invoiceCount: number }>();
    filteredInvoices.forEach(invoice => {
      const client = clients.find(c => c.id === invoice.clientId);
      const name = client ? client.companyName : 'Unassigned Client';
      const current = clientLTVMap.get(name) || { companyName: name, totalRevenue: 0, outstanding: 0, invoiceCount: 0 };
      const isPaid = invoice.status === InvoiceStatus.Paid || (invoice.amountPaid || 0) >= invoice.total - 0.001;
      const paidAmt = isPaid ? invoice.total : (invoice.amountPaid || 0);
      const outstandingAmt = isPaid ? 0 : Math.max(0, invoice.total - paidAmt);
      current.totalRevenue += paidAmt;
      current.outstanding += outstandingAmt;
      current.invoiceCount += 1;
      clientLTVMap.set(name, current);
    });
    return Array.from(clientLTVMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredInvoices, clients]);

  // Filtered and Sorted Client List for Client Activity Ledger
  const filteredClientList = useMemo(() => {
    const query = clientTableSearch.trim().toLowerCase();
    let list = clientLifetimeValue;
    if (query) {
      list = list.filter(c => c.companyName.toLowerCase().includes(query));
    }

    return [...list].sort((a, b) => {
      const aVal = a[clientTableSortField];
      const bVal = b[clientTableSortField];

      if (typeof aVal === 'string') {
        const cmp = (aVal as string).localeCompare(bVal as string);
        return clientTableSortOrder === 'asc' ? cmp : -cmp;
      } else {
        const numA = Number(aVal) || 0;
        const numB = Number(bVal) || 0;
        return clientTableSortOrder === 'asc' ? numA - numB : numB - numA;
      }
    });
  }, [clientLifetimeValue, clientTableSearch, clientTableSortField, clientTableSortOrder]);

  const totalClientPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredClientList.length / clientPageSize));
  }, [filteredClientList.length, clientPageSize]);

  // Adjust page number if out of bounds when search or page size changes
  useEffect(() => {
    if (clientCurrentPage > totalClientPages) {
      setClientCurrentPage(1);
    }
  }, [totalClientPages, clientCurrentPage]);

  const paginatedClientList = useMemo(() => {
    const page = Math.min(clientCurrentPage, totalClientPages);
    const startIndex = (page - 1) * clientPageSize;
    return filteredClientList.slice(startIndex, startIndex + clientPageSize);
  }, [filteredClientList, clientCurrentPage, totalClientPages, clientPageSize]);

  const handleClientSort = useCallback((field: 'companyName' | 'invoiceCount' | 'totalRevenue' | 'outstanding') => {
    if (clientTableSortField === field) {
      setClientTableSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setClientTableSortField(field);
      setClientTableSortOrder(field === 'companyName' ? 'asc' : 'desc');
    }
    setClientCurrentPage(1);
  }, [clientTableSortField]);

  const activePayingClientsCount = useMemo(() => {
    return clientLifetimeValue.filter(c => c.totalRevenue > 0).length;
  }, [clientLifetimeValue]);

  const averageClientLtv = useMemo(() => {
    return activePayingClientsCount > 0 ? Math.round(totalRevenue / activePayingClientsCount) : 0;
  }, [totalRevenue, activePayingClientsCount]);

  const topClientLtv = useMemo(() => {
    return clientLifetimeValue.length > 0 ? clientLifetimeValue[0].totalRevenue : 0;
  }, [clientLifetimeValue]);

  const invoiceConversionRates = useMemo(() => {
    const total = filteredInvoices.length;
    const paid = paidInvoicesCount;
    const sent = sentInvoicesCount;
    const overdue = overdueInvoicesCount;
    const sentOrPaid = sent + paid + overdue;
    const draftToSent = total > 0 ? ((sentOrPaid) / total) * 100 : 0;
    const sentToPaid = sentOrPaid > 0 ? (paid / sentOrPaid) * 100 : 0;
    const totalPaidRate = total > 0 ? (paid / total) * 100 : 0;
    return { total, draftToSent, sentToPaid, totalPaidRate, drafts: draftInvoicesCount, sent, paid, overdue };
  }, [filteredInvoices, paidInvoicesCount, sentInvoicesCount, overdueInvoicesCount, draftInvoicesCount]);

  const overdueAgingData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const ageGroups = {
      '1-30 Days': { count: 0, amount: 0 },
      '31-60 Days': { count: 0, amount: 0 },
      '61-90 Days': { count: 0, amount: 0 },
      '90+ Days': { count: 0, amount: 0 },
    };
    overdueInvoices.forEach(invoice => {
      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 1 && diffDays <= 30) { ageGroups['1-30 Days'].count++; ageGroups['1-30 Days'].amount += invoice.total; }
      else if (diffDays >= 31 && diffDays <= 60) { ageGroups['31-60 Days'].count++; ageGroups['31-60 Days'].amount += invoice.total; }
      else if (diffDays >= 61 && diffDays <= 90) { ageGroups['61-90 Days'].count++; ageGroups['61-90 Days'].amount += invoice.total; }
      else if (diffDays > 90) { ageGroups['90+ Days'].count++; ageGroups['90+ Days'].amount += invoice.total; }
    });
    return Object.entries(ageGroups).map(([label, data]) => ({ label, ...data }));
  }, [overdueInvoices]);

  const servicePortfolioData = useMemo(() => {
    return services.map(s => {
      const matchingSales = serviceBreakdown.find(sb => sb.serviceId === s.id || sb.serviceName.toLowerCase() === s.name.toLowerCase());
      const rev = matchingSales ? matchingSales.revenue : 0;
      const dc = Number(s.directCost) || 0;
      const ic = Number(s.indirectCost) || 0;
      const totalCost = calculateServiceTotalCost(dc, ic);
      const salesCost = matchingSales ? matchingSales.directCost : totalCost;
      const units = matchingSales ? matchingSales.unitsSold : 0;
      const profit = rev - salesCost;
      const margin = rev > 0 ? (profit / rev) * 100 : calculateServiceMarginPct(s.price, dc, ic);
      return {
        id: s.id,
        name: s.name,
        category: s.category || 'General',
        price: s.price,
        directCost: dc,
        indirectCost: ic,
        totalCost,
        unitsSold: units,
        revenue: rev,
        marginPct: margin
      };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [services, serviceBreakdown]);

  const topVolumeService = useMemo(() => {
    if (servicePortfolioData.length === 0) return null;
    return [...servicePortfolioData].sort((a, b) => b.unitsSold - a.unitsSold)[0];
  }, [servicePortfolioData]);

  const averageUnitPrice = useMemo(() => {
    if (services.length === 0) return 0;
    const sumPrice = services.reduce((acc, s) => acc + (s.price || 0), 0);
    return Math.round(sumPrice / services.length);
  }, [services]);

  // AI Handler
  const handleGenerateReportAI = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const queryToUse = customPrompt || reportQuery;

    if (isPlanFree) {
      setAiReportResponse("AI features are not available on the Free Subscription Plan. Please upgrade your workspace tier in Settings.");
      return;
    }
    if (isUnitsDepleted) {
      setAiReportResponse("Your subscription AI units are depleted. Please recharge or upgrade in workspace settings.");
      return;
    }
    if (!isAiEnabled) {
      setAiReportResponse("AI Mode is currently turned OFF. Please turn ON AI Mode in the workspace header or settings.");
      return;
    }
    if (!queryToUse.trim() || isLoadingReport) return;

    setIsLoadingReport(true);
    setAiReportResponse(null);

    try {
      const dataDump = `
Context Date Range: ${dateRange}.
Total Settled Revenue: ₦${totalRevenue.toLocaleString()}.
Total Direct Cost: ₦${totalDirectCost.toLocaleString()}.
Gross Profit: ₦${grossProfit.toLocaleString()} (Margin: ${profitMarginPct.toFixed(1)}%).
Total Invoices Recorded: ${totalInvoicesOverall} (Paid: ${paidInvoicesCount}, Overdue: ${overdueInvoicesCount}, Sent: ${sentInvoicesCount}).
Overdue Outstanding Balance: ₦${totalOverdueRevenue.toLocaleString()}.
Top Performing Services: ${serviceBreakdown.slice(0, 5).map(s => `${s.serviceName}: Revenue ₦${s.revenue.toLocaleString()}, Cost ₦${s.directCost.toLocaleString()}, Margin ${s.profitMarginPct.toFixed(1)}%`).join('; ')}.
Aging Distribution: ${overdueAgingData.map(d => `${d.label}: ₦${d.amount.toLocaleString()}`).join(', ')}.
      `.trim();

      const systemInstruction = `You are a Chief Financial Officer (CFO) and lead SME operations analyst.
Produce highly polished, boardroom-ready, executive-grade financial analysis and strategic recommendations.
Structure output with executive headers, bullet points, quantitative tables where relevant, and clear risk flags.
Keep your analysis actionable, concise, and focused strictly on financial performance, liquidity, and SME profitability.`;

      const prompt = `Operational Dataset:
${dataDump}

User Inquiry: "${queryToUse}"`;

      const response = await generateTextResponse(prompt, 'gemini-3.6-flash', systemInstruction);
      setAiReportResponse(response);
    } catch (error: any) {
      setAiReportResponse("AI service disrupted: " + (error.message || 'Unable to generate analysis.'));
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleCopyDossier = () => {
    if (!aiReportResponse) return;
    navigator.clipboard.writeText(aiReportResponse);
    setCopiedDossier(true);
    setTimeout(() => setCopiedDossier(false), 2000);
  };

  // CSV Export according to current tab context
  const handleExportTabCsv = () => {
    let csvString = '';
    let filename = `CraveBiz_Report_${activeTab}_${dateRange}_${Date.now()}.csv`;

    if (activeTab === 'profitability' || activeTab === 'expenses') {
      const headers = ['Service Name', 'Category', 'Units Sold', 'Revenue (NGN)', 'Direct Cost (NGN)', 'Gross Profit (NGN)', 'Profit Margin (%)', 'Margin Rating'];
      const data = serviceBreakdown.map(s => ({
        'Service Name': s.serviceName,
        'Category': s.category,
        'Units Sold': s.unitsSold,
        'Revenue (NGN)': s.revenue,
        'Direct Cost (NGN)': s.directCost,
        'Gross Profit (NGN)': s.profit,
        'Profit Margin (%)': s.profitMarginPct.toFixed(2),
        'Margin Rating': s.badge.status
      }));
      csvString = convertToCsv(data, headers);
    } else if (activeTab === 'clients') {
      const headers = ['Company Name', 'Total Invoices', 'Settled Revenue (NGN)', 'Outstanding Balance (NGN)'];
      const data = filteredClientList.map(c => ({
        'Company Name': c.companyName,
        'Total Invoices': c.invoiceCount,
        'Settled Revenue (NGN)': c.totalRevenue,
        'Outstanding Balance (NGN)': c.outstanding
      }));
      csvString = convertToCsv(data, headers);
    } else if (activeTab === 'services') {
      const headers = ['Service Name', 'Category', 'Standard Unit Price (NGN)', 'Unit Direct Cost (NGN)', 'Units Sold', 'Total Revenue (NGN)', 'Margin (%)'];
      const data = servicePortfolioData.map(s => ({
        'Service Name': s.name,
        'Category': s.category,
        'Standard Unit Price (NGN)': s.price,
        'Unit Direct Cost (NGN)': s.directCost,
        'Units Sold': s.unitsSold,
        'Total Revenue (NGN)': s.revenue,
        'Margin (%)': s.marginPct.toFixed(2)
      }));
      csvString = convertToCsv(data, headers);
    } else if (activeTab === 'invoices') {
      const headers = ['Invoice Number', 'Invoice Type', 'Client Name', 'Status', 'Frequency', 'Total (NGN)', 'Issue Date', 'Due Date'];
      const targetInvoices = invoiceSubTab === 'onetime'
        ? oneTimeInvoices
        : invoiceSubTab === 'recurring'
        ? recurringInvoices
        : allFilteredInvoices;

      const data = targetInvoices.map(inv => {
        const isRec = inv.isRecurringTemplate || (inv.frequency && inv.frequency !== 'one-time') || !!inv.parentInvoiceId;
        return {
          'Invoice Number': inv.invoiceNumber || inv.id,
          'Invoice Type': isRec ? 'Recurring' : 'One-Time',
          'Client Name': clients.find(c => c.id === inv.clientId)?.companyName || 'Unknown',
          'Status': inv.status,
          'Frequency': inv.frequency ? inv.frequency.charAt(0).toUpperCase() + inv.frequency.slice(1) : 'One-Time',
          'Total (NGN)': inv.total,
          'Issue Date': inv.issueDate,
          'Due Date': inv.dueDate,
        };
      });
      csvString = convertToCsv(data, headers);
      filename = `CraveBiz_InvoiceReport_${invoiceSubTab}_${dateRange}_${Date.now()}.csv`;
    } else {
      // Default invoice ledger export
      const headers = ['Invoice ID', 'Client Name', 'Status', 'Total (NGN)', 'Issue Date', 'Due Date'];
      const data = filteredInvoices.map(inv => ({
        'Invoice ID': inv.id,
        'Client Name': clients.find(c => c.id === inv.clientId)?.companyName || 'Unknown',
        'Status': inv.status,
        'Total (NGN)': inv.total,
        'Issue Date': inv.issueDate,
        'Due Date': inv.dueDate,
      }));
      csvString = convertToCsv(data, headers);
    }

    downloadCsv(csvString, filename);
  };

  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'revenue', label: 'Revenue', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'expenses', label: 'Expenses', icon: <Receipt className="w-4 h-4" /> },
    { id: 'profitability', label: 'Profitability', icon: <Percent className="w-4 h-4" /> },
    { id: 'invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" /> },
    { id: 'clients', label: 'Clients', icon: <Users className="w-4 h-4" /> },
    { id: 'services', label: 'Services', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'ai-usage', label: 'AI Usage', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Merged Vault Analytics & Global Filter Header */}
      <GlobalFilterBar
        filter={currentFilter}
        onFilterChange={handleFilterChange}
        clients={clients}
        services={services}
        totalInvoicesCount={invoices.length}
        filteredInvoicesCount={globallyFilteredInvoices.length}
        title="Vault Analytics"
        description="Real-time financial intelligence, direct cost margins, pipeline conversion, and multi-criteria global filtering."
        extraHeaderActions={
          <button
            onClick={handleExportTabCsv}
            className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            Export Tab CSV
          </button>
        }
      />

      {/* Clean Tabbed Navigation Bar */}
      <div className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-1 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center space-x-2 cursor-pointer ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB CONTENT AREA */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Settled Revenue"
              value={`₦${totalRevenue.toLocaleString()}`}
              subtitle="Paid Invoices"
              icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
              accentColor="emerald"
            />
            <KpiCard
              title="Gross Profit"
              value={`₦${grossProfit.toLocaleString()}`}
              subtitle={`Margin: ${profitMarginPct.toFixed(1)}%`}
              icon={<DollarSign className="w-5 h-5 text-primary-600" />}
              accentColor="blue"
            />
            <KpiCard
              title="Gross Profit Margin"
              value={`${profitMarginPct.toFixed(1)}%`}
              subtitle={getMarginBadge(profitMarginPct).label}
              icon={<Percent className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
            <KpiCard
              title="Total Audit Count"
              value={totalInvoicesOverall.toString()}
              subtitle={`Paid: ${paidInvoicesCount} | Overdue: ${overdueInvoicesCount}`}
              icon={<FileText className="w-5 h-5 text-gray-700" />}
              accentColor="slate"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Temporal Revenue & Direct Cost Trend">
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(val: number) => `₦${val.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="directCost" name="Direct Cost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Invoice Status Distribution">
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={invoiceStatusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={(entry: any) => `${entry.name}: ${entry.value}`}>
                      {invoiceStatusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <ServiceRevenueContributionCard
                serviceBreakdown={serviceBreakdown}
                title="Top Service Revenue Drivers"
              />
            </div>

            <ChartCard title="Pipeline Conversion & Pay-Through Efficiency">
              <div className="space-y-5 p-2">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-black uppercase text-gray-600">Draft ➔ Dispatch Conversion Rate</span>
                    <span className="text-xs font-black text-primary-600">{invoiceConversionRates.draftToSent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div className="bg-primary-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, invoiceConversionRates.draftToSent)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-black uppercase text-gray-600">Dispatch ➔ Settlement Collection Rate</span>
                    <span className="text-xs font-black text-emerald-600">{invoiceConversionRates.sentToPaid.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, invoiceConversionRates.sentToPaid)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-black uppercase text-gray-600">Global Ledger Pay-Through Rate</span>
                    <span className="text-xs font-black text-indigo-600">{invoiceConversionRates.totalPaidRate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, invoiceConversionRates.totalPaidRate)}%` }}></div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p className="text-[10px] font-black uppercase text-gray-400">Total Drafts</p>
                    <p className="text-base font-black text-gray-700 mt-0.5">{invoiceConversionRates.drafts}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <p className="text-[10px] font-black uppercase text-blue-600">Pending Sent</p>
                    <p className="text-base font-black text-blue-900 mt-0.5">{invoiceConversionRates.sent}</p>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                    <p className="text-[10px] font-black uppercase text-emerald-600">Settled Paid</p>
                    <p className="text-base font-black text-emerald-900 mt-0.5">{invoiceConversionRates.paid}</p>
                  </div>
                </div>
              </div>
            </ChartCard>
          </div>
        </div>
      )}

      {/* TAB 2: REVENUE */}
      {activeTab === 'revenue' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Settled Revenue"
              value={`₦${totalRevenue.toLocaleString()}`}
              subtitle={`${paidInvoicesCount} Paid Invoices`}
              icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
              accentColor="emerald"
            />
            <KpiCard
              title="Outstanding / Overdue"
              value={`₦${totalOverdueRevenue.toLocaleString()}`}
              subtitle={`${overdueInvoicesCount} Overdue Accounts`}
              icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
              accentColor="rose"
            />
            <KpiCard
              title="Pending Sent Revenue"
              value={`₦${totalSentRevenue.toLocaleString()}`}
              subtitle={`${sentInvoicesCount} Sent Dispatches`}
              icon={<Clock className="w-5 h-5 text-blue-600" />}
              accentColor="blue"
            />
            <KpiCard
              title="Average Ticket Size"
              value={`₦${Math.round(averageInvoiceTicket).toLocaleString()}`}
              subtitle="Per Paid Invoice"
              icon={<DollarSign className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Temporal Revenue Trend">
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(val: number) => `₦${val.toLocaleString()}`} />
                    <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="lg:col-span-2">
              <ServiceRevenueContributionCard
                serviceBreakdown={serviceBreakdown}
                title="Service Revenue Contribution"
              />
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Average Invoice Ticket Size Trend">
              {averageInvoiceValueOverTime.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={averageInvoiceValueOverTime}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Avg Value"]} />
                      <Line type="monotone" dataKey="avgValue" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Historical Timeline Data" />
              )}
            </ChartCard>

            <ChartCard title="Top Revenue Generating Clients">
              {clientLifetimeValue.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={clientLifetimeValue.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="companyName" type="category" tick={{ fill: '#334155', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip formatter={(val: number) => [`₦${val.toLocaleString()}`, "Settled Revenue"]} />
                      <Bar dataKey="totalRevenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Client Transactions Found" />
              )}
            </ChartCard>
          </div>
        </div>
      )}

      {/* TAB 3: EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Direct Costs"
              value={`₦${totalDirectCost.toLocaleString()}`}
              subtitle="Service Fulfillment Expense"
              icon={<Receipt className="w-5 h-5 text-rose-600" />}
              accentColor="rose"
            />
            <KpiCard
              title="Cost-to-Revenue Ratio"
              value={`${costToRevenueRatio.toFixed(1)}%`}
              subtitle="Direct Expense Percentage"
              icon={<Percent className="w-5 h-5 text-amber-600" />}
              accentColor="amber"
            />
            <KpiCard
              title="Highest Cost Category"
              value={highestCostCategory}
              subtitle="Main Expense Allocator"
              icon={<Layers className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
            <KpiCard
              title="Total Units Delivered"
              value={totalUnitsDelivered.toString()}
              subtitle="Billable Units Delivered"
              icon={<Briefcase className="w-5 h-5 text-blue-600" />}
              accentColor="blue"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Monthly Direct Cost Trend">
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(val: number) => [`₦${val.toLocaleString()}`, "Direct Cost"]} />
                    <Bar dataKey="directCost" name="Direct Cost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Direct Cost Allocation by Category">
              {categoryBreakdown.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="directCost"
                        nameKey="category"
                        label={(entry: any) => `${entry.category}: ₦${((entry.value || entry.directCost || 0) / 1000).toFixed(0)}k`}
                      >
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#f43f5e', '#f59e0b', '#6366f1', '#3b82f6', '#8b5cf6'][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `₦${value.toLocaleString()}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Direct Cost Categories Recorded" />
              )}
            </ChartCard>
          </div>

          {/* Expense Breakdown Table */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Direct Expense & Service Breakdown</h3>
                <p className="text-xs text-gray-500 font-medium">Detailed cost analysis per service item delivered</p>
              </div>

              <div className="relative max-w-xs">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={expenseTableSearch}
                  onChange={(e) => setExpenseTableSearch(e.target.value)}
                  placeholder="Filter expenses..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500 w-full"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <th className="py-3 px-4">Service Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Units Delivered</th>
                    <th className="py-3 px-4 text-right">Revenue (₦)</th>
                    <th className="py-3 px-4 text-right">Direct Cost (₦)</th>
                    <th className="py-3 px-4 text-right">Cost Ratio (%)</th>
                    <th className="py-3 px-4 text-right">Gross Profit (₦)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {serviceBreakdown
                    .filter(s => s.serviceName.toLowerCase().includes(expenseTableSearch.toLowerCase()) || s.category.toLowerCase().includes(expenseTableSearch.toLowerCase()))
                    .map((s) => {
                      const costRatio = s.revenue > 0 ? (s.directCost / s.revenue) * 100 : 0;
                      return (
                        <tr key={s.serviceId} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-800">{s.serviceName}</td>
                          <td className="py-3 px-4 text-gray-500 font-medium">{s.category}</td>
                          <td className="py-3 px-4 text-right font-bold text-gray-700">{s.unitsSold}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">₦{s.revenue.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-600">₦{s.directCost.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-semibold text-gray-600">{costRatio.toFixed(1)}%</td>
                          <td className="py-3 px-4 text-right font-black text-gray-900">₦{s.profit.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  {serviceBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 italic">No expense data found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PROFITABILITY */}
      {activeTab === 'profitability' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Gross Profit"
              value={`₦${grossProfit.toLocaleString()}`}
              subtitle="Net Revenue After Direct Costs"
              icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
              accentColor="emerald"
            />
            <KpiCard
              title="Gross Profit Margin"
              value={`${profitMarginPct.toFixed(1)}%`}
              subtitle={getMarginBadge(profitMarginPct).label}
              icon={<Percent className="w-5 h-5 text-primary-600" />}
              accentColor="blue"
            />
            <KpiCard
              title="Top Margin Driver"
              value={topMarginService ? topMarginService.serviceName : 'N/A'}
              subtitle={topMarginService ? `${topMarginService.profitMarginPct.toFixed(1)}% Margin` : ''}
              icon={<ArrowUpRight className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
            <KpiCard
              title="Low Margin Flagged"
              value={lowMarginServices.length.toString()}
              subtitle="Services with <20% Margin"
              icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
              accentColor="rose"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Revenue, Direct Cost & Gross Profit Trend">
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(val: number) => `₦${val.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="directCost" name="Direct Cost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="grossProfit" name="Gross Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Margin Health Status Distribution">
              {marginStatusDistributionData.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={marginStatusDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {marginStatusDistributionData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Profitability Distribution Data" />
              )}
            </ChartCard>
          </div>

          {/* Profitability Matrix Table */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Service Profitability & Margin Matrix</h3>
                <p className="text-xs text-gray-500 font-medium">Net profit margins and margin classification badges</p>
              </div>

              <div className="relative max-w-xs">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={profitabilityTableSearch}
                  onChange={(e) => setProfitabilityTableSearch(e.target.value)}
                  placeholder="Filter matrix..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500 w-full"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <th className="py-3 px-4">Service Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Revenue (₦)</th>
                    <th className="py-3 px-4 text-right">Direct Cost (₦)</th>
                    <th className="py-3 px-4 text-right">Net Profit (₦)</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                    <th className="py-3 px-4 text-center">Margin Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {serviceBreakdown
                    .filter(s => s.serviceName.toLowerCase().includes(profitabilityTableSearch.toLowerCase()) || s.category.toLowerCase().includes(profitabilityTableSearch.toLowerCase()))
                    .map((s) => (
                      <tr key={s.serviceId} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-800">{s.serviceName}</td>
                        <td className="py-3 px-4 text-gray-500 font-medium">{s.category}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">₦{s.revenue.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600">₦{s.directCost.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700">₦{s.profit.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-black text-gray-800">{s.profitMarginPct.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${s.badge.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.badge.dot}`}></span>
                            {s.badge.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {serviceBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 italic">No profitability records available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INVOICES */}
      {activeTab === 'invoices' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Top Bar with Sub-Tab Controls */}
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                  Invoice Reports & Sectional Intelligence
                </h3>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Comparative analysis of One-Time vs. Recurring billing schedules, aging brackets, and pay-through efficiency.
              </p>
            </div>

            <div className="flex items-center bg-gray-100 p-1 rounded-xl shrink-0 self-stretch sm:self-auto justify-center">
              <button
                onClick={() => setInvoiceSubTab('both')}
                className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  invoiceSubTab === 'both'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                All / Both Sections
              </button>
              <button
                onClick={() => setInvoiceSubTab('onetime')}
                className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  invoiceSubTab === 'onetime'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                One-Time ({oneTimeStats.totalCount})
              </button>
              <button
                onClick={() => setInvoiceSubTab('recurring')}
                className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  invoiceSubTab === 'recurring'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                Recurring ({recurringStats.totalCount})
              </button>
            </div>
          </div>

          {/* SECTION 1: ONE-TIME INVOICES */}
          {(invoiceSubTab === 'both' || invoiceSubTab === 'onetime') && (
            <div className="space-y-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">
                        One-Time Invoices Section
                      </h4>
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {oneTimeStats.totalCount} Invoices
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Single-issuance non-recurring billing documents, settlement ratios, and aging breakdown.
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  title="Total One-Time Invoices"
                  value={oneTimeStats.totalCount.toString()}
                  subtitle="Recorded Documents"
                  icon={<FileText className="w-5 h-5 text-gray-700" />}
                  accentColor="slate"
                />
                <KpiCard
                  title="Settled Paid Revenue"
                  value={`₦${oneTimeStats.totalRevenue.toLocaleString()}`}
                  subtitle={`${oneTimeStats.paidCount} Paid Invoices`}
                  icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  accentColor="emerald"
                />
                <KpiCard
                  title="Overdue Accounts Alert"
                  value={oneTimeStats.overdueCount.toString()}
                  subtitle={`Volume: ₦${oneTimeStats.totalOverdueRevenue.toLocaleString()}`}
                  icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
                  accentColor="rose"
                />
                <KpiCard
                  title="Average Payment Term"
                  value={`${oneTimeStats.averagePaymentTermDays} Days`}
                  subtitle="Issue to Due Duration"
                  icon={<Clock className="w-5 h-5 text-blue-600" />}
                  accentColor="blue"
                />
              </div>

              {/* Charts Row 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="One-Time Status Breakdown">
                  {oneTimeStats.statusData.length > 0 ? (
                    <div style={{ width: '100%', height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie data={oneTimeStats.statusData} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" label={(entry) => `${entry.name}: ${entry.value}`}>
                            {oneTimeStats.statusData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="No One-Time Invoices Recorded" />
                  )}
                </ChartCard>

                <ChartCard title="One-Time Outstanding / Overdue Aging Bracket">
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart data={oneTimeStats.overdueAgingData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Outstanding Amount"]} />
                        <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              {/* Conversion & Ticket Size Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="One-Time Dispatch & Pay-Through Efficiency">
                  <div className="space-y-4 p-2">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold uppercase text-gray-600">Draft ➔ Dispatch Rate</span>
                        <span className="text-xs font-black text-primary-600">{oneTimeStats.conversionRates.draftToSent.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-primary-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, oneTimeStats.conversionRates.draftToSent)}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold uppercase text-gray-600">Dispatch ➔ Settlement Rate</span>
                        <span className="text-xs font-black text-emerald-600">{oneTimeStats.conversionRates.sentToPaid.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, oneTimeStats.conversionRates.sentToPaid)}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold uppercase text-gray-600">One-Time Pay-Through Rate</span>
                        <span className="text-xs font-black text-indigo-600">{oneTimeStats.conversionRates.totalPaidRate.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, oneTimeStats.conversionRates.totalPaidRate)}%` }}></div>
                      </div>
                    </div>
                  </div>
                </ChartCard>

                <ChartCard title="One-Time Average Ticket Size Line Trend">
                  {oneTimeStats.averageValueOverTime.length > 0 ? (
                    <div style={{ width: '100%', height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={oneTimeStats.averageValueOverTime}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Avg Ticket"]} />
                          <Line type="monotone" dataKey="avgValue" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="No One-Time Ticket Size Timeline Records" />
                  )}
                </ChartCard>
              </div>
            </div>
          )}

          {/* SECTION 2: RECURRING INVOICES */}
          {(invoiceSubTab === 'both' || invoiceSubTab === 'recurring') && (
            <div className="space-y-6 bg-indigo-50/40 p-6 rounded-2xl border border-indigo-100 shadow-sm">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                    <Repeat className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">
                        Recurring Invoices & Contracts Section
                      </h4>
                      <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {recurringStats.totalCount} Templates & Schedules
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Subscription renewals, contract schedules, recurring cycle volumes, and frequency breakdown.
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  title="Total Recurring Schedules"
                  value={recurringStats.totalCount.toString()}
                  subtitle={`${recurringExtraStats.activeSchedulesCount} Active | ${recurringExtraStats.pausedSchedulesCount} Paused`}
                  icon={<Repeat className="w-5 h-5 text-indigo-700" />}
                  accentColor="indigo"
                />
                <KpiCard
                  title="Settled Recurring Revenue"
                  value={`₦${recurringStats.totalRevenue.toLocaleString()}`}
                  subtitle={`${recurringStats.paidCount} Settled Recurring Cycles`}
                  icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  accentColor="emerald"
                />
                <KpiCard
                  title="Contract Value per Cycle"
                  value={`₦${recurringExtraStats.totalContractValue.toLocaleString()}`}
                  subtitle="Total Recurring Portfolio"
                  icon={<DollarSign className="w-5 h-5 text-amber-600" />}
                  accentColor="amber"
                />
                <KpiCard
                  title="Overdue Renewal Alerts"
                  value={recurringStats.overdueCount.toString()}
                  subtitle={`Volume: ₦${recurringStats.totalOverdueRevenue.toLocaleString()}`}
                  icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
                  accentColor="rose"
                />
              </div>

              {/* Charts Row 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Recurring Schedule Status Breakdown">
                  {recurringStats.statusData.length > 0 ? (
                    <div style={{ width: '100%', height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie data={recurringStats.statusData} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" label={(entry) => `${entry.name}: ${entry.value}`}>
                            {recurringStats.statusData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="No Recurring Schedules Recorded" />
                  )}
                </ChartCard>

                <ChartCard title="Recurring Overdue & Renewal Aging Bracket">
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart data={recurringStats.overdueAgingData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Outstanding Renewal"]} />
                        <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              {/* Conversion & Frequency Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Recurring Frequency Distribution">
                  {recurringExtraStats.frequencyDistribution.length > 0 ? (
                    <div style={{ width: '100%', height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={recurringExtraStats.frequencyDistribution}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number, name: string) => name === 'value' ? [`₦${val.toLocaleString()}`, "Cycle Value"] : [val, "Contracts"]} />
                          <Bar dataKey="count" name="Schedules Count" fill="#818cf8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="No Frequency Distribution Data" />
                  )}
                </ChartCard>

                <ChartCard title="Recurring Average Ticket Size Trend">
                  {recurringStats.averageValueOverTime.length > 0 ? (
                    <div style={{ width: '100%', height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={recurringStats.averageValueOverTime}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(value: number) => [`₦${value.toLocaleString()}`, "Avg Cycle Ticket"]} />
                          <Line type="monotone" dataKey="avgValue" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="No Recurring Ticket Size Timeline Records" />
                  )}
                </ChartCard>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: CLIENTS */}
      {activeTab === 'clients' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Client Nodes"
              value={clients.length.toString()}
              subtitle="Registered Workspace Accounts"
              icon={<Users className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
            <KpiCard
              title="Active Paying Clients"
              value={activePayingClientsCount.toString()}
              subtitle="With Settled Revenue"
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              accentColor="emerald"
            />
            <KpiCard
              title="Average Client LTV"
              value={`₦${averageClientLtv.toLocaleString()}`}
              subtitle="Lifetime Value / Client"
              icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
              accentColor="blue"
            />
            <KpiCard
              title="Top Client Revenue"
              value={`₦${topClientLtv.toLocaleString()}`}
              subtitle="Highest LTV Account"
              icon={<DollarSign className="w-5 h-5 text-amber-600" />}
              accentColor="amber"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Client Lifetime Value (LTV) Top 5">
              {clientLifetimeValue.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={clientLifetimeValue.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="companyName" type="category" tick={{ fill: '#334155', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip formatter={(val: number) => [`₦${val.toLocaleString()}`, "LTV Revenue"]} />
                      <Bar dataKey="totalRevenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Client LTV Records Found" />
              )}
            </ChartCard>

            <ChartCard title="Client Settled vs Outstanding Balances">
              {clientLifetimeValue.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={clientLifetimeValue.slice(0, 5)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="companyName" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: number) => `₦${val.toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="totalRevenue" name="Settled" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outstanding" name="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Client Balance Metrics" />
              )}
            </ChartCard>
          </div>

          {/* Client Table */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Client Activity Ledger</h3>
                <p className="text-xs text-gray-500 font-medium">Lifetime revenue, total invoices, and outstanding dues</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="client-page-size" className="text-xs text-gray-500 font-bold whitespace-nowrap">Show:</label>
                  <select
                    id="client-page-size"
                    value={clientPageSize}
                    onChange={(e) => {
                      setClientPageSize(Number(e.target.value));
                      setClientCurrentPage(1);
                    }}
                    className="py-1.5 px-2.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500 font-bold text-gray-700 shadow-sm cursor-pointer"
                  >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>

                <div className="relative max-w-xs w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={clientTableSearch}
                    onChange={(e) => {
                      setClientTableSearch(e.target.value);
                      setClientCurrentPage(1);
                    }}
                    placeholder="Filter clients..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <th
                      onClick={() => handleClientSort('companyName')}
                      className="py-3 px-4 text-left cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Company Name</span>
                        {clientTableSortField === 'companyName' ? (
                          clientTableSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-primary-600" /> : <ArrowDown className="w-3.5 h-3.5 text-primary-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleClientSort('invoiceCount')}
                      className="py-3 px-4 text-center cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Invoices</span>
                        {clientTableSortField === 'invoiceCount' ? (
                          clientTableSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-primary-600" /> : <ArrowDown className="w-3.5 h-3.5 text-primary-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleClientSort('totalRevenue')}
                      className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Settled Revenue (₦)</span>
                        {clientTableSortField === 'totalRevenue' ? (
                          clientTableSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-primary-600" /> : <ArrowDown className="w-3.5 h-3.5 text-primary-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleClientSort('outstanding')}
                      className="py-3 px-4 text-right cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Outstanding (₦)</span>
                        {clientTableSortField === 'outstanding' ? (
                          clientTableSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-primary-600" /> : <ArrowDown className="w-3.5 h-3.5 text-primary-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedClientList.map((c) => (
                    <tr key={c.companyName} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-gray-800">{c.companyName}</td>
                      <td className="py-3 px-4 text-center font-bold text-gray-600">{c.invoiceCount}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">₦{c.totalRevenue.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600">₦{c.outstanding.toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredClientList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 italic">No client accounts match your filter criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredClientList.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-4 text-xs font-medium text-gray-600">
                <div>
                  Showing <span className="font-black text-gray-900">{(clientCurrentPage - 1) * clientPageSize + 1}</span> to{' '}
                  <span className="font-black text-gray-900">{Math.min(clientCurrentPage * clientPageSize, filteredClientList.length)}</span> of{' '}
                  <span className="font-black text-gray-900">{filteredClientList.length}</span> clients
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setClientCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={clientCurrentPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalClientPages }, (_, i) => i + 1)
                      .filter(p => {
                        if (totalClientPages <= 7) return true;
                        if (p === 1 || p === totalClientPages) return true;
                        return Math.abs(p - clientCurrentPage) <= 1;
                      })
                      .map((p, idx, arr) => {
                        const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                        return (
                          <React.Fragment key={p}>
                            {showEllipsisBefore && <span className="px-1.5 text-xs text-gray-400 font-bold">...</span>}
                            <button
                              onClick={() => setClientCurrentPage(p)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                clientCurrentPage === p
                                  ? 'bg-primary-600 text-white shadow-sm'
                                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => setClientCurrentPage(prev => Math.min(totalClientPages, prev + 1))}
                    disabled={clientCurrentPage >= totalClientPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold flex items-center gap-1 cursor-pointer"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: SERVICES */}
      {activeTab === 'services' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Active Service Catalog"
              value={services.length.toString()}
              subtitle="Registered Offerings"
              icon={<Briefcase className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
            <KpiCard
              title="Top Volume Service"
              value={topVolumeService ? topVolumeService.name : 'N/A'}
              subtitle={topVolumeService ? `${topVolumeService.unitsSold} Units Delivered` : ''}
              icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
              accentColor="emerald"
            />
            <KpiCard
              title="Average Unit Price"
              value={`₦${averageUnitPrice.toLocaleString()}`}
              subtitle="Catalog Base Price"
              icon={<DollarSign className="w-5 h-5 text-blue-600" />}
              accentColor="blue"
            />
            <KpiCard
              title="Total Units Delivered"
              value={totalUnitsDelivered.toString()}
              subtitle="Fulfilled Item Count"
              icon={<Layers className="w-5 h-5 text-amber-600" />}
              accentColor="amber"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <ServiceRevenueContributionCard
                serviceBreakdown={serviceBreakdown}
                title="Service Revenue Contribution"
              />
            </div>

            <ChartCard title="Units Delivered Per Service">
              {revenueByServiceChart.length > 0 ? (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={revenueByServiceChart}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="unitsSold" name="Units Sold" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No Service Units Delivered" />
              )}
            </ChartCard>
          </div>

          {/* Service Table */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Service Portfolio Performance</h3>
                <p className="text-xs text-gray-500 font-medium">Standard pricing, unit direct costs, units sold, and margin %</p>
              </div>

              <div className="relative max-w-xs">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={serviceTableSearch}
                  onChange={(e) => setServiceTableSearch(e.target.value)}
                  placeholder="Filter services..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500 w-full"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <th className="py-3 px-4">Service Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Standard Price (₦)</th>
                    <th className="py-3 px-4 text-right">Direct Cost (₦)</th>
                    <th className="py-3 px-4 text-right">Units Sold</th>
                    <th className="py-3 px-4 text-right">Total Revenue (₦)</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {servicePortfolioData
                    .filter(s => s.name.toLowerCase().includes(serviceTableSearch.toLowerCase()) || s.category.toLowerCase().includes(serviceTableSearch.toLowerCase()))
                    .map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-800">{s.name}</td>
                        <td className="py-3 px-4 text-gray-500 font-medium">{s.category}</td>
                        <td className="py-3 px-4 text-right font-semibold text-gray-700">₦{s.price.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-semibold text-rose-600">₦{s.directCost.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-800">{s.unitsSold}</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700">₦{s.revenue.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-black text-gray-900">{s.marginPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  {servicePortfolioData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 italic">No services registered in catalog.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: AI USAGE */}
      {activeTab === 'ai-usage' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Subscription Tier"
              value={`${subInfo.tier} Plan`}
              subtitle="Workspace Subscription"
              icon={<Sparkles className="w-5 h-5 text-primary-600" />}
              accentColor="blue"
            />
            <KpiCard
              title="Available AI Units"
              value={subInfo.aiUnits.toString()}
              subtitle="Remaining Query Balance"
              icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
              accentColor="emerald"
            />
            <KpiCard
              title="AI Workspace Mode"
              value={isAiEnabled ? 'Active (ON)' : 'Inactive (OFF)'}
              subtitle="Workspace Header Switch"
              icon={<CheckCircle2 className="w-5 h-5 text-indigo-600" />}
              accentColor="indigo"
            />
            <KpiCard
              title="AI Auditor Readiness"
              value={hasAiAccess ? 'Ready' : 'Restricted'}
              subtitle={hasAiAccess ? 'AI Queries Enabled' : 'Upgrade Required'}
              icon={<ShieldAlert className="w-5 h-5 text-amber-600" />}
              accentColor="amber"
            />
          </div>

          {/* AI Console Box */}
          <div className="bg-white p-6 sm:p-8 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">AI CFO Performance Auditor</h3>
                <p className="text-xs text-gray-500 font-medium">Ask specific financial, profitability, and operational questions about your SME ledger.</p>
              </div>
            </div>

            {/* Status Banners */}
            {isPlanFree && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 text-xs font-semibold flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-blue-950 uppercase tracking-wider text-[10px]">Premium Feature Required</p>
                  <p className="text-xs font-normal mt-0.5">AI Performance Analysis is unavailable on the Free Subscription Plan. Please upgrade to Starter, Growth, or Enterprise in Workspace Settings.</p>
                </div>
              </div>
            )}

            {!isPlanFree && isUnitsDepleted && (
              <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 text-xs font-semibold flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-950 uppercase tracking-wider text-[10px]">AI Units Depleted</p>
                  <p className="text-xs font-normal mt-0.5">Your AI unit balance is fully depleted. Please purchase an AI credit refill or upgrade your subscription tier.</p>
                </div>
              </div>
            )}

            {!isPlanFree && !isUnitsDepleted && !isAiEnabled && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-xs font-semibold flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950 uppercase tracking-wider text-[10px]">AI Mode is Off</p>
                  <p className="text-xs font-normal mt-0.5">AI Mode is turned OFF for this workspace. Enable AI Mode in the top header or workspace settings to run query analysis.</p>
                </div>
              </div>
            )}

            {/* Prompt Quick Buttons */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Suggested CFO Prompts</label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Summarize overall SME revenue, direct costs, and net margin",
                  "Identify low-margin services (<20%) and suggest pricing fixes",
                  "Analyze overdue invoice aging risks and collection strategy",
                  "Recommend cost reduction opportunities for direct expenses"
                ].map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isTextareaDisabled}
                    onClick={() => {
                      setReportQuery(suggestion);
                      handleGenerateReportAI(undefined, suggestion);
                    }}
                    className="text-xs bg-gray-50 hover:bg-primary-50 hover:text-primary-700 text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 font-medium transition-all text-left disabled:opacity-50 cursor-pointer"
                  >
                    💡 {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {/* Query Form */}
            <form onSubmit={handleGenerateReportAI} className="space-y-4">
              <textarea
                id="reportQuery"
                value={reportQuery}
                onChange={e => setReportQuery(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl outline-none focus:border-primary-500 font-medium text-xs bg-gray-50/50 disabled:opacity-50"
                placeholder={placeholderText}
                disabled={isTextareaDisabled}
              ></textarea>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isTextareaDisabled || !reportQuery.trim()}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs shadow-md transition-all disabled:bg-gray-300 cursor-pointer active:scale-95"
                >
                  {isLoadingReport ? "Compiling Analysis..." : "Query Financial Database"}
                </button>
              </div>
            </form>

            {/* Executive Performance Dossier Output */}
            {aiReportResponse && (
              <div className="mt-6 bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-6 shadow-xl animate-in slide-in-from-top-4">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-black text-primary-400 uppercase tracking-widest block">EXECUTIVE PERFORMANCE DOSSIER</span>
                    <h4 className="text-xs font-black text-slate-200 uppercase tracking-tight">Boardroom Financial Insights</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyDossier}
                      className="text-[10px] font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedDossier ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedDossier ? 'Copied' : 'Copy Dossier'}
                    </button>
                    <span className="bg-primary-950 text-primary-400 border border-primary-800 px-2.5 py-1 rounded text-[9px] font-black tracking-widest uppercase">
                      CONFIDENTIAL
                    </span>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-xs">
                  <ReactMarkdown
                    components={{
                      h1: ({ node, ...props }) => <h1 className="text-sm font-black text-white mt-4 mb-2 tracking-wider uppercase border-b pb-1 border-slate-700" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-xs font-black text-primary-400 mt-4 mb-2 tracking-wider uppercase" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-xs font-bold text-slate-200 mt-3 mb-1 uppercase" {...props} />,
                      p: ({ node, ...props }) => <p className="text-xs text-slate-300 leading-relaxed mb-3" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-xs text-slate-300" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-xs text-slate-300" {...props} />,
                      li: ({ node, ...props }) => <li className="pl-1 leading-relaxed" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-extrabold text-white" {...props} />,
                      table: ({ node, ...props }) => <div className="overflow-x-auto my-3"><table className="min-w-full divide-y divide-slate-800 border border-slate-800 rounded-lg text-xs bg-slate-950" {...props} /></div>,
                      thead: ({ node, ...props }) => <thead className="bg-slate-900" {...props} />,
                      tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-800" {...props} />,
                      tr: ({ node, ...props }) => <tr className="hover:bg-slate-900/60" {...props} />,
                      th: ({ node, ...props }) => <th className="px-3 py-2 text-left text-[10px] font-black text-slate-300 uppercase tracking-wider" {...props} />,
                      td: ({ node, ...props }) => <td className="px-3 py-2 text-xs text-slate-300 font-medium" {...props} />,
                    }}
                  >
                    {aiReportResponse}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable Subcomponents

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor?: 'emerald' | 'blue' | 'rose' | 'amber' | 'indigo' | 'slate';
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon, accentColor = 'blue' }) => {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between transition-all hover:shadow-md">
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">{title}</p>
        <p className="text-2xl font-black text-gray-900 tracking-tight">{value}</p>
        {subtitle && (
          <p className="text-[11px] font-bold text-gray-500">{subtitle}</p>
        )}
      </div>
      <div className={`p-2.5 rounded-xl border ${colorMap[accentColor]} shrink-0`}>
        {icon}
      </div>
    </div>
  );
};

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight border-b border-gray-50 pb-3">
      {title}
    </h3>
    <div>{children}</div>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-[250px] flex items-center justify-center text-gray-400 text-xs font-bold italic bg-gray-50/50 rounded-lg border border-dashed border-gray-100">
    {message}
  </div>
);

interface ServiceBreakdownItem {
  serviceId: string;
  serviceName: string;
  category: string;
  revenue: number;
  directCost: number;
  unitsSold: number;
  invoiceCount: number;
  profit: number;
  profitMarginPct: number;
  badge: { bg: string; badge: string; dot: string; label: string; status: string };
}

interface ServiceRevenueContributionCardProps {
  serviceBreakdown: ServiceBreakdownItem[];
  title?: string;
}

const SERVICE_COLORS = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#64748b', // Slate
];

const ServiceRevenueContributionCard: React.FC<ServiceRevenueContributionCardProps> = ({
  serviceBreakdown,
  title = "Service Revenue Contribution & Detailed Intelligence"
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  const totalServiceRevenue = useMemo(() => {
    return serviceBreakdown.reduce((sum, s) => sum + s.revenue, 0);
  }, [serviceBreakdown]);

  const servicesWithDetails = useMemo(() => {
    return serviceBreakdown.map((s, index) => {
      const sharePct = totalServiceRevenue > 0 ? (s.revenue / totalServiceRevenue) * 100 : 0;
      return {
        ...s,
        color: SERVICE_COLORS[index % SERVICE_COLORS.length],
        sharePct,
      };
    });
  }, [serviceBreakdown, totalServiceRevenue]);

  useEffect(() => {
    if (servicesWithDetails.length > 0) {
      if (!selectedServiceId || !servicesWithDetails.some(s => s.serviceId === selectedServiceId)) {
        setSelectedServiceId(servicesWithDetails[0].serviceId);
      }
    }
  }, [servicesWithDetails, selectedServiceId]);

  const selectedService = useMemo(() => {
    return servicesWithDetails.find(s => s.serviceId === selectedServiceId) || servicesWithDetails[0] || null;
  }, [servicesWithDetails, selectedServiceId]);

  if (servicesWithDetails.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight mb-4">{title}</h3>
        <EmptyState message="No Service Revenue Records Available" />
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
              {title}
            </h3>
            <span className="bg-primary-50 text-primary-700 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {servicesWithDetails.length} Services
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Click on any slice in the chart or any legend item below to inspect detailed revenue, invoice count, direct cost, profit, and margin metrics.
          </p>
        </div>
        {totalServiceRevenue > 0 && (
          <div className="text-left sm:text-right bg-gray-50 px-3.5 py-1.5 rounded-xl border border-gray-100 flex-shrink-0">
            <span className="text-[10px] uppercase font-black text-gray-400 block tracking-wider">Total Portfolio Revenue</span>
            <span className="text-sm font-black text-emerald-600">₦{totalServiceRevenue.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Interactive Doughnut Chart & Legend (5 cols on lg) */}
        <div className="lg:col-span-5 flex flex-col items-center space-y-4">
          <div style={{ width: '100%', height: 260 }} className="relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={servicesWithDetails}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={88}
                  paddingAngle={4}
                  dataKey="revenue"
                  nameKey="serviceName"
                  cursor="pointer"
                  onClick={(entry: any) => {
                    if (entry && entry.serviceId) {
                      setSelectedServiceId(entry.serviceId);
                    }
                  }}
                >
                  {servicesWithDetails.map((entry) => {
                    const isSelected = selectedService && entry.serviceId === selectedService.serviceId;
                    return (
                      <Cell
                        key={entry.serviceId}
                        fill={entry.color}
                        stroke={isSelected ? '#0f172a' : '#ffffff'}
                        strokeWidth={isSelected ? 3.5 : 1.5}
                        style={{ filter: isSelected ? 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.2))' : 'none' }}
                        className="transition-all duration-200 hover:opacity-85"
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue Generated']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Summary inside doughnut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
              <span className="text-[9px] uppercase font-black text-gray-400 tracking-wider">Active View</span>
              <span className="text-xs font-black text-slate-900 max-w-[120px] truncate leading-tight mt-0.5">
                {selectedService ? selectedService.serviceName : 'All'}
              </span>
              {selectedService && (
                <span className="text-[11px] font-black text-primary-600 mt-0.5">
                  {selectedService.sharePct.toFixed(1)}% Share
                </span>
              )}
            </div>
          </div>

          {/* Interactive Legend Items */}
          <div className="w-full space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs">
            <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-wider text-gray-400 px-1 mb-1">
              <span>Select Service:</span>
              <span>Revenue Share</span>
            </div>
            {servicesWithDetails.map((s) => {
              const isSelected = selectedService && s.serviceId === selectedService.serviceId;
              return (
                <button
                  key={s.serviceId}
                  onClick={() => setSelectedServiceId(s.serviceId)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white font-bold shadow-sm ring-1 ring-slate-800'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate text-xs">{s.serviceName}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    <span className={`font-black text-xs ${isSelected ? 'text-emerald-400' : 'text-gray-900'}`}>
                      ₦{s.revenue.toLocaleString()}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${isSelected ? 'bg-slate-800 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>
                      {s.sharePct.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Detailed Service Information Panel (7 cols on lg) */}
        {selectedService && (
          <div className="lg:col-span-7 bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md space-y-5">
            {/* Service Header Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-start gap-3">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 mt-1 shadow-sm ring-2 ring-slate-700"
                  style={{ backgroundColor: selectedService.color }}
                />
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight">
                    {selectedService.serviceName}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                      Category: {selectedService.category}
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${selectedService.badge.badge}`}>
                      {selectedService.badge.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-700 text-left sm:text-right flex-shrink-0">
                <span className="text-[10px] uppercase font-black text-slate-400 block tracking-wider">Revenue Contribution</span>
                <span className="text-sm font-black text-emerald-400">{selectedService.sharePct.toFixed(1)}% of total</span>
              </div>
            </div>

            {/* Contribution Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-slate-400">
                <span>Revenue Share Progress</span>
                <span className="text-white font-black">{selectedService.sharePct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, selectedService.sharePct)}%`, backgroundColor: selectedService.color }}
                />
              </div>
            </div>

            {/* Detailed Requirements Grid - All 6 metrics requested */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* 1. Service Name */}
              <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700/80">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Service Name</span>
                <span className="text-xs font-black text-white truncate block mt-1" title={selectedService.serviceName}>
                  {selectedService.serviceName}
                </span>
              </div>

              {/* 2. Revenue Generated */}
              <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700/80">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Revenue Generated</span>
                <span className="text-sm font-black text-emerald-400 block mt-1">
                  ₦{selectedService.revenue.toLocaleString()}
                </span>
              </div>

              {/* 3. Number of Invoices */}
              <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700/80">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Number of Invoices</span>
                <span className="text-sm font-black text-sky-400 block mt-1">
                  {selectedService.invoiceCount} {selectedService.invoiceCount === 1 ? 'Invoice' : 'Invoices'}
                </span>
              </div>

              {/* 4. Direct Cost */}
              <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700/80">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Direct Cost</span>
                <span className="text-sm font-black text-rose-400 block mt-1">
                  ₦{selectedService.directCost.toLocaleString()}
                </span>
              </div>

              {/* 5. Profit */}
              <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700/80">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Profit</span>
                <span className={`text-sm font-black block mt-1 ${selectedService.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ₦{selectedService.profit.toLocaleString()}
                </span>
              </div>

              {/* 6. Profit Margin */}
              <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700/80">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Profit Margin</span>
                <span className={`text-sm font-black block mt-1 ${selectedService.profitMarginPct >= 40 ? 'text-emerald-400' : selectedService.profitMarginPct >= 20 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {selectedService.profitMarginPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Extra Footer Context */}
            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 text-xs flex flex-wrap justify-between items-center gap-2 text-slate-400">
              <span>
                Total Units Delivered: <strong className="text-white font-black">{selectedService.unitsSold} units</strong>
              </span>
              <span>
                Direct Cost Ratio: <strong className="text-white font-black">
                  {selectedService.revenue > 0 ? ((selectedService.directCost / selectedService.revenue) * 100).toFixed(1) : '0.0'}%
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
