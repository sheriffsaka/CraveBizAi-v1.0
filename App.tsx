
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import InvoiceList from './components/InvoiceList';
import ClientList from './components/ClientList';
import ServiceList from './components/ServiceList';
import Reports from './components/Reports';
import Settings from './components/Settings';
import CreateInvoice from './components/CreateInvoice';
import EditInvoice from './components/EditInvoice';
import InvoiceDetail from './components/InvoiceDetail';
import AuthPage from './components/AuthPage';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import ResetPasswordModal from './components/ResetPasswordModal';
import UserProfileModal from './components/UserProfileModal';
import PlainInvoiceDetail from './components/PlainInvoiceDetail';
import RecurringInvoiceList from './components/RecurringInvoiceList';
import SentReceiptsList from './components/SentReceiptsList';
import ReceiptDetail from './components/ReceiptDetail';
import AdminDashboard from './components/AdminDashboard';
import DocumentTransformer from './components/DocumentTransformer';
import DocSignify from './components/DocSignify';
import PublicSigningPortal from './components/PublicSigningPortal';
import ProjectManagement from './components/ProjectManagement';
import { api, supabase } from './lib/api';
import { generateRenewalInvoiceSuggestion } from './services/aiGenerationService';
import { getSubscriptionInfo, setSubscriptionInfo, SubscriptionTier, TIER_LIMITS, syncGlobalPlanSettings, syncSubscriptionInfoFromDb, secureRefillCreditsOnDb, safeFlutterwaveCheckout, getFlutterwavePublicKey, saveSubscriptionInfoToDb, fetchAndCacheFlutterwavePublicKey, incrementInvoiceCount, incrementReceiptCount, syncGlobalRefillPacks, REFILL_PACKS } from './services/subscriptionService';
import { Invoice, Client, Service, Company, User, TenantData, InvoiceStatus, AllTenantsData, GeneratedDocument, DbDocumentSignatory, Project, WorkspaceRole, AuditLog } from './types';
import Icon from './components/common/Icon';
import {
  GlobalFilterState,
  loadGlobalFilterFromSession,
  saveGlobalFilterToSession
} from './lib/globalFilter';

export type Page = 'dashboard' | 'invoices' | 'clients' | 'services' | 'reports' | 'settings' | 'create-invoice' | 'edit-invoice' | 'invoice-detail' | 'receipt-detail' | 'plain-invoice-detail' | 'recurring-invoices' | 'email-verification' | 'sent-receipts' | 'admin-dashboard' | 'document-transformer' | 'projects' | 'doc-signify';

const stringifyError = (err: any): string => {
  if (!err) return "An unknown error occurred.";
  if (typeof err === 'string') {
    if (err.toLowerCase().includes('failed to fetch')) return "Vault Connectivity Error: Unable to reach the cloud server. Please check your internet connection.";
    return err;
  }
  let message = (err instanceof Error) ? err.message : (err.message || err.error_description || (err.error ? (typeof err.error === 'string' ? err.error : stringifyError(err.error)) : (err.details || err.hint || (err.code ? `Error Code: ${err.code}` : JSON.stringify(err)))));
  if (typeof message === 'string' && message.toLowerCase().includes('failed to fetch')) return "Vault Connectivity Error: Unable to reach the cloud server. Please check your internet connection.";
  return message === '[object Object]' ? "Registry synchronization error." : String(message);
};

export default function App() {
  const [publicDocId, setPublicDocId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('docId');
  });
  const [publicRecipient, setPublicRecipient] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('recipient');
  });
  const [publicToken, setPublicToken] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('token');
  });

  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataSyncing, setIsDataSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(() => localStorage.getItem('cravebiz_tenant'));
  const [userRole, setUserRole] = useState<WorkspaceRole>('Owner');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [tenantData, setTenantData] = useState<TenantData>({ invoices: [], clients: [], services: [], generatedDocs: [], projects: [] });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [downloadAction, setDownloadAction] = useState<'print' | 'word' | undefined>(undefined);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [draftRenewal, setDraftRenewal] = useState<Partial<Invoice> | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [docTransformerPrefill, setDocTransformerPrefill] = useState<{
    initialTab?: 'generate' | 'sign' | 'manage' | 'verify';
    prefillProject?: Project;
    prefillClient?: Client;
    initialFile?: GeneratedDocument | null;
  } | null>(null);
  const isMounted = useRef(true);
  const currentUserIdRef = useRef<string | null>(null);

  const [selectedProvisionTier, setSelectedProvisionTier] = useState<SubscriptionTier>('Growth');
  const [subTrigger, setSubTrigger] = useState(0);
  const [subErrorMsg, setSubErrorMsg] = useState<string | null>(null);

  // Global Filter State across Dashboard, Invoices and Reports
  const [globalFilter, setGlobalFilterState] = useState<GlobalFilterState>(() => loadGlobalFilterFromSession());

  const handleGlobalFilterChange = (newFilter: GlobalFilterState) => {
    setGlobalFilterState(newFilter);
    saveGlobalFilterToSession(newFilter);
  };

  useEffect(() => {
    const handleSubChange = () => setSubTrigger(prev => prev + 1);
    window.addEventListener('cravebiz_subscription_change', handleSubChange);
    return () => window.removeEventListener('cravebiz_subscription_change', handleSubChange);
  }, []);

  useEffect(() => {
    const handleSubError = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.message) {
        setSubErrorMsg(customEvent.detail.message);
      }
    };
    window.addEventListener('cravebiz_subscription_error', handleSubError);
    return () => window.removeEventListener('cravebiz_subscription_error', handleSubError);
  }, []);

  useEffect(() => {
    if (currentUser) {
      const signupTier = (currentUser.user_metadata?.subscription_tier || localStorage.getItem('cravebiz_signup_tier')) as SubscriptionTier;
      if (signupTier && (signupTier === 'Free' || signupTier === 'Starter' || signupTier === 'Growth' || signupTier === 'Enterprise')) {
        setSelectedProvisionTier(signupTier);
      }
    }
  }, [currentUser]);

  if (publicToken || publicDocId) {
    return (
      <PublicSigningPortal 
        docId={publicDocId || undefined} 
        token={publicToken || undefined}
        prefilledRecipient={publicRecipient || undefined}
        onBackToLogin={() => {
          window.location.href = window.location.origin + window.location.pathname;
        }}
      />
    );
  }

  const pageTitles: { [key in Page]: string } = {
    dashboard: 'Dashboard', invoices: 'Invoices', clients: 'Clients', services: 'Services',
    reports: 'Vault Analytics', settings: 'Workspace Config', 'create-invoice': 'Generate Invoice',
    'edit-invoice': 'Modify Record', 'invoice-detail': 'Document Detail', 'receipt-detail': 'Receipt Detail',
    'plain-invoice-detail': 'Document View', 'recurring-invoices': 'Recurring Invoices',
    'email-verification': 'Email Verification', 'sent-receipts': 'Sent Receipts',
    'admin-dashboard': 'System Console', 'document-transformer': 'SmartDocs',
    projects: 'Project Hub',
    'doc-signify': 'DocSignify',
  };

  const loadAuditLogs = async (tenantId: string) => {
    try {
      const logs = await api.fetchAuditLogs(tenantId);
      if (isMounted.current) {
        setAuditLogs(logs);
      }
    } catch (e) {
      console.warn("Failed to load audit logs:", e);
    }
  };

  const triggerAuditLog = async (action: string, resource: string, details: string) => {
    if (!activeTenantId || !currentUser) return;
    try {
      await api.createAuditLog({
        companyId: activeTenantId,
        userId: currentUser.id,
        userName: currentUser.name || currentUser.email || 'Workspace Member',
        action,
        resource,
        details
      });
      await loadAuditLogs(activeTenantId);
    } catch (e) {
      console.warn("Failed to trigger audit log:", e);
    }
  };

  useEffect(() => {
    const syncRoleAndLogs = async () => {
      try {
        await syncGlobalPlanSettings();
        await syncGlobalRefillPacks();
      } catch (ge) {
        console.warn("Failed to sync global plan limits or refill packs:", ge);
      }

      if (activeTenantId && currentUser) {
        try {
          await syncSubscriptionInfoFromDb(activeTenantId);
          
          const role = await api.getUserRole(activeTenantId, currentUser.id);
          if (isMounted.current) {
            setUserRole(role);
          }
          await loadAuditLogs(activeTenantId);
        } catch (e) {
          console.warn("Failed to sync role/logs/subscription:", e);
        }
      }
    };
    syncRoleAndLogs();
  }, [activeTenantId, currentUser]);

  const forceSyncData = async (tenantId: string) => {
    if (!tenantId || !isMounted.current) return;
    setIsDataSyncing(true);
    try {
      const [inv, cli, srv, docs, projs] = await Promise.all([
        api.fetchInvoices(tenantId), api.fetchClients(tenantId),
        api.fetchServices(tenantId), api.fetchGeneratedDocs(tenantId),
        api.fetchProjects(tenantId)
      ]);
      if (isMounted.current) {
          setTenantData({ invoices: inv, clients: cli, services: srv, generatedDocs: docs, projects: projs });
          setSyncError(null);
          await syncSubscriptionInfoFromDb(tenantId);
          await loadAuditLogs(tenantId);
      }
    } catch (e) { 
        setSyncError(stringifyError(e)); 
    } finally { 
        if (isMounted.current) setIsDataSyncing(false); 
    }
  };

  const handleAuthSync = async (user: any) => {
    if (!isMounted.current || !user) return;
    
    // Guard: Prevent redundant syncs/resets on background token refresh
    if (currentUserIdRef.current === user.id) {
        return;
    }
    currentUserIdRef.current = user.id;
    
    // Only show full loading screen on initial load or if user changes
    const isInitialLoad = !currentUser;
    if (isInitialLoad) setIsLoading(true);
    
    try {
        const syncResult = await api.ensureProfile(user.id, user.user_metadata?.full_name, user.email);
        if (!syncResult.success) {
            console.error("[Auth Sync] Profile creation/update failed for userId:", user.id, syncResult.error);
            const dbErrorMsg = syncResult.error?.message || syncResult.error?.details || JSON.stringify(syncResult.error);
            throw new Error(`We authenticated you successfully, but we could not synchronize your profile record. Database Error: ${dbErrorMsg}`);
        }

        let profile = await api.getProfile(user.id);
        if (!profile && (user.email?.toLowerCase() === 'cravebiz@cloudcraves.com' || user.email?.toLowerCase() === 'contact@cloudcraves.com')) {
            profile = { id: user.id, name: 'Super Admin', email: user.email, tenantIds: [], isAdmin: true, status: 'Active' };
        }

        if (!profile) {
            console.warn("[Auth Sync] Profile fetch returned null after ensureProfile, using self-healing local profile fallback.");
            profile = {
                id: user.id,
                name: user.user_metadata?.full_name || 'CraveBiZ Member',
                email: user.email || '',
                tenantIds: [],
                isAdmin: user.email?.toLowerCase() === 'cravebiz@cloudcraves.com' || user.email?.toLowerCase() === 'contact@cloudcraves.com' || user.email?.toLowerCase() === 'super@admin.com',
                status: 'Active'
            };
        }

        if (profile && isMounted.current) {
            profile.email = user.email || '';
            profile.user_metadata = user.user_metadata || {};
            if (profile.email.toLowerCase() === 'cravebiz@cloudcraves.com' || profile.email.toLowerCase() === 'contact@cloudcraves.com') {
                profile.name = 'Super Admin';
                profile.isAdmin = true;
                // Proactively ensure they are marked as super admin in DB
                api.updateProfile(user.id, { isAdmin: true, email: profile.email, name: 'Super Admin' }).catch(console.error);
            }
            setCurrentUser(profile);
            localStorage.setItem('cravebiz_user_id', user.id);
            
            if (profile.isAdmin || profile.email?.toLowerCase() === 'cravebiz@cloudcraves.com' || profile.email?.toLowerCase() === 'contact@cloudcraves.com' || profile.email?.toLowerCase() === 'super@admin.com') {
                localStorage.setItem('cravebiz_is_super_admin', 'true');
            } else {
                localStorage.removeItem('cravebiz_is_super_admin');
            }
            
            if (profile.isAdmin) {
                const [allComps, allUsrs, allInvs] = await Promise.all([
                    api.getAllCompanies(),
                    api.getAllProfiles(),
                    api.getAllInvoices()
                ]);
                setCompanies(allComps);
                setAllUsers(allUsrs);
                setAllInvoices(allInvs);
                
                if (allComps.length > 0) {
                    const tid = (activeTenantId && allComps.some(c => c.id === activeTenantId)) ? activeTenantId : allComps[0].id;
                    setActiveTenantId(tid);
                    localStorage.setItem('cravebiz_tenant', tid);
                    forceSyncData(tid);
                }
            } else {
                const discovered = await api.getMyCompanies();
                setCompanies(discovered);
                if (discovered.length > 0) {
                    const tid = (activeTenantId && discovered.some(c => c.id === activeTenantId)) ? activeTenantId : discovered[0].id;
                    setActiveTenantId(tid);
                    localStorage.setItem('cravebiz_tenant', tid);
                    forceSyncData(tid);
                }
            }
        }
    } catch (e) { 
        console.error("Authentication Synchronization Exception:", e);
        setSyncError(stringifyError(e)); 
    } 
    finally { if (isMounted.current && isInitialLoad) setIsLoading(false); }
  };

  useEffect(() => {
    isMounted.current = true;
    const initAuth = async () => {
        try {
            // Fetch and cache the live Flutterwave Public Key dynamically from backend
            fetchAndCacheFlutterwavePublicKey().catch(e => console.warn(e));

            const hash = window.location.hash;
            if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
                setIsResetPasswordOpen(true);
            }
            const session = await api.safeGetSession();
            if (session?.user) {
                await handleAuthSync(session.user);
                if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
                    if (session.user.email) {
                        setResetEmail(session.user.email);
                    }
                }
            }
            else if (isMounted.current) setIsLoading(false);
        } catch (e) { 
            console.warn("[Auth Init] Handled exception:", e);
            if (isMounted.current) { 
                setIsLoading(false); 
                if (!stringifyError(e).includes('Refresh Token')) {
                    setSyncError(stringifyError(e)); 
                }
            } 
        }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            if (isMounted.current) { 
                currentUserIdRef.current = null;
                setCurrentUser(null); setIsLoading(false); setCompanies([]); setActiveTenantId(null); 
                setTenantData({ invoices: [], clients: [], services: [], generatedDocs: [], projects: [] }); 
                localStorage.removeItem('cravebiz_tenant'); 
                localStorage.removeItem('cravebiz_is_super_admin');
            }
            return;
        }
        if (session?.user) {
            handleAuthSync(session.user);
            if (event === 'PASSWORD_RECOVERY') {
                setIsResetPasswordOpen(true);
                if (session.user.email) setResetEmail(session.user.email);
            }
        }
    });
    return () => { isMounted.current = false; subscription.unsubscribe(); };
  }, []);

  const handleRecordPayment = async (
    invoiceId: string, 
    cumulativeAmount: number, 
    details?: { paymentDate?: string; amount?: number; paymentMethod?: string; reference?: string; autoGenerateReceipt?: boolean }
  ) => {
    const inv = tenantData.invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    
    // 1. OPTIMISTIC UPDATE: Change local state immediately
    const isFullyPaid = cumulativeAmount >= (inv.total - 0.001);
    const isPartiallyPaid = cumulativeAmount > 0 && !isFullyPaid;
    const nextStatus = isFullyPaid 
      ? InvoiceStatus.Paid 
      : (isPartiallyPaid ? InvoiceStatus.PartiallyPaid : inv.status);

    const updatedInvoice: Invoice = { ...inv, amountPaid: cumulativeAmount, status: nextStatus };
    
    setTenantData(prev => ({
        ...prev,
        invoices: prev.invoices.map(i => i.id === invoiceId ? updatedInvoice : i)
    }));

    // Record audit log
    const paidDelta = details?.amount || (cumulativeAmount - (inv.amountPaid || 0));
    await triggerAuditLog(
      'RECORD_PAYMENT', 
      invoiceId, 
      `Recorded payment of ₦${paidDelta.toLocaleString()} via ${details?.paymentMethod || 'Manual Registry'} for invoice ${inv.invoiceNumber}`
    );

    // 2. PERSISTENCE: Send to server
    setIsDataSyncing(true);
    try {
        await api.updateInvoice(updatedInvoice);
        setSyncError(null);

        // Record payment transaction in API store if available
        if (details?.paymentMethod) {
          try {
            await api.recordTransaction(inv.companyId || activeTenantId || "default", {
              transactionId: `manual-${Date.now()}`,
              type: 'invoice-payment',
              invoiceId: inv.id,
              amount: paidDelta,
              status: 'successful',
              paymentMethod: details.paymentMethod,
              reference: details.reference,
              paymentDate: details.paymentDate
            });
          } catch (txErr) {
            console.warn("Failed to log transaction record:", txErr);
          }
        }

        // Auto-generate receipt if requested
        if (details?.autoGenerateReceipt) {
          handleSendReceipt(invoiceId);
        }
    } catch (e) {
        console.error("Payment sync failed:", e);
        if (activeTenantId) await forceSyncData(activeTenantId);
        alert("Failed to sync payment to cloud vault. Re-synchronizing...");
    } finally {
        if (isMounted.current) setIsDataSyncing(false);
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, status: InvoiceStatus) => {
    setIsDataSyncing(true);
    try {
        await api.updateInvoiceStatus(invoiceId, status);
        await triggerAuditLog('UPDATE_INVOICE_STATUS', invoiceId, `Updated invoice status to ${status}`);
        await forceSyncData(activeTenantId!);
    } catch (e) { alert(`Status Error: ${stringifyError(e)}`); } 
    finally { if (isMounted.current) setIsDataSyncing(false); }
  }

  const handleSendReceipt = async (invoiceId: string) => {
    const inv = tenantData.invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    // Check receipt limits if the receipt hasn't been sent yet
    if (!inv.isReceiptSent) {
        const sub = getSubscriptionInfo(activeTenantId || '');
        try {
            const usage = await api.getReceiptUsage(activeTenantId, sub.tier);
            if (usage && usage.remainingCount <= 0) {
                const msg = `You have reached the monthly receipt limit of your ${sub.tier} Plan (${usage.createdCount}/${usage.totalQuota} receipts issued). Please upgrade your subscription tier in Workspace Settings.`;
                window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
                alert(msg);
                return;
            }
        } catch (err) {
            console.warn("Error checking receipt usage before send:", err);
        }
    }

    const updatedInvoice: Invoice = { ...inv, isReceiptSent: true };

    setTenantData(prev => ({
        ...prev,
        invoices: prev.invoices.map(i => i.id === invoiceId ? updatedInvoice : i)
    }));

    setIsDataSyncing(true);
    try {
        await api.updateInvoice(updatedInvoice);
        if (!inv.isReceiptSent) {
            await incrementReceiptCount(activeTenantId!);
        }
        await triggerAuditLog('ISSUE_RECEIPT', invoiceId, `Issued receipt for invoice ${inv.invoiceNumber}`);
        setSyncError(null);
    } catch (e) {
        console.error("Receipt sync failed:", e);
        if (activeTenantId) await forceSyncData(activeTenantId);
        alert("Failed to sync receipt to cloud vault. Re-synchronizing...");
    } finally {
        if (isMounted.current) setIsDataSyncing(false);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    setIsDataSyncing(true);
    try {
        await api.deleteInvoice(id);
        await triggerAuditLog('DELETE_INVOICE', id, `Deleted invoice record`);
        if (activeTenantId) await forceSyncData(activeTenantId);
        if (currentUser?.isAdmin) {
            const allInvs = await api.getAllInvoices();
            setAllInvoices(allInvs);
        }
    } catch (e) { alert(`Delete Error: ${stringifyError(e)}`); } 
    finally { if (isMounted.current) setIsDataSyncing(false); }
  };

  const handleGenerateRenewal = async (clientId: string, item: any) => {
    try {
        const suggestion = await generateRenewalInvoiceSuggestion(clientId, [item]);
        if (suggestion) {
            setDraftRenewal(suggestion);
            navigateTo('create-invoice');
        } else {
            alert("AI could not generate a suggestion at this time.");
        }
    } catch (e) {
        setSyncError(stringifyError(e));
    }
  };

  const navigateTo = (page: Page) => { if (isMounted.current) { setActivePage(page); setIsMobileMenuOpen(false); } };
  const handleEditInvoiceAction = (id: string) => { setSelectedInvoiceId(id); navigateTo('edit-invoice'); };
  const displayCompanies = useMemo(() => {
    return companies.map(c => {
      if (currentUser?.email?.toLowerCase() === 'cravebiz@cloudcraves.com' && (c.name?.toLowerCase().includes('musa') || c.name?.toLowerCase().includes('iliasu') || c.name?.toLowerCase().includes('college'))) {
        return { ...c, name: 'Super Admin' };
      }
      return c;
    });
  }, [companies, currentUser]);

  const activeCompany = useMemo(() => activeTenantId ? displayCompanies.find(c => c.id === activeTenantId) || null : null, [activeTenantId, displayCompanies]);

  const handleAddProject = async (proj: Omit<Project, 'id' | 'createdAt'>) => {
    try {
      const newProj = await api.createProject(proj);
      await triggerAuditLog('CREATE_PROJECT', newProj.id, `Created project: ${proj.name}`);
      setTenantData(prev => ({
        ...prev,
        projects: [newProj, ...prev.projects]
      }));
    } catch (e) {
      alert("Error adding project: " + stringifyError(e));
    }
  };

  const handleUpdateProject = async (proj: Project) => {
    try {
      await api.updateProject(proj);
      await triggerAuditLog('UPDATE_PROJECT', proj.id, `Updated project details: ${proj.name}`);
      setTenantData(prev => ({
        ...prev,
        projects: prev.projects.map(p => p.id === proj.id ? proj : p)
      }));
    } catch (e) {
      alert("Error updating project: " + stringifyError(e));
    }
  };

  const handleDeleteProject = async (companyId: string, projectId: string) => {
    try {
      await api.deleteProject(companyId, projectId);
      await triggerAuditLog('DELETE_PROJECT', projectId, `Deleted project record`);
      setTenantData(prev => ({
        ...prev,
        projects: prev.projects.filter(p => p.id !== projectId)
      }));
    } catch (e) {
      alert("Error deleting project: " + stringifyError(e));
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (userRole !== 'Owner') {
      alert("Only Workspace Owners can delete services.");
      return;
    }
    try {
      setIsDataSyncing(true);
      await api.deleteService(serviceId);
      await triggerAuditLog('DELETE_SERVICE', serviceId, `Deleted service record ${serviceId}`);
      setTenantData(prev => ({
        ...prev,
        services: prev.services.filter(s => s.id !== serviceId)
      }));
      if (activeTenantId) await forceSyncData(activeTenantId);
    } catch (e) {
      alert("Error deleting service: " + stringifyError(e));
    } finally {
      if (isMounted.current) setIsDataSyncing(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (userRole !== 'Owner') {
      alert("Only Workspace Owners can delete clients.");
      return;
    }
    try {
      setIsDataSyncing(true);
      await api.deleteClient(clientId);
      await triggerAuditLog('DELETE_CLIENT', clientId, `Deleted client record ${clientId}`);
      setTenantData(prev => ({
        ...prev,
        clients: prev.clients.filter(c => c.id !== clientId)
      }));
      if (activeTenantId) await forceSyncData(activeTenantId);
    } catch (e) {
      alert("Error deleting client: " + stringifyError(e));
    } finally {
      if (isMounted.current) setIsDataSyncing(false);
    }
  };

  const handleDeleteReceipt = async (invoiceId: string) => {
    if (userRole !== 'Owner') {
      alert("Only Workspace Owners can delete receipts.");
      return;
    }
    try {
      setIsDataSyncing(true);
      await api.deleteReceipt(invoiceId);
      await triggerAuditLog('DELETE_RECEIPT', invoiceId, `Deleted / Revoked receipt for invoice ${invoiceId}`);
      setTenantData(prev => ({
        ...prev,
        invoices: prev.invoices.map(inv => inv.id === invoiceId ? { ...inv, isReceiptSent: false } : inv)
      }));
      if (activeTenantId) await forceSyncData(activeTenantId);
    } catch (e) {
      alert("Error deleting receipt: " + stringifyError(e));
    } finally {
      if (isMounted.current) setIsDataSyncing(false);
    }
  };

  if (!isLoading && !currentUser) {
    return (
      <>
        {syncError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-full px-4 animate-in slide-in-from-top-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl shadow-xl flex items-start text-sm">
              <Icon name="reports" className="w-5 h-5 mr-3 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Database Sync Error</p>
                <p className="mt-0.5 text-xs text-red-600">{syncError}</p>
              </div>
              <button onClick={() => setSyncError(null)} className="ml-3 font-bold text-red-500 hover:text-red-700">✕</button>
            </div>
          </div>
        )}
        <AuthPage 
          onLogin={async (e, p) => {
              const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: p });
              if (error) {
                  console.error("Supabase sign-in failed:", error);
                  return stringifyError(error);
              }
              if (data?.user) {
                  try {
                      console.log("Validating and pre-ensuring profile for user:", data.user.id);
                      const syncResult = await api.ensureProfile(data.user.id, data.user.user_metadata?.full_name, data.user.email);
                      if (!syncResult.success) {
                          const dbErrorMsg = syncResult.error?.message || syncResult.error?.details || JSON.stringify(syncResult.error);
                          return `Profile Initialization Failed: We authenticated you, but could not initialize your profile. Database Error: ${dbErrorMsg}`;
                      }
                      const profile = await api.getProfile(data.user.id);
                      if (!profile) {
                          console.warn("[onLogin] Profile fetch returned null after ensureProfile; proceeding anyway as handleAuthSync will self-heal it.");
                      }
                  } catch (pErr: any) {
                      console.error("Profile creation/lookup error on login:", pErr);
                      return `Profile Integration Error: ${pErr.message || pErr}`;
                  }
              }
              return true;
          }}
          onSignup={async (name, email, pass, companyName, phone, subscriptionTier) => {
              localStorage.setItem('cravebiz_signup_name', name);
              localStorage.setItem('cravebiz_signup_company_name', companyName);
              if (phone) localStorage.setItem('cravebiz_signup_phone', phone);
              if (subscriptionTier) {
                  localStorage.setItem('cravebiz_signup_tier', subscriptionTier);
              }
              const { data, error } = await supabase.auth.signUp({ 
                  email, password: pass, options: { data: { full_name: name, company_name: companyName, phone, subscription_tier: subscriptionTier } }
              });
              if (error) {
                  console.error("Supabase sign-up failed:", error);
                  return stringifyError(error);
              }
              
              if (data?.user) {
                  try {
                      console.log("Pre-creating profile table record during registration for:", data.user.id);
                      const syncResult = await api.ensureProfile(data.user.id, name, email);
                      if (!syncResult.success) {
                          console.warn("Direct profile creation during registration failed (expected if email verification restricts database access):", syncResult.error);
                      }
                  } catch (pErr) {
                      console.error("Error creating profile record during registration:", pErr);
                  }
              }
              return true;
          }}
          onOpenForgotPassword={() => setIsForgotPasswordOpen(true)} 
          users={[]} 
          onOpenEmailVerification={() => true} 
          pendingVerificationEmail={null}
        />
        {isForgotPasswordOpen && (
          <ForgotPasswordModal 
            isOpen={isForgotPasswordOpen} 
            onClose={() => setIsForgotPasswordOpen(false)} 
            users={[]} 
            onStartPasswordReset={async (email) => {
              setResetEmail(email);
              try {
                await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: window.location.origin
                });
              } catch (e) {
                console.error("Supabase reset password request skipped/failed", e);
              }
              setIsResetPasswordOpen(true);
            }} 
          />
        )}
        {isResetPasswordOpen && (
          <ResetPasswordModal 
            isOpen={isResetPasswordOpen} 
            onClose={() => {
              setIsResetPasswordOpen(false);
              window.location.hash = '';
            }} 
            email={resetEmail} 
            token={resetToken} 
            onResetPassword={async (email, newPassword) => {
              try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) {
                  alert(stringifyError(error));
                  return false;
                }
                alert("Your password has been reset successfully! You can now sign in with your new password.");
                setIsResetPasswordOpen(false);
                window.location.hash = '';
                return true;
              } catch (err: any) {
                alert("Password update failed: " + stringifyError(err));
                return false;
              }
            }} 
          />
        )}
      </>
    );
  }

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <h1 className="text-3xl font-bold text-primary-700 mb-4 tracking-tighter">CraveBiZ AI</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-600 mb-4"></div>
        <p className="text-gray-400 font-bold uppercase tracking-[0.3em] text-[10px]">Initializing Cloud Vault...</p>
    </div>
  );

  const renderContent = () => {
    if (companies.length === 0 && !isDataSyncing && !syncError) {
        const isPaidPlan = selectedProvisionTier !== 'Free';
        const planPrice = TIER_LIMITS[selectedProvisionTier]?.price || "₦0.00";
        const monthlyVal = TIER_LIMITS[selectedProvisionTier]?.monthlyPriceVal || 0;

        const regCompanyName = currentUser?.user_metadata?.company_name || localStorage.getItem('cravebiz_signup_company_name') || `${currentUser?.name || 'My'}'s Workspace`;
        const regName = currentUser?.user_metadata?.full_name || localStorage.getItem('cravebiz_signup_name') || currentUser?.name || 'User';
        const regPhone = currentUser?.user_metadata?.phone || localStorage.getItem('cravebiz_signup_phone') || '';

        const handleProvisionCheckout = () => {
            const flutterwaveKey = getFlutterwavePublicKey();
            
            safeFlutterwaveCheckout({
                public_key: flutterwaveKey,
                tx_ref: `cravebiz-provision-${Date.now()}-${currentUser?.id}`,
                amount: monthlyVal,
                currency: "NGN",
                payment_options: "card, banktransfer, ussd",
                customer: {
                    email: currentUser?.email || "customer@cravebiz.ai",
                    name: regName,
                    phone_number: regPhone
                },
                customizations: {
                    title: `Activate CraveBiZ ${selectedProvisionTier}`,
                    description: `Payment for CraveBiZ ${selectedProvisionTier} Plan Subscription - ₦${monthlyVal.toLocaleString()}`,
                    logo: "https://checkout.flutterwave.com/assets/img/flutterwave-logo.svg",
                },
                callback: async function (data: any) {
                    console.log("Provision checkout response:", data);
                    if (data.status === "successful" || data.status === "completed") {
                        try {
                            setIsDataSyncing(true);
                            const nc = await api.createCompany({ name: regCompanyName, phone: regPhone });
                            setSubscriptionInfo(nc.id, selectedProvisionTier);
                            await saveSubscriptionInfoToDb(nc.id);
                            setCompanies([nc]);
                            setActiveTenantId(nc.id);
                            localStorage.setItem('cravebiz_tenant', nc.id);
                            await forceSyncData(nc.id);
                            alert(`Congratulations! Your workspace has been successfully activated on the ${selectedProvisionTier} plan.`);
                        } catch(e) {
                            setSyncError(stringifyError(e));
                        } finally {
                            if (isMounted.current) setIsDataSyncing(false);
                        }
                    } else {
                        alert(`Payment was not successful (Status: ${data.status}). Please try again to activate your plan.`);
                    }
                },
                onclose: function () {
                    console.log("Checkout closed by user.");
                }
            });
        };

        const handleProvisionFree = async () => {
            try {
                setIsDataSyncing(true);
                const nc = await api.createCompany({ name: regCompanyName, phone: regPhone });
                setSubscriptionInfo(nc.id, 'Free');
                await saveSubscriptionInfoToDb(nc.id);
                setCompanies([nc]);
                setActiveTenantId(nc.id);
                localStorage.setItem('cravebiz_tenant', nc.id);
                await forceSyncData(nc.id);
                alert("Your free workspace is ready! Enjoy 5 free AI credits every month.");
            } catch(e) {
                setSyncError(stringifyError(e));
            } finally {
                if (isMounted.current) setIsDataSyncing(false);
            }
        };

        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-4 bg-gray-50/50">
                <div className="bg-white p-8 lg:p-10 rounded-[2.5rem] shadow-2xl border border-gray-100 max-w-xl w-full animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-primary-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary-100">
                        <Icon name="dashboard" className="w-10 h-10 text-primary-600" />
                    </div>
                    
                    <h2 className="text-3xl font-black text-gray-800 tracking-tighter mb-2 text-center">Dashboard Activation</h2>
                    <p className="text-gray-500 mb-8 text-sm leading-relaxed text-center">
                        Your registration information has been successfully retrieved. Confirm your workspace details below to activate your account. No password re-entry or plan selection is required.
                    </p>
                    
                    {/* Workspace Summary Card */}
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 text-left mb-8 space-y-4">
                        <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Workspace Configuration Details</span>
                        
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400">Workspace Name</p>
                                <p className="text-sm font-bold text-gray-900 mt-0.5">{regCompanyName}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400">Workspace Owner</p>
                                <p className="text-sm font-medium text-gray-900 mt-0.5">{regName}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400">Selected Plan</p>
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                    <span className="text-sm font-bold text-primary-700">{selectedProvisionTier}</span>
                                    <span className="text-[9px] font-bold bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded">
                                        {TIER_LIMITS[selectedProvisionTier]?.maxInvoices === -1 ? 'Unlimited' : `${TIER_LIMITS[selectedProvisionTier]?.maxInvoices} Invoices`}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400">Billing Price</p>
                                <p className="text-sm font-bold text-gray-900 mt-0.5">{planPrice}</p>
                            </div>
                        </div>
                    </div>

                    {/* Verification & Checkout description */}
                    <div className="bg-primary-50/50 p-5 rounded-2xl border border-primary-100/50 text-left mb-8">
                        <div className="flex items-start space-x-3">
                            <div className="bg-primary-100 p-2 rounded-xl mt-0.5">
                                <Icon name="reports" className="w-5 h-5 text-primary-700" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-800">
                                    {isPaidPlan ? `${selectedProvisionTier} Plan Subscription` : 'Free Plan Subscription'}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1">
                                    {isPaidPlan 
                                        ? `Your workspace requires secure activation. Clicking below will open the Flutterwave gateway to complete your subscription payment of ${planPrice}.`
                                        : "Your Free tier is ready for immediate setup. No payment details or card inputs are required."}
                                </p>
                            </div>
                        </div>
                    </div>

                    {isPaidPlan ? (
                        <button 
                            onClick={handleProvisionCheckout} 
                            className="w-full py-5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary-100 hover:bg-primary-700 transition-all flex items-center justify-center space-x-2 group active:scale-95"
                        >
                            <span>Pay {planPrice} & Activate</span>
                            <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        </button>
                    ) : (
                        <button 
                            onClick={handleProvisionFree} 
                            className="w-full py-5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary-100 hover:bg-primary-700 transition-all flex items-center justify-center space-x-2 active:scale-95"
                        >
                            <span>Activate Free Workspace</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const { invoices = [], clients = [], services = [], generatedDocs = [], projects = [] } = tenantData;

    switch (activePage) {
      case 'dashboard': return <Dashboard invoices={invoices} clients={clients} activeTenantId={activeTenantId} setActivePage={navigateTo} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onGenerateRenewal={handleGenerateRenewal} />;
      case 'doc-signify': return <DocSignify 
          company={activeCompany} 
          user={currentUser} 
          prefillProject={docTransformerPrefill?.prefillProject}
          prefillClient={docTransformerPrefill?.prefillClient}
          initialFile={docTransformerPrefill?.initialFile}
          onBackToDashboard={() => navigateTo('dashboard')}
      />;
      case 'document-transformer': return <DocumentTransformer 
          company={activeCompany} 
          user={currentUser} 
          userRole={userRole}
          generatedDocs={generatedDocs} 
          initialTab={docTransformerPrefill?.initialTab}
          prefillProject={docTransformerPrefill?.prefillProject}
          prefillClient={docTransformerPrefill?.prefillClient}
          onSaveDoc={async (doc, id) => { 
              try {
                  let saved;
                  const docWithOwner = { ...doc, ownerId: doc.ownerId || currentUser?.id };
                  if (id) {
                      saved = await api.updateGeneratedDoc(activeTenantId!, id, docWithOwner);
                  } else {
                      saved = await api.saveGeneratedDoc(activeTenantId!, docWithOwner); 
                  }
                  const savedId = saved?.id;
                  if (savedId && (doc.originalFileBase64 || doc.originalFileUrl)) {
                      // Synchronize with modern DocSignify database tables
                  const signatoriesMapped = (doc.signatures || []).map((s: any, idx: number) => ({
                      id: s.id || `sig-${idx}`,
                      name: s.name || 'Signatory',
                      email: s.email || '',
                      role: (s.signatoryType === 'Main' ? 'main_signatory' : s.signatoryType === 'Witness' ? 'witness' : 'additional_signatory') as DbDocumentSignatory['role']
                  }));
                  const contentJson = {
                      fields: (doc.signatures || []).map((s: any, idx: number) => ({
                          id: `field_${s.id || 'sig-' + idx}`,
                          type: 'signature',
                          page_number: s.page_number || 1,
                          x_position: s.x_position !== undefined ? s.x_position : 50,
                          y_position: s.y_position !== undefined ? s.y_position : (80 + idx * 5),
                          width: s.width || 140,
                          height: s.height || 55,
                          assigned_signer_id: s.id || `sig-${idx}`,
                          required: true
                      }))
                  };
                  await api.createDocSignifyDocument(
                      savedId,
                      doc.documentType || 'Uploaded Agreement',
                      doc.originalFileUrl || doc.originalFileBase64 || '',
                      currentUser?.id || 'owner',
                      doc.originalFileType || 'pdf',
                      doc.originalFileName || 'document.pdf',
                      signatoriesMapped,
                      contentJson
                  ).catch(err => {
                      console.warn("DocSignify tables sync warning:", err);
                  });
              }
              await forceSyncData(activeTenantId!); 
              return savedId;
          } catch (e) {
              setSyncError(stringifyError(e));
              return undefined;
          }
      }} 
      onNavigateToSignify={(doc) => {
          setDocTransformerPrefill({
              initialFile: doc,
              initialTab: 'sign'
          });
          navigateTo('doc-signify');
      }}
      onDeleteDoc={async (id) => {
          try {
              await api.deleteGeneratedDoc(activeTenantId!, id);
              await forceSyncData(activeTenantId!);
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} />;
      case 'invoices': return <InvoiceList invoices={invoices} clients={clients} services={services} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onDeleteInvoice={handleDeleteInvoice} globalFilter={globalFilter} onFilterChange={handleGlobalFilterChange} />;
      case 'recurring-invoices': return <RecurringInvoiceList invoices={invoices.filter(i => i.isRecurringTemplate)} clients={clients} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onDeleteInvoice={handleDeleteInvoice} />;
      case 'sent-receipts': return <SentReceiptsList invoices={invoices.filter(i => i.isReceiptSent)} clients={clients} userRole={userRole} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('receipt-detail'); }} onEditInvoice={handleEditInvoiceAction} onDeleteReceipt={handleDeleteReceipt} />;
      case 'receipt-detail': {
        const inv = invoices.find(i => i.id === selectedInvoiceId);
        if (!inv) return <div className="text-center py-20 italic text-gray-400">Document synchronized or unavailable.</div>;
        const cli = clients.find(c => c.id === inv.clientId) || { id: '', companyId: '', name: 'Guest', email: '', companyName: 'Guest' };
        return <ReceiptDetail 
            invoice={inv} client={cli} services={services} company={activeCompany!} 
            userRole={userRole}
            onBack={() => navigateTo('sent-receipts')}
            onSendReceipt={handleSendReceipt}
            onDeleteReceipt={handleDeleteReceipt}
        />;
      }
      case 'create-invoice': {
          if (!activeCompany) return <div className="text-center py-20 italic">Awaiting synchronization...</div>;
          
          const sub = getSubscriptionInfo(activeTenantId || '');
          const currentCount = invoices.length;
          const maxAllowed = sub.maxInvoices;
          if (currentCount >= maxAllowed) {
              const msg = `You have reached the monthly invoice limit of your ${sub.tier} Plan (${currentCount}/${maxAllowed} invoices generated). Please upgrade your subscription tier in Workspace Settings.`;
              window.dispatchEvent(new CustomEvent('cravebiz_subscription_error', { detail: { message: msg } }));
              return (
                  <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl max-w-lg mx-auto my-12 animate-in fade-in">
                      <div className="bg-red-50 w-16 h-16 rounded-3xl flex items-center justify-center mb-4 text-red-600 border border-red-100">
                          <Icon name="reports" className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-2">Invoice Limit Reached</h3>
                      <p className="text-sm text-gray-500 mb-6 leading-relaxed">{msg}</p>
                      <button onClick={() => navigateTo('settings')} className="px-6 py-3 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary-200 hover:bg-primary-700 transition">Upgrade Subscription</button>
                  </div>
              );
          }

          return <CreateInvoice clients={clients} services={services} company={activeCompany} initialDraft={draftRenewal} onAddInvoice={async (i) => { 
              try { 
                  setIsDataSyncing(true); 
                  // First check backend quota
                  const check = await api.getInvoiceUsage(activeTenantId, sub.tier);
                  if (check && check.remainingCount <= 0) {
                      throw new Error(`Invoice creation quota exhausted (${check.createdCount}/${check.totalQuota} generated). Please upgrade your plan.`);
                  }
                  const newInvoice = await api.createInvoice(activeTenantId!, i); 
                  setTenantData(prev => ({ ...prev, invoices: [newInvoice, ...prev.invoices] }));
                  await incrementInvoiceCount(activeTenantId!);
                  setDraftRenewal(null);
                  navigateTo('invoices');
                  await forceSyncData(activeTenantId!); 
              } catch (err: any) { alert(stringifyError(err)); } 
              finally { if (isMounted.current) setIsDataSyncing(false); } 
          }} onCancel={() => { setDraftRenewal(null); navigateTo('invoices'); }} />;
      }
      case 'edit-invoice': {
        const inv = invoices.find(i => i.id === selectedInvoiceId);
        if (!inv || !activeCompany) return <div className="text-center py-20 italic text-gray-400">Loading record metadata...</div>;
        return <EditInvoice 
            invoice={inv} clients={clients} services={services} company={activeCompany} 
            onUpdateInvoice={async (updatedInv, status) => {
                try {
                    setIsDataSyncing(true);
                    await api.updateInvoice({ ...updatedInv, status });
                    await forceSyncData(activeTenantId!);
                    navigateTo('invoice-detail');
                } catch(e) { alert(stringifyError(e)); } 
                finally { if (isMounted.current) setIsDataSyncing(false); }
            }}
            onCancel={() => navigateTo('invoice-detail')}
        />;
      }
      case 'invoice-detail': {
        const inv = invoices.find(i => i.id === selectedInvoiceId);
        if (!inv) return <div className="text-center py-20 italic text-gray-400">Document synchronized or unavailable.</div>;
        const cli = clients.find(c => c.id === inv.clientId) || { id: '', companyId: '', name: 'Guest', email: '', companyName: 'Guest' };
        return <InvoiceDetail 
            invoice={inv} client={cli} services={services} company={activeCompany} 
            onUpdateStatus={handleUpdateInvoiceStatus} onRecordPayment={handleRecordPayment}
            onGenerateReceipt={async (id) => {
                await handleSendReceipt(id);
                navigateTo('receipt-detail');
            }} allTenantInvoices={invoices} onEditInvoice={handleEditInvoiceAction} 
            onViewPlainInvoice={(id, act) => { setSelectedInvoiceId(id); setDownloadAction(act); navigateTo('plain-invoice-detail'); }} 
            onViewTemplate={()=>{}} onSendInvoice={async (id) => { 
                try {
                    await api.updateInvoiceStatus(id, InvoiceStatus.Sent); 
                    await forceSyncData(activeTenantId!); 
                } catch (e) {
                    setSyncError(stringifyError(e));
                }
            }} onSendReceipt={handleSendReceipt} 
        />;
      }
      case 'plain-invoice-detail': {
        const inv = invoices.find(i => i.id === selectedInvoiceId);
        if (!inv) return null;
        const cli = clients.find(c => c.id === inv.clientId) || { id: '', companyId: '', name: 'Guest', email: '', companyName: 'Guest' };
        return <PlainInvoiceDetail 
            invoice={inv} client={cli} services={services} company={activeCompany} 
            onBackToInvoiceDetail={() => { setDownloadAction(undefined); navigateTo('invoice-detail'); }} 
            action={downloadAction} onActionComplete={() => setDownloadAction(undefined)}
        />;
      }
      case 'settings': return <Settings 
          company={activeCompany} 
          onSaveChanges={async (id, det) => { 
              try {
                  await api.updateCompany(id, det); 
                  await forceSyncData(id); 
              } catch (e) {
                  setSyncError(stringifyError(e));
              }
          }} 
          onInviteUser={() => {}} 
          users={[]} 
          activeTenantId={activeTenantId!} 
          onUpdateUserStatus={() => {}} 
          onResendInvite={() => {}} 
          userRole={userRole}
          auditLogs={auditLogs}
          onTriggerAuditLog={triggerAuditLog}
          invoices={invoices}
      />;
      case 'clients': return <ClientList companyId={activeTenantId!} clients={clients} invoices={invoices} userRole={userRole} onDeleteClient={handleDeleteClient} onAddClient={async (c) => { 
          try {
              await api.createClient(c); 
              await forceSyncData(activeTenantId!); 
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} onUpdateClient={async (c) => { 
          try {
              await api.updateClient(c); 
              await forceSyncData(activeTenantId!); 
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} />;
      case 'services': return <ServiceList companyId={activeTenantId!} services={services} invoices={invoices} userRole={userRole} onDeleteService={handleDeleteService} onAddService={async (s) => { 
          try {
              await api.createService(s); 
              await forceSyncData(activeTenantId!); 
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} onUpdateService={async (s) => { 
          try {
              await api.updateService(s); 
              await forceSyncData(activeTenantId!); 
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} />;
      case 'reports': return <Reports invoices={invoices} clients={clients} services={services} activeTenantId={activeTenantId || ''} />;
      case 'admin-dashboard': {
          const allTenantsData: AllTenantsData = {};
          // For the admin dashboard, we can reconstruct a basic view of all tenants
          displayCompanies.forEach(c => {
              allTenantsData[c.id] = {
                  invoices: allInvoices.filter(inv => inv.companyId === c.id),
                  clients: [],
                  services: [],
                  generatedDocs: [],
                  projects: []
              };
          });
          return <AdminDashboard 
            allTenantData={allTenantsData} 
            companies={displayCompanies} 
            users={allUsers} 
            onUpdateCompany={async (id, det) => {
                try {
                    await api.updateCompany(id, det);
                    const updatedComps = await api.getAllCompanies();
                    setCompanies(updatedComps);
                } catch (e) { setSyncError(stringifyError(e)); }
            }}
            onDeleteCompany={async (id) => {
                try {
                    await api.deleteCompany(id);
                    const updatedComps = await api.getAllCompanies();
                    setCompanies(updatedComps);
                } catch (e) { setSyncError(stringifyError(e)); }
            }}
            onUpdateUser={async (id, det) => {
                try {
                    await api.updateProfile(id, det);
                    const updatedUsers = await api.getAllProfiles();
                    setAllUsers(updatedUsers);
                } catch (e) { setSyncError(stringifyError(e)); }
            }}
          />;
      }
      case 'projects': return <ProjectManagement companyId={activeTenantId!} projects={projects} clients={clients} generatedDocs={generatedDocs} invoices={invoices} auditLogs={auditLogs} onAddProject={handleAddProject} onUpdateProject={handleUpdateProject} onDeleteProject={handleDeleteProject} onRecordPayment={handleRecordPayment} onSendReceipt={handleSendReceipt} onNavigateTo={(page, props) => {
        if (page === 'create-invoice' && props?.prefillProject) {
          const prefillCli = props.prefillClient;
          const prefillProj = props.prefillProject;
          setDraftRenewal({
            clientId: prefillCli?.id,
            projectId: prefillProj?.id,
            total: prefillProj?.value || 0,
            paymentTerms: `Project execution payment for: ${prefillProj?.name}`,
            items: [
              {
                serviceId: '',
                description: `Project milestones for ${prefillProj?.name}`,
                quantity: 1,
                price: prefillProj?.value || 0
              }
            ]
          });
        }
        if (page === 'document-transformer') {
          setDocTransformerPrefill({
            initialTab: props?.initialTab || 'sign',
            prefillProject: props?.prefillProject,
            prefillClient: props?.prefillClient
          });
        }
        navigateTo(page as Page);
      }} />;
      default: return <Dashboard invoices={invoices} clients={clients} services={services} activeTenantId={activeTenantId} setActivePage={navigateTo} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onGenerateRenewal={handleGenerateRenewal} globalFilter={globalFilter} onFilterChange={handleGlobalFilterChange} />;
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('cravebiz_tenant');
    localStorage.removeItem('cravebiz_is_super_admin');
    localStorage.removeItem('cravebiz_signup_tier');
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <Sidebar 
        activePage={activePage} 
        setActivePage={navigateTo} 
        companyName={activeCompany?.name || 'Synchronizing Vault...'} 
        onLogout={handleLogout} 
        isAdmin={currentUser?.isAdmin || false} 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
        isCollapsed={isSidebarCollapsed}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
            pageTitle={pageTitles[activePage]} 
            onCreateInvoice={() => navigateTo('create-invoice')} 
            companies={displayCompanies} 
            activeTenantId={activeTenantId || ''} 
            onSwitchTenant={(id) => { setActiveTenantId(id); localStorage.setItem('cravebiz_tenant', id); forceSyncData(id); }} 
            user={currentUser} 
            onOpenUserProfile={() => setIsUserProfileModalOpen(true)} 
            onLogout={handleLogout} 
            onToggleMobileMenu={() => setIsMobileMenuOpen(true)} 
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
            onNavigate={navigateTo}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
            {syncError && (
                <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 font-bold shadow-lg flex justify-between items-center animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <Icon name="reports" className="w-5 h-5" />
                        <span>{syncError}</span>
                    </div>
                    <button onClick={() => window.location.reload()} className="bg-white px-4 py-2 rounded-xl text-xs hover:bg-gray-50 transition-colors shadow-sm">Refresh Vault</button>
                </div>
            )}
            {isDataSyncing && (
                <div className="fixed top-4 right-8 z-50 flex items-center bg-primary-600 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase shadow-2xl animate-pulse">
                    Syncing Vault...
                </div>
            )}
            {renderContent()}
        </main>
      </div>
      {isUserProfileModalOpen && currentUser && (
          <UserProfileModal isOpen={isUserProfileModalOpen} onClose={() => setIsUserProfileModalOpen(false)} user={currentUser} onUpdateProfile={()=>{}} />
      )}
      {isResetPasswordOpen && (
          <ResetPasswordModal 
            isOpen={isResetPasswordOpen} 
            onClose={() => {
              setIsResetPasswordOpen(false);
              window.location.hash = '';
            }} 
            email={resetEmail} 
            token={resetToken} 
            onResetPassword={async (email, newPassword) => {
              try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) {
                  alert(stringifyError(error));
                  return false;
                }
                alert("Your password has been reset successfully! You can now use your new password.");
                setIsResetPasswordOpen(false);
                window.location.hash = '';
                return true;
              } catch (err: any) {
                alert("Password update failed: " + stringifyError(err));
                return false;
              }
            }} 
          />
      )}
      {subErrorMsg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-gray-100 text-center">
            {subErrorMsg.toLowerCase().includes('ai') || subErrorMsg.toLowerCase().includes('token') || subErrorMsg.toLowerCase().includes('credit') || subErrorMsg.toLowerCase().includes('unit') ? (
              <>
                <div className="bg-amber-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
                  <Icon name="reports" className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-2">AI Quota Exhausted</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  No workspace AI units are currently available, or your user profile is not authorized to use the workspace AI quota. 
                  You can proceed manually or purchase additional units immediately.
                </p>
                <div className="flex flex-col gap-2.5">
                  <button 
                    onClick={() => {
                      // Trigger secure Flutterwave payment on the spot!
                      const companyId = activeTenantId || 'default-tenant';
                      const flutterwaveKey = getFlutterwavePublicKey();
                      let isSuccess = false;

                      safeFlutterwaveCheckout({
                        public_key: flutterwaveKey,
                        tx_ref: `cravebiz-credits-${Date.now()}-${companyId}`,
                        amount: REFILL_PACKS.pack_300.amount,
                        currency: "NGN",
                        payment_options: "card, banktransfer, ussd",
                        customer: {
                          email: currentUser?.email || "customer@cravebiz.ai",
                          name: currentUser?.name || "CraveBiZ Client",
                        },
                        customizations: {
                          title: "CraveBiZ AI Token Refill",
                          description: `Secure purchase of ${REFILL_PACKS.pack_300.credits} AI credits for ₦${REFILL_PACKS.pack_300.amount.toLocaleString()}`,
                          logo: "https://checkout.flutterwave.com/assets/img/flutterwave-logo.svg",
                        },
                        callback: function (data: any) {
                          console.log("Flutterwave refill response:", data);
                          if (data.status === "successful" || data.status === "completed") {
                            isSuccess = true;
                            const transactionId = data.transaction_id || data.tx_ref || "";
                            
                            // Securely refill credits on backend DB
                            secureRefillCreditsOnDb(companyId, transactionId, 'pack_300')
                              .then(() => {
                                setSubErrorMsg(null);
                                alert(`Congratulations! ${REFILL_PACKS.pack_300.credits} AI credits have been successfully added to your workspace.`);
                              })
                              .catch((err: any) => {
                                console.error("Backend refill error:", err);
                                alert(`Refill Payment was received, but we encountered an issue syncing credits to our secure vault: ${err.message || err}. Please contact support with your Transaction ID: ${transactionId}.`);
                              });
                          } else {
                            alert(`Failed Token Refill: Payment status was '${data.status}'. Please try again.`);
                          }
                        },
                        onclose: function() {
                          console.log("Flutterwave payment modal dismissed");
                          if (!isSuccess) {
                            alert("Failed Token Refill: Checkout was cancelled before completion.");
                          }
                        }
                      });
                    }} 
                    className="w-full px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition"
                  >
                    Buy {REFILL_PACKS.pack_300.credits} AI Units (₦{REFILL_PACKS.pack_300.amount.toLocaleString()})
                  </button>
                  <button 
                    onClick={() => {
                      setSubErrorMsg(null);
                      navigateTo('settings');
                    }} 
                    className="w-full px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-primary-700 transition"
                  >
                    Upgrade Plan
                  </button>
                  <button 
                    onClick={() => {
                      // Allow proceeding manually by dismissing the error gracefully, preventing app failure!
                      setSubErrorMsg(null);
                    }} 
                    className="w-full px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-gray-200 transition"
                  >
                    Use Manual Method (Standard Entry)
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-red-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100 animate-bounce">
                  <Icon name="reports" className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-2">Subscription Limit</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">{subErrorMsg}</p>
                <div className="flex gap-3 justify-center">
                  <button 
                    onClick={() => {
                      setSubErrorMsg(null);
                      navigateTo('settings');
                    }} 
                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary-200 hover:bg-primary-700 transition"
                  >
                    Upgrade Plan
                  </button>
                  <button 
                    onClick={() => setSubErrorMsg(null)} 
                    className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-gray-200 transition"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
