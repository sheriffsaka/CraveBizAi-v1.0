import React, { useState, useMemo, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Invoice, Client, Service, InvoiceStatus } from '../types';
import { generateTextResponse } from '../services/aiGenerationService';
import { getSubscriptionInfo } from '../services/subscriptionService';
import ReactMarkdown from 'react-markdown';
import { TrendingUp, DollarSign, PieChart as PieIcon, ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2, Sparkles, Download, Printer, FileSpreadsheet, Calendar, RefreshCw, Layers, ShieldAlert } from 'lucide-react';
import { calculateServiceTotalCost, calculateServiceMarginPct } from '../lib/margin';

interface RevenueVsDirectCostReportProps {
  invoices: Invoice[];
  clients: Client[];
  services: Service[];
  activeTenantId?: string;
}

export type FilterRange = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'custom' | 'all_time';

export const getMarginBadge = (marginPct: number) => {
  if (marginPct >= 40) {
    return {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      badge: 'bg-emerald-500 text-white',
      dot: 'bg-emerald-500',
      label: 'High Margin (>40%)',
      status: 'Green'
    };
  } else if (marginPct >= 20) {
    return {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      badge: 'bg-amber-500 text-white',
      dot: 'bg-amber-500',
      label: 'Moderate (20%-40%)',
      status: 'Yellow'
    };
  } else {
    return {
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      badge: 'bg-rose-500 text-white',
      dot: 'bg-rose-500',
      label: 'Low Margin (<20%)',
      status: 'Red'
    };
  }
};

const RevenueVsDirectCostReport: React.FC<RevenueVsDirectCostReportProps> = ({
  invoices,
  clients,
  services,
  activeTenantId
}) => {
  const [filterRange, setFilterRange] = useState<FilterRange>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const [subTrigger, setSubTrigger] = useState(0);

  useEffect(() => {
    const handleSubChange = () => setSubTrigger(prev => prev + 1);
    window.addEventListener('cravebiz_subscription_change', handleSubChange);
    return () => window.removeEventListener('cravebiz_subscription_change', handleSubChange);
  }, []);

  const subInfo = useMemo(() => getSubscriptionInfo(activeTenantId || ''), [activeTenantId, subTrigger]);

  // Compute date boundary
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = new Date();
    end.setHours(23, 59, 59, 999);

    switch (filterRange) {
      case 'today':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      case 'this_week': {
        start = new Date(now);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'this_quarter': {
        const qMonth = now.getMonth() - (now.getMonth() % 3);
        start = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0, 0);
        break;
      }
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      case 'custom':
        start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
        end = customEndDate ? new Date(`${customEndDate}T23:59:59`) : null;
        break;
      case 'all_time':
      default:
        start = null;
        end = null;
        break;
    }

    return { startDate: start, endDate: end };
  }, [filterRange, customStartDate, customEndDate]);

  // Filter ONLY Paid Invoices in selected range
  const paidInvoicesInRange = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.status !== InvoiceStatus.Paid) return false;
      const invDate = new Date(inv.issueDate);
      if (startDate && invDate < startDate) return false;
      if (endDate && invDate > endDate) return false;
      return true;
    });
  }, [invoices, startDate, endDate]);

  // Calculate Metrics & Per-Service Financial Breakdown
  const { totalRevenue, totalDirectCost, grossProfit, profitMarginPct, serviceBreakdown, trendTimeline } = useMemo(() => {
    let revSum = 0;
    let costSum = 0;

    // Map serviceId -> accumulators
    const serviceMap = new Map<string, {
      serviceId: string;
      serviceName: string;
      category: string;
      revenue: number;
      directCost: number;
      unitsSold: number;
    }>();

    // Map month/day -> timeline accumulators
    const timelineMap = new Map<string, { period: string; revenue: number; directCost: number; profit: number; timestamp: number }>();

    paidInvoicesInRange.forEach(inv => {
      const invDate = new Date(inv.issueDate);
      let periodKey = '';
      let periodLabel = '';

      if (filterRange === 'today' || filterRange === 'this_week') {
        periodKey = invDate.toISOString().split('T')[0];
        periodLabel = invDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        periodKey = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`;
        periodLabel = invDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      if (!timelineMap.has(periodKey)) {
        timelineMap.set(periodKey, { period: periodLabel, revenue: 0, directCost: 0, profit: 0, timestamp: invDate.getTime() });
      }
      const periodData = timelineMap.get(periodKey)!;

      inv.items.forEach(item => {
        const qty = Number(item.quantity) || 1;
        const itemRevenue = Number(item.price) * qty;
        
        // Find matching service or fallback
        const matchingService = services.find(s => s.id === item.serviceId || s.name.toLowerCase() === item.description.toLowerCase());
        
        // Unit cost priority: item -> matchingService -> 0
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

        periodData.revenue += itemRevenue;
        periodData.directCost += itemCost;
        periodData.profit += (itemRevenue - itemCost);

        const sKey = matchingService?.id || item.serviceId || item.description || 'General Services';
        const sName = matchingService?.name || item.description || 'Custom Service';
        const sCategory = matchingService?.category || 'General';

        if (!serviceMap.has(sKey)) {
          serviceMap.set(sKey, {
            serviceId: sKey,
            serviceName: sName,
            category: sCategory,
            revenue: 0,
            directCost: 0,
            unitsSold: 0
          });
        }

        const sData = serviceMap.get(sKey)!;
        sData.revenue += itemRevenue;
        sData.directCost += itemCost;
        sData.unitsSold += qty;
      });
    });

    const netGrossProfit = revSum - costSum;
    const margin = revSum > 0 ? (netGrossProfit / revSum) * 100 : 0;

    // Convert service map to sorted array
    const breakdown = Array.from(serviceMap.values()).map(s => {
      const profit = s.revenue - s.directCost;
      const matchingSrv = services.find(srv => srv.id === s.serviceId || srv.name.toLowerCase() === s.serviceName.toLowerCase());
      const marginPct = s.revenue > 0
        ? (profit / s.revenue) * 100
        : calculateServiceMarginPct(matchingSrv?.price || 0, matchingSrv?.directCost, matchingSrv?.indirectCost);
      return {
        ...s,
        profit,
        profitMarginPct: marginPct,
        indicator: getMarginBadge(marginPct)
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Convert timeline map to array
    const timeline = Array.from(timelineMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    return {
      totalRevenue: revSum,
      totalDirectCost: costSum,
      grossProfit: netGrossProfit,
      profitMarginPct: margin,
      serviceBreakdown: breakdown,
      trendTimeline: timeline
    };
  }, [paidInvoicesInRange, services, filterRange]);

  // Derived AI Insights calculations
  const highMarginServices = useMemo(() => serviceBreakdown.filter(s => s.profitMarginPct >= 40), [serviceBreakdown]);
  const lowMarginServices = useMemo(() => serviceBreakdown.filter(s => s.profitMarginPct < 20), [serviceBreakdown]);
  const highRevLowProfitServices = useMemo(() => {
    const avgRevenue = serviceBreakdown.length > 0 ? totalRevenue / serviceBreakdown.length : 0;
    return serviceBreakdown.filter(s => s.revenue >= avgRevenue && s.profitMarginPct < 30);
  }, [serviceBreakdown, totalRevenue]);

  // AI Generation Handler
  const handleGenerateAiInsights = async () => {
    if (subInfo.tier === 'Free' && subInfo.aiUnits <= 0) {
      alert("AI insights are not available on the Free Subscription Plan. Please upgrade in Workspace Settings.");
      return;
    }
    setIsGeneratingAi(true);
    try {
      const summaryPayload = {
        period: filterRange,
        totalRevenue: `₦${totalRevenue.toLocaleString()}`,
        totalDirectCost: `₦${totalDirectCost.toLocaleString()}`,
        grossProfit: `₦${grossProfit.toLocaleString()}`,
        profitMargin: `${profitMarginPct.toFixed(1)}%`,
        totalPaidInvoicesCount: paidInvoicesInRange.length,
        services: serviceBreakdown.map(s => ({
          name: s.serviceName,
          category: s.category,
          revenue: `₦${s.revenue.toLocaleString()}`,
          directCost: `₦${s.directCost.toLocaleString()}`,
          profit: `₦${s.profit.toLocaleString()}`,
          marginPercent: `${s.profitMarginPct.toFixed(1)}%`
        }))
      };

      const systemPrompt = `You are a Senior CFO & SME Profitability Advisor at CraveBiz.
Analyze the provided Revenue vs Direct Cost report dataset and deliver an executive profitability dossier.
Your dossier must include:
1. Executive Profitability Overview (Margin rating, revenue vs cost analysis).
2. Highest Margin Drivers (Services delivering >40% margins and why they excel).
3. Low Profitability & Risk Areas (Services below 20% margin or high revenue with thin margins).
4. Strategic Cost Reduction & Pricing Recommendations (Actionable steps to cut direct fulfillment costs, re-negotiate vendor/labor fees, or optimize pricing tiers).
Format cleanly with professional markdown, bold metrics, bullet points, and high-impact boardroom style.`;

      const userPrompt = `Operational Dataset for Revenue vs Direct Cost Report:
${JSON.stringify(summaryPayload, null, 2)}`;

      const response = await generateTextResponse(userPrompt, 'gemini-3.6-flash', systemPrompt);
      setAiAnalysis(response);
    } catch (err: any) {
      console.error("Failed to generate AI report insights:", err);
      alert("AI analysis error: " + (err.message || 'Unable to complete AI analysis.'));
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Export handlers
  const handleExportCsv = () => {
    const headers = ['Service Name', 'Category', 'Revenue Generated (NGN)', 'Direct Cost (NGN)', 'Gross Profit (NGN)', 'Profit Margin (%)', 'Margin Status'];
    const rows = serviceBreakdown.map(s => [
      `"${s.serviceName.replace(/"/g, '""')}"`,
      `"${s.category.replace(/"/g, '""')}"`,
      s.revenue,
      s.directCost,
      s.profit,
      s.profitMarginPct.toFixed(2),
      s.indicator.status
    ]);

    // Add summary row
    rows.push([]);
    rows.push(['"TOTAL METRICS"', '""', totalRevenue, totalDirectCost, grossProfit, profitMarginPct.toFixed(2), getMarginBadge(profitMarginPct).status]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CraveBiz_Revenue_vs_DirectCost_${filterRange}_${Date.now()}.csv`;
    a.click();
  };

  const handleExportExcel = () => {
    // Generate TSV / Excel-compatible format
    const headers = ['Service Name\tCategory\tRevenue Generated (₦)\tDirect Cost (₦)\tGross Profit (₦)\tProfit Margin (%)\tStatus'];
    const rows = serviceBreakdown.map(s => `${s.serviceName}\t${s.category}\t${s.revenue}\t${s.directCost}\t${s.profit}\t${s.profitMarginPct.toFixed(2)}%\t${s.indicator.status}`);
    rows.push(`\nSUMMARY\tALL SERVICES\t${totalRevenue}\t${totalDirectCost}\t${grossProfit}\t${profitMarginPct.toFixed(2)}%\t${getMarginBadge(profitMarginPct).status}`);

    const excelContent = [headers, ...rows].join('\n');
    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CraveBiz_Revenue_vs_DirectCost_${filterRange}_${Date.now()}.xls`;
    a.click();
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const overallIndicator = getMarginBadge(profitMarginPct);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 md:p-8 rounded-xl shadow-xl border border-gray-100">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary-200">
              Profitability Audit
            </span>
            <span className="text-xs font-bold text-gray-400">Paid Ledger Direct Integration</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 uppercase tracking-tight mt-1">
            Revenue vs Direct Cost Report
          </h2>
          <p className="text-xs font-semibold text-gray-500 mt-1">
            Compare total earned revenue against direct service execution costs to monitor margins and unit economics.
          </p>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 print-hidden">
          <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 p-1.5 rounded-lg">
            <Calendar className="w-4 h-4 text-gray-400 ml-2" />
            <select
              value={filterRange}
              onChange={(e) => setFilterRange(e.target.value as FilterRange)}
              className="bg-transparent text-xs font-black uppercase tracking-wider text-gray-800 outline-none pr-3 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Date Range</option>
              <option value="all_time">Archive (All Time)</option>
            </select>
          </div>

          {filterRange === 'custom' && (
            <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 p-2 rounded-lg text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white px-2 py-1 border border-gray-200 rounded-lg font-bold text-gray-700 outline-none"
              />
              <span className="text-gray-400 font-bold">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white px-2 py-1 border border-gray-200 rounded-lg font-bold text-gray-700 outline-none"
              />
            </div>
          )}

          {/* Export Dropdown / Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCsv}
              title="Export CSV"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportExcel}
              title="Export Excel Spreadsheet"
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              onClick={handlePrintPdf}
              title="Print / Save PDF"
              className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF / Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Key Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Revenue */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-lg relative overflow-hidden group hover:border-emerald-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Paid Revenue</p>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
                ₦{totalRevenue.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 flex items-center text-[11px] font-bold text-gray-500">
            <span>From {paidInvoicesInRange.length} paid invoice{paidInvoicesInRange.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        {/* Card 2: Total Direct Cost */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-lg relative overflow-hidden group hover:border-rose-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Direct Cost</p>
              <h3 className="text-2xl font-black text-rose-700 tracking-tight mt-1">
                ₦{totalDirectCost.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg text-rose-600 border border-rose-100">
              <Layers className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 flex items-center text-[11px] font-bold text-gray-500">
            <span>Direct labor, materials & execution</span>
          </div>
        </div>

        {/* Card 3: Gross Profit */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-lg relative overflow-hidden group hover:border-indigo-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Gross Profit</p>
              <h3 className={`text-2xl font-black tracking-tight mt-1 ${grossProfit >= 0 ? 'text-indigo-900' : 'text-rose-600'}`}>
                ₦{grossProfit.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 flex items-center text-[11px] font-bold text-gray-500">
            <span>Revenue minus Direct Costs</span>
          </div>
        </div>

        {/* Card 4: Profit Margin % */}
        <div className={`bg-white p-6 rounded-xl border-2 shadow-lg relative overflow-hidden transition-all ${overallIndicator.bg}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Overall Profit Margin</p>
              <div className="flex items-baseline space-x-2 mt-1">
                <h3 className="text-3xl font-black text-gray-900 tracking-tight">
                  {profitMarginPct.toFixed(1)}%
                </h3>
              </div>
            </div>
            <div className={`p-2.5 rounded-lg font-extrabold text-xs tracking-wider uppercase shadow-sm border ${overallIndicator.bg}`}>
              {overallIndicator.status}
            </div>
          </div>

          {/* Indicator Rules Bar */}
          <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="flex items-center space-x-1">
              <span className={`w-2 h-2 rounded-full ${overallIndicator.dot}`}></span>
              <span>{overallIndicator.label}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Visual Charts: Bar Chart (Revenue vs Direct Cost) & Line Chart (Trends) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bar Chart: Revenue vs Direct Cost by Service */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-xl border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                Revenue vs Direct Cost Comparison
              </h3>
              <p className="text-xs text-gray-500 font-medium">Per-service breakdown of earned revenue against direct costs</p>
            </div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full">
              Bar Analysis
            </span>
          </div>

          {serviceBreakdown.length > 0 ? (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={serviceBreakdown.slice(0, 8)} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="serviceName"
                    tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 800 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickFormatter={(val) => val.length > 12 ? `${val.substring(0, 10)}...` : val}
                  />
                  <YAxis
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 800 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [`₦${value.toLocaleString()}`, name === 'revenue' ? 'Revenue' : 'Direct Cost']}
                    contentStyle={{ borderRadius: '0.75rem', border: '1px solid #f3f4f6', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px', fontWeight: 800 }} />
                  <Bar dataKey="revenue" name="Revenue (₦)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="directCost" name="Direct Cost (₦)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[320px] flex flex-col items-center justify-center text-gray-400 italic font-bold">
              <PieIcon className="w-12 h-12 text-gray-200 mb-2" />
              <span>No paid service revenue recorded for this timeframe.</span>
            </div>
          )}
        </div>

        {/* Line Chart: Revenue and Direct Cost Trends over time */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-xl border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                Margin Timeline Trend
              </h3>
              <p className="text-xs text-gray-500 font-medium">Tracking Revenue, Direct Cost, and Gross Profit trajectory</p>
            </div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full">
              Timeline
            </span>
          </div>

          {trendTimeline.length > 0 ? (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={trendTimeline} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="period" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 800 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [`₦${value.toLocaleString()}`, name]}
                    contentStyle={{ borderRadius: '0.75rem', border: '1px solid #f3f4f6', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px', fontWeight: 800 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="directCost" name="Direct Cost" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[320px] flex flex-col items-center justify-center text-gray-400 italic font-bold">
              <TrendingUp className="w-12 h-12 text-gray-200 mb-2" />
              <span>No historical payment data available in this period.</span>
            </div>
          )}
        </div>
      </div>

      {/* Service Profitability Table */}
      <div className="bg-white p-6 md:p-8 rounded-xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
              Service Profitability Breakdown
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              Detailed financials per service line item from settled invoices.
            </p>
          </div>

          {/* Indicator Rules Legend */}
          <div className="flex items-center space-x-3 text-[10px] font-black uppercase tracking-wider bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-emerald-800">Green (&gt;40%)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-amber-800">Yellow (20-40%)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-rose-800">Red (&lt;20%)</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 uppercase font-black tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 rounded-l-lg">Service Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4 text-right">Revenue Generated</th>
                <th className="px-6 py-4 text-right">Direct Cost</th>
                <th className="px-6 py-4 text-right">Gross Profit</th>
                <th className="px-6 py-4 text-center">Profit Margin %</th>
                <th className="px-6 py-4 text-center rounded-r-lg">Indicator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {serviceBreakdown.map((s, idx) => (
                <tr key={s.serviceId + idx} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900 whitespace-nowrap">
                    <div className="text-sm font-extrabold text-gray-900">{s.serviceName}</div>
                    <div className="text-[10px] text-gray-400">{s.unitsSold} unit{s.unitsSold === 1 ? '' : 's'} fulfilled</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full font-bold uppercase text-[9px] tracking-wider">
                      {s.category || 'General'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-extrabold text-emerald-700 text-right whitespace-nowrap">
                    ₦{s.revenue.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-bold text-rose-700 text-right whitespace-nowrap">
                    ₦{s.directCost.toLocaleString()}
                  </td>
                  <td className={`px-6 py-4 font-black text-right whitespace-nowrap ${s.profit >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                    ₦{s.profit.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-sm whitespace-nowrap">
                    {s.profitMarginPct.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${s.indicator.bg}`}>
                      <span className={`w-2 h-2 rounded-full ${s.indicator.dot}`}></span>
                      <span>{s.indicator.status} ({s.profitMarginPct.toFixed(0)}%)</span>
                    </span>
                  </td>
                </tr>
              ))}
              {serviceBreakdown.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400 italic font-bold">
                    No paid invoice data found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Insights & Strategic Profitability Advisor Section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 text-white p-6 md:p-8 rounded-xl shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-lg text-indigo-300">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">AI Intelligence Engine</span>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">Profitability & Margin Advisory</h3>
            </div>
          </div>

          <button
            onClick={handleGenerateAiInsights}
            disabled={isGeneratingAi}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-black uppercase tracking-wider text-xs shadow-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingAi ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Compiling CFO Analysis...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Generate Strategic AI Report</span>
              </>
            )}
          </button>
        </div>

        {/* Real-time Rule-based Quick Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-lg">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Highest Profit Margin Services</span>
            </div>
            {highMarginServices.length > 0 ? (
              <ul className="space-y-1 text-xs text-slate-200">
                {highMarginServices.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex justify-between font-medium">
                    <span className="truncate pr-2">{s.serviceName}</span>
                    <span className="font-extrabold text-emerald-400">{s.profitMarginPct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">No services currently exceeding 40% target margin.</p>
            )}
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-lg">
            <div className="flex items-center space-x-2 text-rose-400 text-xs font-bold uppercase tracking-wider mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Low Profitability Caution</span>
            </div>
            {lowMarginServices.length > 0 ? (
              <ul className="space-y-1 text-xs text-slate-200">
                {lowMarginServices.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex justify-between font-medium">
                    <span className="truncate pr-2">{s.serviceName}</span>
                    <span className="font-extrabold text-rose-400">{s.profitMarginPct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">No services operating under the 20% margin threshold.</p>
            )}
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-lg">
            <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldAlert className="w-4 h-4" />
              <span>High Revenue / Low Profit Risk</span>
            </div>
            {highRevLowProfitServices.length > 0 ? (
              <ul className="space-y-1 text-xs text-slate-200">
                {highRevLowProfitServices.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex justify-between font-medium">
                    <span className="truncate pr-2">{s.serviceName}</span>
                    <span className="font-extrabold text-amber-400">₦{s.profit.toLocaleString()} profit</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">Revenue volume matches healthy profit retention.</p>
            )}
          </div>
        </div>

        {/* Deep AI Analysis Response Panel */}
        {aiAnalysis && (
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-lg p-6 md:p-8 animate-in slide-in-from-bottom-3">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Executive Dossier & Recommendations</span>
              <span className="text-[9px] font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-md">AI-Generated</span>
            </div>
            <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-200">
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 className="text-sm font-black text-indigo-300 uppercase tracking-wider mt-4 mb-2 border-b border-slate-800 pb-1" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-xs font-black text-white uppercase tracking-wider mt-3 mb-1.5" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-xs font-bold text-indigo-200 uppercase mt-2 mb-1" {...props} />,
                  p: ({node, ...props}) => <p className="text-xs text-slate-300 leading-relaxed mb-2.5" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1 text-xs text-slate-300" {...props} />,
                  li: ({node, ...props}) => <li className="pl-1 leading-relaxed" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-black text-white" {...props} />,
                }}
              >
                {aiAnalysis}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenueVsDirectCostReport;
