
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
import AdminDashboard from './components/AdminDashboard';
import DocumentTransformer from './components/DocumentTransformer';
import PaymentIntelligence from './components/PaymentIntelligence';
import PublicSigningPortal from './components/PublicSigningPortal';
import { api, supabase } from './lib/api';
import { generateRenewalInvoiceSuggestion } from './services/aiGenerationService';
import { Invoice, Client, Service, Company, User, TenantData, InvoiceStatus, AllTenantsData, GeneratedDocument } from './types';
import Icon from './components/common/Icon';

export type Page = 'dashboard' | 'invoices' | 'clients' | 'services' | 'reports' | 'settings' | 'create-invoice' | 'edit-invoice' | 'invoice-detail' | 'receipt-detail' | 'plain-invoice-detail' | 'recurring-invoices' | 'email-verification' | 'sent-receipts' | 'admin-dashboard' | 'document-transformer' | 'payment-intelligence';

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

  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isDataSyncing, setIsDataSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(() => localStorage.getItem('cravebiz_tenant'));
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [tenantData, setTenantData] = useState<TenantData>({ invoices: [], clients: [], services: [], generatedDocs: [] });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [downloadAction, setDownloadAction] = useState<'print' | 'word' | undefined>(undefined);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [draftRenewal, setDraftRenewal] = useState<Partial<Invoice> | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const isMounted = useRef(true);

  if (publicDocId) {
    return (
      <PublicSigningPortal 
        docId={publicDocId} 
        prefilledRecipient={publicRecipient || undefined}
        onBackToLogin={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setPublicDocId(null);
          setPublicRecipient(null);
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
    'payment-intelligence': 'Payment Intelligence Board',
  };

  const forceSyncData = async (tenantId: string) => {
    if (!tenantId || !isMounted.current) return;
    setIsDataSyncing(true);
    try {
      const [inv, cli, srv, docs] = await Promise.all([
        api.fetchInvoices(tenantId), api.fetchClients(tenantId),
        api.fetchServices(tenantId), api.fetchGeneratedDocs(tenantId)
      ]);
      if (isMounted.current) {
          setTenantData({ invoices: inv, clients: cli, services: srv, generatedDocs: docs });
          setSyncError(null);
      }
    } catch (e) { 
        setSyncError(stringifyError(e)); 
    } finally { 
        if (isMounted.current) setIsDataSyncing(false); 
    }
  };

  const handleAuthSync = async (user: any) => {
    if (!isMounted.current || !user) return;
    
    // Only show full loading screen on initial load or if user changes
    const isInitialLoad = !currentUser;
    if (isInitialLoad) setIsLoading(true);
    
    try {
        await api.ensureProfile(user.id, user.user_metadata?.full_name);
        const profile = await api.getProfile(user.id);
        if (profile && isMounted.current) {
            profile.email = user.email || '';
            setCurrentUser(profile);
            
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
                    await forceSyncData(tid);
                }
            } else {
                const discovered = await api.getMyCompanies();
                setCompanies(discovered);
                if (discovered.length > 0) {
                    const tid = (activeTenantId && discovered.some(c => c.id === activeTenantId)) ? activeTenantId : discovered[0].id;
                    setActiveTenantId(tid);
                    localStorage.setItem('cravebiz_tenant', tid);
                    await forceSyncData(tid);
                }
            }
        }
    } catch (e) { setSyncError(stringifyError(e)); } 
    finally { if (isMounted.current && isInitialLoad) setIsLoading(false); }
  };

  useEffect(() => {
    isMounted.current = true;
    const initAuth = async () => {
        try {
            const hash = window.location.hash;
            if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
                setIsResetPasswordOpen(true);
            }
            const { data } = await supabase.auth.getSession();
            if (data?.session?.user) {
                await handleAuthSync(data.session.user);
                if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
                    if (data.session.user.email) {
                        setResetEmail(data.session.user.email);
                    }
                }
            }
            else if (isMounted.current) setIsLoading(false);
        } catch (e) { if (isMounted.current) { setIsLoading(false); setSyncError(stringifyError(e)); } }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            handleAuthSync(session.user);
            if (event === 'PASSWORD_RECOVERY') {
                setIsResetPasswordOpen(true);
                if (session.user.email) setResetEmail(session.user.email);
            }
        }
        else if (event === 'SIGNED_OUT' && isMounted.current) { 
            setCurrentUser(null); setIsLoading(false); setCompanies([]); setActiveTenantId(null); 
            setTenantData({ invoices: [], clients: [], services: [], generatedDocs: [] }); localStorage.removeItem('cravebiz_tenant'); 
        }
    });
    return () => { isMounted.current = false; subscription.unsubscribe(); };
  }, []);

  const handleRecordPayment = async (invoiceId: string, cumulativeAmount: number) => {
    const inv = tenantData.invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    
    // 1. OPTIMISTIC UPDATE: Change local state immediately
    const isFullyPaid = cumulativeAmount >= inv.total;
    const nextStatus = isFullyPaid ? InvoiceStatus.Paid : (inv.status === InvoiceStatus.Paid ? InvoiceStatus.Sent : inv.status);
    const updatedInvoice: Invoice = { ...inv, amountPaid: cumulativeAmount, status: nextStatus };
    
    setTenantData(prev => ({
        ...prev,
        invoices: prev.invoices.map(i => i.id === invoiceId ? updatedInvoice : i)
    }));

    // 2. PERSISTENCE: Send to server
    setIsDataSyncing(true);
    try {
        await api.updateInvoice(updatedInvoice);
        // Do NOT call forceSyncData immediately to avoid race condition flicker.
        // The local state is now the "source of truth".
        setSyncError(null);
    } catch (e) {
        console.error("Payment sync failed:", e);
        // If it failed, we must revert or re-sync
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
        await forceSyncData(activeTenantId!);
    } catch (e) { alert(`Status Error: ${stringifyError(e)}`); } 
    finally { if (isMounted.current) setIsDataSyncing(false); }
  }

  const handleDeleteInvoice = async (id: string) => {
    setIsDataSyncing(true);
    try {
        await api.deleteInvoice(id);
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
  const activeCompany = useMemo(() => activeTenantId ? companies.find(c => c.id === activeTenantId) || null : null, [activeTenantId, companies]);

  if (!isLoading && !currentUser) {
    return (
      <>
        <AuthPage 
          onLogin={async (e, p) => {
              const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
              if (error) return stringifyError(error);
              return true;
          }}
          onSignup={async (name, email, pass, companyName, phone) => {
              const { error } = await supabase.auth.signUp({ 
                  email, password: pass, options: { data: { full_name: name, company_name: companyName, phone } }
              });
              if (error) return stringifyError(error);
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
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
                <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-gray-100 max-w-lg w-full">
                    <div className="bg-primary-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8"><Icon name="dashboard" className="w-10 h-10 text-primary-600" /></div>
                    <h2 className="text-3xl font-black text-gray-800 tracking-tighter mb-4">Vault Ready</h2>
                    <p className="text-gray-500 mb-10 text-sm leading-relaxed">Securely provision your SME workspace.</p>
                    <button onClick={async () => { 
                        try { 
                            setIsDataSyncing(true); 
                            const nc = await api.createCompany({ name: 'My Workspace' }); 
                            setCompanies([nc]); setActiveTenantId(nc.id); 
                            localStorage.setItem('cravebiz_tenant', nc.id); 
                            await forceSyncData(nc.id); 
                        } catch(e) { setSyncError(stringifyError(e)); } 
                        finally { if (isMounted.current) setIsDataSyncing(false); } 
                    }} className="w-full py-5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl hover:bg-primary-700 transition-all">Provision Workspace</button>
                </div>
            </div>
        );
    }

    const { invoices = [], clients = [], services = [], generatedDocs = [] } = tenantData;

    switch (activePage) {
      case 'dashboard': return <Dashboard invoices={invoices} clients={clients} setActivePage={navigateTo} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onGenerateRenewal={handleGenerateRenewal} />;
      case 'document-transformer': return <DocumentTransformer company={activeCompany} user={currentUser} generatedDocs={generatedDocs} onSaveDoc={async (doc, id) => { 
          try {
              let saved;
              if (id) {
                  saved = await api.updateGeneratedDoc(activeTenantId!, id, doc);
              } else {
                  saved = await api.saveGeneratedDoc(activeTenantId!, doc); 
              }
              await forceSyncData(activeTenantId!); 
              return saved?.id;
          } catch (e) {
              setSyncError(stringifyError(e));
              return undefined;
          }
      }} onDeleteDoc={async (id) => {
          try {
              await api.deleteGeneratedDoc(activeTenantId!, id);
              await forceSyncData(activeTenantId!);
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} />;
      case 'invoices': return <InvoiceList invoices={invoices} clients={clients} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onDeleteInvoice={handleDeleteInvoice} />;
      case 'recurring-invoices': return <RecurringInvoiceList invoices={invoices.filter(i => i.isRecurringTemplate)} clients={clients} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onDeleteInvoice={handleDeleteInvoice} />;
      case 'sent-receipts': return <SentReceiptsList invoices={invoices.filter(i => i.isReceiptSent)} clients={clients} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} />;
      case 'create-invoice': {
          if (!activeCompany) return <div className="text-center py-20 italic">Awaiting synchronization...</div>;
          return <CreateInvoice clients={clients} services={services} company={activeCompany} initialDraft={draftRenewal} onAddInvoice={async (i) => { 
              try { 
                  setIsDataSyncing(true); 
                  const newInvoice = await api.createInvoice(activeTenantId!, i); 
                  setTenantData(prev => ({ ...prev, invoices: [newInvoice, ...prev.invoices] }));
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
            onGenerateReceipt={()=>{}} allTenantInvoices={invoices} onEditInvoice={handleEditInvoiceAction} 
            onViewPlainInvoice={(id, act) => { setSelectedInvoiceId(id); setDownloadAction(act); navigateTo('plain-invoice-detail'); }} 
            onViewTemplate={()=>{}} onSendInvoice={async (id) => { 
                try {
                    await api.updateInvoiceStatus(id, InvoiceStatus.Sent); 
                    await forceSyncData(activeTenantId!); 
                } catch (e) {
                    setSyncError(stringifyError(e));
                }
            }} onSendReceipt={()=>{}} 
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
      case 'settings': return <Settings company={activeCompany} onSaveChanges={async (id, det) => { 
          try {
              await api.updateCompany(id, det); 
              await forceSyncData(id); 
          } catch (e) {
              setSyncError(stringifyError(e));
          }
      }} onInviteUser={()=>{}} users={[]} activeTenantId={activeTenantId!} onUpdateUserStatus={()=>{}} onResendInvite={()=>{}} />;
      case 'clients': return <ClientList companyId={activeTenantId!} clients={clients} onAddClient={async (c) => { 
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
      case 'services': return <ServiceList companyId={activeTenantId!} services={services} onAddService={async (s) => { 
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
      case 'reports': return <Reports invoices={invoices} clients={clients} services={services} />;
      case 'payment-intelligence': return <PaymentIntelligence invoices={invoices} clients={clients} />;
      case 'admin-dashboard': {
          const allTenantsData: AllTenantsData = {};
          // For the admin dashboard, we can reconstruct a basic view of all tenants
          companies.forEach(c => {
              allTenantsData[c.id] = {
                  invoices: allInvoices.filter(inv => inv.companyId === c.id),
                  clients: [],
                  services: [],
                  generatedDocs: []
              };
          });
          return <AdminDashboard 
            allTenantData={allTenantsData} 
            companies={companies} 
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
      default: return <Dashboard invoices={invoices} clients={clients} setActivePage={navigateTo} onViewInvoice={(id) => { setSelectedInvoiceId(id); navigateTo('invoice-detail'); }} onEditInvoice={handleEditInvoiceAction} onGenerateRenewal={handleGenerateRenewal} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <Sidebar 
        activePage={activePage} 
        setActivePage={navigateTo} 
        companyName={activeCompany?.name || 'Synchronizing Vault...'} 
        onLogout={async () => { localStorage.removeItem('cravebiz_tenant'); await supabase.auth.signOut(); }} 
        isAdmin={currentUser?.isAdmin || false} 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
            pageTitle={pageTitles[activePage]} 
            onCreateInvoice={() => navigateTo('create-invoice')} 
            companies={companies} 
            activeTenantId={activeTenantId || ''} 
            onSwitchTenant={(id) => { setActiveTenantId(id); localStorage.setItem('cravebiz_tenant', id); forceSyncData(id); }} 
            user={currentUser} 
            onOpenUserProfile={() => setIsUserProfileModalOpen(true)} 
            onLogout={async () => { await supabase.auth.signOut(); }} 
            onToggleMobileMenu={() => setIsMobileMenuOpen(true)} 
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
    </div>
  );
}
