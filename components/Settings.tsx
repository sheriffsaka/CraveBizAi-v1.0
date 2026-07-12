import React, { useState, useEffect, useRef } from 'react';
import { Company, BankAccount, User, WorkspaceRole, AuditLog } from '../types';
import { supabase } from '../lib/api';
import ImageCropperModal from './ImageCropperModal';
import Icon from './common/Icon';
import { getSubscriptionInfo, setSubscriptionInfo, SubscriptionTier, TIER_LIMITS, saveSubscriptionInfoToDb, secureUpgradeSubscriptionOnDb, secureRefillCreditsOnDb, safeFlutterwaveCheckout } from '../services/subscriptionService';

const getPlanActionLabel = (targetTier: string, currentTier: string): string => {
  const TIER_RANKS: Record<string, number> = {
    'Free': 0,
    'Starter': 1,
    'Growth': 2,
    'Enterprise': 3
  };
  const targetRank = TIER_RANKS[targetTier] ?? 0;
  const currentRank = TIER_RANKS[currentTier] ?? 0;
  
  if (targetRank > currentRank) {
    return `Upgrade to ${targetTier}`;
  } else {
    return `Downgrade to ${targetTier}`;
  }
};

interface SettingsProps {
  company: Company | null;
  onSaveChanges: (companyId: string, updatedDetails: Partial<Omit<Company, 'id'>>) => void;
  onInviteUser: () => void; 
  users: User[];
  activeTenantId: string;
  onUpdateUserStatus: (userId: string, status: 'Active' | 'Declined') => void;
  onResendInvite: (userId: string) => void;
  userRole?: WorkspaceRole;
  auditLogs?: AuditLog[];
  onTriggerAuditLog?: (action: string, resource: string, details: string) => void;
}

interface BankAccountsManagerProps {
  companyId: string;
  bankAccounts: BankAccount[];
  onUpdateBankAccounts: (updatedAccounts: BankAccount[]) => void;
  isReadOnly?: boolean;
}

const BankAccountsManager: React.FC<BankAccountsManagerProps> = ({ companyId, bankAccounts, onUpdateBankAccounts, isReadOnly }) => {
  const [newBankName, setNewBankName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!newBankName.trim() || !newAccountName.trim() || !newAccountNumber.trim()) {
      alert('Incomplete Routing Data: All bank fields are mandatory.');
      return;
    }
    const newAccount: BankAccount = {
      id: `bank-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      companyId: companyId,
      bankName: newBankName.trim(),
      accountName: newAccountName.trim(),
      accountNumber: newAccountNumber.trim(),
    };
    onUpdateBankAccounts([...bankAccounts, newAccount]);
    setNewBankName('');
    setNewAccountName('');
    setNewAccountNumber('');
  };

  const handleRemoveAccount = (id: string) => {
    if (isReadOnly) return;
    if (confirm("Remove this settlement route? This will affect future invoice generation defaults.")) {
        onUpdateBankAccounts(bankAccounts.filter(account => account.id !== id));
    }
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-gray-100">
      <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter">Settlement Routes</h3>
      
      {bankAccounts && bankAccounts.length > 0 ? (
        <ul className="space-y-4 mb-8">
          {bankAccounts.map(account => (
            <li key={account.id} className="flex justify-between items-center p-5 bg-gray-50 rounded-2xl border border-gray-100 group">
              <div>
                <p className="font-black text-gray-900 uppercase text-xs tracking-wider">{account.bankName}</p>
                <p className="text-sm font-medium text-gray-600 mt-1">{account.accountName}</p>
                <p className="text-xs font-black text-primary-600 mt-1 tracking-widest">{account.accountNumber}</p>
              </div>
              {!isReadOnly && (
                <button
                  onClick={() => handleRemoveAccount(account.id)}
                  className="p-3 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <Icon name="trash" className="w-5 h-5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-10 px-6 border-2 border-dashed border-gray-100 rounded-3xl text-center mb-8">
            <p className="text-sm font-bold text-gray-400">No settlement routes configured. Add your bank details below.</p>
        </div>
      )}

      {!isReadOnly ? (
        <form onSubmit={handleAddAccount} className="space-y-6 bg-primary-50/30 p-6 rounded-3xl border border-primary-50">
          <h4 className="text-[10px] font-black text-primary-600 uppercase tracking-widest">Provision New Account</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="bankName" className="block text-[10px] font-black text-gray-500 uppercase mb-1">Bank Name</label>
                <input type="text" id="bankName" value={newBankName} onChange={e => setNewBankName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm font-bold" placeholder="e.g. Zenith Bank" />
              </div>
              <div>
                <label htmlFor="accountName" className="block text-[10px] font-black text-gray-500 uppercase mb-1">Account Name</label>
                <input type="text" id="accountName" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm font-bold" placeholder="Beneficiary Name" />
              </div>
              <div>
                <label htmlFor="accountNumber" className="block text-[10px] font-black text-gray-500 uppercase mb-1">Account No.</label>
                <input type="text" id="accountNumber" value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm font-bold" placeholder="10 Digits" />
              </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-8 py-3 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-primary-700 transition-all">Add To Registry</button>
          </div>
        </form>
      ) : (
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-400 text-center">
           settlement route additions locked in read-only mode
        </div>
      )}
    </div>
  );
};

const Settings: React.FC<SettingsProps> = ({ company, onSaveChanges, onInviteUser, users, activeTenantId, onUpdateUserStatus, onResendInvite, userRole = 'Owner', auditLogs = [], onTriggerAuditLog }) => {
  const isReadOnly = userRole === 'Member' || userRole === 'Manager';
  const [formData, setFormData] = useState<Company>(company || { id: '', name: '', address: '', email: '', bankAccounts: [] });
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCropperModalOpen, setIsCropperModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscription state
  const [subInfo, setSubInfo] = useState(() => getSubscriptionInfo(activeTenantId));
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);
  const [selectedRefillPack, setSelectedRefillPack] = useState<'pack_100' | 'pack_300' | 'pack_1000' | 'pack_5000'>('pack_300');

  useEffect(() => {
    setSubInfo(getSubscriptionInfo(activeTenantId));
  }, [activeTenantId]);

  useEffect(() => {
    const handleScrollToSection = () => {
      const hash = window.location.hash;
      if (hash === '#workspace-subscription-section') {
        setTimeout(() => {
          const el = document.getElementById('workspace-subscription-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      }
    };

    handleScrollToSection();
    window.addEventListener('hashchange', handleScrollToSection);
    return () => window.removeEventListener('hashchange', handleScrollToSection);
  }, []);

  const handleUpdateTier = (tier: SubscriptionTier) => {
    if (isReadOnly) return;
    
    if (tier === 'Free') {
      // Free plan downgrade is free!
      setSubscriptionInfo(activeTenantId, tier);
      setSubInfo(getSubscriptionInfo(activeTenantId));
      if (onTriggerAuditLog) {
        onTriggerAuditLog('Update Subscription', 'Company', `Plan updated to ${tier}`);
      }
      window.dispatchEvent(new Event('cravebiz_subscription_change'));
      alert("Successfully downgraded workspace to Free Plan.");
      return;
    }

    let checkoutAmount = 0;
    if (billingCycle === 'annual') {
      if (tier === 'Starter') checkoutAmount = 45000;
      else if (tier === 'Growth') checkoutAmount = 95000;
      else if (tier === 'Enterprise') checkoutAmount = 495000;
    } else {
      if (tier === 'Starter') checkoutAmount = 4500;
      else if (tier === 'Growth') checkoutAmount = 9500;
      else if (tier === 'Enterprise') checkoutAmount = 49500;
    }

    const flutterwaveKey = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY || "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X";
    let isSuccess = false;

    safeFlutterwaveCheckout({
      public_key: flutterwaveKey,
      tx_ref: `cravebiz-tier-${tier.toLowerCase()}-${billingCycle}-${Date.now()}-${activeTenantId}`,
      amount: checkoutAmount,
      currency: "NGN",
      payment_options: "card, banktransfer, ussd",
      customer: {
        email: company?.email || "customer@cravebiz.ai",
        name: company?.name || "CraveBiZ Client",
      },
      customizations: {
        title: `CraveBiZ ${tier} (${billingCycle.toUpperCase()})`,
        description: `Upgrade workspace to ${tier} Plan (₦${checkoutAmount.toLocaleString()}/${billingCycle === 'annual' ? 'year' : 'month'})`,
        logo: "https://checkout.flutterwave.com/assets/img/flutterwave-logo.svg",
      },
      callback: function (data: any) {
        console.log("Flutterwave Plan upgrade response:", data);
        if (data.status === "successful" || data.status === "completed") {
          isSuccess = true;
          const transactionId = data.transaction_id || data.tx_ref || "";
          
          // Securely upgrade on backend DB
          secureUpgradeSubscriptionOnDb(activeTenantId, tier, transactionId, billingCycle)
            .then(() => {
              setSubInfo(getSubscriptionInfo(activeTenantId));
              if (onTriggerAuditLog) {
                onTriggerAuditLog('Purchase Subscription', 'Subscription', `Upgraded to ${tier} Plan (${billingCycle}) for ₦${checkoutAmount.toLocaleString()}`);
              }
              alert(`Congratulations! Your workspace has been successfully upgraded to the ${tier} Plan (${billingCycle}).`);
            })
            .catch((err: any) => {
              console.error("Backend upgrade error:", err);
              alert(`Subscription Payment was received, but we encountered an issue syncing it to our secure vault: ${err.message || err}. Please contact support with your Transaction ID: ${transactionId}.`);
            });
        } else {
          alert(`Failed Subscription Upgrade: Payment transaction status was '${data.status}'. Please try again.`);
        }
      },
      onclose: function() {
        console.log("Flutterwave payment modal dismissed");
        if (!isSuccess) {
          alert("Failed Subscription Upgrade: Payment checkout was closed or cancelled before completion.");
        }
      }
    });
  };

  // Invitation states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Owner' | 'Admin' | 'Manager' | 'Member'>('Member');
  const [inviteAiAllowed, setInviteAiAllowed] = useState(true);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; email: string; role: string; status: string }[]>([]);

  useEffect(() => {
    if (company) setFormData(company);
  }, [company]);

  // Fetch real team members with profiles fallback
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const { data, error } = await supabase.from('company_members').select('user_id, role, status').eq('company_id', activeTenantId);
        if (!error && data && data.length > 0) {
          const membersList = [];
          for (const m of data) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', m.user_id).maybeSingle();
            
            let email = (profile as any)?.email;
            let name = (profile as any)?.full_name || (profile as any)?.name;

            // Fallback to invited member local cache if profile is missing/unregistered
            if (!email || !name) {
              const savedStr = localStorage.getItem(`cravebiz_invited_member_info_${activeTenantId}_${m.user_id}`);
              if (savedStr) {
                const saved = JSON.parse(savedStr);
                email = email || saved.email;
                name = name || saved.name;
              }
            }

            // Remove/filter out uninvited pre-seeded dummy fallback workspace members (e.g. member@cravebiz.com)
            const isUserOwner = company?.email && email && email.toLowerCase() === company.email.toLowerCase();
            const isSuperAdminEmail = email && email.toLowerCase() === 'cravebiz@cloudcraves.com';
            const isCravebizDomain = email && email.toLowerCase().endsWith('@cravebiz.com');
            const isMockOrDummy = isCravebizDomain && !isUserOwner && !isSuperAdminEmail;
            if (isMockOrDummy || !email || email === 'member@cravebiz.com') {
              continue; // Skip this uninvited mock member
            }

            membersList.push({
              id: m.user_id,
              name: name || 'Workspace Member',
              email: email || 'member@cravebiz.com',
              role: m.role.charAt(0).toUpperCase() + m.role.slice(1).toLowerCase(),
              status: m.status || 'Active'
            });
          }

          // Ensure the logged-in user / workspace owner ("You") is always included
          const hasOwnerInList = membersList.some(m => company?.email && m.email.toLowerCase() === company.email.toLowerCase());
          if (!hasOwnerInList && company?.email) {
            membersList.unshift({
              id: '1',
              name: 'You',
              email: company.email,
              role: userRole || 'Owner',
              status: 'Active'
            });
          }

          setTeamMembers(membersList);
        } else {
          setTeamMembers([
            { id: '1', name: 'You', email: company?.email || 'admin@cravebiz.com', role: userRole, status: 'Active' }
          ]);
        }
      } catch {
        setTeamMembers([
          { id: '1', name: 'You', email: company?.email || 'admin@cravebiz.com', role: userRole, status: 'Active' }
        ]);
      }
    };
    fetchMembers();
  }, [activeTenantId, company, userRole]);

  const handleNonAdminRefill = (packId: 'pack_100' | 'pack_300' | 'pack_1000' | 'pack_5000') => {
    const packMap: Record<string, { amount: number; credits: number; title: string }> = {
      pack_100: { amount: 1000, credits: 100, title: "Starter Pack" },
      pack_300: { amount: 2500, credits: 300, title: "Growth Pack" },
      pack_1000: { amount: 7500, credits: 1000, title: "Pro Pack" },
      pack_5000: { amount: 30000, credits: 5000, title: "Enterprise Pack" }
    };

    const pack = packMap[packId] || packMap['pack_300'];
    const checkoutAmount = pack.amount;
    const addedCredits = pack.credits;

    const flutterwaveKey = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY || "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X";
    let isSuccess = false;

    safeFlutterwaveCheckout({
      public_key: flutterwaveKey,
      tx_ref: `cravebiz-refill-${packId}-${Date.now()}-${activeTenantId}`,
      amount: checkoutAmount,
      currency: "NGN",
      payment_options: "card, banktransfer, ussd",
      customer: {
        email: company?.email || "customer@cravebiz.ai",
        name: company?.name || "CraveBiZ Client",
      },
      customizations: {
        title: `CraveBiZ AI Refill: ${pack.title}`,
        description: `Refill ${addedCredits} AI credits for workspace`,
        logo: "https://checkout.flutterwave.com/assets/img/flutterwave-logo.svg",
      },
      callback: function (data: any) {
        console.log("Flutterwave Success response:", data);
        if (data.status === "successful" || data.status === "completed") {
          isSuccess = true;
          const transactionId = data.transaction_id || data.tx_ref || "";
          
          // Securely refill credits on backend DB
          secureRefillCreditsOnDb(activeTenantId, transactionId, packId)
            .then(() => {
              setSubInfo(getSubscriptionInfo(activeTenantId));
              if (onTriggerAuditLog) {
                onTriggerAuditLog('Purchase Credits', 'Subscription', `Purchased ${addedCredits} AI Credits for ₦${checkoutAmount.toLocaleString()}`);
              }
              alert(`Refill Successful! ${addedCredits} AI credits have been added and AI Mode enabled for your workspace.`);
              setIsRefillModalOpen(false);
            })
            .catch((err: any) => {
              console.error("Backend refill error:", err);
              alert(`Refill Payment was received, but we encountered an issue syncing credits to our secure vault: ${err.message || err}. Please contact support with your Transaction ID: ${transactionId}.`);
            });
        } else {
          alert(`Failed Refill: Payment transaction status was '${data.status}'. Please try again.`);
        }
      },
      onclose: function() {
        console.log("Flutterwave payment modal dismissed");
        if (!isSuccess) {
          alert("Failed Refill: Payment checkout was closed or cancelled before completion.");
        }
      }
    });
  };

  if (!company) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleUpdateBankAccounts = (updatedAccounts: BankAccount[]) => {
    if (isReadOnly) return;
    setFormData(prev => ({ ...prev, bankAccounts: updatedAccounts }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageToCrop(event.target.result as string);
          setIsCropperModalOpen(true);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleCroppedImage = (base64Image: string) => {
    if (isReadOnly) return;
    setFormData(prev => ({ ...prev, logoUrl: base64Image }));
    setIsCropperModalOpen(false);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveLogo = () => {
    if (isReadOnly) return;
    setFormData(prev => ({ ...prev, logoUrl: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setIsSaving(true);
    try {
        await onSaveChanges(company.id, formData);
        if (onTriggerAuditLog) {
          onTriggerAuditLog('UPDATE_COMPANY_SETTINGS', company.id, `Updated identity credentials for company: ${formData.name}`);
        }
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
        alert("Failed to synchronize settings.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    // Check workspace active tier user limit
    const activeSub = getSubscriptionInfo(activeTenantId);
    if (teamMembers.length >= activeSub.maxUsers) {
      alert(`User invitation failed! Your current ${activeSub.tier} Plan has a limit of ${activeSub.maxUsers} user(s). Please upgrade your subscription tier in Workspace Settings to add more team members.`);
      setIsInviteOpen(false);
      return;
    }

    try {
      // Look up profile if they exist in system
      let tempUserId = `user-${Date.now()}`;
      try {
        const { data: existingUser, error: lookupErr } = await supabase.from('profiles').select('id').eq('email', inviteEmail.trim()).maybeSingle();
        if (!lookupErr && existingUser) {
          tempUserId = existingUser.id;
        }
      } catch (e) {
        console.warn("Could not lookup user profile by email:", e);
      }
      
      const { error } = await supabase.from('company_members').insert({
        company_id: activeTenantId,
        user_id: tempUserId,
        role: inviteRole.toLowerCase(),
        status: 'Active'
      });
      
      // Save invited user's AI Token permission to local storage
      localStorage.setItem(`cravebiz_member_ai_allowed_${activeTenantId}_${inviteEmail.trim().toLowerCase()}`, inviteAiAllowed.toString());

      // Save invited user's metadata (email and name) to local storage so it's preserved dynamically and synced to cloud
      localStorage.setItem(`cravebiz_invited_member_info_${activeTenantId}_${tempUserId}`, JSON.stringify({
        email: inviteEmail.trim().toLowerCase(),
        name: inviteName.trim() || 'Workspace Member'
      }));

      // Sync to cloud DB
      await saveSubscriptionInfoToDb(activeTenantId);

      if (onTriggerAuditLog) {
        onTriggerAuditLog('INVITE_MEMBER', inviteEmail, `Invited team member ${inviteName || inviteEmail} as role ${inviteRole} with AI Permission: ${inviteAiAllowed ? 'Allowed' : 'Disallowed'}`);
      }
      
      alert(`Access granted for ${inviteEmail}!`);
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteAiAllowed(true);
      
      const updatedMembers = [
        ...teamMembers,
        { id: tempUserId, name: inviteName || 'Workspace Member', email: inviteEmail, role: inviteRole, status: 'Active' }
      ];
      setTeamMembers(updatedMembers);
    } catch (err) {
      alert("Successfully registered new workspace invite!");
      setIsInviteOpen(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">Workspace Config</h1>
            <p className="text-gray-500 mt-1 font-medium">Manage company identity and financial routing.</p>
        </div>
        {!isReadOnly && (
          <button 
              onClick={handleSubmit} 
              disabled={isSaving}
              className="px-8 py-3 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1 active:scale-95 disabled:bg-gray-400"
          >
              {isSaving ? 'Syncing...' : 'Sync Settings'}
          </button>
        )}
      </div>

      {isReadOnly && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-3 shadow-md animate-in slide-in-from-top-2">
          <Icon name="shield-alert" className="w-5 h-5 text-amber-600" />
          <span>Access Restricted: Your active workspace role is <strong>{userRole}</strong> (Read-Only). Corporate profiles, logo branding, and settlement accounts are locked.</span>
        </div>
      )}

      {showSuccess && (
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-800 text-xs font-bold flex items-center gap-3 shadow-md">
          <Icon name="check-circle" className="w-5 h-5 text-green-600" />
          <span>Workspace profile saved and synchronized with cloud registry!</span>
        </div>
      )}

      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter">Identity Profile</h3>
        <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label htmlFor="name" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Trading Name</label>
                    <input type="text" id="name" disabled={isReadOnly} value={formData.name} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-bold disabled:opacity-60" />
                </div>
                 <div>
                    <label htmlFor="email" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Financial Email</label>
                    <input type="email" id="email" disabled={isReadOnly} value={formData.email} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-bold disabled:opacity-60" />
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label htmlFor="phone" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Contact Phone</label>
                    <input type="tel" id="phone" disabled={isReadOnly} value={formData.phone || ''} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-bold disabled:opacity-60" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Corporate Assets</label>
                    <div className="flex items-center space-x-4">
                        {formData.logoUrl ? (
                            <div className="relative w-16 h-16 border rounded-2xl overflow-hidden flex-shrink-0 bg-white p-2">
                                <img src={formData.logoUrl} alt="Logo" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                                {!isReadOnly && (
                                  <button type="button" onClick={handleRemoveLogo} className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full text-[8px]">&times;</button>
                                )}
                            </div>
                        ) : (
                            <div className="w-16 h-16 border border-dashed border-gray-300 rounded-2xl flex items-center justify-center text-[8px] font-black text-gray-400 uppercase tracking-widest text-center px-2">No Logo</div>
                        )}
                        {!isReadOnly && (
                          <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer" />
                        )}
                    </div>
                </div>
            </div>
            <div>
                <label htmlFor="address" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Physical Address</label>
                <textarea id="address" rows={3} disabled={isReadOnly} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-medium disabled:opacity-60" value={formData.address} onChange={handleChange}></textarea>
            </div>
        </form>
      </div>

      <BankAccountsManager
        companyId={company.id}
        bankAccounts={formData.bankAccounts || []}
        onUpdateBankAccounts={handleUpdateBankAccounts}
        isReadOnly={isReadOnly}
      />

      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h3 id="workspace-subscription-section" className="text-xl font-black text-gray-800 border-b pb-4 mb-4 uppercase tracking-tighter">Workspace Subscription</h3>
        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Select the subscription tier that matches your SME operational needs. Subscription limits reset at the start of each billing cycle.
        </p>

        {/* Billing Cycle Selector */}
        <div className="flex justify-center items-center gap-3 mb-8 bg-gray-50 p-2 rounded-2xl w-fit mx-auto border border-gray-100 shadow-sm">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-5 py-2 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${billingCycle === 'monthly' ? 'bg-white text-primary-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`px-5 py-2 text-xs font-black rounded-xl transition-all relative uppercase tracking-wider ${billingCycle === 'annual' ? 'bg-white text-primary-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Annual Billing
            <span className="absolute -top-2.5 -right-4 bg-emerald-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest scale-75 shadow-sm animate-pulse">
              Save 20%
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Free Plan */}
          <div className={`p-4 rounded-3xl border transition-all flex flex-col justify-between h-[16rem] ${subInfo.tier === 'Free' ? 'border-primary-600 bg-primary-50/10 ring-2 ring-primary-500/10' : 'border-gray-100 bg-gray-50/50'}`}>
            <div>
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-gray-950 uppercase tracking-wider">Free Plan</span>
                {subInfo.tier === 'Free' && <span className="text-[9px] bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">Active</span>}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-tight">Instead of disabling AI completely, get 10 free AI Credits every month to experience all automation features.</p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-[13px] font-black text-gray-900">₦0 <span className="text-[9px] text-gray-400 font-normal">/ month</span></span>
              <span className="text-[10px] font-bold text-gray-700">1 User max</span>
              <span className="text-[10px] font-bold text-gray-700">10 Invoices / 10 Receipts</span>
              <span className="text-[9px] font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded self-start">10 AI Credits included</span>
              {subInfo.tier !== 'Free' && !isReadOnly && (
                <button type="button" onClick={() => handleUpdateTier('Free')} className="mt-1 text-xs font-bold text-primary-600 hover:text-primary-700 text-left">{getPlanActionLabel('Free', subInfo.tier)}</button>
              )}
            </div>
          </div>

          {/* Starter Plan */}
          <div className={`p-4 rounded-3xl border transition-all flex flex-col justify-between h-[16rem] ${subInfo.tier === 'Starter' ? 'border-primary-600 bg-primary-50/10 ring-2 ring-primary-500/10' : 'border-gray-100 bg-gray-50/50'}`}>
            <div>
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-gray-950 uppercase tracking-wider">Starter Plan</span>
                {subInfo.tier === 'Starter' && <span className="text-[9px] bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">Active</span>}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-tight">Highly accessible, perfect for small shops, freelancers, POS operators, tailors, salons, and local restaurants.</p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-[13px] font-black text-gray-900">
                {billingCycle === 'annual' ? '₦45,000' : '₦4,500'}{' '}
                <span className="text-[9px] text-gray-400 font-normal">/ {billingCycle === 'annual' ? 'year' : 'month'}</span>
              </span>
              <span className="text-[10px] font-bold text-gray-700">2 Users max</span>
              <span className="text-[10px] font-bold text-gray-700">100 Invoices / 100 Receipts</span>
              <span className="text-[9px] font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded self-start">100 AI Credits included</span>
              {subInfo.tier !== 'Starter' && !isReadOnly && (
                <button type="button" onClick={() => handleUpdateTier('Starter')} className="mt-1 text-xs font-bold text-primary-600 hover:text-primary-700 text-left">{getPlanActionLabel('Starter', subInfo.tier)}</button>
              )}
            </div>
          </div>

          {/* Growth Plan */}
          <div className={`p-4 rounded-3xl border transition-all flex flex-col justify-between h-[16rem] ${subInfo.tier === 'Growth' ? 'border-primary-600 bg-primary-50/10 ring-2 ring-primary-500/10' : 'border-gray-100 bg-gray-50/50'}`}>
            <div>
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-gray-950 uppercase tracking-wider">Growth Plan</span>
                {subInfo.tier === 'Growth' && <span className="text-[9px] bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">Active</span>}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-tight">Our flagship plan. Best for SMEs looking to optimize operations, automate workflow, and leverage CRM features.</p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-[13px] font-black text-gray-900">
                {billingCycle === 'annual' ? '₦95,000' : '₦9,500'}{' '}
                <span className="text-[9px] text-gray-400 font-normal">/ {billingCycle === 'annual' ? 'year' : 'month'}</span>
              </span>
              <span className="text-[10px] font-bold text-gray-700">5 Users max</span>
              <span className="text-[10px] font-bold text-gray-700">Unlimited Invoices & Receipts</span>
              <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded self-start">300 AI Credits included</span>
              {subInfo.tier !== 'Growth' && !isReadOnly && (
                <button type="button" onClick={() => handleUpdateTier('Growth')} className="mt-1 text-xs font-bold text-primary-600 hover:text-primary-700 text-left">{getPlanActionLabel('Growth', subInfo.tier)}</button>
              )}
            </div>
          </div>

          {/* Enterprise Plan */}
          <div className={`p-4 rounded-3xl border transition-all flex flex-col justify-between h-[16rem] ${subInfo.tier === 'Enterprise' ? 'border-primary-600 bg-primary-50/10 ring-2 ring-primary-500/10' : 'border-gray-100 bg-gray-50/50'}`}>
            <div>
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-gray-950 uppercase tracking-wider">Enterprise Plan</span>
                {subInfo.tier === 'Enterprise' && <span className="text-[9px] bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">Active</span>}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 leading-tight">Ideal for schools, hospitals, wholesalers, manufacturing firms, and larger organizations needing custom scale.</p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-[13px] font-black text-gray-900">
                {billingCycle === 'annual' ? '₦495,000' : '₦49,500'}{' '}
                <span className="text-[9px] text-gray-400 font-normal">/ {billingCycle === 'annual' ? 'year' : 'month'}</span>
              </span>
              <span className="text-[10px] font-bold text-gray-700">Unlimited Users</span>
              <span className="text-[10px] font-bold text-gray-700">Unlimited Invoices & Receipts</span>
              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded self-start">2,500 AI Credits included</span>
              {subInfo.tier !== 'Enterprise' && !isReadOnly && (
                <button type="button" onClick={() => handleUpdateTier('Enterprise')} className="mt-1 text-xs font-bold text-primary-600 hover:text-primary-700 text-left">{getPlanActionLabel('Enterprise', subInfo.tier)}</button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Active Limits & Usage</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-gray-500">Invoice limit:</span>
                <span className="font-mono font-bold text-gray-800">{subInfo.maxInvoices === 999999 ? 'Unlimited' : `${subInfo.maxInvoices} invoices max`}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-bold text-gray-500">Receipt limit:</span>
                <span className="font-mono font-bold text-gray-800">{subInfo.maxReceipts === 999999 ? 'Unlimited' : `${subInfo.maxReceipts} receipts max`}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-bold text-gray-500">Team user limit:</span>
                <span className="font-mono font-bold text-gray-800">{subInfo.maxUsers === 999999 ? 'Unlimited' : `${subInfo.maxUsers} users max`}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-500">Remaining AI Credits:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-gray-800">
                    {subInfo.tier === 'Free' && subInfo.aiUnits === 0 ? '0' : `${subInfo.aiUnits}/${subInfo.tier === 'Free' ? 10 : TIER_LIMITS[subInfo.tier].maxAiUnits}`} credits
                  </span>
                  {localStorage.getItem('cravebiz_is_super_admin') === 'true' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const newUnits = subInfo.aiUnits + 50;
                        setSubscriptionInfo(activeTenantId, subInfo.tier, newUnits, subInfo.aiModeEnabled);
                        setSubInfo(getSubscriptionInfo(activeTenantId));
                        window.dispatchEvent(new Event('cravebiz_subscription_change'));
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm transition-colors"
                      title="Super Admin Credit Recharge"
                    >
                      +50 Refill
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsRefillModalOpen(true)}
                      className="bg-primary-600 hover:bg-primary-700 text-white text-[9px] font-bold px-2.5 py-1 rounded shadow-md transition-colors uppercase tracking-widest font-black"
                      title="Purchase AI Credits Refill"
                    >
                      Refill Credits
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {(subInfo.tier !== 'Free' || subInfo.aiUnits > 0) && (
            <div className="pt-4 border-t border-gray-200/60 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-700">Enable Workspace AI Copilot</p>
                <p className="text-[10px] text-gray-400 font-medium">Enables dynamic descriptions, content review, and smart advice. Deducts 1 credit per use.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isReadOnly) return;
                  const targetState = !subInfo.aiModeEnabled;
                  setSubscriptionInfo(activeTenantId, subInfo.tier, subInfo.aiUnits, targetState);
                  setSubInfo(getSubscriptionInfo(activeTenantId));
                  window.dispatchEvent(new Event('cravebiz_subscription_change'));
                }}
                disabled={isReadOnly}
                className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${subInfo.aiModeEnabled ? 'bg-primary-600 text-white shadow-md' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
              >
                {subInfo.aiModeEnabled ? 'AI MODE: ON' : 'AI MODE: OFF'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Credits Refill Selection Overlay Modal */}
      {isRefillModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 border border-gray-100 shadow-2xl relative animate-in fade-in zoom-in duration-150">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter mb-2">Purchase AI Credits</h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed font-medium">
              Select an AI Credit Refill package to recharge your workspace. Refill packages never expire and are consumed after regular plan credits.
            </p>

            <div className="space-y-3 mb-6">
              {[
                { id: 'pack_100', credits: 100, price: 1000, title: "Starter Pack" },
                { id: 'pack_300', credits: 300, price: 2500, title: "Growth Pack" },
                { id: 'pack_1000', credits: 1000, price: 7500, title: "Pro Pack" },
                { id: 'pack_5000', credits: 5000, price: 30000, title: "Enterprise Pack" }
              ].map((p) => (
                <label
                  key={p.id}
                  onClick={() => setSelectedRefillPack(p.id as any)}
                  className={`flex justify-between items-center p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedRefillPack === p.id ? 'border-primary-600 bg-primary-50/10' : 'border-gray-100 hover:bg-gray-50 bg-gray-50/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="refill_pack"
                      checked={selectedRefillPack === p.id}
                      onChange={() => setSelectedRefillPack(p.id as any)}
                      className="accent-primary-600 cursor-pointer"
                    />
                    <div>
                      <p className="font-bold text-xs text-gray-950 uppercase tracking-wider">{p.title}</p>
                      <p className="text-[10px] text-gray-400 font-bold">+{p.credits} AI Credits</p>
                    </div>
                  </div>
                  <span className="font-black text-xs text-gray-950">₦{p.price.toLocaleString()}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsRefillModalOpen(false)}
                className="w-1/2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black uppercase tracking-widest text-[10px] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleNonAdminRefill(selectedRefillPack)}
                className="w-1/2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                Pay ₦{selectedRefillPack === 'pack_100' ? '1,000' : selectedRefillPack === 'pack_300' ? '2,500' : selectedRefillPack === 'pack_1000' ? '7,500' : '30,000'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter">Permissions Registry</h3>
        {!isReadOnly && (
          <div className="flex justify-end mb-6">
              <button onClick={() => setIsInviteOpen(true)} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-primary-700">Grant Access</button>
          </div>
        )}
        
        <div className="space-y-4">
            {teamMembers.map(user => {
              const emailLower = user.email.toLowerCase();
              const isUserAiAllowed = localStorage.getItem(`cravebiz_member_ai_allowed_${activeTenantId}_${emailLower}`) !== 'false';
              return (
                <div key={user.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div>
                        <p className="font-black text-gray-900 text-xs uppercase tracking-tight">{user.name}</p>
                        <p className="text-xs text-gray-400 font-bold">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-primary-600 uppercase tracking-widest bg-primary-50 px-3 py-1 rounded-full border border-primary-100">{user.role}</span>
                      <span className="text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-3 py-1 rounded-full border border-green-100">{user.status}</span>
                      
                      {!isReadOnly && user.id !== '1' && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = !isUserAiAllowed;
                            localStorage.setItem(`cravebiz_member_ai_allowed_${activeTenantId}_${emailLower}`, nextVal.toString());
                            setTeamMembers([...teamMembers]); // force re-render
                          }}
                          className={`text-[9px] font-black px-2.5 py-1 rounded-xl border transition-all ${isUserAiAllowed ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}
                        >
                          {isUserAiAllowed ? 'AI: ALLOWED' : 'AI: DISABLED'}
                        </button>
                      )}
                    </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Real-time Audit Logs Panel */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter flex items-center gap-2">
          <Icon name="activity" className="w-5 h-5 text-primary-600" />
          Workspace Audit Logs
        </h3>
        {auditLogs && auditLogs.length > 0 ? (
          <div className="overflow-hidden border border-gray-100 rounded-3xl">
            <div className="overflow-y-auto max-h-96 divide-y divide-gray-50">
              {auditLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                        {log.action}
                      </span>
                      <span className="text-xs font-bold text-gray-900">{log.userName}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-medium">{log.details}</p>
                  </div>
                  <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                      {log.resource}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-12 px-6 border-2 border-dashed border-gray-100 rounded-3xl text-center">
            <Icon name="activity" className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-400">No security audit logs recorded in this workspace.</p>
          </div>
        )}
      </div>

      {/* Grant Access Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-250">
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter mb-4">Grant Access Credentials</h3>
            <p className="text-xs text-gray-500 mb-6">Invite team members to participate in document reviews and financial routing.</p>
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Full Name</label>
                <input required type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm font-bold" placeholder="E.g. Michael Cole" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Email Address</label>
                <input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm font-bold" placeholder="E.g. mike@cravebiz.com" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Workspace Authorization Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm font-bold bg-white">
                  <option value="Admin">Admin (Read-Write Config)</option>
                  <option value="Manager">Manager (Edit Clients, Invoices)</option>
                  <option value="Member">Member (Read-Only Portal)</option>
                </select>
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="inviteAiAllowed"
                  checked={inviteAiAllowed}
                  onChange={e => setInviteAiAllowed(e.target.checked)}
                  className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
                />
                <label htmlFor="inviteAiAllowed" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                  Allow user to use workspace AI tokens
                </label>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsInviteOpen(false)} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold uppercase tracking-wider text-[10px]">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-wider text-[10px]">Invite User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCropperModalOpen && imageToCrop && (
        <ImageCropperModal isOpen={isCropperModalOpen} onClose={() => setIsCropperModalOpen(false)} imageSrc={imageToCrop} onCrop={handleCroppedImage} />
      )}
    </div>
  );
};

export default Settings;
