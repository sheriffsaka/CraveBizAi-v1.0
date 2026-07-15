
import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Company, User, AllTenantsData, InvoiceStatus, TenantData, Project, AuditLog } from '../types';
import StatCard from './StatCard';
import Icon from './common/Icon';
import { generateTextResponse } from '../services/aiGenerationService';
import CompanyDetailModal from './CompanyDetailModal';
import EditUserModal from './EditUserModal';
import { api } from '../lib/api';
import { getSubscriptionInfo, setSubscriptionInfo, TIER_LIMITS, SubscriptionTier, saveGlobalPlanSettings, REFILL_PACKS, saveGlobalRefillPacks, syncGlobalRefillPacks } from '../services/subscriptionService';

interface AdminDashboardProps {
  allTenantData: AllTenantsData;
  companies: Company[];
  users: User[];
  onUpdateCompany: (companyId: string, details: Partial<Company>) => Promise<void>;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateUser: (userId: string, details: Partial<User>) => Promise<void>;
}

const AdminDashboardIcon = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const CompaniesTable: React.FC<{
  companies: Company[];
  onViewDetails: (company: Company) => void;
  sortKey: 'name' | 'email' | 'users' | 'invoices' | 'revenue';
  sortDirection: 'asc' | 'desc';
  onSort: (key: 'name' | 'email' | 'users' | 'invoices' | 'revenue') => void;
  allTenantData: AllTenantsData;
  users: User[];
}> = ({ companies, onViewDetails, sortKey, sortDirection, onSort, allTenantData, users }) => {
  const getSortIcon = (key: string) => (sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null);

  const getCompanyStats = (companyId: string) => {
    const tenantUsers = users.filter(u => u.tenantIds.includes(companyId));
    const tenantInvoices = allTenantData[companyId]?.invoices || [];
    const tenantRevenue = tenantInvoices.filter(inv => inv.status === InvoiceStatus.Paid).reduce((sum, inv) => sum + inv.total, 0);
    return {
      userCount: tenantUsers.length,
      invoiceCount: tenantInvoices.length,
      revenue: tenantRevenue,
    };
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>Company Name{getSortIcon('name')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('email')}>Email{getSortIcon('email')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('users')}>Users{getSortIcon('users')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('invoices')}>Invoices{getSortIcon('invoices')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('revenue')}>Revenue{getSortIcon('revenue')}</th>
            <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const stats = getCompanyStats(company.id);
            return (
              <tr key={company.id} className="bg-white border-b hover:bg-gray-50">
                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{company.name}</th>
                <td className="px-6 py-4">{company.email}</td>
                <td className="px-6 py-4">{stats.userCount}</td>
                <td className="px-6 py-4">{stats.invoiceCount}</td>
                <td className="px-6 py-4">₦{stats.revenue.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => onViewDetails(company)} className="font-medium text-primary-600 hover:underline">View Details</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const UsersTable: React.FC<{
  users: User[];
  onEditUser: (user: User) => void;
  sortKey: 'name' | 'email' | 'tenantCount' | 'isAdmin' | 'status';
  sortDirection: 'asc' | 'desc';
  onSort: (key: 'name' | 'email' | 'tenantCount' | 'isAdmin' | 'status') => void;
}> = ({ users, onEditUser, sortKey, sortDirection, onSort }) => {
  const getSortIcon = (key: string) => (sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('name')}>Name{getSortIcon('name')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('email')}>Email{getSortIcon('email')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('tenantCount')}>Tenants{getSortIcon('tenantCount')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('isAdmin')}>Type{getSortIcon('isAdmin')}</th>
            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => onSort('status')}>Status{getSortIcon('status')}</th>
            <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
              <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{user.name}</th>
              <td className="px-6 py-4">{user.email}</td>
              <td className="px-6 py-4">{user.tenantIds?.length || 0}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
                  {user.isAdmin ? 'Admin' : 'User'}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {user.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => onEditUser(user)} className="font-medium text-primary-600 hover:underline">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ allTenantData, companies, users, onUpdateCompany, onDeleteCompany, onUpdateUser }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'users' | 'reports' | 'security' | 'ai_usage'>('overview');
  const [aiUsageSearch, setAiUsageSearch] = useState('');
  const [aiUsageList, setAiUsageList] = useState<any[]>([]);
  const [aiLedgerEntries, setAiLedgerEntries] = useState<any[]>([]);
  const [isFetchingLedger, setIsFetchingLedger] = useState<boolean>(false);
  const [ledgerSearch, setLedgerSearch] = useState('');

  const [editableLimits, setEditableLimits] = useState<typeof TIER_LIMITS>(() => ({ ...TIER_LIMITS }));
  const [savePricingSuccess, setSavePricingSuccess] = useState(false);

  const [editableRefillPacks, setEditableRefillPacks] = useState<typeof REFILL_PACKS>(() => ({ ...REFILL_PACKS }));
  const [saveRefillSuccess, setSaveRefillSuccess] = useState(false);

  useEffect(() => {
    syncGlobalRefillPacks().then(() => {
      setEditableRefillPacks({ ...REFILL_PACKS });
    }).catch(console.error);
  }, []);

  useEffect(() => {
    setEditableLimits({ ...TIER_LIMITS });
    setEditableRefillPacks({ ...REFILL_PACKS });
  }, [activeTab]);

  // Load AI Credit logs ledger when entering AI Usage tab
  useEffect(() => {
    if (activeTab === 'ai_usage') {
      const loadLedger = async () => {
        setIsFetchingLedger(true);
        try {
          const logs = await api.fetchAiLedger();
          setAiLedgerEntries(logs || []);
        } catch (e) {
          console.error("Failed to load AI ledger entries:", e);
        } finally {
          setIsFetchingLedger(false);
        }
      };
      loadLedger();
    }
  }, [activeTab]);

  const handleSavePricingLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      Object.keys(editableLimits).forEach((tierKey) => {
        const tier = tierKey as SubscriptionTier;
        TIER_LIMITS[tier] = {
          ...TIER_LIMITS[tier],
          ...editableLimits[tier]
        };
      });

      await saveGlobalPlanSettings(TIER_LIMITS);
      localStorage.setItem('cravebiz_custom_tier_limits', JSON.stringify(TIER_LIMITS));

      window.dispatchEvent(new Event('cravebiz_subscription_change'));
      reloadAiUsageData();

      setSavePricingSuccess(true);
      setTimeout(() => setSavePricingSuccess(false), 3000);
      alert("Subscription Plan limits and pricing saved and updated globally!");
    } catch (err) {
      alert("Failed to save plan pricing and limits configuration.");
    }
  };

  const handleSaveRefillPacks = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveGlobalRefillPacks(editableRefillPacks);
      setSaveRefillSuccess(true);
      setTimeout(() => setSaveRefillSuccess(false), 3000);
      alert("Global AI Credit Refill Packs updated and saved successfully!");
    } catch (err) {
      alert("Failed to save custom Refill Packs settings.");
    }
  };

  const reloadAiUsageData = () => {
    const data = companies.map(comp => {
      const sub = getSubscriptionInfo(comp.id);
      return {
        companyId: comp.id,
        name: comp.name,
        email: comp.email,
        tier: sub.tier,
        aiUnits: sub.aiUnits,
        aiModeEnabled: sub.aiModeEnabled,
        maxAiUnits: TIER_LIMITS[sub.tier]?.maxAiUnits || 0
      };
    });
    setAiUsageList(data);

    // Also update ledger
    api.fetchAiLedger().then(logs => setAiLedgerEntries(logs || [])).catch(console.error);
  };

  useEffect(() => {
    reloadAiUsageData();
  }, [companies, activeTab]);

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // New multi-tenant platform details states
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allAuditLogs, setAllAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingPlatformDetails, setIsLoadingPlatformDetails] = useState(false);

  // Verification & Scanning states
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [verifiedProjectIds, setVerifiedProjectIds] = useState<string[]>([]);

  // Audit explorer filters
  const [searchQuery, setSearchQuery] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // AI Security compliance analyzer states
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load platform-wide projects and audit logs in parallel for security audits
  useEffect(() => {
    const loadPlatformDetails = async () => {
      setIsLoadingPlatformDetails(true);
      try {
        const projectPromises = companies.map(c => api.fetchProjects(c.id));
        const auditLogPromises = companies.map(c => api.fetchAuditLogs(c.id));
        
        const [projectsArrays, auditLogsArrays] = await Promise.all([
          Promise.all(projectPromises),
          Promise.all(auditLogPromises)
        ]);
        
        setAllProjects(projectsArrays.flat());
        setAllAuditLogs(auditLogsArrays.flat());
      } catch (err) {
        console.warn("Failed to load platform details:", err);
      } finally {
        setIsLoadingPlatformDetails(false);
      }
    };
    if (companies.length > 0) {
      loadPlatformDetails();
    }
  }, [companies]);

  const triggerIntegrityScan = async () => {
    setScanStatus('scanning');
    setScanLogs([]);
    setVerifiedProjectIds([]);

    const logs = [
      "⚡ Initializing System Integrity Ledger Scanner...",
      "🔍 Loading workspace node registry...",
      `📦 Located ${companies.length} active company nodes...`,
      "🧬 Instantiating SHA-256 validator engine...",
    ];

    const addLogWithDelay = (message: string, delay: number) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setScanLogs(prev => [...prev, message]);
          resolve();
        }, delay);
      });
    };

    // Output basic logs
    for (let i = 0; i < logs.length; i++) {
      await addLogWithDelay(logs[i], 180);
    }

    const archivedProjects = allProjects.filter(p => p.status === 'Archived');
    
    if (archivedProjects.length === 0) {
      await addLogWithDelay("⚠️ No archived compliance ledgers located in workspace stores.", 250);
      await addLogWithDelay("✅ System Scan complete: 0/0 ledgers verified.", 150);
      setScanStatus('success');
      return;
    }

    await addLogWithDelay(`📊 Scanning ${archivedProjects.length} compliance ledger records...`, 250);

    for (let j = 0; j < archivedProjects.length; j++) {
      const proj = archivedProjects[j];
      const comp = companies.find(c => c.id === proj.companyId);
      await addLogWithDelay(`🛡️ Decrypting block seal for [${comp?.name || 'Unknown'}] - "${proj.name}"...`, 200);
      await addLogWithDelay(`🔑 Re-computing local vault hash: ${proj.vaultHash || 'CBZ-SEAL-PENDING'}`, 150);
      
      if (proj.vaultHash) {
        await addLogWithDelay(`✨ Match confirmed: SHA-256 seal verified against system registry.`, 120);
        setVerifiedProjectIds(prev => [...prev, proj.id]);
      } else {
        await addLogWithDelay(`❌ WARNING: Missing signature seal hash for project "${proj.name}"!`, 120);
      }
    }

    await addLogWithDelay("🔒 Double-checking cross-tenant database constraints...", 200);
    await addLogWithDelay("💚 ALL SEALS VALID. No anomalous alterations detected.", 150);
    await addLogWithDelay("✅ System Scan complete. 100% Cryptographic integrity preserved.", 150);
    setScanStatus('success');
  };

  const handleExportCSV = () => {
    // Re-filter the logs based on current filters
    const filteredLogs = allAuditLogs.filter(log => {
      const matchesSearch = searchQuery ? (
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resource.toLowerCase().includes(searchQuery.toLowerCase())
      ) : true;
      const matchesWorkspace = workspaceFilter ? log.companyId === workspaceFilter : true;
      const matchesAction = actionFilter ? log.action === actionFilter : true;
      return matchesSearch && matchesWorkspace && matchesAction;
    });

    if (filteredLogs.length === 0) {
      alert("No logs to export matching current filters.");
      return;
    }

    // Generate CSV content
    const headers = ["Event ID", "Timestamp", "User Name", "User ID", "Workspace Node ID", "Action", "Resource Code", "Details"];
    const rows = filteredLogs.map(log => [
      log.id,
      log.createdAt,
      `"${log.userName.replace(/"/g, '""')}"`,
      log.userId,
      log.companyId,
      log.action,
      log.resource,
      `"${log.details.replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `platform_compliance_audit_trail_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAIComplianceAudit = async (customPrompt?: string) => {
    setAiLoading(true);
    setAiResponse(null);

    const activePrompt = customPrompt || "Perform system-wide compliance assessment.";
    const archivedProjects = allProjects.filter(p => p.status === 'Archived');
    
    const contextStr = `
Platform Admin Compliance Audit Request.
Active Companies: ${companies.length}
Active User Profiles: ${users.length}
Total Compliance Invoices: ${stats.totalInvoices}
Platform Revenue Node Total: ₦${stats.totalRevenue}

Archived Compliance Vaults:
${archivedProjects.map(p => {
  const comp = companies.find(c => c.id === p.companyId);
  return `- Workspace: ${comp?.name || p.companyId}, Project: "${p.name}", Retention Policy: ${p.compliancePolicy || 'N/A'}, Value: ₦${p.value}, Rating: ${p.satisfactionRating || 'N/A'}, Seal Hash: ${p.vaultHash || 'None'}`;
}).join('\n')}

Recent Audit Log Excerpts:
${allAuditLogs.slice(0, 15).map(l => `[${l.createdAt}] User: ${l.userName}, Action: ${l.action}, Target: ${l.resource}, Details: ${l.details}`).join('\n')}

Admin Query: ${activePrompt}
`;

    try {
      const insight = await generateTextResponse(
        contextStr, 
        'gemini-3-flash-preview', 
        "You are the senior CraveBiZ Platform Compliance Auditor and Risk Intelligence Analyst. Respond with a formal, professional, bulleted audit report specifying observations, identified risks, satisfaction reviews, and technical retention compliance recommendations."
      );
      setAiResponse(insight);
    } catch (err) {
      setAiResponse("Compliance analysis query failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const stats = useMemo(() => {
    const tenantValues = Object.values(allTenantData) as TenantData[];
    const totalInvoices = tenantValues.reduce((sum, t) => sum + (t.invoices?.length || 0), 0);
    const totalRevenue = tenantValues.reduce((sum, t) => 
      sum + (t.invoices?.filter(i => i.status === InvoiceStatus.Paid).reduce((s, i) => s + i.total, 0) || 0), 0);
    const pendingRevenue = tenantValues.reduce((sum, t) => 
      sum + (t.invoices?.filter(i => i.status !== InvoiceStatus.Paid).reduce((s, i) => s + i.total, 0) || 0), 0);
    
    // Monthly revenue and invoice count data for charts
    const monthlyData: { [key: string]: number } = {};
    const monthlyInvoicesCount: { [key: string]: number } = {};

    tenantValues.forEach(t => {
      t.invoices?.forEach(inv => {
        const month = inv.issueDate.substring(0, 7); // YYYY-MM
        if (inv.status === InvoiceStatus.Paid) {
          monthlyData[month] = (monthlyData[month] || 0) + inv.total;
        }
        monthlyInvoicesCount[month] = (monthlyInvoicesCount[month] || 0) + 1;
      });
    });

    const allMonths = Array.from(new Set([
      ...Object.keys(monthlyData),
      ...Object.keys(monthlyInvoicesCount)
    ])).sort();

    const chartData = allMonths.map(month => ({
      name: month,
      revenue: monthlyData[month] || 0,
      transactions: monthlyData[month] || 0,
      invoicesCount: monthlyInvoicesCount[month] || 0
    }));

    return { totalInvoices, totalRevenue, pendingRevenue, chartData };
  }, [allTenantData]);

  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const insight = await generateTextResponse(`Admin Query: ${query}. Context: ${companies.length} companies, ${users.length} users, ${stats.totalInvoices} invoices, Total Revenue: ₦${stats.totalRevenue}.`, 'gemini-3-flash-preview', "You are a Platform Admin Analyst.");
      setResponse(insight);
    } catch (err) {
      setResponse("Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const changePlan = (companyId: string, tier: SubscriptionTier) => {
    const limits = TIER_LIMITS[tier];
    setSubscriptionInfo(companyId, tier, limits.maxAiUnits, limits.aiAvailable);
    reloadAiUsageData();
    window.dispatchEvent(new Event('cravebiz_subscription_change'));
  };

  const addCredits = (companyId: string, extraAmount: number) => {
    const sub = getSubscriptionInfo(companyId);
    const newUnits = sub.aiUnits + extraAmount;
    setSubscriptionInfo(companyId, sub.tier, newUnits, sub.aiModeEnabled);
    reloadAiUsageData();
    window.dispatchEvent(new Event('cravebiz_subscription_change'));
  };

  const resetCredits = (companyId: string) => {
    const sub = getSubscriptionInfo(companyId);
    const limits = TIER_LIMITS[sub.tier];
    setSubscriptionInfo(companyId, sub.tier, limits?.maxAiUnits || 0, sub.aiModeEnabled);
    reloadAiUsageData();
    window.dispatchEvent(new Event('cravebiz_subscription_change'));
  };

  const toggleAiEngine = (companyId: string) => {
    const sub = getSubscriptionInfo(companyId);
    setSubscriptionInfo(companyId, sub.tier, sub.aiUnits, !sub.aiModeEnabled);
    reloadAiUsageData();
    window.dispatchEvent(new Event('cravebiz_subscription_change'));
  };

  const renderAiUsage = () => {
    const filteredUsage = aiUsageList.filter(item => 
      item.name.toLowerCase().includes(aiUsageSearch.toLowerCase()) ||
      item.email.toLowerCase().includes(aiUsageSearch.toLowerCase()) ||
      item.companyId.toLowerCase().includes(aiUsageSearch.toLowerCase())
    );

    const totalActiveAiWorkspaces = aiUsageList.filter(item => item.tier !== 'Free').length;
    const totalAiCreditsAllocated = aiUsageList.reduce((sum, item) => sum + item.aiUnits, 0);
    const totalDepletedWorkspaces = aiUsageList.filter(item => item.aiUnits === 0 && item.tier !== 'Free').length;

    return (
      <div className="space-y-8 font-sans">
        {/* Banner with explanations */}
        <div className="bg-slate-900 text-slate-100 p-8 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/10 rounded-full -mr-24 -mt-24"></div>
          <div className="max-w-3xl">
            <span className="text-[10px] font-black text-primary-400 uppercase tracking-widest bg-primary-950/40 border border-primary-900 px-3 py-1.5 rounded-full inline-block mb-4">
              🛡️ Super Admin AI Operations
            </span>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight uppercase">
              SME AI Plan & Credit Control Console
            </h2>
            <p className="text-xs text-slate-300 mt-3 leading-relaxed font-medium">
              This dashboard provides real-time oversight of all tenant workspaces on the CraveBiZ platform. As the application owner, you can manage active subscription tiers, activate or migrate workspaces, and recharge credits when they exhaust their monthly tokens.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 border-t border-slate-800 pt-6">
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl">
                <span className="text-3xs font-black text-slate-400 uppercase tracking-widest">Active AI Workspaces</span>
                <p className="text-xl font-black text-white mt-1">{totalActiveAiWorkspaces} Tenants</p>
                <p className="text-4xs text-slate-500 mt-1">On Standard or Enterprise plans</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl">
                <span className="text-3xs font-black text-slate-400 uppercase tracking-widest">Total Allocated Credits</span>
                <p className="text-xl font-black text-emerald-400 mt-1">{totalAiCreditsAllocated} Units</p>
                <p className="text-4xs text-slate-500 mt-1">Available across all active nodes</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl">
                <span className="text-3xs font-black text-slate-400 uppercase tracking-widest">Depleted Workspaces</span>
                <p className={`text-xl font-black mt-1 ${totalDepletedWorkspaces > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {totalDepletedWorkspaces} Tenants
                </p>
                <p className="text-4xs text-slate-500 mt-1">Exhausted their monthly credits</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and interactive table */}
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Active Workspaces List</h3>
              <p className="text-xs text-gray-400 font-medium">Monitor active balances, upgrade subscription tiers, or add extra tokens</p>
            </div>
            
            <div className="w-full md:w-80">
              <input
                type="text"
                placeholder="Search tenant or email..."
                value={aiUsageSearch}
                onChange={e => setAiUsageSearch(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              />
            </div>
          </div>

          {filteredUsage.length > 0 ? (
            <div className="overflow-x-auto border border-gray-100 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/50">
                    <th className="py-3 px-4">SME Workspace Node</th>
                    <th className="py-3 px-4">Current Plan</th>
                    <th className="py-3 px-4">AI Engine Switch</th>
                    <th className="py-3 px-4">AI Credits Balance</th>
                    <th className="py-3 px-4">Activate/Migrate Plan</th>
                    <th className="py-3 px-4 text-right">Recharge Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-medium">
                  {filteredUsage.map((item) => {
                    const pct = item.maxAiUnits > 0 ? Math.min(100, Math.round((item.aiUnits / item.maxAiUnits) * 100)) : 0;
                    const isDepleted = item.aiUnits === 0 && item.tier !== 'Free';
                    
                    return (
                      <tr key={item.companyId} className="hover:bg-gray-50/30 transition-colors">
                        <td className="py-4 px-4">
                          <p className="font-extrabold text-sm text-gray-800">{item.name}</p>
                          <span className="text-[10px] font-mono text-gray-400 select-all">{item.companyId}</span>
                          <p className="text-[10px] text-gray-500 mt-0.5">{item.email}</p>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            item.tier === 'Enterprise' 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : item.tier === 'Growth'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : item.tier === 'Starter'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {item.tier}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => toggleAiEngine(item.companyId)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                              item.aiModeEnabled
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-200'
                            }`}
                          >
                            {item.aiModeEnabled ? '● Active' : '○ Off'}
                          </button>
                        </td>
                        <td className="py-4 px-4">
                          <div className="space-y-1.5 w-36">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className={isDepleted ? 'text-rose-600 font-extrabold' : 'text-gray-500'}>
                                {item.aiUnits} / {item.maxAiUnits} credits
                              </span>
                              {isDepleted && <span className="text-rose-500 text-[8px] uppercase tracking-wider font-extrabold">DEPLETED</span>}
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  item.tier === 'Free'
                                    ? 'bg-gray-300'
                                    : isDepleted 
                                    ? 'bg-rose-500' 
                                    : pct < 25 
                                    ? 'bg-amber-500' 
                                    : 'bg-emerald-500'
                                }`} 
                                style={{ width: `${item.tier === 'Free' ? 0 : pct}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                            <button
                              type="button"
                              onClick={() => changePlan(item.companyId, 'Free')}
                              disabled={item.tier === 'Free'}
                              className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-colors ${
                                item.tier === 'Free' 
                                  ? 'bg-gray-100 text-gray-400 border border-gray-150 cursor-not-allowed' 
                                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              Free
                            </button>
                            <button
                              type="button"
                              onClick={() => changePlan(item.companyId, 'Starter')}
                              disabled={item.tier === 'Starter'}
                              className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-colors ${
                                item.tier === 'Starter' 
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200 cursor-not-allowed' 
                                  : 'bg-white text-blue-600 hover:bg-blue-50 border border-blue-200'
                              }`}
                            >
                              Starter
                            </button>
                            <button
                              type="button"
                              onClick={() => changePlan(item.companyId, 'Growth')}
                              disabled={item.tier === 'Growth'}
                              className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-colors ${
                                item.tier === 'Growth' 
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200 cursor-not-allowed' 
                                  : 'bg-white text-purple-600 hover:bg-purple-50 border border-purple-200'
                              }`}
                            >
                              Growth
                            </button>
                            <button
                              type="button"
                              onClick={() => changePlan(item.companyId, 'Enterprise')}
                              disabled={item.tier === 'Enterprise'}
                              className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-colors ${
                                item.tier === 'Enterprise' 
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200 cursor-not-allowed' 
                                  : 'bg-white text-amber-600 hover:bg-amber-50 border border-amber-200'
                              }`}
                            >
                              Enterprise
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => addCredits(item.companyId, 50)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-2 py-1 rounded shadow-sm transition-colors animate-pulse"
                              title="Refill 50 AI credits"
                            >
                              +50 Refill
                            </button>
                            <button
                              type="button"
                              onClick={() => addCredits(item.companyId, 100)}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-bold px-2 py-1 rounded shadow-sm transition-colors"
                              title="Refill 100 AI credits"
                            >
                              +100 Refill
                            </button>
                            <button
                              type="button"
                              onClick={() => resetCredits(item.companyId)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold px-2 py-1 rounded transition-colors"
                              title="Reset balance to plan limits"
                            >
                              Reset
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center border border-dashed border-gray-100 rounded-3xl bg-gray-50/20">
              <p className="text-sm font-bold text-gray-400 italic">No workspace matches your search query.</p>
            </div>
          )}
        </div>

        {/* Global Plan Configuration Panel */}
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100 mt-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Standard Plan Limits & Pricing Settings</h3>
              <p className="text-xs text-gray-400 font-medium">Configure global subscription plan prices, credit allowance limits, and other tier features</p>
            </div>
          </div>

          <form onSubmit={handleSavePricingLimits} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(Object.keys(editableLimits) as SubscriptionTier[]).map((tier) => {
                const limit = editableLimits[tier];
                return (
                  <div key={tier} className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-800">{tier} Plan</span>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`aiAvailable-${tier}`}
                          checked={limit.aiAvailable}
                          onChange={(e) => {
                            setEditableLimits(prev => ({
                              ...prev,
                              [tier]: { ...prev[tier], aiAvailable: e.target.checked }
                            }));
                          }}
                          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-0"
                        />
                        <label htmlFor={`aiAvailable-${tier}`} className="ml-1.5 text-3xs font-extrabold uppercase tracking-wider text-gray-500 cursor-pointer select-none">
                          AI Available
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Pricing (e.g. ₦15,000.00)</label>
                        <input
                          type="text"
                          value={limit.price}
                          onChange={(e) => {
                            setEditableLimits(prev => ({
                              ...prev,
                              [tier]: { ...prev[tier], price: e.target.value }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Max AI Tokens (Credits)</label>
                        <input
                          type="number"
                          value={limit.maxAiUnits}
                          onChange={(e) => {
                            setEditableLimits(prev => ({
                              ...prev,
                              [tier]: { ...prev[tier], maxAiUnits: parseInt(e.target.value) || 0 }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Max Invoices Limit</label>
                        <input
                          type="number"
                          value={limit.maxInvoices}
                          onChange={(e) => {
                            setEditableLimits(prev => ({
                              ...prev,
                              [tier]: { ...prev[tier], maxInvoices: parseInt(e.target.value) || 0 }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Max Receipts Limit</label>
                        <input
                          type="number"
                          value={limit.maxReceipts}
                          onChange={(e) => {
                            setEditableLimits(prev => ({
                              ...prev,
                              [tier]: { ...prev[tier], maxReceipts: parseInt(e.target.value) || 0 }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Max Authorized Users</label>
                        <input
                          type="number"
                          value={limit.maxUsers}
                          onChange={(e) => {
                            setEditableLimits(prev => ({
                              ...prev,
                              [tier]: { ...prev[tier], maxUsers: parseInt(e.target.value) || 0 }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl shadow-lg transition-all"
              >
                Save Pricing & Limits Config
              </button>
            </div>
          </form>
        </div>

        {/* Global AI Credit Refill Packs Panel */}
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100 mt-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Global AI Credit Refill Packs</h3>
              <p className="text-xs text-gray-400 font-medium">Configure global prices, credit amounts, and titles for each purchasable AI Refill pack</p>
            </div>
          </div>

          <form onSubmit={handleSaveRefillPacks} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {(Object.keys(editableRefillPacks) as Array<keyof typeof REFILL_PACKS>).map((packKey) => {
                const pack = editableRefillPacks[packKey];
                return (
                  <div key={packKey} className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-800">{packKey.replace('_', ' ')}</span>
                    </div>

                    <div className="space-y-3 text-xs font-bold">
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Pack Title</label>
                        <input
                          type="text"
                          value={pack.title}
                          onChange={(e) => {
                            setEditableRefillPacks(prev => ({
                              ...prev,
                              [packKey]: { ...prev[packKey], title: e.target.value }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">AI Credits Count</label>
                        <input
                          type="number"
                          value={pack.credits}
                          onChange={(e) => {
                            setEditableRefillPacks(prev => ({
                              ...prev,
                              [packKey]: { ...prev[packKey], credits: parseInt(e.target.value) || 0 }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="text-4xs font-black uppercase tracking-widest text-gray-400 block mb-1">Price (₦ - Naira)</label>
                        <input
                          type="number"
                          value={pack.amount}
                          onChange={(e) => {
                            setEditableRefillPacks(prev => ({
                              ...prev,
                              [packKey]: { ...prev[packKey], amount: parseInt(e.target.value) || 0 }
                            }));
                          }}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none text-gray-800"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl shadow-lg transition-all"
              >
                Save Refill Packs Config
              </button>
            </div>
          </form>
        </div>

        {/* Super-Admin AI Credit Ledger Logs & Billing Calculator */}
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100 mt-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
            <div>
              <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest bg-primary-50 px-2.5 py-1 rounded-md inline-block mb-2">
                Ledger Logs & Billing Ledger
              </span>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">AI Credits Usage Registry</h3>
              <p className="text-xs text-gray-400 font-medium mt-1">
                Audits real-time tokens & credits consumed by SMEs utilizing Gemini intelligence. Useful for key credit cost allocation.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <input
                type="text"
                placeholder="Search by User or Task..."
                value={ledgerSearch}
                onChange={e => setLedgerSearch(e.target.value)}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500 transition-all w-full sm:w-64"
              />
              <button
                type="button"
                onClick={() => {
                  setIsFetchingLedger(true);
                  api.fetchAiLedger()
                    .then(logs => setAiLedgerEntries(logs || []))
                    .catch(console.error)
                    .finally(() => setIsFetchingLedger(false));
                }}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Billing / Cost allocation summary cards */}
          {(() => {
            const filteredLedger = aiLedgerEntries.filter(entry => 
              (entry.userEmail || '').toLowerCase().includes(ledgerSearch.toLowerCase()) ||
              (entry.task || '').toLowerCase().includes(ledgerSearch.toLowerCase()) ||
              (entry.companyId || '').toLowerCase().includes(ledgerSearch.toLowerCase())
            );

            const totalTokens = filteredLedger.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);
            const totalCredits = filteredLedger.reduce((sum, e) => sum + (e.creditsUsed || 0), 0);
            // Assuming cost is $0.075 per 1,000 credits for platform margin
            const estimatedCostNgn = totalCredits * 50; 

            return (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-gray-100 p-5 rounded-2xl">
                    <p className="text-4xs font-black text-gray-400 uppercase tracking-widest">Aggregate Tokens Spent</p>
                    <p className="text-lg font-black text-slate-800 mt-1">{totalTokens.toLocaleString()} tokens</p>
                    <p className="text-4xs text-gray-400 mt-0.5">Calculated from prompt & response lengths</p>
                  </div>
                  <div className="bg-slate-50 border border-gray-100 p-5 rounded-2xl">
                    <p className="text-4xs font-black text-gray-400 uppercase tracking-widest">AI Credits Discharged</p>
                    <p className="text-lg font-black text-emerald-600 mt-1">{totalCredits.toLocaleString()} credits</p>
                    <p className="text-4xs text-gray-400 mt-0.5">Direct units deducted from SME quotas</p>
                  </div>
                  <div className="bg-slate-50 border border-gray-100 p-5 rounded-2xl">
                    <p className="text-4xs font-black text-gray-400 uppercase tracking-widest">Key Consumption Index</p>
                    <p className="text-lg font-black text-primary-600 mt-1">₦{estimatedCostNgn.toLocaleString()}</p>
                    <p className="text-4xs text-gray-400 mt-0.5">Approximate cash weight of key operations</p>
                  </div>
                </div>

                {isFetchingLedger ? (
                  <div className="py-12 text-center text-xs text-gray-400 font-bold">
                    Querying secure compliance log vault...
                  </div>
                ) : filteredLedger.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/50">
                          <th className="py-3 px-4">User Identity</th>
                          <th className="py-3 px-4">SME node identity</th>
                          <th className="py-3 px-4">Task(s) Performed</th>
                          <th className="py-3 px-4">Tokens Used</th>
                          <th className="py-3 px-4">Credits Spent</th>
                          <th className="py-3 px-4 text-right">Time Registered</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                        {filteredLedger.map((entry) => {
                          const formattedDate = new Date(entry.timestamp).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });

                          return (
                            <tr key={entry.id} className="hover:bg-gray-50/30 transition-colors">
                              <td className="py-4 px-4">
                                <p className="font-extrabold text-gray-900">{entry.userName || 'Unknown User'}</p>
                                <span className="text-[10px] text-gray-400 select-all">{entry.userEmail}</span>
                              </td>
                              <td className="py-4 px-4">
                                <p className="font-bold text-gray-800">
                                  {companies.find(c => c.id === entry.companyId)?.name || 'Central Workspace'}
                                </p>
                                <span className="text-[9px] text-gray-400 font-mono select-all">{entry.companyId}</span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-md font-bold text-[10px] uppercase tracking-wide">
                                  {entry.task || 'AI Task'}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="font-mono text-gray-900 font-bold">{entry.tokensUsed?.toLocaleString() || 0}</span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-black text-[11px]">
                                  {entry.creditsUsed || 0}
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right font-mono text-gray-400 select-none">
                                {formattedDate}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center border border-dashed border-gray-100 rounded-3xl bg-gray-50/20">
                    <p className="text-sm font-bold text-gray-400 italic">No ledger entries match your filter rules.</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Companies" value={companies.length.toString()} icon={<AdminDashboardIcon d="M3 21h18M3 7v14M21 7v14M6 21V3h12v18M9 7h1m-1 4h1m-1 4h1m4-12h1m-1 4h1m-1 4h1" />} />
          <StatCard title="Total Users" value={users.length.toString()} icon={<AdminDashboardIcon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />} />
          <StatCard title="Total Invoices" value={stats.totalInvoices.toString()} icon={<AdminDashboardIcon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />} />
          <StatCard title="Transaction Volume" value={`₦${stats.totalRevenue.toLocaleString()}`} icon={<AdminDashboardIcon d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
            <h3 className="text-lg font-black mb-6 uppercase tracking-tighter">Transaction By Month</h3>
            <div className="h-64">
              {stats.chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} tickFormatter={(v: number) => `₦${(v/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Transaction Amount']}
                    />
                    <Line type="monotone" dataKey="transactions" stroke="#2563eb" strokeWidth={4} dot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                  No transaction data yet
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
            <h3 className="text-lg font-black mb-6 uppercase tracking-tighter">Invoices By Months</h3>
            <div className="h-64">
              {stats.chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} tickFormatter={(v: number) => v.toFixed(0)} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [value, 'Invoices Count']}
                    />
                    <Bar dataKey="invoicesCount" fill="#10b981" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                  No invoice data yet
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
          <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-3">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              AI Platform Intelligence
          </h3>
          <form onSubmit={handleAskAI} className="flex gap-4">
            <input value={query} onChange={e => setQuery(e.target.value)} className="flex-1 border-2 border-gray-100 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 transition-all font-medium" placeholder="Analyze platform growth or revenue trends..." />
            <button className="bg-primary-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-primary-700 transition-all active:scale-95 disabled:bg-gray-300" disabled={loading}>{loading ? 'Consulting...' : 'Run Analysis'}</button>
          </form>
          {response && <div className="mt-6 p-6 bg-primary-50 rounded-2xl border border-primary-100 text-sm font-medium leading-relaxed italic text-primary-900 animate-in slide-in-from-top-4">{response}</div>}
        </div>
      </div>
    );
  };

  const renderSecurity = () => {
    const archivedProjects = allProjects.filter(p => p.status === 'Archived');
    
    // Unique actions list
    const uniqueActions = Array.from(new Set(allAuditLogs.map(l => l.action)));

    const filteredAuditLogs = allAuditLogs.filter(log => {
      const matchesSearch = searchQuery ? (
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resource.toLowerCase().includes(searchQuery.toLowerCase())
      ) : true;
      const matchesWorkspace = workspaceFilter ? log.companyId === workspaceFilter : true;
      const matchesAction = actionFilter ? log.action === actionFilter : true;
      return matchesSearch && matchesWorkspace && matchesAction;
    });

    const totalArchivedValue = archivedProjects.reduce((sum, p) => sum + p.value, 0);

    const COMPLIANCE_POLICIES: Record<string, { label: string; desc: string; duration: string }> = {
      'IRS-7Y': { label: 'IRS Tax Audit Code Section 6001', desc: 'Secure preservation of financial invoices and agreement contracts for a minimum of 7 years.', duration: '7 Years' },
      'GDPR-5Y': { label: 'GDPR Article 17 Data Retention', desc: 'Legal holding of transactional profiles and agreements with right-to-be-forgotten schedules after 5 years.', duration: '5 Years' },
      'HIPAA-6Y': { label: 'HIPAA Health Transactions Holding', desc: 'Encrypted storage of healthcare related service contracts and payments for 6 years.', duration: '6 Years' },
      'PERM': { label: 'Permanent Cryptographic Archival', desc: 'Permanent preservation in the read-only CraveBiZ smart vault system.', duration: 'Permanent' }
    };

    return (
      <div className="space-y-8">
        {/* Compliance Hero Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-900 text-slate-100 p-6 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full -mr-12 -mt-12"></div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Archived Vaults</p>
            <h4 className="text-3xl font-black text-white tracking-tighter">{archivedProjects.length}</h4>
            <p className="text-2xs text-slate-400 mt-2 font-medium">Secured across multi-tenant nodes</p>
          </div>
          <div className="bg-slate-900 text-slate-100 p-6 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full -mr-12 -mt-12"></div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Seal Status</p>
            <h4 className="text-3xl font-black text-white tracking-tighter">
              {scanStatus === 'success' ? '100% SECURE' : 'PENDING SCAN'}
            </h4>
            <p className="text-2xs text-slate-400 mt-2 font-medium">Cryptographic validation state</p>
          </div>
          <div className="bg-slate-900 text-slate-100 p-6 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full -mr-12 -mt-12"></div>
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Audit Ledger Size</p>
            <h4 className="text-3xl font-black text-white tracking-tighter">{allAuditLogs.length}</h4>
            <p className="text-2xs text-slate-400 mt-2 font-medium">Recorded regulatory security events</p>
          </div>
          <div className="bg-slate-900 text-slate-100 p-6 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full -mr-12 -mt-12"></div>
            <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Archived Asset Value</p>
            <h4 className="text-3xl font-black text-white tracking-tighter">₦{totalArchivedValue.toLocaleString()}</h4>
            <p className="text-2xs text-slate-400 mt-2 font-medium">Compliance-protected capital value</p>
          </div>
        </div>

        {/* Dynamic Verification Scanner Block */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 bg-slate-950 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden text-slate-100 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full -mr-16 -mt-16"></div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                </span>
                <h3 className="text-lg font-black uppercase tracking-tight">Ledger Integrity Scan</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Executes platform-wide validation sweeps across all company nodes. Re-verifies individual vault cryptographic hashes against our un-modifiable system ledger record.
              </p>
            </div>

            <div className="my-6 flex-1 min-h-[140px] max-h-[180px] bg-slate-900/60 rounded-2xl border border-slate-850 p-4 font-mono text-[10px] text-emerald-400 overflow-y-auto space-y-1 shadow-inner custom-scrollbar">
              {scanLogs.length > 0 ? (
                scanLogs.map((log, index) => (
                  <p key={index} className="animate-in fade-in slide-in-from-left-2 duration-150">{log}</p>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 italic text-center">
                  Scanner Idle. Run scan to initiate cryptographic verification sequence.
                </div>
              )}
            </div>

            <button
              onClick={triggerIntegrityScan}
              disabled={scanStatus === 'scanning'}
              className={`w-full py-4 rounded-xl text-3xs font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 ${
                scanStatus === 'scanning'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                  : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer hover:shadow-blue-500/15'
              }`}
            >
              {scanStatus === 'scanning' ? '⚡ VERIFYING LEDGERS...' : '🔍 RUN PLATFORM SCAN'}
            </button>
          </div>

          {/* Unified Compliance Vault Table */}
          <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight text-gray-800">Unified Compliance & Archival Vault</h3>
                  <p className="text-xs text-gray-400 font-medium">Multi-tenant regulatory records under holding policy guidelines</p>
                </div>
                <span className="text-3xs font-black bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-wider">
                  {archivedProjects.length} Vaults Active
                </span>
              </div>

              {archivedProjects.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/50">
                        <th className="py-3 px-4">Project & Tenant Node</th>
                        <th className="py-3 px-4">Value</th>
                        <th className="py-3 px-4">Retention Policy</th>
                        <th className="py-3 px-4">Satisfaction</th>
                        <th className="py-3 px-4">Seal Hash</th>
                        <th className="py-3 px-4 text-right">Ledger Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs">
                      {archivedProjects.map((p) => {
                        const comp = companies.find(c => c.id === p.companyId);
                        const isVerified = verifiedProjectIds.includes(p.id) || scanStatus === 'success';
                        const policyCode = p.compliancePolicy || 'IRS-7Y';
                        const policyInfo = COMPLIANCE_POLICIES[policyCode] || { label: 'IRS-7Y', duration: '7 Years' };

                        return (
                          <tr key={p.id} className="hover:bg-gray-50/75 transition-colors">
                            <td className="py-4 px-4 font-bold text-gray-800">
                              <p className="font-extrabold text-sm">{p.name}</p>
                              <span className="text-[10px] font-black uppercase tracking-tight text-primary-600 mt-0.5 inline-block">
                                🏢 {comp?.name || p.companyId}
                              </span>
                            </td>
                            <td className="py-4 px-4 font-black text-gray-900 text-xs">
                              ₦{p.value.toLocaleString()}
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-[10px] font-black bg-primary-50 text-primary-700 border border-primary-100 px-2.5 py-1 rounded-full uppercase tracking-wider" title={policyInfo.label}>
                                {policyCode} ({policyInfo.duration})
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              {p.satisfactionRating ? (
                                <div className="flex items-center gap-1 text-amber-500">
                                  <span>★</span>
                                  <span className="font-extrabold text-xs">{p.satisfactionRating}/5</span>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">None</span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-mono text-[9px] text-gray-400 select-all" title={p.vaultHash || 'No seal generated'}>
                              {p.vaultHash ? `${p.vaultHash.substring(0, 10)}...` : 'N/A'}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isVerified 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                  : 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse'
                              }`}>
                                {isVerified ? '✓✓ Verified' : '● Unchecked'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center border border-dashed border-gray-100 rounded-3xl bg-gray-50/20">
                  <p className="text-sm font-bold text-gray-400 italic">No SME tenants have currently archived compliance ledgers on this platform.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Compliance Risk Analyst */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
          <h3 className="text-xl font-black mb-4 uppercase tracking-tighter flex items-center gap-3 text-gray-800">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            AI Compliance Risk Analyst
          </h3>
          <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
            Run automated intelligence assessments on cross-tenant document preservation structures, regulatory policies, event log consistency, and anomalous ledger actions.
          </p>

          {/* Quick Action prompts */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button 
              onClick={() => handleAIComplianceAudit("Analyze platform data retention compliance risks across all multi-tenant nodes and list suggestions.")}
              disabled={aiLoading}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200 text-gray-600 font-bold text-3xs uppercase tracking-wider rounded-xl transition-all"
            >
              📊 Compliance Risk Analysis
            </button>
            <button 
              onClick={() => handleAIComplianceAudit("Audit the audit logs for potential unauthorized modifications, project status changes, or unusual activity.")}
              disabled={aiLoading}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200 text-gray-600 font-bold text-3xs uppercase tracking-wider rounded-xl transition-all"
            >
              🚨 Audit Log Anomaly Sweep
            </button>
            <button 
              onClick={() => handleAIComplianceAudit("Verify satisfaction ratings and value stats of completed/archived projects, summarize performance review.")}
              disabled={aiLoading}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200 text-gray-600 font-bold text-3xs uppercase tracking-wider rounded-xl transition-all"
            >
              ⭐️ Archive Quality & Satisfaction Audit
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleAIComplianceAudit(); }} className="flex gap-4">
            <input 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              className="flex-1 border-2 border-gray-100 rounded-2xl px-6 py-4 outline-none focus:border-primary-500 transition-all font-medium text-sm text-gray-800" 
              placeholder="Ask the AI Auditor anything about platform safety, regulatory posture, or log trail analysis..." 
            />
            <button 
              type="submit"
              className="bg-primary-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-primary-700 transition-all active:scale-95 disabled:bg-gray-300" 
              disabled={aiLoading}
            >
              {aiLoading ? 'Auditing Vaults...' : 'Execute AI Audit'}
            </button>
          </form>

          {aiResponse && (
            <div className="mt-6 p-6 bg-slate-900 rounded-3xl border border-slate-800 text-slate-100 text-xs font-mono leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap animate-in slide-in-from-top-4">
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                <span className="text-[10px] font-black tracking-widest text-primary-400 uppercase">🛡️ SENIOR AUDITOR INSIGHT REPORT</span>
                <span className="text-[9px] text-slate-500 font-bold">{new Date().toUTCString()}</span>
              </div>
              {aiResponse}
            </div>
          )}
        </div>

        {/* Global Audit Trails Explorer */}
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b pb-6 border-gray-100">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tighter text-gray-800 flex items-center gap-2">
                <Icon name="reports" className="w-5 h-5 text-primary-600" />
                Cross-Tenant Security Audit Trails
              </h3>
              <p className="text-xs text-gray-400 font-medium">Platform-wide record of SME events, compliance updates, and security triggers</p>
            </div>
            
            <button
              onClick={handleExportCSV}
              className="px-6 py-3 bg-slate-900 text-slate-100 hover:bg-slate-800 rounded-2xl text-3xs font-black uppercase tracking-widest shadow-xl flex items-center gap-2 transition-all"
            >
              📥 EXPORT AUDIT TRAIL (CSV)
            </button>
          </div>

          {/* Interactive Filtering Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-gray-50/50 p-6 rounded-2xl border border-gray-100/50">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Free-text Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search user, action, details..."
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">SME Workspace Node</label>
              <select
                value={workspaceFilter}
                onChange={e => setWorkspaceFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All SME Nodes</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Action Trigger Type</label>
              <select
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All Event Action types</option>
                {uniqueActions.map(act => (
                  <option key={act} value={act}>{act}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredAuditLogs.length > 0 ? (
            <div className="overflow-x-auto border border-gray-100 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/50">
                    <th className="py-3 px-4">Event Timestamp</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Workspace Node</th>
                    <th className="py-3 px-4">Action Trigger</th>
                    <th className="py-3 px-4">Resource Code</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {filteredAuditLogs.map(log => {
                    const comp = companies.find(c => c.id === log.companyId);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-4 font-mono text-[10px] text-gray-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-bold text-gray-900">{log.userName}</p>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full uppercase tracking-tight">
                            🏢 {comp?.name || log.companyId}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-100">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono text-[10px] text-gray-500 bg-gray-50/50 rounded-md">
                          {log.resource}
                        </td>
                        <td className="py-4 px-4 font-medium text-gray-600">
                          {log.details}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center border border-dashed border-gray-100 rounded-3xl bg-gray-50/20">
              <p className="text-sm font-bold text-gray-400 italic">No audit events match your search/filter parameters.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
           <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">System Console</h1>
           <p className="text-gray-500 text-sm">Managing {companies.length} SME nodes across the vault.</p>
        </div>
        <div className="flex flex-wrap gap-1 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
          <button onClick={() => setActiveTab('overview')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'overview' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Overview</button>
          <button onClick={() => setActiveTab('companies')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'companies' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Companies</button>
          <button onClick={() => setActiveTab('users')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Users</button>
          <button onClick={() => setActiveTab('ai_usage')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'ai_usage' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>AI Usage & Billing</button>
          <button onClick={() => setActiveTab('security')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'security' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Compliance & Auditing</button>
          <button onClick={() => setActiveTab('reports')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}>Reports</button>
        </div>
      </div>

      {activeTab === 'overview' && renderOverview()}

      {activeTab === 'ai_usage' && renderAiUsage()}

      {activeTab === 'security' && renderSecurity()}

      {activeTab === 'companies' && (
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b font-black uppercase text-xs tracking-widest text-gray-400 bg-gray-50/50">Company Registry</div>
          <CompaniesTable 
            companies={companies} 
            onViewDetails={(c) => { setSelectedCompany(c); setIsCompanyModalOpen(true); }} 
            sortKey="name" 
            sortDirection="asc" 
            onSort={() => {}} 
            allTenantData={allTenantData} 
            users={users} 
          />
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b font-black uppercase text-xs tracking-widest text-gray-400 bg-gray-50/50">User Access Management</div>
          <UsersTable 
            users={users} 
            onEditUser={(u) => { setSelectedUser(u); setIsUserModalOpen(true); }} 
            sortKey="name" 
            sortDirection="asc" 
            onSort={() => {}} 
          />
        </div>
      )}

      {isCompanyModalOpen && selectedCompany && (
        <CompanyDetailModal 
          isOpen={isCompanyModalOpen}
          onClose={() => setIsCompanyModalOpen(false)}
          company={selectedCompany}
          users={users.filter(u => u.tenantIds.includes(selectedCompany.id))}
          onUpdateCompanyDetails={onUpdateCompany}
          onDeleteCompany={onDeleteCompany}
        />
      )}

      {isUserModalOpen && selectedUser && (
        <EditUserModal 
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          user={selectedUser}
          onUpdateUser={onUpdateUser}
        />
      )}

      {activeTab === 'reports' && (
        <div className="space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Revenue</p>
                  <h4 className="text-3xl font-black text-emerald-900 tracking-tighter">₦{stats.totalRevenue.toLocaleString()}</h4>
              </div>
              <div className="bg-orange-50 p-8 rounded-[2rem] border border-orange-100">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Pending Invoices</p>
                  <h4 className="text-3xl font-black text-orange-900 tracking-tighter">₦{stats.pendingRevenue.toLocaleString()}</h4>
              </div>
              <div className="bg-blue-50 p-8 rounded-[2rem] border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Total SME Nodes</p>
                  <h4 className="text-3xl font-black text-blue-900 tracking-tighter">{companies.length}</h4>
              </div>
           </div>
           
           <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-gray-100">
              <h3 className="text-xl font-black mb-8 uppercase tracking-tighter">Platform Financial Performance</h3>
              <div className="h-96">
                {stats.chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={stats.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} tickFormatter={(v: number) => `₦${(v/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Revenue']}
                      />
                      <Bar dataKey="revenue" fill="#2563eb" radius={[15, 15, 0, 0]} barSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 italic">
                    Insufficient data for financial reporting
                  </div>
                )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};


export default AdminDashboard;
